import { promises as fs } from "node:fs";
import { inflateRawSync } from "node:zlib";

const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_UINT16 = 0xffff;
const ZIP64_UINT32 = 0xffffffff;
const DEFAULT_LIMITS = Object.freeze({
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 10000,
  maxEntryUncompressedBytes: 80 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024
});

export class ZipArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ZipArchiveError";
    this.code = code;
  }
}

function zipError(code, message) {
  return new ZipArchiveError(code, message);
}

function positiveLimit(value, fallback) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeLimits(options = {}) {
  return {
    maxArchiveBytes: positiveLimit(options.maxArchiveBytes, DEFAULT_LIMITS.maxArchiveBytes),
    maxEntries: positiveLimit(options.maxEntries, DEFAULT_LIMITS.maxEntries),
    maxEntryUncompressedBytes: positiveLimit(
      options.maxEntryUncompressedBytes,
      DEFAULT_LIMITS.maxEntryUncompressedBytes
    ),
    maxTotalUncompressedBytes: positiveLimit(
      options.maxTotalUncompressedBytes,
      DEFAULT_LIMITS.maxTotalUncompressedBytes
    )
  };
}

function assertBufferRange(buffer, offset, length, label) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  ) {
    throw zipError("zip_entry_out_of_bounds", `ZIP ${label} is outside the archive boundary.`);
  }
}

function normalizeEntryName(value, { allowDirectory = true } = {}) {
  const source = String(value || "");
  if (!source || source.includes("\0")) {
    throw zipError("zip_entry_path_invalid", "ZIP entry path is empty or contains a null byte.");
  }
  const normalizedSeparators = source.replaceAll("\\", "/");
  if (
    normalizedSeparators.startsWith("/") ||
    normalizedSeparators.startsWith("//") ||
    /^[A-Za-z]:/.test(normalizedSeparators)
  ) {
    throw zipError("zip_entry_path_invalid", `ZIP entry path is absolute: ${source}`);
  }
  const isDirectory = normalizedSeparators.endsWith("/");
  if (isDirectory && !allowDirectory) {
    throw zipError("zip_entry_path_invalid", `ZIP entry path identifies a directory: ${source}`);
  }
  const trimmed = isDirectory ? normalizedSeparators.slice(0, -1) : normalizedSeparators;
  const parts = trimmed.split("/");
  if (!trimmed || parts.some((part) => !part || part === "." || part === "..")) {
    throw zipError("zip_entry_path_invalid", `ZIP entry path is unsafe: ${source}`);
  }
  return `${parts.join("/")}${isDirectory ? "/" : ""}`;
}

function findEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) {
    throw zipError("zip_end_not_found", "ZIP end of central directory was not found.");
  }
  const start = Math.max(0, buffer.length - 22 - ZIP64_UINT16);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_END_SIGNATURE) {
      continue;
    }
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) {
      return offset;
    }
  }
  throw zipError("zip_end_not_found", "ZIP end of central directory was not found.");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function publicEntry(entry) {
  return {
    fileName: entry.fileName,
    isDirectory: entry.isDirectory,
    compressionMethod: entry.compressionMethod,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize
  };
}

class ZipArchive {
  constructor(buffer, entries, limits) {
    this.buffer = buffer;
    this.entries = entries;
    this.limits = limits;
    this.entryMap = new Map(entries.map((entry) => [entry.fileName, entry]));
    this.cache = new Map();
  }

  listEntries(predicate = null) {
    const selected = typeof predicate === "function" ? this.entries.filter((entry) => predicate(publicEntry(entry))) : this.entries;
    return selected.map(publicEntry);
  }

  listEntriesBySuffix(suffix = "") {
    const normalizedSuffix = String(suffix || "").toLowerCase();
    return this.listEntries((entry) => entry.fileName.toLowerCase().endsWith(normalizedSuffix));
  }

  hasEntry(fileName = "") {
    const normalized = normalizeEntryName(fileName, { allowDirectory: true });
    return this.entryMap.has(normalized);
  }

