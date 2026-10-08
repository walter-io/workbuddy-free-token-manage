import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconChart,
  IconDownload,
  IconRefresh,
  Segmented,
  Skeleton,
  Spinner,
  useToast,
} from '../components/ui';
import { get, TIMEOUT } from '../lib/api';
import type { StatsResponse } from '../lib/types';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative, fmtTokens } from '../lib/format';

const RANGE_OPTS = [
  { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部' },
] as const;

type Range = (typeof RANGE_OPTS)[number]['value'];

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function isFreeName(m: string) {
  return m.endsWith(':free') || /(^|\/)free$/i.test(m);
}

function OverviewCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="px-4 py-3.5 transition-shadow hover:shadow-md">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-xl font-semibold mt-1 font-mono ${accent || 'text-zinc-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-400 mt-0.5">{sub}</div>}
    </Card>
  );
}

/** 首次加载骨架屏：页面立即渲染，数据到了再填充 */
function StatsSkeleton({ elapsed }: { elapsed: number }) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-400 text-center">
        正在解析本机 {elapsed > 0 ? `${elapsed} 秒` : ''}…
        <span className="text-zinc-300"> 首次扫描需遍历全部会话日志（约 1 分钟），之后会走缓存秒开。</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="px-4 py-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20 mt-2.5" />
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <Skeleton className="h-4 w-72 mb-3" />
        <Skeleton className="h-72 w-full" />
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-80 w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-80 w-full" />
        </Card>
      </div>
      <Card className="p-4">
        <Skeleton className="h-4 w-56 mb-3" />
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}

/** 活跃时段热力图：列宽固定 16px + 间距 4px，刻度与列严格对齐 */
const CELL = 'w-4 h-4 rounded-sm shrink-0';

