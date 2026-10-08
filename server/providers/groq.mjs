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
  keyPlaceholder: 'gsk_…',
  keyFormat: /^gsk_[A-Za-z0-9]+$/,
  note: '需要连 VPN；注意对话请求由 WorkBuddy 直接发出，需开启 TUN 模式/全局代理（仅系统代理可能无效），节点避开香港。403 = 地区被拒；401 = Key 无效',
});
