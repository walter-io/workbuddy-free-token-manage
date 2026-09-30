import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconInfo,
  IconRefresh,
  IconSearch,
  IconTrash,
  Modal,
  Segmented,
  Spinner,
  useToast,
} from '../components/ui';
import { get, post } from '../lib/api';
import type { KeyInfo, KeysResponse, LoadedInfo, LoadResult, ModelsResponse, ORModel, PlatformInfo } from '../lib/types';
import { fmtContext, fmtDate, fmtPricePerM, fmtRelative } from '../lib/format';

type PriceFilter = 'all' | 'free' | 'paid';
type KindFilter = 'all' | 'text' | 'image' | 'video';
type SortKey = 'created' | 'context' | 'name' | 'price';

const PAGE_SIZE = 50;

/** 客户端模型列表缓存：切换平台秒开；超过 TTL 由定时器在后台静默刷新，手动「刷新」才强制回源 */
const CLIENT_TTL = 5 * 60_000;
const modelsCache = new Map<string, { data: ModelsResponse; at: number }>();

const KIND_LABEL: Record<string, string> = {
  text: '文本对话',
  image: '图像生成',
  video: '视频生成',
};

function kindBadge(m: ORModel) {
  if (m.outputKind === 'image') return <Badge color="violet">图像生成</Badge>;
  if (m.outputKind === 'video') return <Badge color="amber">视频生成</Badge>;
  return null;
}

/** 平台切换 pills：默认停在 OpenRouter；圆点表示该平台是否已配置 Key */
function PlatformTabs({ platforms, active, onChange }: { platforms: PlatformInfo[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-3 mb-3 border-b border-zinc-100">
      {platforms.map((p) => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            title={`${p.name}（${p.keyCount ? '已配置 Key' : '未配置 Key'}）${p.note ? ` — ${p.note}` : ''}`}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
              isActive
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/80' : p.keyCount ? 'bg-emerald-500' : 'bg-zinc-300'}`}
            />
            {p.shortName}
          </button>
        );
      })}
    </div>
  );
}

