import { useCallback, useEffect, useState } from 'react';
import { Badge, IconChart, IconGauge, IconGrid, IconSettings, ToastProvider } from './components/ui';
import { get } from './lib/api';
import type { QuotaResponse } from './lib/types';
import ModelsPage from './pages/ModelsPage';
import QuotaPage from './pages/QuotaPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  { id: 'models', label: '模型广场', icon: IconGrid },
  { id: 'quota', label: '额度与积分', icon: IconGauge },
  { id: 'stats', label: 'Token 统计', icon: IconChart },
  { id: 'settings', label: '设置', icon: IconSettings },
] as const;

type TabId = (typeof TABS)[number]['id'];

function currentTab(): TabId {
  const h = location.hash.replace('#', '');
  return (TABS.some((t) => t.id === h) ? h : 'models') as TabId;
}

/** 顶栏：OpenRouter 活跃 key 的今日免费额度小徽标（60s 自动刷新） */
function HeaderQuotaChip({ onGoQuota }: { onGoQuota: () => void }) {
  const [quota, setQuota] = useState<QuotaResponse | null>(null);

  const load = useCallback(() => {
    get<QuotaResponse>('/api/quota')
      .then(setQuota)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!quota || quota.platforms.length === 0) {
    return (
      <button onClick={onGoQuota} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100">
        未配置平台 Key，点击前往设置
      </button>
    );
  }

  const orGroup = quota.platforms.find((g) => g.platform === 'openrouter');
  if (!orGroup) return null; // 未配置 OpenRouter 时顶栏不展示其额度
  const active =
    orGroup.keys.find((k) => k.keyId === quota.activeKeys?.openrouter) || orGroup.keys.find((k) => k.status === 'ok');
  if (!active || active.status !== 'ok') {
    return (
      <Badge color="red">Key 状态异常</Badge>
    );
  }
  const f = active.freeModelDailyRequests;
  return (
    <button
      onClick={onGoQuota}
      className="flex items-center gap-2 text-xs bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 shadow-sm hover:bg-zinc-50"
      title="OpenRouter 今日免费模型请求额度（点击查看详情）"
    >
      <span className="text-zinc-400">今日免费</span>
      {f ? (
        <>
          <span className={`font-semibold font-mono ${f.remaining <= 0 ? 'text-red-600' : f.remaining <= f.limit * 0.2 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {f.remaining}
          </span>
          <span className="text-zinc-400">/ {f.limit}</span>
        </>
      ) : (
        <span className="text-zinc-400">未知</span>
      )}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>(currentTab());
  // 访问过的页签保持挂载（仅隐藏），切换不重新加载数据、不丢筛选状态
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([currentTab()]));

  useEffect(() => {
    const onHash = () => setTab(currentTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  const go = (id: TabId) => {
    location.hash = id;
    setTab(id);
  };

  return (
    <ToastProvider>
      <div className="h-full flex">
        {/* 侧栏 */}
        <aside className="w-52 shrink-0 bg-white border-r border-zinc-200 flex flex-col max-md:hidden">
          <div className="px-4 py-5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              FT
            </div>
            <div>
              <div className="font-semibold text-zinc-900 leading-tight">Free Token</div>
              <div className="text-[11px] text-zinc-400 leading-tight">多平台免费模型管理</div>
            </div>
          </div>
          <nav className="px-2.5 mt-2 flex flex-col gap-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={`flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm transition-all ${
                    tab === t.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium ring-1 ring-indigo-200/70'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto px-4 py-4 text-[11px] text-zinc-400 leading-relaxed">
            数据仅存本机：key 保存在 ~/.free-token，模型写入 ~/.workbuddy/models.json
          </div>
        </aside>

        {/* 主区域 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 bg-white/80 backdrop-blur border-b border-zinc-200 flex items-center px-5 gap-3">
            {/* 小屏导航 */}
            <div className="hidden max-md:flex items-center gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={`px-3 h-8 rounded-lg text-xs whitespace-nowrap ${tab === t.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-zinc-500 hover:bg-zinc-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="max-md:hidden flex items-center gap-2.5">
              <div className="font-semibold text-zinc-900">{TABS.find((t) => t.id === tab)?.label}</div>
              {tab === 'models' && <span className="text-xs text-zinc-400">浏览与筛选各平台模型，一键载入 WorkBuddy</span>}
            </div>
            <div className="ml-auto">
              <HeaderQuotaChip onGoQuota={() => go('quota')} />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-[1400px] mx-auto p-5">
              {[...visited].map((id) => (
                <div key={id} className={tab === id ? '' : 'hidden'}>
                  {id === 'models' && <ModelsPage />}
                  {id === 'quota' && <QuotaPage />}
                  {id === 'stats' && <StatsPage />}
                  {id === 'settings' && <SettingsPage />}
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
