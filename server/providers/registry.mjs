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

/** 平台在界面里的展示顺序（模型广场切换、额度分组、设置页 Key 分组共用） */
export const PLATFORM_ORDER = [
  'openrouter',
  'zen',
  'agnes',
  'siliconflow',
  'modelscope',
  'zhipu',
  'groq',
  'cerebras',
  'mistral',
  'googleai',
  'nvidia',
  'github',
];

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
    return { id: pid, name, shortName, site, keyUrl, keyPlaceholder, modelsPublic, quotaKind, note, baseUrl };
  });
}

/** 判断一个 WorkBuddy models.json 条目的 url 属于哪个受管平台（null = 与本工具无关） */
export function matchPlatformUrl(url) {
  if (typeof url !== 'string') return null;
  for (const id of PLATFORM_ORDER) {
    const p = providers[id];
    if (url.startsWith(p.baseUrl)) return id;
  }
  return null;
}
