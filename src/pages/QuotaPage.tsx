import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconGauge,
  IconInfo,
  IconKey,
  IconRefresh,
  IconWarning,
  ProgressBar,
  Skeleton,
  useToast,
} from '../components/ui';
import { get, TIMEOUT } from '../lib/api';
import type { KeyQuota, PlatformInfo, PlatformQuotaGroup, QuotaResponse } from '../lib/types';
import { fmtDuration, fmtMoney, fmtNumber, msToUtcMidnight, showsMask } from '../lib/format';

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

function StatusBadge({ status }: { status: KeyQuota['status'] }) {
  if (status === 'ok') return <Badge color="green" dot>正常</Badge>;
  if (status === 'invalid') return <Badge color="red" dot>Key 无效</Badge>;
  if (status === 'unknown') return <Badge color="gray" dot>未测</Badge>;
  return <Badge color="amber" dot>查询失败</Badge>;
}

/** OpenRouter 主体：每日免费次数 + 用量 + 积分 */
function OpenRouterBody({ k }: { k: KeyQuota }) {
  const f = k.freeModelDailyRequests;
  const balance = k.credits && k.credits.total != null && k.credits.used != null ? k.credits.total - k.credits.used : null;

  return (
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
          <div className="mt-1.5 flex justify-between gap-2 text-xs text-zinc-400">
            <span>已用 {fmtNumber(f.used)} 次</span>
            <span>
              UTC 0 点重置（北京时间 08:00）· 剩余 <ResetCountdown />
            </span>
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-zinc-400 leading-relaxed">
            <IconInfo className="w-3 h-3 mt-px shrink-0" />
            <span>计数实时透传自 OpenRouter，官方统计有约 5~30 分钟延迟：刚用完没立刻增加属正常，稍后刷新会自动补上。</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">未返回免费额度数据</div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
          <div className="text-xs text-zinc-400">今日用量</div>
          <div className="text-sm font-semibold text-zinc-800 mt-0.5 font-mono">{fmtMoney(k.usageDaily)}</div>
        </div>
        <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
          <div className="text-xs text-zinc-400">累计用量</div>
          <div className="text-sm font-semibold text-zinc-800 mt-0.5 font-mono">{fmtMoney(k.usage)}</div>
        </div>
        <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
          <div className="text-xs text-zinc-400">积分余额</div>
          <div className={`text-sm font-semibold mt-0.5 font-mono ${balance != null && balance <= 0 ? 'text-red-500' : 'text-zinc-800'}`}>
            {balance != null ? fmtMoney(balance) : '—'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        {k.credits?.total != null && <span>累计充值 {fmtMoney(k.credits.total)}</span>}
        {k.credits?.used != null && <span>累计消耗 {fmtMoney(k.credits.used)}</span>}
        {k.limit != null && (
          <span>
            Key 限额 {fmtMoney(k.limitRemaining)} / {fmtMoney(k.limit)} 剩余
          </span>
        )}
        {k.isFreeTier && <span className="text-amber-500">免费档（累计充值满 $10 每日免费次数可提升至 1000 次）</span>}
        {k.expiresAt && <span>Key 过期：{new Date(k.expiresAt).toLocaleString('zh-CN')}</span>}
      </div>
    </>
  );
}

/** 余额型平台（如硅基流动）：仅展示余额概览 */
function BalanceBody({ k }: { k: KeyQuota }) {
  if (k.unavailable) {
    return <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 leading-relaxed">{k.unavailable}</div>;
  }
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
        <div className="text-xs text-zinc-400">总余额</div>
        <div className="text-sm font-semibold text-zinc-800 mt-0.5 font-mono">{k.balance?.total != null ? fmtMoney(k.balance.total) : '—'}</div>
      </div>
      <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
        <div className="text-xs text-zinc-400">充值余额</div>
        <div className="text-sm font-semibold text-zinc-800 mt-0.5 font-mono">{k.balance?.charge != null ? fmtMoney(k.balance.charge) : '—'}</div>
      </div>
      <div className="bg-zinc-50 rounded-lg px-3 py-2.5">
        <div className="text-xs text-zinc-400">赠送余额</div>
        <div className="text-sm font-semibold text-zinc-800 mt-0.5 font-mono">{k.balance?.gift != null ? fmtMoney(k.balance.gift) : '—'}</div>
      </div>
    </div>
  );
}

/** 单个 Key 的额度卡片：平台名内嵌到卡片头部，卡片因此可以自由两两排布 */
function KeyQuotaCard({ group, k, uiDisabled }: { group: PlatformQuotaGroup; k: KeyQuota; uiDisabled?: 'region' | 'platform' | null }) {
  const kind = group.quotaKind;
  // 余额接口不可用时，正文已给出说明，不再重复平台备注
  const note = kind === 'balance' && k.unavailable ? null : group.note;

  return (
    <Card className="p-4 mb-4 break-inside-avoid space-y-3.5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-zinc-400">{group.platformName}</span>
        {kind === 'none' && <Badge color="gray">无额度接口</Badge>}
        {uiDisabled && <Badge color="amber">{uiDisabled === 'region' ? '地区受限' : '平台限制'}</Badge>}
      </div>

      <div className="flex items-center gap-1.5">
        <IconKey className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
        <span className="font-medium text-zinc-800 truncate">{k.label}</span>
        {showsMask(k.label, k.masked) && <span className="font-mono text-xs text-zinc-400 truncate">{k.masked}</span>}
        <div className="ml-auto shrink-0">
          <StatusBadge status={k.status} />
        </div>
      </div>

      {k.status !== 'ok' ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 leading-relaxed">{k.error || '状态未知'}</div>
      ) : kind === 'openrouter' ? (
        <OpenRouterBody k={k} />
      ) : kind === 'balance' ? (
        <BalanceBody k={k} />
      ) : null}

      {note && <div className="text-[11px] text-zinc-400 leading-relaxed">{note}</div>}
    </Card>
  );
}

