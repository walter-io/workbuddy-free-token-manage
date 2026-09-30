import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * Cerebras（https://cloud.cerebras.ai）
 * 全部模型免费档使用，限速；晶圆级推理速度极快。
 */
export const platform = defineOpenAIPlatform({
  id: 'cerebras',
  name: 'Cerebras',
  site: 'https://www.cerebras.ai',
  keyUrl: 'https://cloud.cerebras.ai',
  baseUrl: 'https://api.cerebras.ai/v1',
  modelsPublic: false,
  isFree: true,
  keyFormat: /^csk-[A-Za-z0-9]+$/,
  note: '全部模型按免费档限速使用，推理速度极快',
});
