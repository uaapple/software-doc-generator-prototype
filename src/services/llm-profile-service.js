import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseURL: "https://api.openai.com/v1",
    baseURLEditable: true,
    modelPlaceholder: "gpt-4.1-mini"
  },
  {
    id: "doubao",
    label: "豆包",
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    baseURLEditable: true,
    modelPlaceholder: "doubao-seed-1-6"
  }
];

function now() {
  return new Date().toISOString();
}

function getProvider(providerId) {
  return PROVIDERS.find((item) => item.id === providerId) || null;
}

function maskApiKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 3)}***${apiKey.slice(-4)}`;
}

function normalizeProfileInput(input) {
  const provider = getProvider(input.provider);
  if (!provider) {
    throw new Error("Unsupported LLM provider");
  }

  const name = String(input.name || "").trim();
  const model = String(input.model || "").trim();
  const apiKey = String(input.apiKey || "").trim();
  const baseURL = String(input.baseURL || provider.defaultBaseURL || "").trim();

  if (!name) {
    throw new Error("Model name is required");
  }
  if (!model) {
    throw new Error("Model identifier is required");
  }
  if (!apiKey) {
    throw new Error("API key is required");
  }
  if (!baseURL) {
    throw new Error("Base URL is required");
  }

  return {
    providerId: provider.id,
    providerLabel: provider.label,
    name,
    model,
    apiKey,
    baseURL
  };
}

function toPublicProfile(profile) {
  return {
    id: profile.id,
    provider: profile.provider,
    providerLabel: getProvider(profile.provider)?.label || profile.provider,
    name: profile.name,
    model: profile.model,
    baseURL: profile.baseURL,
    apiKeyMasked: maskApiKey(profile.apiKey),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function buildSeedProfile() {
  if (!config.openai.apiKey) {
    return null;
  }

  const providerId = String(config.openai.baseURL || "").includes("volces.com") ? "doubao" : "openai";
  const provider = getProvider(providerId);
  return {
    id: "seed-profile",
    provider: provider.id,
    name: providerId === "doubao" ? "默认豆包模型" : "默认 OpenAI 模型",
    model: config.openai.model,
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseURL || provider.defaultBaseURL,
    createdAt: now(),
    updatedAt: now(),
    seeded: true
  };
}

function normalizeStore(store) {
  return {
    defaultProfileId: store?.defaultProfileId || "",
    profiles: Array.isArray(store?.profiles) ? store.profiles : []
  };
}

export class LlmProfileService {
  async ensureInitialized() {
    const existing = normalizeStore(await readJson(config.llmProfileStorePath, null));
    const seedProfile = buildSeedProfile();
    let changed = false;

    if (seedProfile) {
      const existingSeedIndex = existing.profiles.findIndex((profile) => profile.id === seedProfile.id);
      if (existingSeedIndex === -1) {
        existing.profiles.push(seedProfile);
        changed = true;
      }
    }

    if (!existing.defaultProfileId && existing.profiles.length) {
      existing.defaultProfileId = existing.profiles[0].id;
      changed = true;
    }

    if (changed || !(await readJson(config.llmProfileStorePath, null))) {
      await writeJson(config.llmProfileStorePath, existing);
    }

    return existing;
  }

  async readStore() {
    return this.ensureInitialized();
  }

  async writeStore(store) {
    await writeJson(config.llmProfileStorePath, store);
    return store;
  }

  async listProviders() {
    return PROVIDERS.map((provider) => ({ ...provider }));
  }

  async listProfiles() {
    const store = await this.readStore();
    return {
      defaultProfileId: store.defaultProfileId || store.profiles[0]?.id || "",
      profiles: store.profiles.map((profile) => toPublicProfile(profile))
    };
  }

  async getMeta() {
    const [providers, profileState] = await Promise.all([this.listProviders(), this.listProfiles()]);
    return {
      providers,
      defaultProfileId: profileState.defaultProfileId,
      profiles: profileState.profiles
    };
  }

  async addProfile(input) {
    const normalized = normalizeProfileInput(input || {});
    const store = await this.readStore();
    const profile = {
      id: randomUUID(),
      provider: normalized.providerId,
      name: normalized.name,
      model: normalized.model,
      apiKey: normalized.apiKey,
      baseURL: normalized.baseURL,
      createdAt: now(),
      updatedAt: now()
    };

    store.profiles.unshift(profile);
    if (!store.defaultProfileId) {
      store.defaultProfileId = profile.id;
    }
    await this.writeStore(store);
    return toPublicProfile(profile);
  }

  async setDefaultProfile(profileId) {
    const store = await this.readStore();
    const exists = store.profiles.some((profile) => profile.id === profileId);
    if (!exists) {
      throw new Error("LLM profile not found");
    }
    store.defaultProfileId = profileId;
    await this.writeStore(store);
    return this.getMeta();
  }

  async resolveProfile(profileId = "") {
    const store = await this.readStore();
    const resolvedId = profileId || store.defaultProfileId || store.profiles[0]?.id || "";
    if (!resolvedId) {
      return null;
    }
    return store.profiles.find((profile) => profile.id === resolvedId) || null;
  }
}
