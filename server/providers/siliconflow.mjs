import { defineOpenAIPlatform } from './genericOpenAI.mjs';
import { proxyFetch } from '../proxy.mjs';

/**
 * 硅基流动 SiliconFlow（https://siliconflow.cn）
 * 国内直连友好；部分小模型永久免费，其余按量计费。
 * 官方 /v1/user/balance 余额接口已于 2026-08 下线，额度页降级为紧凑状态展示，
 * 若官方后续提供替代接口，只需恢复 fetchQuotaForKey 的解析逻辑。
 */
const BASE = 'https://api.siliconflow.cn/v1';

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

async function fetchQuotaForKey(apiKey) {
  try {
    const res = await proxyFetch(`${BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, invalid: true };
    if (!res.ok) return { ok: true, unavailable: `官方余额接口已不可用（HTTP ${res.status}），请到官网「费用账单」查看` };
    const json = await res.json();
    const d = json?.data || {};
    return { ok: true, balance: { total: num(d.totalBalance), charge: num(d.chargeBalance), gift: num(d.balance) } };
  } catch (err) {
    return { ok: true, unavailable: err?.message || '网络错误' };
  }
}

/**
 * 免费模型清单（官方定价快照，2026-08-21 校对；来源：siliconflow.cn 模型广场"免费"标注）。
 * 官方 /v1/models 不含价格字段，无法动态判定，故采用精确清单；免费名单调整时更新此处即可。
 * 付费版模型为同 ID 加 Pro/ 前缀，不在本清单内。
 */
const FREE_MODEL_IDS = new Set([
  'THUDM/GLM-Z1-9B-0414',
  'THUDM/GLM-4-9B-0414',
  'tencent/Hunyuan-MT-7B',
  'PaddlePaddle/PaddleOCR-VL-1.5',
  'Kwai-Kolors/Kolors',
  'Qwen/Qwen3-ASR-1.7B',
  'TeleAI/TeleSpeechASR',
  'FunAudioLLM/SenseVoiceSmall',
  'BAAI/bge-m3',
  'BAAI/bge-large-zh-v1.5',
  'BAAI/bge-reranker-v2-m3',
  'BAAI/bge-m3-reranker',
]);

/** 非对话模型（embedding / rerank / 语音 / OCR / 绘图），不可载入 WorkBuddy */
const NON_CHAT_RE = /(bge|rerank|asr|sensevoice|tts|ocr|kolors|embedding)/i;

export const platform = defineOpenAIPlatform({
  id: 'siliconflow',
  name: 'SiliconFlow',
  site: 'https://siliconflow.cn',
  keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  baseUrl: BASE,
  modelsPublic: false,
  isFree: (m) => FREE_MODEL_IDS.has(m.id),
  loadable: (m) => !NON_CHAT_RE.test(m.id),
  keyFormat: /^[A-Za-z0-9_-]{16,}$/,
  fetchQuotaForKey,
  note: '部分小模型永久免费（免费清单为 2026-08 快照，以官网模型广场标注为准）；官方 /models 不含价格字段，余额查询接口已被官方下线',
});
