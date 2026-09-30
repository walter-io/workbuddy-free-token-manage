import fs from 'node:fs';
import { atomicWriteJson, cachePath } from '../store/config.mjs';

/**
 * 通用 OpenAI 兼容平台适配器：各平台只需声明 baseUrl、免费判定规则和模态推断规则。
 * 统一产出与 OpenRouter 相同的模型结构，前端无需区分来源。
 *
 * normalizeGeneric 产出的 created 保持"秒"级时间戳，与 OpenRouter 归一化结果一致。
 */

export function normalizeGeneric(m, { platform, isFree, outputKind = 'text', supportsTools = true, loadable = true, supportsReasoning = false }) {
  const id = m.id || '';
  const vendor = id.includes('/') ? id.split('/')[0] : (m.owned_by || platform);
  return {
    id,
    platform,
    name: m.name || id,
    vendor,
    created: m.created != null ? Number(m.created) || null : null,
    description: m.description || '',
    contextLength: m.context_length || m.context_window || m.max_context_window_tokens || null,
    pricing: null,
    inputModalities: ['text'],
    outputModalities: [typeof outputKind === 'function' ? 'text' : outputKind],
    supportedParameters: [],
    isFree: typeof isFree === 'function' ? !!isFree(m) : !!isFree,
    outputKind: typeof outputKind === 'function' ? outputKind(m) : outputKind,
    supportsTools,
    supportsReasoning,
    supportsImageInput: false,
    loadable: typeof loadable === 'function' ? !!loadable(m) : !!loadable,
  };
}

const UPSTREAM_TIMEOUT_MS = 15_000;

