import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * 智谱 BigModel 开放平台（https://open.bigmodel.cn）
 * GLM flash 系列模型免费，其余按量计费；国内直连。
 */
export const platform = defineOpenAIPlatform({
  id: 'zhipu',
  name: '智谱 BigModel',
  site: 'https://open.bigmodel.cn',
  keyUrl: 'https://open.bigmodel.cn/apikey/platform',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  modelsPublic: false,
  isFree: (m) => /flash/i.test(m.id),
  keyFormat: /^[A-Za-z0-9.\-]{16,}$/,
  note: 'GLM flash 系列模型免费，其余按量计费',
});
