import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * Mistral La Plateforme（https://console.mistral.ai）
 * Experiment 免费档可调用全部托管模型（限速）。
 */
export const platform = defineOpenAIPlatform({
  id: 'mistral',
  name: 'Mistral',
  site: 'https://mistral.ai',
  keyUrl: 'https://console.mistral.ai/api-keys',
  baseUrl: 'https://api.mistral.ai/v1',
  modelsPublic: false,
  isFree: true,
  keyFormat: /^[A-Za-z0-9]{32}$/,
  note: 'Experiment 免费档限速调用全部托管模型；国内网络可能需要代理',
});
