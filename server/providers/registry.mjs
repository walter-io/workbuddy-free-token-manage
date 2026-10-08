/**
 * 平台注册表：每个"上游平台"提供模型列表、key 校验、（可选）额度查询与
 * WorkBuddy 条目构造能力。新平台实现见 genericOpenAI.mjs 的 defineOpenAIPlatform。
 */
import * as openrouter from './openrouter.mjs';
import { OPENROUTER_BASE_URL } from './openrouter.mjs';
import { defineOpenAIPlatform } from './genericOpenAI.mjs';
import * as zen from './zen.mjs';
import * as agnes from './agnes.mjs';
import * as siliconflow from './siliconflow.mjs';
import * as modelscope from './modelscope.mjs';
import * as zhipu from './zhipu.mjs';
import * as groq from './groq.mjs';
import * as cerebras from './cerebras.mjs';
import * as mistral from './mistral.mjs';
import * as googleai from './googleai.mjs';
import * as nvidia from './nvidia.mjs';
import * as github from './github.mjs';

/** 平台在界面里的展示顺序（模型广场切换、额度分组、设置页 Key 分组共用）。
 * 后段为置灰展示的平台：不可浏览模型、不可添加 Key，点击时提示原因。
 * 适配器均保留，URL 识别不中断——此前载入的条目仍可在「已载入面板」中移除。
 * - region：地区封锁（对话请求由 WorkBuddy 直连发出，国内无 TUN 全局代理时必然 403）
 * - platform：国内可连但平台限制外部客户端调用 */
export const PLATFORM_ORDER = [
  'openrouter',
  'agnes',
  'siliconflow',
  'modelscope',
  'groq',
  'googleai',
  'nvidia',
  'github',
  'zen',
];

/** 置灰展示的平台及原因（null/undefined = 正常可用） */
export const UI_DISABLED_REASONS = {
  groq: 'region',
  googleai: 'region',
  nvidia: 'region',
  github: 'region',
  zen: 'platform',
};

const openrouterProvider = {
  id: 'openrouter',
  name: 'OpenRouter',
  site: 'https://openrouter.ai',
  keyUrl: 'https://openrouter.ai/settings/keys',
  keyPlaceholder: 'sk-or-v1-…',
  keyFormat: openrouter.keyFormat,
  modelsPublic: false,
  quotaKind: 'openrouter',
  note: null,
  baseUrl: OPENROUTER_BASE_URL,
  getModels: openrouter.getModels,
  peek: openrouter.peekModels,
  fetchQuotaForKey: openrouter.fetchQuotaForKey,
  testKey: openrouter.testKey,
  buildEntry: openrouter.buildEntry,
};

const generic = (cfg) => ({ ...cfg, quotaKind: cfg.fetchQuotaForKey ? 'balance' : 'none' });

export const providers = {
  openrouter: openrouterProvider,
  zen: generic(zen.platform),
  agnes: generic(agnes.platform),
  siliconflow: generic(siliconflow.platform),
  modelscope: generic(modelscope.platform),
  zhipu: generic(zhipu.platform),
  groq: generic(groq.platform),
  cerebras: generic(cerebras.platform),
  mistral: generic(mistral.platform),
  googleai: generic(googleai.platform),
  nvidia: generic(nvidia.platform),
  github: generic(github.platform),
};

for (const p of Object.values(providers)) p.shortName = p.shortName || p.name;

export function getProvider(id) {
  const p = providers[id];
  if (!p) throw new Error(`未知的平台: ${id}`);
  return p;
}

/** 前端用的平台元数据（按展示顺序） */
export function listPlatforms() {
  return PLATFORM_ORDER.filter((id) => providers[id]).map((id) => {
    const { id: pid, name, shortName, site, keyUrl, keyPlaceholder, modelsPublic, quotaKind, note, baseUrl } = providers[id];
    return { id: pid, name, shortName, site, keyUrl, keyPlaceholder, modelsPublic, quotaKind, note, baseUrl, uiDisabled: UI_DISABLED_REASONS[pid] || null };
  });
}

/** 判断一个 WorkBuddy models.json 条目的 url 属于哪个受管平台（null = 与本工具无关）。
 * 用全量适配器（而非 PLATFORM_ORDER）匹配，界面下线的平台此前载入的条目仍可被识别和移除。 */
export function matchPlatformUrl(url) {
  if (typeof url !== 'string') return null;
  for (const p of Object.values(providers)) {
    if (url.startsWith(p.baseUrl)) return p.id;
  }
  return null;
}
