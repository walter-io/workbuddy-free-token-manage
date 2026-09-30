import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * Google AI Studio（https://aistudio.google.com）
 * Gemini 系列免费档限速使用；OpenAI 兼容层在 /v1beta/openai。
 * 列表返回的 id 带 models/ 前缀，统一去掉以保证可直接用于 /chat/completions。
 */
export const platform = defineOpenAIPlatform({
  id: 'googleai',
  name: 'Google AI Studio',
  site: 'https://aistudio.google.com',
  keyUrl: 'https://aistudio.google.com/apikey',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  modelsPublic: false,
  isFree: true,
  mapModelId: (id) => id.replace(/^models\//, ''),
  keyFormat: /^AIza[A-Za-z0-9_-]+$/,
  note: 'Gemini 系列免费档限速使用；国内网络需要代理',
});