export default function ModelsPage() {
  const toast = useToast();

  const [platform, setPlatform] = useState('openrouter');
  const platformRef = useRef('openrouter');
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 筛选
  const [q, setQ] = useState('');
  const [price, setPrice] = useState<PriceFilter>('free');
  const [kind, setKind] = useState<KindFilter>('all');
  const [vendor, setVendor] = useState('all');
  const [toolsOnly, setToolsOnly] = useState(false);
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [minCtx, setMinCtx] = useState('0');
  const [sort, setSort] = useState<SortKey>('created');
  const [page, setPage] = useState(1);

  // 载入相关
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [activeKeys, setActiveKeys] = useState<Record<string, string | null>>({});
  const [loadedInfo, setLoadedInfo] = useState<LoadedInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadKey, setLoadKey] = useState('');
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [loadLoading, setLoadLoading] = useState(false);
  const [showLoadedPanel, setShowLoadedPanel] = useState(false);

  const platformName = platforms.find((p) => p.id === platform)?.name || data?.platformName || platform;
  const platformMeta = platforms.find((p) => p.id === platform);

  /** 拉取指定平台模型列表。force=true 绕过服务端缓存强制回源；有缓存可展示时失败不打扰用户 */
  const fetchModels = useCallback(async (pf: string, force = false) => {
    setRefreshing(true);
    try {
      const r = await get<ModelsResponse>(`/api/models?platform=${encodeURIComponent(pf)}${force ? '&refresh=1' : ''}`);
      modelsCache.set(pf, { data: r, at: Date.now() });
      if (platformRef.current === pf) {
        setData(r);
        setError(null);
      }
    } catch (e: any) {
      if (platformRef.current === pf && !modelsCache.has(pf)) {
        setError(e?.message || '加载失败');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** 展示某平台：有缓存立即渲染，过期则后台补一次刷新；无缓存才整页加载 */
  const showPlatform = useCallback(
    (pf: string) => {
      const cached = modelsCache.get(pf);
      if (cached) {
        setData(cached.data);
        setError(null);
        setLoading(false);
        if (Date.now() - cached.at > CLIENT_TTL) fetchModels(pf, false);
      } else {
        setData(null);
        setLoading(true);
        fetchModels(pf, false).finally(() => setLoading(false));
      }
    },
    [fetchModels]
  );

  const loadSideData = useCallback(async () => {
    get<{ platforms: PlatformInfo[] }>('/api/platforms')
      .then((r) => setPlatforms(r.platforms || []))
      .catch(() => {});
    get<KeysResponse>('/api/keys')
      .then((r) => {
        setKeys(r.keys);
        setActiveKeys(r.activeKeys || {});
      })
      .catch(() => {});
    get<LoadedInfo>('/api/workbuddy/status')
      .then(setLoadedInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    showPlatform('openrouter');
    loadSideData();
  }, [showPlatform, loadSideData]);

  // 定期刷新：每分钟检查一次，数据超过 5 分钟就在后台静默更新（不挡界面）
  useEffect(() => {
    const t = setInterval(() => {
      const cached = modelsCache.get(platformRef.current);
      if (cached && Date.now() - cached.at > CLIENT_TTL) fetchModels(platformRef.current, false);
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchModels]);

  const switchPlatform = (id: string) => {
    if (id === platformRef.current) return;
    platformRef.current = id;
    setPlatform(id);
    setSelected(new Set());
    setQ('');
    setPrice('free');
    setKind('all');
    setVendor('all');
    setToolsOnly(false);
    setReasoningOnly(false);
    setMinCtx('0');
    setSort('created');
    setPage(1);
    showPlatform(id);
  };

  // 载入用 key：当前平台的活跃 key（无则该平台第一个）
  const platformKeys = useMemo(() => keys.filter((k) => k.platform === platform), [keys, platform]);
  useEffect(() => {
    setLoadKey(activeKeys[platform] || platformKeys[0]?.id || '');
  }, [platform, platformKeys, activeKeys]);

  const loadedIds = useMemo(() => new Set((loadedInfo?.loaded || []).map((e) => e.id)), [loadedInfo]);
  const platformNameOf = (id: string) => platforms.find((p) => p.id === id)?.shortName || id;

  const vendors = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of data?.models || []) map.set(m.vendor, (map.get(m.vendor) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const filtered = useMemo(() => {
    let list = data?.models || [];
    const kw = q.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (m) => m.id.toLowerCase().includes(kw) || m.name.toLowerCase().includes(kw) || m.description.toLowerCase().includes(kw)
      );
    }
    if (price === 'free') list = list.filter((m) => m.isFree);
    if (price === 'paid') list = list.filter((m) => !m.isFree);
    if (kind !== 'all') list = list.filter((m) => m.outputKind === kind);
    if (vendor !== 'all') list = list.filter((m) => m.vendor === vendor);
    if (toolsOnly) list = list.filter((m) => m.supportsTools);
    if (reasoningOnly) list = list.filter((m) => m.supportsReasoning);
    const minCtxN = Number(minCtx) || 0;
    if (minCtxN > 0) list = list.filter((m) => (m.contextLength || 0) >= minCtxN);

    const sorted = [...list];
    if (sort === 'created') sorted.sort((a, b) => (b.created || 0) - (a.created || 0));
    if (sort === 'context') sorted.sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0));
    if (sort === 'name') sorted.sort((a, b) => a.id.localeCompare(b.id));
    if (sort === 'price')
      sorted.sort((a, b) => (a.pricing?.prompt ?? 0) + (a.pricing?.completion ?? 0) - ((b.pricing?.prompt ?? 0) + (b.pricing?.completion ?? 0)));
    return sorted;
  }, [data, q, price, kind, vendor, toolsOnly, reasoningOnly, minCtx, sort]);

  useEffect(() => setPage(1), [q, price, kind, vendor, toolsOnly, reasoningOnly, minCtx, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const freeCount = useMemo(() => (data?.models || []).filter((m) => m.isFree).length, [data]);

  const selectable = (m: ORModel) => m.outputKind === 'text' && m.loadable !== false;
  const pageSelectableIds = pageItems.filter(selectable).map((m) => m.id);
  const allPageSelected = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id));

  const toggleSelect = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  };
  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageSelectableIds.forEach((id) => next.delete(id));
      else pageSelectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedFree = useMemo(() => {
    const all = data?.models || [];
    return [...selected].filter((id) => all.find((m) => m.id === id)?.isFree).length;
  }, [selected, data]);

  const doLoad = async () => {
    setLoadLoading(true);
    try {
      const r = await post<LoadResult>('/api/workbuddy/load', { platform, modelIds: [...selected], keyId: loadKey || undefined });
      setLoadResult(r);
      setLoadOpen(false);
      setSelected(new Set());
      toast('ok', `载入完成：新增 ${r.added} 个，更新 ${r.updated} 个`);
      loadSideData();
    } catch (e: any) {
      toast('err', e?.message || '载入失败');
    } finally {
      setLoadLoading(false);
    }
  };

  const doRemove = async (id: string) => {
    if (!confirm(`确定从 WorkBuddy 移除「${id}」吗？（会先自动备份 models.json）`)) return;
    try {
      const r = await post<{ removed: number; backup: string | null }>('/api/workbuddy/remove', { modelIds: [id] });
      toast('ok', `已移除 ${r.removed} 个模型` + (r.backup ? `，备份：${r.backup.split(/[\\/]/).pop()}` : ''));
      loadSideData();
    } catch (e: any) {
      toast('err', e?.message || '移除失败');
    }
  };

  const doRestart = async () => {
    try {
      await post('/api/workbuddy/restart');
      toast('ok', 'WorkBuddy 已重启，模型配置生效');
      loadSideData();
    } catch (e: any) {
      toast('err', e?.message || '重启失败，请手动重启 WorkBuddy');
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(
      () => toast('info', `已复制 ${id}`),
      () => {}
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner className="w-6 h-6" />
        <span className="ml-3 text-sm text-zinc-500">正在获取 {platformName} 模型列表…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <PlatformTabs platforms={platforms} active={platform} onChange={switchPlatform} />
          <EmptyState
            icon={<IconRefresh />}
            title={`${platformName} 模型列表加载失败`}
            desc={
              error +
              (platformMeta?.modelsPublic || !platformMeta?.keyUrl
                ? '。已尝试本地缓存但不可用，请检查网络后重试。'
                : '。添加该平台的 API Key 后即可获取模型列表。')
            }
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => showPlatform(platform)}>重试</Button>
                {!platformMeta?.modelsPublic && platformMeta?.keyUrl && (
                  <Button variant="subtle" onClick={() => (location.hash = 'settings')}>前往设置添加 Key</Button>
                )}
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <Card className="p-4">
        <PlatformTabs platforms={platforms} active={platform} onChange={switchPlatform} />
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <IconSearch className="w-4 h-4 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索模型 ID / 名称 / 描述"
              className="w-64 h-9 pl-8 pr-3 rounded-lg border border-zinc-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="w-px h-6 bg-zinc-200/80 hidden lg:block" />
          <Segmented<PriceFilter>
            value={price}
            onChange={setPrice}
            options={[
              { value: 'free', label: '免费' },
              { value: 'paid', label: '付费' },
              { value: 'all', label: '全部' },
            ]}
          />
          <Segmented<KindFilter>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'text', label: '文本对话' },
              { value: 'image', label: '图像生成' },
              { value: 'video', label: '视频生成' },
            ]}
          />
          <div className="w-px h-6 bg-zinc-200/80 hidden lg:block" />
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-zinc-200 text-sm bg-white outline-none focus:border-indigo-400"
          >
            <option value="all">全部厂商</option>
            {vendors.map(([v, n]) => (
              <option key={v} value={v}>
                {v} ({n})
              </option>
            ))}
          </select>
          <select
            value={minCtx}
            onChange={(e) => setMinCtx(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-zinc-200 text-sm bg-white outline-none focus:border-indigo-400"
          >
            <option value="0">上下文不限</option>
            <option value="32768">≥ 32K</option>
            <option value="131072">≥ 128K</option>
            <option value="200000">≥ 200K</option>
            <option value="1000000">≥ 1M</option>
          </select>
          <div className="w-px h-6 bg-zinc-200/80 hidden lg:block" />
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer select-none">
            <input type="checkbox" checked={toolsOnly} onChange={(e) => setToolsOnly(e.target.checked)} className="accent-indigo-600 rounded" />
            支持工具调用
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 cursor-pointer select-none">
            <input type="checkbox" checked={reasoningOnly} onChange={(e) => setReasoningOnly(e.target.checked)} className="accent-indigo-600 rounded" />
            支持推理
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 px-2.5 rounded-lg border border-zinc-200 text-sm bg-white outline-none focus:border-indigo-400 ml-auto"
          >
            <option value="created">排序：最新发布</option>
            <option value="context">排序：上下文最大</option>
            <option value="price">排序：价格最低</option>
            <option value="name">排序：名称</option>
          </select>
          <Button variant="subtle" loading={refreshing} onClick={() => fetchModels(platform, true)} title="绕过缓存，强制从平台重新拉取模型列表">
            <IconRefresh className="w-4 h-4" />
            刷新
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>
            共 <b className="text-zinc-600">{data?.count ?? 0}</b> 个模型，其中免费 <b className="text-emerald-600">{freeCount}</b> 个
          </span>
          <span>当前筛选结果 {filtered.length} 个</span>
          <span>列表更新于 {fmtRelative(data?.fetchedAt)}</span>
          {loadedInfo && (
            <span className={loadedInfo.running ? 'text-emerald-600' : 'text-zinc-400'}>
              WorkBuddy：{loadedInfo.running ? '运行中' : '未运行'}
            </span>
          )}
        </div>
        {data?.note && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 leading-relaxed">
            <IconInfo className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>{data.note}</span>
          </div>
        )}
      </Card>

      {/* 已载入面板 */}
      {loadedInfo && loadedInfo.loaded.length > 0 && (
        <Card className="overflow-hidden">
          <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => setShowLoadedPanel((v) => !v)}>
            <IconChevronDown className={`w-4 h-4 transition-transform ${showLoadedPanel ? '' : '-rotate-90'}`} />
            已载入 WorkBuddy 的模型
            <Badge color="green">{loadedInfo.loaded.length}</Badge>
            <span className="ml-auto text-xs text-zinc-400 font-normal truncate max-w-sm">{loadedInfo.modelsJsonPath}</span>
          </button>
          {showLoadedPanel && (
            <div className="border-t border-zinc-100 divide-y divide-zinc-50">
              {loadedInfo.loaded.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-zinc-700 truncate">{e.id}</span>
                  <Badge color="blue">{platformNameOf(e.platform)}</Badge>
                  {e.keyTail && <Badge color="gray">key…{e.keyTail}</Badge>}
                  {e.supportsToolCall && <Badge color="blue">tools</Badge>}
                  {e.supportsReasoning && <Badge color="violet">reasoning</Badge>}
                  <div className="ml-auto">
                    <Button size="sm" variant="danger" onClick={() => doRemove(e.id)}>
                      <IconTrash className="w-3.5 h-3.5" />
                      移除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 批量操作条 */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10">
          <Card className="px-4 py-2.5 flex flex-wrap items-center gap-3 border-indigo-200 bg-indigo-50/90 backdrop-blur">
            <span className="text-sm text-zinc-700">
              已选 <b>{selected.size}</b> 个模型（免费 {selectedFree} 个）
            </span>
            <Button variant="primary" size="sm" onClick={() => setLoadOpen(true)}>
              <IconDownload className="w-3.5 h-3.5" />
              载入到 WorkBuddy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              取消选择
            </Button>
          </Card>
        </div>
      )}

      {/* 模型表格 */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-500 text-xs">
              <th className="w-9 pl-4">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllPage}
                  className="accent-indigo-600 rounded"
                  title="全选本页可载入的模型"
                />
              </th>
              <th className="text-left py-2.5 pr-3 font-medium">模型</th>
              <th className="text-left py-2.5 pr-3 font-medium w-28">厂商</th>
              <th className="text-left py-2.5 pr-3 font-medium w-20">上下文</th>
              <th className="text-left py-2.5 pr-3 font-medium w-36">价格 / 1M tokens</th>
              <th className="text-left py-2.5 pr-3 font-medium">能力</th>
              <th className="text-left py-2.5 pr-3 font-medium w-24">发布</th>
              <th className="text-left py-2.5 pr-4 font-medium w-28">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {pageItems.map((m) => {
              const canLoad = selectable(m);
              const isLoaded = loadedIds.has(m.id);
              return (
                <tr
                  key={m.id}
                  className={`hover:bg-zinc-50/60 ${canLoad ? 'cursor-pointer' : ''}`}
                  onClick={
                    canLoad
                      ? (e) => {
                          // 点在按钮/复选框/链接上时不触发行选中
                          if ((e.target as HTMLElement).closest('button,input,a,label')) return;
                          toggleSelect(m.id, !selected.has(m.id));
                        }
                      : undefined
                  }
                >
                  <td className="pl-4">
                    <input
                      type="checkbox"
                      disabled={!canLoad}
                      checked={selected.has(m.id)}
                      onChange={(e) => toggleSelect(m.id, e.target.checked)}
                      className="accent-indigo-600 rounded disabled:opacity-30"
                      title={canLoad ? '选择' : m.loadable === false ? '该模型协议不兼容，不支持载入' : '图像/视频生成模型暂不支持载入'}
                    />
                  </td>
                  <td className="py-2 pr-3 max-w-[340px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-800 truncate" title={m.description?.slice(0, 200)}>
                        {m.name}
                      </span>
                      {kindBadge(m)}
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs text-zinc-400 font-mono hover:text-indigo-500 mt-0.5"
                      onClick={() => copyId(m.id)}
                      title="点击复制模型 ID"
                    >
                      <IconCopy className="w-3 h-3 shrink-0" />
                      <span className="truncate">{m.id}</span>
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-zinc-500">{m.vendor}</td>
                  <td className="py-2 pr-3 text-zinc-500 font-mono text-xs">{fmtContext(m.contextLength)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {m.isFree ? (
                      <Badge color="green">免费</Badge>
                    ) : m.pricing ? (
                      <span className="text-zinc-600 font-mono">
                        {fmtPricePerM(m.pricing.prompt)} <span className="text-zinc-300">in</span> · {fmtPricePerM(m.pricing.completion)}{' '}
                        <span className="text-zinc-300">out</span>
                      </span>
                    ) : (
                      <span className="text-zinc-300">按平台计费</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {m.supportsTools && <Badge color="blue">工具调用</Badge>}
                      {m.supportsReasoning && <Badge color="violet">推理</Badge>}
                      {m.supportsImageInput && <Badge color="gray">图片输入</Badge>}
                      {!m.supportsTools && !m.supportsReasoning && !m.supportsImageInput && <span className="text-zinc-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{m.created ? fmtDate(m.created * 1000) : '—'}</td>
                  <td className="py-2 pr-4">
                    {isLoaded ? (
                      <Badge color="green">已载入</Badge>
                    ) : canLoad ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toggleSelect(m.id, true);
                          setLoadOpen(true);
                        }}
                      >
                        载入
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-300">{m.loadable === false ? '协议不兼容' : '不支持载入'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="py-10 text-center text-sm text-zinc-400">没有符合筛选条件的模型，试试放宽筛选</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 text-xs text-zinc-500">
          <span>
            第 {page} / {pageCount} 页 · 本页 {pageItems.length} 个
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="subtle" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button size="sm" variant="subtle" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {/* 载入确认弹窗 */}
      <Modal open={loadOpen} onClose={() => setLoadOpen(false)} title={`载入模型到 WorkBuddy（${platformName}）`}>
        <div className="space-y-4 text-sm">
          <div className="text-zinc-600">
            将把 <b className="text-zinc-900">{selected.size}</b> 个模型以「自定义模型（OpenAI 兼容）」方式写入：
            <div className="mt-1 font-mono text-xs bg-zinc-50 rounded px-2 py-1.5 text-zinc-500 break-all">{loadedInfo?.modelsJsonPath || '~/.workbuddy/models.json'}</div>
          </div>
          <div>
            <div className="mb-1.5 text-zinc-600">使用的 {platformName} API Key：</div>
            {platformKeys.length === 0 ? (
              <div className="text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                尚未配置 {platformName} Key，请先到「设置」添加
                {platformMeta?.keyUrl && (
                  <>
                    {' '}
                    （<a href={platformMeta.keyUrl} target="_blank" rel="noreferrer" className="underline">获取 Key ↗</a>）
                  </>
                )}
              </div>
            ) : (
              <select
                value={loadKey}
                onChange={(e) => setLoadKey(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm outline-none focus:border-indigo-400"
              >
                {platformKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                    {k.id === activeKeys[platform] ? '（活跃）' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="text-xs text-zinc-400 leading-relaxed">
            写入前会自动备份 models.json；已存在的模型会更新配置而不会重复添加。图像/视频生成模型与协议不兼容的模型不支持载入。
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={() => setLoadOpen(false)}>取消</Button>
            <Button variant="primary" loading={loadLoading} disabled={platformKeys.length === 0} onClick={doLoad}>
              确认载入 {selected.size} 个
            </Button>
          </div>
        </div>
      </Modal>

      {/* 载入结果弹窗 */}
      <Modal open={!!loadResult} onClose={() => setLoadResult(null)} title="载入结果">
        {loadResult && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2">
              <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                <div className="text-emerald-700 text-lg font-semibold">{loadResult.added}</div>
                <div className="text-xs text-emerald-600">新增模型</div>
              </div>
              <div className="flex-1 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2.5">
                <div className="text-sky-700 text-lg font-semibold">{loadResult.updated}</div>
                <div className="text-xs text-sky-600">更新已有</div>
              </div>
              <div className="flex-1 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2.5">
                <div className="text-zinc-700 text-lg font-semibold">{loadResult.total}</div>
                <div className="text-xs text-zinc-500">models.json 总数</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              使用 Key：<span className="font-mono">{loadResult.keyUsed}</span>
              {loadResult.backup && (
                <>
                  <br />
                  备份文件：<span className="font-mono break-all">{loadResult.backup}</span>
                </>
              )}
            </div>
            {loadResult.skipped.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs">
                <div className="text-amber-700 font-medium mb-1">跳过 {loadResult.skipped.length} 个：</div>
                {loadResult.skipped.map((s) => (
                  <div key={s.id} className="text-amber-600 font-mono">
                    {s.id} — {s.reason}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2.5 text-xs text-zinc-500">
              <span className="flex-1">WorkBuddy 正在运行时需要重启才能读取新模型配置。</span>
              {loadedInfo?.running ? (
                <Button size="sm" variant="primary" onClick={doRestart}>
                  重启 WorkBuddy
                </Button>
              ) : (
                <span>当前未运行，下次启动自动生效</span>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setLoadResult(null)}>
                完成
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
