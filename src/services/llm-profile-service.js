import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseURL: "https://api.openai.com/v1",
    baseURLEditable: true,
    modelPlaceholder: "gpt-4.1-mini",
    requiresApiKey: true
  },
  {
    id: "doubao",
    label: "豆包",
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    baseURLEditable: true,
    modelPlaceholder: "doubao-seed-1-6",
    requiresApiKey: true
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    defaultBaseURL: "https://open.bigmodel.cn/api/paas/v4",
    baseURLEditable: true,
    modelPlaceholder: "glm-4.5-air",
    requiresApiKey: true
  },
  {
    id: "ollama",
    label: "Ollama",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    baseURLEditable: true,
    modelPlaceholder: "gemma3:4b",
    requiresApiKey: false
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

function normalizeProfileInput(input, options = {}) {
  const provider = getProvider(input.provider);
  if (!provider) {
    throw new Error("Unsupported LLM provider");
  }

  const requireApiKey = options.requireApiKey ?? provider.requiresApiKey !== false;
  const existingProfile = options.existingProfile || null;
  const name = String(input.name || "").trim();
  const model = String(input.model || "").trim();
  const apiKey = String(input.apiKey || "").trim() || existingProfile?.apiKey || "";
  const baseURL = String(input.baseURL || provider.defaultBaseURL || "").trim();

  if (!name) {
    throw new Error("Model name is required");
  }
  if (!model) {
    throw new Error("Model identifier is required");
  }
  if (requireApiKey && !apiKey) {
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
    updatedAt: profile.updatedAt,
    seeded: Boolean(profile.seeded)
  };
}

function buildSeedProfile() {
  if (!config.openai.apiKey) {
    return null;
  }

  const baseURL = String(config.openai.baseURL || "");
  const providerId = baseURL.includes("volces.com")
    ? "doubao"
    : baseURL.includes("bigmodel.cn")
      ? "zhipu"
      : "openai";
  const provider = getProvider(providerId);
  const seedNameMap = {
    doubao: "默认豆包模型",
    zhipu: "默认智谱模型",
    openai: "默认 OpenAI 模型"
  };
  return {
    id: "seed-profile",
    provider: provider.id,
    name: seedNameMap[providerId] || "默认模型",
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
    const rawStore = await readJson(config.llmProfileStorePath, null);
    const existing = normalizeStore(rawStore);
    const seedProfile = buildSeedProfile();
    let changed = false;

    if (seedProfile) {
      const existingSeedIndex = existing.profiles.findIndex((profile) => profile.id === seedProfile.id);
      if (existingSeedIndex === -1) {
        if (!rawStore || !existing.profiles.length) {
          existing.profiles.push(seedProfile);
          changed = true;
        }
      } else {
        const currentSeed = existing.profiles[existingSeedIndex];
        const shouldRepairSeed =
          currentSeed.name !== seedProfile.name ||
          currentSeed.provider !== seedProfile.provider ||
          currentSeed.baseURL !== seedProfile.baseURL ||
          currentSeed.model !== seedProfile.model ||
          currentSeed.apiKey !== seedProfile.apiKey ||
          !currentSeed.seeded;

        if (shouldRepairSeed) {
          existing.profiles[existingSeedIndex] = {
            ...currentSeed,
            ...seedProfile,
            createdAt: currentSeed.createdAt || seedProfile.createdAt,
            updatedAt: now()
          };
          changed = true;
        }
      }
    }

    if (!existing.defaultProfileId && existing.profiles.length) {
      existing.defaultProfileId = existing.profiles[0].id;
      changed = true;
    }

    if (changed || !rawStore) {
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

  async updateProfile(profileId, input) {
    const store = await this.readStore();
    const profileIndex = store.profiles.findIndex((profile) => profile.id === profileId);
    if (profileIndex === -1) {
      throw new Error("LLM profile not found");
    }

    const currentProfile = store.profiles[profileIndex];
    const normalized = normalizeProfileInput(input || {}, {
      requireApiKey: false,
      existingProfile: currentProfile
    });

    const updatedProfile = {
      ...currentProfile,
      provider: normalized.providerId,
      name: normalized.name,
      model: normalized.model,
      apiKey: normalized.apiKey,
      baseURL: normalized.baseURL,
      updatedAt: now()
    };

    store.profiles[profileIndex] = updatedProfile;
    await this.writeStore(store);
    return toPublicProfile(updatedProfile);
  }

  async deleteProfile(profileId) {
    const store = await this.readStore();
    const profileIndex = store.profiles.findIndex((profile) => profile.id === profileId);
    if (profileIndex === -1) {
      throw new Error("LLM profile not found");
    }

    const [removedProfile] = store.profiles.splice(profileIndex, 1);
    if (store.defaultProfileId === profileId) {
      store.defaultProfileId = store.profiles[0]?.id || "";
    }

    await this.writeStore(store);
    return {
      removedProfileId: profileId,
      removedProfile: toPublicProfile(removedProfile),
      meta: await this.getMeta()
    };
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

  async testProfileConnectivity(profileId) {
    const profile = await this.resolveProfile(profileId);
    if (!profile) {
      throw new Error("LLM profile not found");
    }

    const startedAt = Date.now();

    if (profile.provider === "ollama") {
      const response = await fetch(`${String(profile.baseURL || "").replace(/\/v1\/?$/i, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: profile.model,
          prompt: '只输出 JSON：{"ok":true}',
          stream: false,
          format: "json",
          options: { temperature: 0 }
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!String(result?.response || "").trim()) {
        throw new Error("Ollama returned empty response body");
      }
    } else {
      const client = new OpenAI({
        apiKey: profile.apiKey,
        baseURL: profile.baseURL,
        timeout: 15000,
        maxRetries: 0
      });

      await client.chat.completions.create({
        model: profile.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0
      });
    }

    return {
      profileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
      model: profile.model,
      baseURL: profile.baseURL,
      durationMs: Date.now() - startedAt,
      checkedAt: now(),
      success: true
    };
  }
}

