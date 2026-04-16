import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

const INSTANCES = new Map();

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return value === undefined ? null : JSON.stringify(value ?? null);
}

function trimValue(value) {
  if (Array.isArray(value)) {
    const next = value.map((item) => trimValue(item)).filter((item) => item !== undefined);
    return next.length ? next : undefined;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }
    return value;
  }
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = trimValue(entry);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function sortByOrder(items = []) {
  return [...items].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

export class SkillDatabaseService {
  constructor(dbPath = config.skillDatabasePath) {
    const cached = INSTANCES.get(dbPath);
    if (cached) {
      return cached;
    }

    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initializeSchema();
    INSTANCES.set(dbPath, this);
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL DEFAULT 1,
        layer TEXT NOT NULL,
        profile_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        document_type_scope TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(layer, profile_key)
      );

      CREATE TABLE IF NOT EXISTS skill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        skill_code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        order_index INTEGER NOT NULL,
        section_key TEXT NOT NULL DEFAULT 'default',
        provenance_json TEXT,
        review_json TEXT,
        structured_payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_rule_hints (
        skill_item_id INTEGER PRIMARY KEY,
        domain TEXT NOT NULL DEFAULT '',
        document_type TEXT NOT NULL DEFAULT '',
        subdomain TEXT NOT NULL DEFAULT '',
        writing_pattern TEXT NOT NULL DEFAULT '',
        target_style TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_rule_hint_section_hints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_item_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_rule_hint_source_basis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_item_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_source_aliases (
        skill_item_id INTEGER PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_source_alias_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_item_id INTEGER NOT NULL,
        alias_value TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_forbidden_expansions (
        skill_item_id INTEGER PRIMARY KEY,
        topic TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_forbidden_expansion_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_item_id INTEGER NOT NULL,
        entry_value TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_normalization_rules (
        skill_item_id INTEGER PRIMARY KEY,
        pattern TEXT NOT NULL DEFAULT '',
        replacement TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_source_policy_settings (
        skill_item_id INTEGER PRIMARY KEY,
        policy_key TEXT NOT NULL,
        policy_value_json TEXT,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_blueprint_sections (
        skill_item_id INTEGER PRIMARY KEY,
        role TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        section_number TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_blueprint_section_requirement_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_item_id INTEGER NOT NULL,
        requirement_type TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_blueprint_policies (
        skill_item_id INTEGER PRIMARY KEY,
        policy_key TEXT NOT NULL,
        policy_value_json TEXT,
        FOREIGN KEY(skill_item_id) REFERENCES skill_items(id) ON DELETE CASCADE
      );
    `);
  }

  setMeta(key, value) {
    this.db.prepare(`
      INSERT INTO skill_meta(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value ?? ""));
  }

  getMeta(key, fallback = "") {
    const row = this.db.prepare("SELECT value FROM skill_meta WHERE key = ?").get(key);
    return row?.value ?? fallback;
  }

  isImported() {
    return this.getMeta("active_imported", "") === "true";
  }

  markImported() {
    this.setMeta("active_imported", "true");
    this.setMeta("last_imported_at", new Date().toISOString());
  }

  clearAll() {
    this.db.exec(`
      DELETE FROM skill_blueprint_section_requirement_types;
      DELETE FROM skill_blueprint_sections;
      DELETE FROM skill_blueprint_policies;
      DELETE FROM skill_source_policy_settings;
      DELETE FROM skill_normalization_rules;
      DELETE FROM skill_forbidden_expansion_entries;
      DELETE FROM skill_forbidden_expansions;
      DELETE FROM skill_source_alias_values;
      DELETE FROM skill_source_aliases;
      DELETE FROM skill_rule_hint_source_basis;
      DELETE FROM skill_rule_hint_section_hints;
      DELETE FROM skill_rule_hints;
      DELETE FROM skill_items;
      DELETE FROM profiles;
    `);
  }

  importRegistries(registries = []) {
    this.db.exec("BEGIN");
    try {
      this.clearAll();
      for (const registry of registries) {
        this.saveProfileRegistry(registry);
      }
      this.markImported();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listProfiles() {
    return this.db
      .prepare(`
        SELECT id, version, layer, profile_key AS profileKey, display_name AS displayName,
               document_type_scope AS documentTypeScope, status, created_at AS createdAt, updated_at AS updatedAt
        FROM profiles
        ORDER BY
          CASE layer
            WHEN 'generic' THEN 1
            WHEN 'docType' THEN 2
            WHEN 'domain' THEN 3
            ELSE 4
          END,
          profile_key
      `)
      .all();
  }

  loadProfileRegistry(layer, profileKey) {
    const profile = this.db.prepare(`
      SELECT id, version, layer, profile_key AS profileKey, display_name AS displayName,
             document_type_scope AS documentTypeScope, status, created_at AS createdAt, updated_at AS updatedAt
      FROM profiles
      WHERE layer = ? AND profile_key = ?
    `).get(layer, profileKey);

    if (!profile) {
      return null;
    }

    const itemRows = this.db.prepare(`
      SELECT id, skill_code AS skillCode, kind, title, content, status, order_index AS orderIndex,
             section_key AS sectionKey, provenance_json AS provenanceJson, review_json AS reviewJson,
             structured_payload_json AS structuredPayloadJson, created_at AS createdAt, updated_at AS updatedAt
      FROM skill_items
      WHERE profile_id = ?
      ORDER BY order_index, id
    `).all(profile.id);

    return {
      version: Number(profile.version || 1) || 1,
      layer: profile.layer,
      profileKey: profile.profileKey,
      displayName: profile.displayName,
      documentTypeScope: profile.documentTypeScope || "",
      status: profile.status || "active",
      items: itemRows.map((row) => ({
        skillCode: row.skillCode,
        layer: profile.layer,
        profileKey: profile.profileKey,
        kind: row.kind,
        title: row.title,
        content: row.content || "",
        status: row.status || "active",
        order: Number(row.orderIndex || 0) || 0,
        sectionKey: row.sectionKey || "default",
        provenance: parseJson(row.provenanceJson, {}) || {},
        review: parseJson(row.reviewJson, {}) || {},
        structuredPayload: this.buildStructuredPayload(row.id, row.kind, row.structuredPayloadJson),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    };
  }

  saveProfileRegistry(registry) {
    const normalizedItems = sortByOrder(registry.items || []).map((item, index) => ({
      ...item,
      order: index + 1
    }));
    const profileRow = this.db.prepare(`
      INSERT INTO profiles(version, layer, profile_key, display_name, document_type_scope, status, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(layer, profile_key) DO UPDATE SET
        version = excluded.version,
        display_name = excluded.display_name,
        document_type_scope = excluded.document_type_scope,
        status = excluded.status,
        updated_at = excluded.updated_at
      RETURNING id
    `).get(
      Number(registry.version || 1) || 1,
      registry.layer,
      registry.profileKey,
      registry.displayName || registry.profileKey,
      registry.documentTypeScope || "",
      registry.status || "active",
      registry.createdAt || new Date().toISOString(),
      registry.updatedAt || new Date().toISOString()
    );

    const profileId = profileRow.id;
    const itemIds = this.db.prepare("SELECT id FROM skill_items WHERE profile_id = ?").all(profileId).map((row) => row.id);
    for (const itemId of itemIds) {
      this.deleteStructuredRows(itemId);
    }
    this.db.prepare("DELETE FROM skill_items WHERE profile_id = ?").run(profileId);

    const insertItem = this.db.prepare(`
      INSERT INTO skill_items(
        profile_id, skill_code, kind, title, content, status, order_index, section_key,
        provenance_json, review_json, structured_payload_json, created_at, updated_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `);

    for (const item of normalizedItems) {
      const itemRow = insertItem.get(
        profileId,
        item.skillCode,
        item.kind,
        item.title || "",
        item.content || "",
        item.status || "active",
        Number(item.order || 0) || 0,
        item.sectionKey || "default",
        stringifyJson(item.provenance || {}),
        stringifyJson(item.review || {}),
        stringifyJson(item.structuredPayload ?? null),
        item.createdAt || new Date().toISOString(),
        item.updatedAt || new Date().toISOString()
      );
      this.saveStructuredRows(itemRow.id, item.kind, item.structuredPayload);
    }
  }

  getItem(skillCode) {
    const row = this.db.prepare(`
      SELECT p.layer, p.profile_key AS profileKey
      FROM skill_items si
      JOIN profiles p ON p.id = si.profile_id
      WHERE si.skill_code = ?
    `).get(skillCode);
    if (!row) return null;
    const registry = this.loadProfileRegistry(row.layer, row.profileKey);
    return registry?.items.find((item) => item.skillCode === skillCode) || null;
  }

  removeProfile(layer, profileKey) {
    this.db.prepare("DELETE FROM profiles WHERE layer = ? AND profile_key = ?").run(layer, profileKey);
  }

  deleteStructuredRows(skillItemId) {
    this.db.prepare("DELETE FROM skill_blueprint_section_requirement_types WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_blueprint_sections WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_blueprint_policies WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_source_policy_settings WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_normalization_rules WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_forbidden_expansion_entries WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_forbidden_expansions WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_source_alias_values WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_source_aliases WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_rule_hint_source_basis WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_rule_hint_section_hints WHERE skill_item_id = ?").run(skillItemId);
    this.db.prepare("DELETE FROM skill_rule_hints WHERE skill_item_id = ?").run(skillItemId);
  }

  saveStructuredRows(skillItemId, kind, payload) {
    if (!payload || typeof payload !== "object") return;

    if (kind === "rule_hint") {
      this.db.prepare(`
        INSERT INTO skill_rule_hints(skill_item_id, domain, document_type, subdomain, writing_pattern, target_style)
        VALUES(?, ?, ?, ?, ?, ?)
      `).run(
        skillItemId,
        String(payload.domain || ""),
        String(payload.documentType || ""),
        String(payload.subdomain || ""),
        String(payload.writingPattern || ""),
        String(payload.targetStyle || "")
      );
      (payload.sectionHints || []).forEach((value, index) => {
        this.db.prepare(`
          INSERT INTO skill_rule_hint_section_hints(skill_item_id, value, order_index)
          VALUES(?, ?, ?)
        `).run(skillItemId, String(value || ""), index + 1);
      });
      (payload.sourceBasis || []).forEach((value, index) => {
        this.db.prepare(`
          INSERT INTO skill_rule_hint_source_basis(skill_item_id, value, order_index)
          VALUES(?, ?, ?)
        `).run(skillItemId, String(value || ""), index + 1);
      });
      return;
    }

    if (kind === "source_alias") {
      this.db.prepare(`
        INSERT INTO skill_source_aliases(skill_item_id, canonical_name)
        VALUES(?, ?)
      `).run(skillItemId, String(payload.canonical || ""));
      (payload.aliases || []).forEach((value, index) => {
        this.db.prepare(`
          INSERT INTO skill_source_alias_values(skill_item_id, alias_value, order_index)
          VALUES(?, ?, ?)
        `).run(skillItemId, String(value || ""), index + 1);
      });
      return;
    }

    if (kind === "forbidden_expansion") {
      this.db.prepare(`
        INSERT INTO skill_forbidden_expansions(skill_item_id, topic)
        VALUES(?, ?)
      `).run(skillItemId, String(payload.topic || ""));
      (payload.entries || payload.items || []).forEach((value, index) => {
        this.db.prepare(`
          INSERT INTO skill_forbidden_expansion_entries(skill_item_id, entry_value, order_index)
          VALUES(?, ?, ?)
        `).run(skillItemId, String(value || ""), index + 1);
      });
      return;
    }

    if (kind === "normalization_rule") {
      this.db.prepare(`
        INSERT INTO skill_normalization_rules(skill_item_id, pattern, replacement)
        VALUES(?, ?, ?)
      `).run(skillItemId, String(payload.pattern || ""), String(payload.replacement || ""));
      return;
    }

    if (kind === "source_policy_setting") {
      this.db.prepare(`
        INSERT INTO skill_source_policy_settings(skill_item_id, policy_key, policy_value_json)
        VALUES(?, ?, ?)
      `).run(skillItemId, String(payload.key || ""), stringifyJson(payload.value));
      return;
    }

    if (kind === "document_blueprint_section") {
      this.db.prepare(`
        INSERT INTO skill_blueprint_sections(skill_item_id, role, title, section_number)
        VALUES(?, ?, ?, ?)
      `).run(skillItemId, String(payload.role || ""), String(payload.title || ""), String(payload.sectionNumber || ""));
      (payload.coreRequirementTypes || []).forEach((value, index) => {
        this.db.prepare(`
          INSERT INTO skill_blueprint_section_requirement_types(skill_item_id, requirement_type, order_index)
          VALUES(?, ?, ?)
        `).run(skillItemId, String(value || ""), index + 1);
      });
      return;
    }

    if (kind === "document_blueprint_policy") {
      this.db.prepare(`
        INSERT INTO skill_blueprint_policies(skill_item_id, policy_key, policy_value_json)
        VALUES(?, ?, ?)
      `).run(skillItemId, String(payload.key || ""), stringifyJson(payload.value));
    }
  }

  buildStructuredPayload(skillItemId, kind, fallbackJson) {
    const fallback = parseJson(fallbackJson, null);

    if (kind === "rule_hint") {
      const row = this.db.prepare(`
        SELECT domain, document_type AS documentType, subdomain, writing_pattern AS writingPattern, target_style AS targetStyle
        FROM skill_rule_hints
        WHERE skill_item_id = ?
      `).get(skillItemId);
      if (row) {
        return trimValue({
          ...fallback,
          ...row,
          sectionHints: this.db
            .prepare("SELECT value FROM skill_rule_hint_section_hints WHERE skill_item_id = ? ORDER BY order_index")
            .all(skillItemId)
            .map((entry) => entry.value),
          sourceBasis: this.db
            .prepare("SELECT value FROM skill_rule_hint_source_basis WHERE skill_item_id = ? ORDER BY order_index")
            .all(skillItemId)
            .map((entry) => entry.value)
        }) || null;
      }
    }

    if (kind === "source_alias") {
      const row = this.db.prepare("SELECT canonical_name AS canonical FROM skill_source_aliases WHERE skill_item_id = ?").get(skillItemId);
      if (row) {
        return trimValue({
          ...fallback,
          ...row,
          aliases: this.db
            .prepare("SELECT alias_value FROM skill_source_alias_values WHERE skill_item_id = ? ORDER BY order_index")
            .all(skillItemId)
            .map((entry) => entry.alias_value)
        }) || null;
      }
    }

    if (kind === "forbidden_expansion") {
      const row = this.db.prepare("SELECT topic FROM skill_forbidden_expansions WHERE skill_item_id = ?").get(skillItemId);
      if (row) {
        return trimValue({
          ...fallback,
          ...row,
          entries: this.db
            .prepare("SELECT entry_value FROM skill_forbidden_expansion_entries WHERE skill_item_id = ? ORDER BY order_index")
            .all(skillItemId)
            .map((entry) => entry.entry_value)
        }) || null;
      }
    }

    if (kind === "normalization_rule") {
      const row = this.db.prepare("SELECT pattern, replacement FROM skill_normalization_rules WHERE skill_item_id = ?").get(skillItemId);
      if (row) return trimValue({ ...fallback, ...row }) || null;
    }

    if (kind === "source_policy_setting") {
      const row = this.db.prepare("SELECT policy_key AS key, policy_value_json AS valueJson FROM skill_source_policy_settings WHERE skill_item_id = ?").get(skillItemId);
      if (row) return trimValue({ ...fallback, key: row.key, value: parseJson(row.valueJson, fallback?.value ?? null) }) || null;
    }

    if (kind === "document_blueprint_section") {
      const row = this.db.prepare(`
        SELECT role, title, section_number AS sectionNumber
        FROM skill_blueprint_sections
        WHERE skill_item_id = ?
      `).get(skillItemId);
      if (row) {
        return trimValue({
          ...fallback,
          ...row,
          coreRequirementTypes: this.db
            .prepare("SELECT requirement_type FROM skill_blueprint_section_requirement_types WHERE skill_item_id = ? ORDER BY order_index")
            .all(skillItemId)
            .map((entry) => entry.requirement_type)
        }) || null;
      }
    }

    if (kind === "document_blueprint_policy") {
      const row = this.db.prepare("SELECT policy_key AS key, policy_value_json AS valueJson FROM skill_blueprint_policies WHERE skill_item_id = ?").get(skillItemId);
      if (row) return trimValue({ ...fallback, key: row.key, value: parseJson(row.valueJson, fallback?.value ?? null) }) || null;
    }

    return trimValue(fallback) || null;
  }

  close() {
    try {
      this.db.close();
    } catch (_error) {
      // noop
    }
    INSTANCES.delete(this.dbPath);
  }

  static closeAll() {
    for (const instance of INSTANCES.values()) {
      instance.close();
    }
    INSTANCES.clear();
  }
}
