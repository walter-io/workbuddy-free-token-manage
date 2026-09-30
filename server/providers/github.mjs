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
  keyFormat: /^(github_pat_|gho_|ghp_)[A-Za-z0-9_]+$/,
  note: '使用 GitHub Token（Fine-grained PAT 或 OAuth），按账号档位限速',
});
