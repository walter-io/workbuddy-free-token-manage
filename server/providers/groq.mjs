import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * Groq（https://groq.com）
 * 全部模型免费档使用，按模型有 RPM / 日请求上限；以极低延迟著称。
 */
export const platform = defineOpenAIPlatform({
  id: 'groq',
  name: 'Groq',
  site: 'https://groq.com',
  keyUrl: 'https://console.groq.com/keys',
  baseUrl: 'https://api.groq.com/openai/v1',
  modelsPublic: false,
  isFree: true,
  keyFormat: /^gsk_[A-Za-z0-9]+$/,
  note: '全部模型按免费档限速使用（RPM / 日请求上限）',
});
