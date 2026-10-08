import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * NVIDIA NIM（https://build.nvidia.com）
 * 模型列表公开；注册送开发积分，按积分限速使用。
 */
export const platform = defineOpenAIPlatform({
  id: 'nvidia',
  name: 'NVIDIA NIM',
  site: 'https://build.nvidia.com',
  keyUrl: 'https://build.nvidia.com/settings/api-keys',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  modelsPublic: true,
  isFree: true,
  keyPlaceholder: 'nvapi-…',
  keyFormat: /^nvapi-[A-Za-z0-9_-]+$/,
  note: '需要连 VPN（国内无法直连）；注册送开发积分，按积分限速使用',
});