export async function fetchModelsOpenAI({ platform, baseUrl, apiKey, extraHeaders = {} }) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${platform} /models 返回 HTTP ${res.status}`);
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : [];
  if (!list.length) throw new Error(`${platform} /models 返回为空`);
  return list;
}

/** 平台级两级缓存（内存 + ~/.free-token/cache/<platform>-models.json） */
const memCache = new Map();

export function modelsCacheFile(platform) {
  return cachePath(`${platform}-models.json`);
}

/** 服务端缓存有效期：期内直接回缓存；过期立即返回旧数据并在后台静默回源（stale-while-revalidate） */
export const MODELS_CACHE_TTL = 30 * 60_000;

const inflightRefreshes = new Map();

export async function getModelsCached({ platform, refresh = false, fetcher }) {
  const readCache = () => {
    if (memCache.has(platform)) return memCache.get(platform);
    try {
      const cached = JSON.parse(fs.readFileSync(modelsCacheFile(platform), 'utf8'));
      if (Array.isArray(cached?.models) && cached.models.length) {
        memCache.set(platform, cached);
        return cached;
      }
    } catch {
      /* 无缓存 */
    }
    return null;
  };
  const fetchAndStore = async () => {
    const models = await fetcher();
    const payload = { fetchedAt: Date.now(), platform, count: models.length, models };
    memCache.set(platform, payload);
    try {
      atomicWriteJson(modelsCacheFile(platform), payload);
    } catch {
      /* 缓存写失败不影响返回 */
    }
    return payload;
  };

  const cached = refresh ? null : readCache();
  // 无任何缓存或手动刷新：等待回源，失败向上抛
  if (refresh || !cached) return fetchAndStore();
  // 有效期内：直接回缓存
  if (Date.now() - cached.fetchedAt < MODELS_CACHE_TTL) return cached;
  // 过期缓存：立即返回旧数据，后台刷新（进行中不重复发起；失败保留旧数据，下次再试）
  if (!inflightRefreshes.has(platform)) {
    const p = fetchAndStore()
      .catch(() => {})
      .finally(() => inflightRefreshes.delete(platform));
    inflightRefreshes.set(platform, p);
  }
  return cached;
}

export function peekModelsCacheFor(platform) {
  return memCache.get(platform) || null;
}

/** 清空模型缓存（内存 + 磁盘），platform 省略时清全部 */
export function clearModelsCache(platform) {
  const ids = platform ? [platform] : [...memCache.keys()];
  for (const id of ids) memCache.delete(id);
  try {
    for (const f of fs.readdirSync(cachePath(''))) {
      if (f.endsWith('-models.json') && (!platform || f === modelsCacheFile(platform).split(/[\\/]/).pop())) {
        fs.unlinkSync(cachePath(f));
      }
    }
  } catch {
    /* ignore */
  }
}

/** 用 /models 可达性做 key 有效性校验（模型列表需要鉴权的平台用） */
export async function testKeyOpenAI({ baseUrl, apiKey, extraHeaders = {} }) {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...extraHeaders },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, invalid: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || '网络错误' };
  }
}

/**
 * 模型列表公开（无鉴权）平台的 key 校验：列表接口无法验证 key，
 * 改用一次 1-token 的 /chat/completions 探测（仅在用户点击「测试」时触发）。
 * 401/403 = key 无效；200/429/400（如模型参数问题）都认为鉴权通过。
 */
export async function testKeyByChatProbe({ baseUrl, apiKey, probeModel, extraHeaders = {} }) {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model: probeModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, invalid: true };
    if (res.status === 429) return { ok: true };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/model/i.test(text) && res.status === 404) return { ok: true }; // 鉴权已过，仅探测模型不存在
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || '网络错误' };
  }
}

/**
 * 平台工厂：把一个 OpenAI 兼容平台的配置变成注册表条目。
 * - isFree / loadable / outputKind 可以是布尔值或 (rawModel) => boolean|string 函数
 * - entryUrl(model) 自定义写入 WorkBuddy 的 url（默认 baseUrl，即由客户端拼 /chat/completions）
 * - modelsPublic=true 时模型列表无需鉴权，key 校验走 chat 探测（probeModel）
 */
export function defineOpenAIPlatform(cfg) {
  const {
    id,
    name,
    baseUrl,
    site,
    keyUrl,
    modelsPublic = false,
    isFree = true,
    loadable = true,
    outputKind = 'text',
    supportsTools = true,
    supportsReasoning = false,
    entryUrl,
    mapModelId,
    probeModel,
    fetchQuotaForKey,
    keyFormat,
    note = null,
    extraHeaders = {},
  } = cfg;

  const normalize = (m) => {
    if (mapModelId && m.id) m = { ...m, id: mapModelId(m.id) };
    return normalizeGeneric(m, { platform: id, isFree, outputKind, supportsTools, supportsReasoning, loadable });
  };

  return {
    id,
    name,
    baseUrl,
    site: site || null,
    keyUrl: keyUrl || null,
    modelsPublic,
    keyFormat: keyFormat || null,
    note,
    getModels: async ({ refresh = false, apiKey } = {}) => {
      try {
        return await getModelsCached({
          platform: id,
          refresh,
          fetcher: async () => {
            const list = await fetchModelsOpenAI({ platform: name, baseUrl, apiKey, extraHeaders });
            return list.map(normalize);
          },
        });
      } catch (err) {
        const msg = String(err?.message || err);
        if (/HTTP 40[13]/.test(msg)) {
          throw new Error(`${name} 需要配置 API Key 才能获取模型列表，请到「设置」添加`);
        }
        throw err;
      }
    },
    peek: () => peekModelsCacheFor(id),
    fetchQuotaForKey,
    testKey: async (apiKey) => {
      if (modelsPublic) {
        let model = probeModel;
        if (!model) {
          try {
            const list = await fetchModelsOpenAI({ platform: name, baseUrl, apiKey, extraHeaders });
            model = list[0]?.id;
          } catch {
            model = null;
          }
        }
        if (!model) return { ok: false, error: '无法确定探测模型' };
        return testKeyByChatProbe({ baseUrl, apiKey, probeModel: model, extraHeaders });
      }
      return testKeyOpenAI({ baseUrl, apiKey, extraHeaders });
    },
    buildEntry: (model, apiKey) => ({
      id: model.id,
      name: model.name || model.id,
      vendor: 'Custom',
      url: entryUrl ? entryUrl(model) : baseUrl,
      apiKey,
      supportsToolCall: !!model.supportsTools,
      supportsImages: !!model.supportsImageInput,
      supportsReasoning: !!model.supportsReasoning,
      useCustomProtocol: false,
    }),
  };
}
