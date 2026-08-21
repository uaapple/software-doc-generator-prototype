import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./storage.js";

const COOKIE_NAME = "sdg_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "11118888";

function cleanUser(user = {}) {
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    displayName: String(user.displayName || user.username || ""),
    role: user.role === "admin" ? "admin" : "user",
    createdAt: String(user.createdAt || "")
  };
}

function passwordRecord(password = "") {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function passwordMatches(password = "", record = {}) {
  if (!record.salt || !record.hash) return false;
  const expected = Buffer.from(record.hash, "hex");
  const actual = scryptSync(password, record.salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class SimpleAuthService {
  constructor(dataDir = "") {
    this.adminDir = path.join(dataDir, "admin");
    this.accountsPath = path.join(this.adminDir, "accounts.json");
    this.legacyAuthPath = path.join(this.adminDir, "auth.json");
    this.sessions = new Map();
  }

  async ensureInitialized() {
    await fs.mkdir(this.adminDir, { recursive: true });
    const store = await readJson(this.accountsPath, null);
    if (!store || !Array.isArray(store.users) || store.users.length === 0) {
      const now = new Date().toISOString();
      await this.saveUsers([{
        id: randomUUID(),
        username: DEFAULT_ADMIN_USERNAME,
        displayName: "管理员",
        role: "admin",
        createdAt: now,
        password: passwordRecord(DEFAULT_ADMIN_PASSWORD)
      }]);
    }
  }

  async readUsers() {
    const store = await readJson(this.accountsPath, { users: [] });
    return Array.isArray(store.users) ? store.users : [];
  }

  async saveUsers(users = []) {
    await writeJson(this.accountsPath, { schema: "sdg-accounts/v1", updatedAt: new Date().toISOString(), users });
  }

  async setupRequired() {
    return false;
  }

  validateInput(username = "", password = "") {
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw Object.assign(new Error("用户名需为 3-32 位字母、数字、下划线或短横线。"), { statusCode: 400 });
    if (String(password).length < 8) throw Object.assign(new Error("密码至少 8 位。"), { statusCode: 400 });
  }

  async bootstrap({ bootstrapCode = "", username = "", displayName = "", password = "" } = {}) {
    if (!(await this.setupRequired())) throw Object.assign(new Error("管理员已经初始化。"), { statusCode: 409 });
    const legacy = await readJson(this.legacyAuthPath, null);
    const digest = createHash("sha256").update(String(bootstrapCode)).digest("hex");
    if (!legacy?.bootstrapHash || legacy.bootstrapHash !== digest) throw Object.assign(new Error("Bootstrap Code 不正确。"), { statusCode: 403 });
    this.validateInput(username, password);
    const now = new Date().toISOString();
    const user = { id: randomUUID(), username, displayName: String(displayName || username).trim(), role: "admin", createdAt: now, password: passwordRecord(password) };
    await this.saveUsers([user]);
    return cleanUser(user);
  }

  async login(username = "", password = "") {
    const user = (await this.readUsers()).find((item) => item.username === String(username).trim());
    if (!user || !passwordMatches(password, user.password)) throw Object.assign(new Error("用户名或密码错误。"), { statusCode: 401 });
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, { user: cleanUser(user), expiresAt: Date.now() + SESSION_TTL_MS });
    return { token, user: cleanUser(user) };
  }

  sessionFromRequest(req) {
    const cookies = Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter(([key]) => key));
    const token = cookies[COOKIE_NAME] || "";
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (token) this.sessions.delete(token);
      return null;
    }
    return { token, user: session.user };
  }

  cookieHeader(token = "") {
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
  }

  clearCookieHeader() {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  logout(req) {
    const session = this.sessionFromRequest(req);
    if (session) this.sessions.delete(session.token);
  }

  async listAccounts() {
    return (await this.readUsers()).map(cleanUser);
  }

  async createAccount({ username = "", displayName = "", password = "", role = "user" } = {}) {
    this.validateInput(username, password);
    const users = await this.readUsers();
    if (users.some((item) => item.username === username)) throw Object.assign(new Error("用户名已存在。"), { statusCode: 409 });
    const user = { id: randomUUID(), username, displayName: String(displayName || username).trim(), role: role === "admin" ? "admin" : "user", createdAt: new Date().toISOString(), password: passwordRecord(password) };
    await this.saveUsers([...users, user]);
    return cleanUser(user);
  }

  async changePassword(userId = "", oldPassword = "", newPassword = "") {
    if (String(newPassword).length < 8) throw Object.assign(new Error("新密码至少 8 位。"), { statusCode: 400 });
    const users = await this.readUsers();
    const user = users.find((item) => item.id === userId);
    if (!user || !passwordMatches(oldPassword, user.password)) throw Object.assign(new Error("旧密码不正确。"), { statusCode: 403 });
    user.password = passwordRecord(newPassword);
    await this.saveUsers(users);
    for (const [token, session] of this.sessions) if (session.user.id === userId) this.sessions.delete(token);
    return { ok: true };
  }
}
