import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * GitHub Models（https://github.com/marketplace/models）
 * GitHub Token 即可调用全部目录模型，按账号档位限速；OpenAI 兼容层在 /openai。
 */
export const platform = defineOpenAIPlatform({
  id: 'github',
  name: 'GitHub Models',
  site: 'https://github.com/marketplace/models',
  keyUrl: 'https://github.com/settings/personal-access-tokens',
  baseUrl: 'https://models.github.ai/openai',
  modelsPublic: false,
  isFree: true,
  keyPlaceholder: 'github_pat_… / ghp_…',
  keyFormat: /^(github_pat_|gho_|ghp_)[A-Za-z0-9_]+$/,
  note: '目录内全部模型免费用（按账号档位限速，免费档较慢）。Key 用 GitHub Token：打开 github.com/settings/personal-access-tokens → Generate new token → 在权限里勾选 Models: Read',
});
