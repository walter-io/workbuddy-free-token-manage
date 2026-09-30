import { defineOpenAIPlatform } from './genericOpenAI.mjs';

/**
 * 硅基流动 SiliconFlow（https://siliconflow.cn）
 * 国内直连友好；部分小模型永久免费，其余按量计费。
 * 官方 /v1/user/balance 余额接口已于 2026-08 下线，额度页降级为紧凑状态展示，
 * 若官方后续提供替代接口，只需恢复 fetchQuotaForKey 的解析逻辑。
 */
const BASE = 'https://api.siliconflow.cn/v1';

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

async function fetchQuotaForKey(apiKey) {
  try {
    const res = await fetch(`${BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, invalid: true };
    if (!res.ok) return { ok: true, unavailable: `官方余额接口已不可用（HTTP ${res.status}），请到官网「费用账单」查看` };
    const json = await res.json();
    const d = json?.data || {};
    return { ok: true, balance: { total: num(d.totalBalance), charge: num(d.chargeBalance), gift: num(d.balance) } };
  } catch (err) {
    return { ok: true, unavailable: err?.message || '网络错误' };
  }
}

export const platform = defineOpenAIPlatform({
  id: 'siliconflow',
  name: 'SiliconFlow',
  site: 'https://siliconflow.cn',
  keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  baseUrl: BASE,
  modelsPublic: false,
  isFree: (m) => /-free$/i.test(m.id),
  keyFormat: /^[A-Za-z0-9_-]{16,}$/,
  fetchQuotaForKey,
  note: '部分小模型永久免费、其余按量计费，免费清单以官网模型广场标注为准；余额查询接口已被官方下线',
});
