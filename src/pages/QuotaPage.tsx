import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, IconGauge, IconInfo, IconKey, IconRefresh, ProgressBar, Spinner, useToast } from '../components/ui';
import { get } from '../lib/api';
import type { KeyQuota, PlatformQuotaGroup, QuotaResponse } from '../lib/types';
import { fmtDuration, fmtMoney, fmtNumber, msToUtcMidnight } from '../lib/format';

function ResetCountdown() {
  const [ms, setMs] = useState(msToUtcMidnight());
  useEffect(() => {
    const t = setInterval(() => setMs(msToUtcMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono">{fmtDuration(ms)}</span>;
}

function quotaColor(used: number, limit: number) {
  const r = limit > 0 ? used / limit : 0;
  if (r >= 1) return 'bg-red-500';
  if (r >= 0.8) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/** OpenRouter：每日免费次数 + 用量 + 积分 */
function OpenRouterQuotaCard({ k }: { k: KeyQuota }) {
  const f = k.freeModelDailyRequests;
  const balance = k.credits && k.credits.total != null && k.credits.used != null ? k.credits.total - k.credits.used : null;

  return (
    <Card className="p-4 space-y-3.5">
      <div className="flex items-center gap-2">
        <IconKey className="w-4 h-4 text-zinc-400" />
        <span className="font-medium text-zinc-800 truncate">{k.label}</span>
        <span className="font-mono text-xs text-zinc-400">{k.masked}</span>
        <div className="ml-auto">
          {k.status === 'ok' ? (
            <Badge color="green">正常</Badge>
          ) : k.status === 'invalid' ? (
            <Badge color="red">Key 无效</Badge>
          ) : (
            <Badge color="amber">查询失败</Badge>
          )}
        </div>
      </div>

      {k.status !== 'ok' ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{k.error || '状态未知'}</div>
      ) : (
        <>
          {f ? (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm text-zinc-600">今日免费模型请求</span>
                <span className="text-sm">
                  <span className={`font-semibold font-mono text-lg ${f.remaining <= 0 ? 'text-red-600' : 'text-zinc-900'}`}>{f.remaining}</span>
                  <span className="text-zinc-400"> / {f.limit} 剩余</span>
                </span>
              </div>
              <ProgressBar percent={(f.used / Math.max(f.limit, 1)) * 100} color={quotaColor(f.used, f.limit)} />
              <div className="mt-1.5 flex justify-between text-xs text-zinc-400">
                <span>已用 {f.used} 次</span>
                <span>UTC 0 点重置（北京时间早上 8 点）· 剩余 <ResetCountdown /></span>
              </div>
              <div className="mt-1.5 flex items-start gap-1 text-[11px] text-zinc-400 leading-relaxed">
                <IconInfo className="w-3 h-3 mt-px shrink-0" />
                <span>计数实时透传自 OpenRouter，官方统计有约 5~30 分钟延迟：刚用完没立刻增加属正常，稍后刷新会自动补上。</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-400">未返回免费额度数据</div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
              <div className="text-xs text-zinc-400">今日用量</div>
              <div className="text-sm font-semibold text-zinc-800 mt-0.5">{fmtMoney(k.usageDaily)}</div>
            </div>
            <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
              <div className="text-xs text-zinc-400">累计用量</div>
              <div className="text-sm font-semibold text-zinc-800 mt-0.5">{fmtMoney(k.usage)}</div>
            </div>
            <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
              <div className="text-xs text-zinc-400">积分余额</div>
              <div className={`text-sm font-semibold mt-0.5 ${balance != null && balance <= 0 ? 'text-red-500' : 'text-zinc-800'}`}>
                {balance != null ? fmtMoney(balance) : '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {k.credits?.total != null && <span>累计充值 {fmtMoney(k.credits.total)}</span>}
            {k.credits?.used != null && <span>累计消耗 {fmtMoney(k.credits.used)}</span>}
            {k.limit != null && <span>Key 限额 {fmtMoney(k.limitRemaining)} / {fmtMoney(k.limit)} 剩余</span>}
            {k.isFreeTier && <span className="text-amber-500">免费档（累计充值满 $10 每日免费次数可提升至 1000 次）</span>}
            {k.expiresAt && <span>Key 过期：{new Date(k.expiresAt).toLocaleString('zh-CN')}</span>}
          </div>
        </>
      )}
    </Card>
  );
}

/** 余额型平台（如硅基流动）：仅展示余额概览 */
function BalanceQuotaCard({ k, note }: { k: KeyQuota; note?: string | null }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <IconKey className="w-4 h-4 text-zinc-400" />
        <span className="font-medium text-zinc-800 truncate">{k.label}</span>
        <span className="font-mono text-xs text-zinc-400">{k.masked}</span>
        <div className="ml-auto">
          {k.status === 'ok' ? (
            <Badge color="green">正常</Badge>
          ) : k.status === 'invalid' ? (
            <Badge color="red">Key 无效</Badge>
          ) : (
            <Badge color="amber">查询失败</Badge>
          )}
        </div>
      </div>
      {k.status !== 'ok' ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{k.error || '状态未知'}</div>
      ) : k.unavailable ? (
        <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 leading-relaxed">{k.unavailable}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
            <div className="text-xs text-zinc-400">总余额</div>
            <div className="text-sm font-semibold text-zinc-800 mt-0.5">{k.balance?.total != null ? fmtMoney(k.balance.total) : '—'}</div>
          </div>
          <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
            <div className="text-xs text-zinc-400">充值余额</div>
            <div className="text-sm font-semibold text-zinc-800 mt-0.5">{k.balance?.charge != null ? fmtMoney(k.balance.charge) : '—'}</div>
          </div>
          <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
            <div className="text-xs text-zinc-400">赠送余额</div>
            <div className="text-sm font-semibold text-zinc-800 mt-0.5">{k.balance?.gift != null ? fmtMoney(k.balance.gift) : '—'}</div>
          </div>
        </div>
      )}
      {note && <div className="text-[11px] text-zinc-400 leading-relaxed">{note}</div>}
    </Card>
  );
}

/** 无额度接口的平台：紧凑的 key 状态行 */
function NoQuotaRow({ k }: { k: KeyQuota }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-lg border border-zinc-100 bg-white">
      <IconKey className="w-3.5 h-3.5 text-zinc-300" />
      <span className="text-sm text-zinc-700 truncate max-w-48">{k.label}</span>
      <span className="font-mono text-xs text-zinc-400">{k.masked}</span>
      <div className="ml-auto">
        {k.status === 'ok' ? (
          <Badge color="green">正常</Badge>
        ) : k.status === 'invalid' ? (
          <Badge color="red">Key 无效</Badge>
        ) : k.status === 'unknown' ? (
          <Badge color="gray">未测</Badge>
        ) : (
          <Badge color="amber">异常</Badge>
        )}
      </div>
    </div>
  );
}

/** 按平台分组渲染额度信息 */
function PlatformSection({ group }: { group: PlatformQuotaGroup }) {
  return (
    <div className="space-y-2.5 pt-5 border-t border-zinc-100 first:pt-0 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="font-medium text-zinc-900">{group.platformName}</span>
        {group.quotaKind === 'none' && <Badge color="gray">无额度接口</Badge>}
        {group.note && (
          <span className="text-[11px] text-zinc-400 flex items-start gap-1">
            <IconInfo className="w-3 h-3 mt-px shrink-0" />
            {group.note}
          </span>
        )}
      </div>
      {group.quotaKind === 'openrouter' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {group.keys.map((k) => (
            <OpenRouterQuotaCard key={k.keyId} k={k} />
          ))}
        </div>
      )}
      {group.quotaKind === 'balance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {group.keys.map((k) => (
            <BalanceQuotaCard key={k.keyId} k={k} note={k.unavailable ? null : group.note} />
          ))}
        </div>
      )}
      {group.quotaKind === 'none' && (
        <div className="space-y-1.5">
          {group.keys.map((k) => (
            <NoQuotaRow key={k.keyId} k={k} />
          ))}
          <div className="text-[11px] text-zinc-400 px-1">该平台未提供额度查询接口，可在「设置」页测试 Key 有效性。</div>
        </div>
      )}
    </div>
  );
}