  readEntry(fileName = "", options = {}) {
    const normalized = normalizeEntryName(fileName, { allowDirectory: false });
    const entry = this.entryMap.get(normalized);
    if (!entry) {
      if (options.required) {
        throw zipError("zip_entry_not_found", `ZIP entry was not found: ${normalized}`);
      }
      return null;
    }
    if (this.cache.has(normalized)) {
      return Buffer.from(this.cache.get(normalized));
    }

    const compressed = this.buffer.subarray(entry.dataStart, entry.dataEnd);
    let data;
    try {
      if (entry.compressionMethod === 0) {
        data = Buffer.from(compressed);
      } else {
        data = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, entry.uncompressedSize)
        });
      }
    } catch (cause) {
      throw zipError("zip_entry_decompression_failed", `ZIP entry could not be decompressed: ${normalized} (${cause.message})`);
    }
    if (data.length !== entry.uncompressedSize) {
      throw zipError("zip_entry_size_mismatch", `ZIP entry size does not match its central directory record: ${normalized}`);
    }
    if (crc32(data) !== entry.crc32) {
      throw zipError("zip_entry_crc_mismatch", `ZIP entry CRC does not match its central directory record: ${normalized}`);
    }
    this.cache.set(normalized, data);
    return Buffer.from(data);
  }

  readText(fileName = "", options = {}) {
    const data = this.readEntry(fileName, options);
    return data === null ? null : data.toString(options.encoding || "utf8");
  }

  readEntries(predicate = null) {
    return this.listEntries(predicate)
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        ...entry,
        data: this.readEntry(entry.fileName, { required: true })
      }));
  }

  readTextEntries(predicate = null, options = {}) {
    return this.readEntries(predicate).map((entry) => ({
      ...entry,
      text: entry.data.toString(options.encoding || "utf8")
    }));
  }

  readTextEntriesBySuffix(suffix = "", options = {}) {
    const normalizedSuffix = String(suffix || "").toLowerCase();
    return this.readTextEntries(
      (entry) => entry.fileName.toLowerCase().endsWith(normalizedSuffix),
      options
    );
  }
}

