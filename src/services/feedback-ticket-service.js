import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { normalizeUploadedFileName } from "./upload-filename.js";

function now() {
  return new Date().toISOString();
}

function getTicketPath(ticketId) {
  return path.join(config.feedbackTicketStoreDir, `${ticketId}.json`);
}

function createManagedError(message, statusCode = 400, code = "feedback_ticket_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeText(value = "", maxLength = 0) {
  const text = String(value || "").trim();
  if (!maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function buildAttachmentRecord(file) {
  const mimeType = String(file?.mimetype || "").trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    throw createManagedError("反馈附件仅支持图片文件", 400, "feedback_attachment_not_image", {
      mimeType
    });
  }

  return {
    id: randomUUID(),
    originalName: normalizeUploadedFileName(file?.originalname) || "image",
    storedName: String(file?.filename || "").trim(),
    relativePath: path.join("feedback-tickets", String(file?.filename || "").trim()).replaceAll("\\", "/"),
    absolutePath: "",
    mimeType,
    size: Math.max(0, Number(file?.size || 0) || 0),
    uploadedAt: now()
  };
}

function resolveAttachmentStoredName(attachment = {}) {
  const storedName = String(attachment.storedName || "").trim();
  if (storedName) {
    return storedName;
  }

  const relativePath = String(attachment.relativePath || "").replaceAll("\\", "/").trim();
  if (!relativePath) {
    return "";
  }

  return path.posix.basename(relativePath);
}

function toClientAttachment(attachment = {}) {
  const storedName = resolveAttachmentStoredName(attachment);
  return {
    ...attachment,
    storedName,
    url: storedName ? `/feedback-ticket-assets/${encodeURIComponent(storedName)}` : ""
  };
}

function toClientTicket(ticket = {}) {
  return {
    ...ticket,
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments.map((attachment) => toClientAttachment(attachment)) : []
  };
}

export class FeedbackTicketService {
  async createTicket(input = {}, files = []) {
    const title = normalizeText(input.title, 120);
    const detail = normalizeText(input.detail, 8000);

    if (!title) {
      throw createManagedError("请填写问题标题", 400, "feedback_title_required");
    }

    if (!detail) {
      throw createManagedError("请填写问题详情", 400, "feedback_detail_required");
    }

    const attachments = (Array.isArray(files) ? files : []).map((file) => buildAttachmentRecord(file));
    const ticket = {
      id: randomUUID(),
      title,
      detail,
      pagePath: normalizeText(input.pagePath, 400),
      pageTitle: normalizeText(input.pageTitle, 160),
      status: "open",
      attachments,
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getTicketPath(ticket.id), ticket);
    return toClientTicket(ticket);
  }

  async listTickets() {
    const names = await fs.readdir(config.feedbackTicketStoreDir).catch(() => []);
    const tickets = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(config.feedbackTicketStoreDir, name)))
    );

    return tickets
      .filter(Boolean)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  async listTicketsForClient() {
    const tickets = await this.listTickets();
    return tickets.map((ticket) => toClientTicket(ticket));
  }
}