export default function QuotaPage() {
  const toast = useToast();
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [platformCount, setPlatformCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(
    async (manual = false) => {
      manual ? setRefreshing(true) : setLoading(true);
      try {
        const r = await get<QuotaResponse>('/api/quota');
        setData(r);
        get<{ platforms: { id: string }[] }>('/api/platforms')
          .then((p) => setPlatformCount(p.platforms.length))
          .catch(() => {});
      } catch (e: any) {
        if (manual) toast('err', e?.message || '刷新失败');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(false), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner className="w-6 h-6" />
        <span className="ml-3 text-sm text-zinc-500">正在查询各平台 Key 额度…</span>
      </div>
    );
  }

  const groups = data?.platforms || [];
  if (!data || groups.length === 0) {
    return (
      <EmptyState
        icon={<IconGauge />}
        title="尚未配置任何平台的 API Key"
        desc="到「设置」页选择平台并添加 Key 后，即可在这里查看免费额度、用量和余额。"
        action={
          <Button variant="primary" onClick={() => (location.hash = 'settings')}>
            前往设置
          </Button>
        }
      />
    );
  }

  const orGroup = groups.find((g) => g.quotaKind === 'openrouter');
  const okKeys = orGroup?.keys.filter((k) => k.status === 'ok' && k.freeModelDailyRequests) || [];
  const totalRemaining = okKeys.reduce((s, k) => s + (k.freeModelDailyRequests?.remaining || 0), 0);
  const totalLimit = okKeys.reduce((s, k) => s + (k.freeModelDailyRequests?.limit || 0), 0);
  const hasOpenRouter = groups.some((g) => g.platform === 'openrouter');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {okKeys.length > 0 && (
          <div className="text-sm text-zinc-600">
            OpenRouter 全部 Key 今日免费剩余合计：
            <b className={`font-mono text-lg ml-1 ${totalRemaining <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtNumber(totalRemaining)}</b>
            <span className="text-zinc-400"> / {fmtNumber(totalLimit)} 次</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-indigo-600 rounded" />
            每 60 秒自动刷新
          </label>
          <Button variant="subtle" loading={refreshing} onClick={() => load(true)}>
            <IconRefresh className="w-4 h-4" />
            刷新
          </Button>
        </div>
      </div>

      {hasOpenRouter && (
        <div className="text-xs text-zinc-400">
          OpenRouter 数据来自官方接口，本工具实时透传、不做缓存，更新于 {new Date(data.fetchedAt).toLocaleTimeString('zh-CN')}。
          官方计数有约 5~30 分钟延迟，刚使用后未立刻变化属正常。
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <PlatformSection key={g.platform} group={g} />
        ))}
      </div>

      {platformCount > groups.length && (
        <div className="text-xs text-zinc-400 border-t border-zinc-100 pt-3">
          还有 {platformCount - groups.length} 个平台尚未配置 Key，可在「模型广场」切换浏览。
          <button className="ml-1 text-indigo-500 hover:underline" onClick={() => (location.hash = 'settings')}>
            前往设置添加
          </button>
        </div>
      )}
    </div>
  );
}