export function parseZipArchive(value, options = {}) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  const limits = normalizeLimits(options);
  if (buffer.length > limits.maxArchiveBytes) {
    throw zipError("zip_archive_too_large", `ZIP archive exceeds ${limits.maxArchiveBytes} bytes.`);
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDiskNumber = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== totalEntries) {
    throw zipError("zip_multidisk_unsupported", "Multi-disk ZIP archives are not supported.");
  }
  if (
    totalEntries === ZIP64_UINT16 ||
    centralSize === ZIP64_UINT32 ||
    centralOffset === ZIP64_UINT32
  ) {
    throw zipError("zip64_unsupported", "Zip64 archives are not supported.");
  }
  if (totalEntries > limits.maxEntries) {
    throw zipError("zip_entry_limit_exceeded", `ZIP archive exceeds ${limits.maxEntries} entries.`);
  }
  assertBufferRange(buffer, centralOffset, centralSize, "central directory");
  const centralEnd = centralOffset + centralSize;
  if (centralEnd > eocdOffset) {
    throw zipError("zip_central_directory_invalid", "ZIP central directory overlaps its end record.");
  }

  const entries = [];
  const seenNames = new Set();
  const localRanges = [];
  let totalUncompressedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    assertBufferRange(buffer, offset, 46, "central directory entry");
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw zipError("zip_central_entry_invalid", "ZIP central directory entry signature is invalid.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const entryCrc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const centralEntryLength = 46 + fileNameLength + extraLength + commentLength;
    assertBufferRange(buffer, offset, centralEntryLength, "central directory entry");
    if (offset + centralEntryLength > centralEnd) {
      throw zipError("zip_central_entry_invalid", "ZIP central directory entry exceeds the declared directory boundary.");
    }
    if (
      compressedSize === ZIP64_UINT32 ||
      uncompressedSize === ZIP64_UINT32 ||
      localHeaderOffset === ZIP64_UINT32 ||
      diskStart === ZIP64_UINT16
    ) {
      throw zipError("zip64_unsupported", "Zip64 entries are not supported.");
    }
    if (diskStart !== 0) {
      throw zipError("zip_multidisk_unsupported", "Multi-disk ZIP entries are not supported.");
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw zipError("zip_encryption_unsupported", "Encrypted ZIP entries are not supported.");
    }
    if (![0, 8].includes(compressionMethod)) {
      throw zipError("zip_compression_unsupported", `ZIP compression method ${compressionMethod} is not supported.`);
    }
    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      throw zipError("zip_entry_size_mismatch", "Stored ZIP entry has mismatched compressed and uncompressed sizes.");
    }
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw zipError(
        "zip_entry_limit_exceeded",
        `ZIP entry exceeds ${limits.maxEntryUncompressedBytes} uncompressed bytes.`
      );
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw zipError(
        "zip_total_limit_exceeded",
        `ZIP entries exceed ${limits.maxTotalUncompressedBytes} total uncompressed bytes.`
      );
    }

    const rawName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const fileName = normalizeEntryName(rawName, { allowDirectory: true });
    if (seenNames.has(fileName)) {
      throw zipError("zip_entry_duplicate", `ZIP archive contains a duplicate entry: ${fileName}`);
    }
    seenNames.add(fileName);

    assertBufferRange(buffer, localHeaderOffset, 30, "local file header");
    if (localHeaderOffset >= centralOffset || buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw zipError("zip_local_entry_invalid", `ZIP local file header is invalid: ${fileName}`);
    }
    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localHeaderLength = 30 + localFileNameLength + localExtraLength;
    assertBufferRange(buffer, localHeaderOffset, localHeaderLength, "local file header");
    if (localFlags !== flags || localCompressionMethod !== compressionMethod) {
      throw zipError("zip_local_entry_mismatch", `ZIP local header does not match the central directory: ${fileName}`);
    }
    const localRawName = buffer
      .subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localFileNameLength)
      .toString("utf8");
    if (normalizeEntryName(localRawName, { allowDirectory: true }) !== fileName) {
      throw zipError("zip_local_entry_mismatch", `ZIP local entry name does not match the central directory: ${fileName}`);
    }
    const dataStart = localHeaderOffset + localHeaderLength;
    const dataEnd = dataStart + compressedSize;
    assertBufferRange(buffer, dataStart, compressedSize, `entry data for ${fileName}`);
    if (dataEnd > centralOffset) {
      throw zipError("zip_entry_out_of_bounds", `ZIP entry overlaps the central directory: ${fileName}`);
    }

    const isDirectory = fileName.endsWith("/");
    if (isDirectory && (compressedSize !== 0 || uncompressedSize !== 0)) {
      throw zipError("zip_directory_entry_invalid", `ZIP directory entry contains data: ${fileName}`);
    }
    entries.push({
      fileName,
      isDirectory,
      flags,
      compressionMethod,
      crc32: entryCrc32,
      compressedSize,
      uncompressedSize,
      dataStart,
      dataEnd
    });
    localRanges.push({ start: localHeaderOffset, end: dataEnd, fileName });
    offset += centralEntryLength;
  }
  if (offset !== centralEnd) {
    throw zipError("zip_central_directory_invalid", "ZIP central directory size does not match its entries.");
  }

  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].start < localRanges[index - 1].end) {
      throw zipError(
        "zip_entry_overlap",
        `ZIP entries overlap: ${localRanges[index - 1].fileName} and ${localRanges[index].fileName}`
      );
    }
  }
  return new ZipArchive(buffer, entries, limits);
}

export async function openZipArchive(filePath, options = {}) {
  const limits = normalizeLimits(options);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw zipError("zip_archive_not_file", `ZIP archive path is not a file: ${filePath}`);
  }
  if (stat.size > limits.maxArchiveBytes) {
    throw zipError("zip_archive_too_large", `ZIP archive exceeds ${limits.maxArchiveBytes} bytes.`);
  }
  return parseZipArchive(await fs.readFile(filePath), limits);
}