/** 加载骨架，保持页面结构不跳动 */
function QuotaSkeleton() {
  return (
    <div className="columns-1 lg:columns-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4 mb-4 break-inside-avoid space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, n) => (
              <Skeleton key={n} className="h-14" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function QuotaPage({ active = true }: { active?: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [platformCount, setPlatformCount] = useState(0);
  /** 平台置灰原因：用于标注「该平台已不可用」，避免额度页出现无解释的记录 */
  const [disabledMap, setDisabledMap] = useState<Record<string, 'region' | 'platform'>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  /** 刷新失败时的提示：避免只弹一个转瞬即逝的 toast，用户以为界面卡住 */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (manual = false) => {
      manual ? setRefreshing(true) : setLoading(true);
      try {
        const r = await get<QuotaResponse>('/api/quota', { timeoutMs: TIMEOUT.quota });
        setData(r);
        setLoadError(null);
        get<{ platforms: PlatformInfo[] }>('/api/platforms')
          .then((p) => {
            setPlatformCount(p.platforms.length);
            const map: Record<string, 'region' | 'platform'> = {};
            for (const pf of p.platforms) if (pf.uiDisabled) map[pf.id] = pf.uiDisabled;
            setDisabledMap(map);
          })
          .catch(() => {});
      } catch (e: any) {
        const msg = e?.message || '刷新失败';
        setLoadError(msg);
        if (manual) toast('err', msg);
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

  // 页签重新激活时刷新一次（设置页刚加完 Key 切回来能立即看到额度）
  useEffect(() => {
    if (active) load(false);
  }, [active, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(false), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const groups = data?.platforms || [];
  const allKeys = groups.flatMap((g) => g.keys.map((k) => ({ group: g, k })));

  const orGroup = groups.find((g) => g.quotaKind === 'openrouter');
  const okKeys = orGroup?.keys.filter((k) => k.status === 'ok' && k.freeModelDailyRequests) || [];
  const totalRemaining = okKeys.reduce((s, k) => s + (k.freeModelDailyRequests?.remaining || 0), 0);
  const totalLimit = okKeys.reduce((s, k) => s + (k.freeModelDailyRequests?.limit || 0), 0);
  const hasOpenRouter = groups.some((g) => g.platform === 'openrouter');

  if (!loading && data && groups.length === 0) {
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

  if (!data && !loading) {
    return (
      <EmptyState
        icon={<IconGauge />}
        title="额度信息加载失败"
        desc="无法获取各平台额度，请确认 free-token 服务正在运行后重试。"
        action={
          <Button variant="primary" onClick={() => load(true)}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          {data && okKeys.length > 0 ? (
            <div className="text-sm text-zinc-600">
              OpenRouter 全部 Key 今日免费剩余合计：
              <b className={`font-mono text-lg ml-1 ${totalRemaining <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtNumber(totalRemaining)}</b>
              <span className="text-zinc-400"> / {fmtNumber(totalLimit)} 次</span>
            </div>
          ) : (
            <div className="text-sm text-zinc-400 flex items-center gap-1.5">
              <IconGauge className="w-4 h-4" />
              {loading ? '正在查询各平台 Key 额度…' : '各平台额度与余额'}
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
        {hasOpenRouter && data && (
          <div className="mt-2 text-xs text-zinc-400">
            OpenRouter 数据来自官方接口，本工具实时透传、不做缓存，更新于 {new Date(data.fetchedAt).toLocaleTimeString('zh-CN')}。官方计数有约 5~30
            分钟延迟，刚使用后未立刻变化属正常。
          </div>
        )}
      </Card>

      {loadError && data && (
        <Card className="px-4 py-2.5 border-amber-200 bg-amber-50/90 flex flex-wrap items-center gap-3 animate-fade-in">
          <IconWarning className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700">
            刷新失败：{loadError}。以下为上次成功获取的数据（{new Date(data.fetchedAt).toLocaleTimeString('zh-CN')}）。
          </span>
          <div className="ml-auto">
            <Button size="sm" variant="subtle" loading={refreshing} onClick={() => load(true)}>
              重试
            </Button>
          </div>
        </Card>
      )}

      {!data ? (
        <QuotaSkeleton />
      ) : (
        <>
          {/* 卡片两两一行（瀑布流排布，不同高度的卡片不留竖向空白） */}
          <div className="columns-1 lg:columns-2 gap-4">
            {allKeys.map(({ group, k }) => (
              <KeyQuotaCard key={k.keyId} group={group} k={k} uiDisabled={disabledMap[group.platform] || null} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 border-t border-zinc-100 pt-3">
            <span>标注「无额度接口」的平台未提供额度查询接口，可在「设置」页测试 Key 有效性。</span>
            {platformCount > groups.length && (
              <span>
                还有 {platformCount - groups.length} 个平台尚未配置 Key，可在「模型广场」切换浏览。
                <button className="ml-1 text-indigo-500 hover:underline" onClick={() => (location.hash = 'settings')}>
                  前往设置添加
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
