import { getModelsCached, peekModelsCacheFor } from './genericOpenAI.mjs';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const BASE = OPENROUTER_BASE_URL;

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function inferOutputMods(modality) {
  // modality 形如 "text->text"、"text+image->text"、"text->image"
  const out = String(modality || '').split('->')[1] || '';
  return out.split('+').map((s) => s.trim()).filter(Boolean);
}

function inferInputMods(modality) {
  const input = String(modality || '').split('->')[0] || '';
  return input.split('+').map((s) => s.trim()).filter(Boolean);
}

/** 把 OpenRouter 原始模型对象压平成工具内部使用的结构 */
export function normalizeModel(m) {
  const id = m.id || '';
  const pricing = m.pricing || {};
  const arch = m.architecture || {};
  const sp = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
  const inputMods =
    Array.isArray(arch.input_modalities) && arch.input_modalities.length
      ? arch.input_modalities
      : inferInputMods(arch.modality);
  const outputMods =
    Array.isArray(arch.output_modalities) && arch.output_modalities.length
      ? arch.output_modalities
      : inferOutputMods(arch.modality);

  const promptPrice = num(pricing.prompt);
  const completionPrice = num(pricing.completion);
  const requestPrice = num(pricing.request);
  const imagePrice = num(pricing.image);
  const allZero =
    promptPrice === 0 &&
    completionPrice === 0 &&
    (requestPrice === null || requestPrice === 0) &&
    (imagePrice === null || imagePrice === 0);
  const isFree = id.endsWith(':free') || allZero;

  const outputKind = outputMods.includes('video')
    ? 'video'
    : outputMods.includes('image')
      ? 'image'
      : 'text';

  return {
    id,
    name: m.name || id,
    vendor: id.includes('/') ? id.split('/')[0] : 'other',
    created: m.created || null,
    description: m.description || '',
    contextLength: m.context_length ?? null,
    pricing: {
      prompt: promptPrice,
      completion: completionPrice,
      request: requestPrice,
      image: imagePrice,
    },
    inputModalities: inputMods,
    outputModalities: outputMods,
    supportedParameters: sp,
    isFree,
    outputKind, // text | image | video
    supportsTools: sp.includes('tools'),
    supportsReasoning: sp.includes('reasoning') || sp.includes('include_reasoning'),
    supportsImageInput: inputMods.includes('image'),
  };
}

export async function fetchModelsFromApi() {
  const res = await fetch(`${BASE}/models`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenRouter /models 返回 HTTP ${res.status}`);
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : [];
  if (!list.length) throw new Error('OpenRouter /models 返回为空');
  return list.map(normalizeModel);
}

/** 带两级缓存的模型列表：内存 -> ~/.free-token/cache -> OpenRouter API（30 分钟内直接回缓存） */
export async function getModels({ refresh = false } = {}) {
  return getModelsCached({ platform: 'openrouter', refresh, fetcher: fetchModelsFromApi });
}

export async function fetchKeyInfo(apiKey) {
  const res = await fetch(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) return { ok: false, invalid: true };
  if (!res.ok) throw new Error(`OpenRouter /key 返回 HTTP ${res.status}`);
  const json = await res.json();
  return { ok: true, data: json?.data || {} };
}

export async function fetchCredits(apiKey) {
  const res = await fetch(`${BASE}/credits`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data || null; // { total_credits, total_usage }
}

/** 汇总单个 key 的额度信息：免费次数、用量、余额 */
export async function fetchQuotaForKey(apiKey) {
  const info = await fetchKeyInfo(apiKey);
  if (!info.ok) return { ok: false, invalid: true };
  let credits = null;
  try {
    credits = await fetchCredits(apiKey);
  } catch {
    credits = null;
  }
  return { ok: true, key: info.data, credits };
}

/** 校验 key 并返回可展示的信息（label 来自 OpenRouter，本地可自定义备注） */
export async function testKey(apiKey) {
  const info = await fetchKeyInfo(apiKey);
  if (!info.ok) return { ok: false, invalid: true };
  return { ok: true, label: info.data.label || '', isFreeTier: !!info.data.is_free_tier };
}

/** OpenRouter 模型 -> WorkBuddy models.json 条目（url 为 base URL，由客户端拼接路径） */
export function buildEntry(model, apiKey) {
  return {
    id: model.id,
    name: model.name || model.id,
    vendor: 'Custom',
    url: OPENROUTER_BASE_URL,
    apiKey,
    supportsToolCall: !!model.supportsTools,
    supportsImages: !!model.supportsImageInput,
    supportsReasoning: !!model.supportsReasoning,
    useCustomProtocol: false,
  };
}

export function peekModels() {
  return peekModelsCacheFor('openrouter');
}

export const keyFormat = /^sk-or-[A-Za-z0-9-]+$/;