function HoursHeatmap({ hours }: { hours: Record<string, number> }) {
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const max = Math.max(1, ...Object.values(hours));
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block">
          {/* 小时刻度：每 6 小时一个标签，与下方列一一对应 */}
          <div className="flex items-center gap-1 mb-1">
            <span className="w-8 shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="w-4 shrink-0 text-[10px] text-zinc-400 text-center font-mono">
                {h % 6 === 0 ? h : ''}
              </span>
            ))}
          </div>
          {weekdays.map((wd) => (
            <div key={wd} className="flex items-center gap-1 mb-1">
              <span className="w-8 text-[10px] text-zinc-400 shrink-0">{wd}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const v = hours[`${wd}-${h}`] || 0;
                const intensity = v / max;
                return (
                  <div
                    key={h}
                    title={`${wd} ${String(h).padStart(2, '0')}:00 — ${v} 次请求`}
                    className={CELL}
                    style={{ background: v > 0 ? `rgba(99, 102, 241, ${0.15 + intensity * 0.85})` : '#f4f4f5' }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
        <span>少</span>
        {[0.15, 0.35, 0.55, 0.75, 1].map((a) => (
          <span key={a} className="w-3.5 h-3.5 rounded-sm" style={{ background: `rgba(99, 102, 241, ${a})` }} />
        ))}
        <span>多</span>
        <span className="ml-2">单格最深 {max} 次请求</span>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const toast = useToast();
  const [range, setRange] = useState<Range>('30d');
  const [model, setModel] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true); // 首次加载：骨架屏
  const [updating, setUpdating] = useState(false); // 后台/手动更新中（不挡界面）
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [elapsed, setElapsed] = useState(0); // 首次扫描耗时：让 1 分钟的冷扫描不像"卡死"
  const seqRef = useRef(0); // 防乱序：只采纳最后一次请求的结果

  useEffect(() => {
    if (!initialLoading) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [initialLoading]);

  /**
   * initial = 首次进入（骨架屏）；silent = 筛选变化/定时刷新（旧数据保持可见）；
   * manual = 手动刷新（force=1 强制重扫，失败弹提示）
   */
  const load = useCallback(
    async (mode: 'initial' | 'silent' | 'manual' = 'silent') => {
      const seq = ++seqRef.current;
      if (mode === 'initial') setInitialLoading(true);
      else setUpdating(true);
      try {
        const params = new URLSearchParams({ range });
        if (model) params.set('model', model);
        if (freeOnly) params.set('freeOnly', '1');
        if (mode === 'manual') params.set('force', '1');
        const res = await get<StatsResponse>(`/api/stats?${params}`, { timeoutMs: TIMEOUT.stats });
        if (seq === seqRef.current) setData(res);
      } catch (e: any) {
        if (mode === 'manual') toast('err', e?.message || '统计加载失败');
        // 静默刷新失败保留旧数据，等下个周期再试
      } finally {
        if (seq === seqRef.current) {
          setInitialLoading(false);
          setUpdating(false);
        }
      }
    },
    [range, model, freeOnly, toast]
  );

  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 筛选变化：静默刷新，不清空当前数据
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    load('silent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, model, freeOnly]);

  // 定时刷新：每 60 秒静默更新当前筛选下的统计
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load('silent'), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const topModelsForChart = useMemo(() => (data?.models || []).slice(0, 8).map((m) => m.name), [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((d) => {
      const row: Record<string, string | number> = { date: d.date.slice(5), requests: d.requests };
      let other = 0;
      for (const [m, tokens] of Object.entries(d.byModel)) {
        if (topModelsForChart.includes(m)) row[m] = tokens;
        else other += tokens;
      }
      if (other > 0) row['其他'] = other;
      return row;
    });
  }, [data, topModelsForChart]);

  /** 导出当前筛选下的统计结果为 CSV（含 BOM，Excel 直接打开不乱码） */
  const exportCsv = useCallback(() => {
    if (!data) return;
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    const row = (arr: unknown[]) => lines.push(arr.map(esc).join(','));
    const rangeLabel = RANGE_OPTS.find((r) => r.value === range)?.label || range;
    const modelLabel = model || '全部模型';

    row(['Free Token Token 用量统计']);
    row(['生成时间', new Date(data.generatedAt).toLocaleString('zh-CN')]);
    row(['统计区间', rangeLabel]);
    row(['模型筛选', modelLabel]);
    row(['仅 OpenRouter 免费模型', freeOnly ? '是' : '否']);
    row(['扫描会话文件数', data.filesScanned]);
    if (data.coverageStartAt) row(['数据覆盖起始', fmtDate(data.coverageStartAt)]);
    row([]);
    row(['一、总览']);
    row(['指标', '数值']);
    row(['请求次数', data.summary.requests]);
    row(['总 Token', data.summary.total]);
    row(['输入 Token', data.summary.input]);
    row(['输出 Token', data.summary.output]);
    row(['缓存读取', data.summary.cacheRead]);
    row(['缓存写入', data.summary.cacheWrite]);
    row([]);
    row(['二、模型排行']);
    row(['模型', '请求次数', '输入', '输出', '缓存读取', '缓存写入', '总 Token']);
    for (const m of data.models) row([m.name, m.requests, m.input, m.output, m.cacheRead, m.cacheWrite, m.total]);
    row([]);
    row(['三、每日趋势']);
    row(['日期', '请求次数', '总 Token']);
    for (const d of data.daily) row([d.date, d.requests, d.total]);
    row([]);
    row(['四、项目排行']);
    row(['项目', '请求次数', '总 Token']);
    for (const p of data.projects) row([p.name, p.requests, p.total]);
    row([]);
    row(['五、会话排行']);
    row(['会话', '项目', '请求次数', '总 Token', '最近活跃']);
    for (const s of data.sessions) row([s.title || s.sessionId, s.project, s.requests, s.total, s.lastActive ? fmtDateTime(s.lastActive) : '']);

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `free-token-统计-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('ok', '已导出 CSV 到下载目录');
  }, [data, range, model, freeOnly, toast]);

  if (!initialLoading && !data) {
    return (
      <EmptyState
        icon={<IconChart />}
        title="统计加载失败"
        desc="无法获取统计数据，请确认 free-token 服务正在运行后重试。"
        action={
          <Button variant="primary" onClick={() => load('manual')}>
            重试
          </Button>
        }
      />
    );
  }

  if (data && data.filesScanned === 0) {
    return (
      <EmptyState
        icon={<IconChart />}
        title="未找到 WorkBuddy 会话数据"
        desc={`已尝试扫描 ${data.dir || '~/.workbuddy'}/projects 下的会话日志。如果 WorkBuddy 安装在其他位置，请到「设置」修改数据目录。`}
        action={
          <Button variant="primary" onClick={() => (location.hash = 'settings')}>
            前往设置
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 控制条（首次加载时也渲染，页面立刻可用） */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented<Range> value={range} onChange={setRange} options={[...RANGE_OPTS]} />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-zinc-200 text-sm bg-white outline-none focus:border-indigo-400 max-w-[260px]"
          >
            <option value="">全部模型</option>
            {(data?.models || []).slice(0, 50).map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer select-none">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="accent-indigo-600 rounded" />
            仅 OpenRouter 免费模型
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {initialLoading ? (
              <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                <Spinner className="w-3.5 h-3.5" />
                正在扫描会话日志…{elapsed > 0 && <span className="font-mono">{elapsed}s</span>}
                {elapsed >= 10 && <span className="text-zinc-300">首次扫描较慢，请稍候</span>}
              </span>
            ) : (
              data && (
                <span className="text-xs text-zinc-400">
                  扫描 {data.filesScanned} 个会话文件{data.parseErrors > 0 ? ` · ${data.parseErrors} 个解析失败` : ''}
                  {data.coverageStartAt ? ` · 覆盖 ${fmtDate(data.coverageStartAt)} 起` : ''}
                  {updating && <span className="text-indigo-400"> · 更新中…</span>}
                </span>
              )
            )}
            <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer select-none">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-indigo-600 rounded" />
              每 60 秒自动刷新
            </label>
            <Button variant="subtle" onClick={exportCsv} disabled={!data} title="导出当前筛选下的统计数据为 CSV">
              <IconDownload className="w-4 h-4" />
              导出 CSV
            </Button>
            <Button variant="subtle" loading={updating} onClick={() => load('manual')} title="强制重新扫描会话日志">
              <IconRefresh className="w-4 h-4" />
              刷新
            </Button>
          </div>
        </div>
      </Card>

      {!data ? (
        <StatsSkeleton elapsed={elapsed} />
      ) : (
        <>
          {/* 总览卡 */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <OverviewCard label="请求次数" value={fmtNumber(data.summary.requests)} />
            <OverviewCard label="总 Token" value={fmtTokens(data.summary.total)} accent="text-indigo-600" />
            <OverviewCard label="输入" value={fmtTokens(data.summary.input)} sub={`含缓存命中 ${fmtTokens(data.summary.cacheRead)}`} />
            <OverviewCard label="输出" value={fmtTokens(data.summary.output)} />
            <OverviewCard label="缓存读取" value={fmtTokens(data.summary.cacheRead)} />
            <OverviewCard label="缓存写入" value={fmtTokens(data.summary.cacheWrite)} />
          </div>

          {/* 每日趋势 */}
          <Card className="p-4">
            <div className="flex flex-wrap items-baseline gap-2 mb-3">
              <div className="font-medium text-zinc-800">每日 Token 趋势</div>
              <div className="text-xs text-zinc-400">堆叠柱 = 各模型 Token 构成，灰线 = 请求次数（右轴）</div>
            </div>
            <div className="h-72">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-zinc-400">当前筛选下没有趋势数据</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f1" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={{ stroke: '#e4e4e7' }} />
                    <YAxis yAxisId="t" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtTokens(v)} width={52} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      formatter={(value: any, name: any) => [name === 'requests' ? `${value} 次` : fmtTokens(Number(value)), name]}
                      labelStyle={{ color: '#52525b' }}
                      contentStyle={{ borderRadius: 8, borderColor: '#e4e4e7', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {topModelsForChart.map((m, i) => (
                      <Bar key={m} yAxisId="t" dataKey={m} stackId="tokens" fill={PALETTE[i % PALETTE.length]} maxBarSize={26} name={m} />
                    ))}
                    <Bar yAxisId="t" dataKey="其他" stackId="tokens" fill="#d4d4d8" maxBarSize={26} name="其他" />
                    <Line yAxisId="r" type="monotone" dataKey="requests" stroke="#52525b" strokeWidth={1.5} dot={false} name="requests" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* 模型排行 */}
            <Card className="p-4">
              <div className="font-medium text-zinc-800 mb-3">模型排行（Top 20）</div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {(data.models || []).slice(0, 20).map((m) => {
                  const share = data.summary.total > 0 ? (m.total / data.summary.total) * 100 : 0;
                  return (
                    <div key={m.name} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-700 truncate flex-1" title={m.name}>
                          {m.name}
                        </span>
                        {isFreeName(m.name) && <Badge color="green">free</Badge>}
                        <span className="text-zinc-500 font-mono text-xs shrink-0">{fmtTokens(m.total)}</span>
                        <span className="text-zinc-400 text-xs w-12 text-right shrink-0 font-mono">{share.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-indigo-400/70 rounded-full transition-all duration-500" style={{ width: `${share}%` }} />
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {fmtNumber(m.requests)} 次请求 · 入 {fmtTokens(m.input)} / 出 {fmtTokens(m.output)} / 缓存读 {fmtTokens(m.cacheRead)}
                      </div>
                    </div>
                  );
                })}
                {(data.models || []).length === 0 && <div className="text-sm text-zinc-400 py-6 text-center">当前筛选下没有数据</div>}
              </div>
            </Card>

            <div className="space-y-4">
              {/* 项目排行 */}
              <Card className="p-4">
                <div className="font-medium text-zinc-800 mb-3">项目排行（Top 10）</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-zinc-50">
                    {(data.projects || []).slice(0, 10).map((p) => (
                      <tr key={p.name}>
                        <td className="py-1.5 text-zinc-700 truncate max-w-[220px]" title={p.name}>
                          {p.name}
                        </td>
                        <td className="py-1.5 text-right text-zinc-500 text-xs whitespace-nowrap font-mono">{fmtNumber(p.requests)} 次</td>
                        <td className="py-1.5 text-right font-mono text-xs text-zinc-600 w-20">{fmtTokens(p.total)}</td>
                      </tr>
                    ))}
                    {(data.projects || []).length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-sm text-zinc-400">
                          当前筛选下没有项目数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>

              {/* 活跃时段 */}
              <Card className="p-4">
                <div className="font-medium text-zinc-800 mb-3">活跃时段热力图（请求次数）</div>
                <HoursHeatmap hours={data.hours || {}} />
              </Card>
            </div>
          </div>

          {/* 会话排行 */}
          <Card className="p-4">
            <div className="font-medium text-zinc-800 mb-3">会话排行（Top 20 · Token 用在哪些会话）</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs text-zinc-400 text-left border-b border-zinc-100">
                    <th className="py-2 font-medium">会话</th>
                    <th className="py-2 font-medium w-32">项目</th>
                    <th className="py-2 font-medium w-56">主要模型</th>
                    <th className="py-2 font-medium w-16 text-right">请求</th>
                    <th className="py-2 font-medium w-24 text-right">Token</th>
                    <th className="py-2 font-medium w-28 text-right">最近活跃</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {(data.sessions || []).slice(0, 20).map((sess) => (
                    <tr key={sess.sessionId} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-2 max-w-[280px]">
                        <div className="truncate text-zinc-700" title={sess.title || sess.sessionId}>
                          {sess.title || <span className="font-mono text-xs">{sess.sessionId.slice(0, 18)}…</span>}
                        </div>
                      </td>
                      <td className="py-2 text-zinc-500 text-xs truncate max-w-32" title={sess.project}>
                        {sess.project}
                      </td>
                      <td className="py-2 text-xs">
                        {sess.topModels.slice(0, 2).map((tm, i) => (
                          <span key={tm.model} className="mr-2 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="font-mono text-zinc-500">{tm.model.length > 28 ? tm.model.slice(0, 28) + '…' : tm.model}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-2 text-right text-zinc-500 text-xs font-mono">{fmtNumber(sess.requests)}</td>
                      <td className="py-2 text-right font-mono text-xs text-zinc-700">{fmtTokens(sess.total)}</td>
                      <td className="py-2 text-right text-zinc-400 text-xs" title={sess.lastActive ? fmtDateTime(sess.lastActive) : ''}>
                        {fmtRelative(sess.lastActive)}
                      </td>
                    </tr>
                  ))}
                  {(data.sessions || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-zinc-400">
                        当前筛选下没有会话数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="text-xs text-zinc-400">
            数据来源：本机 <span className="font-mono">{data.dir}/projects</span> 下的会话日志，仅本地解析，不会上传。统计生成于{' '}
            {fmtDateTime(data.generatedAt)}。
          </div>
        </>
      )}
    </div>
  );
}
