import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * OpenCode Zen（https://opencode.ai/docs/zen）
 * 模型列表公开无需鉴权；限时免费模型 id 带 free 后缀（另有 big-pickle）。
 * 注意：claude-* 走 Anthropic 协议、gpt-* / grok-* 走 Responses 协议，
 * 只有其余的 OpenAI /chat/completions 兼容子集可以载入 WorkBuddy。
 */
export const platform = defineOpenAIPlatform({
  id: 'zen',
  name: 'OpenCode Zen',
  site: 'https://opencode.ai',
  keyUrl: 'https://opencode.ai/zen',
  baseUrl: 'https://opencode.ai/zen/v1',
  modelsPublic: true,
  probeModel: 'big-pickle',
  isFree: (m) => /free/i.test(m.id) || m.id === 'big-pickle',
  loadable: (m) => !/^(claude-|gpt-|grok-)/i.test(m.id),
  keyFormat: /^[A-Za-z0-9_-]{8,}$/,
  note: '限时免费模型可能收集对话数据；claude-*/gpt-*/grok-* 系列因协议不同，不支持载入 WorkBuddy',
});
