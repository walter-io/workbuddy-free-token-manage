import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmProvider,
  IconChart,
  IconGauge,
  IconGrid,
  IconRefresh,
  IconSettings,
  IconSparkles,
  IconWarning,
  ToastProvider,
} from './components/ui';
import { get } from './lib/api';
import type { LoadedInfo, QuotaResponse } from './lib/types';
import ModelsPage from './pages/ModelsPage';
import QuotaPage from './pages/QuotaPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  { id: 'models', label: '模型广场', desc: '浏览与筛选各平台模型，一键载入 WorkBuddy', icon: IconGrid },
  { id: 'quota', label: '额度与积分', desc: '查看各平台 Key 的免费额度、用量与余额', icon: IconGauge },
  { id: 'stats', label: 'Token 统计', desc: '本地解析会话日志，统计 Token 消耗与分布', icon: IconChart },
  { id: 'settings', label: '设置', desc: '管理平台 Key、数据目录与网络代理', icon: IconSettings },
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
      <button
        onClick={onGoQuota}
        className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
      >
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
      <button onClick={onGoQuota} title="点击查看各平台额度详情">
        <Badge color="red" dot>
          Key 状态异常
        </Badge>
      </button>
    );
  }
  const f = active.freeModelDailyRequests;
  return (
    <button
      onClick={onGoQuota}
      className="flex items-center gap-2 text-xs bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 shadow-sm hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
      title="仅统计 OpenRouter 免费（:free）模型的今日请求额度，其他平台不受此限制；点击查看各平台额度详情"
    >
      <IconSparkles className="w-3.5 h-3.5 text-indigo-400" />
      <span className="text-zinc-400">OpenRouter 免费模型</span>
      {f ? (
        <>
          <span
            className={`font-semibold font-mono ${
              f.remaining <= 0 ? 'text-red-600' : f.remaining <= f.limit * 0.2 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {f.remaining}
          </span>
          <span className="text-zinc-400">/ {f.limit} 次</span>
        </>
      ) : (
        <span className="text-zinc-400">额度未知</span>
      )}
    </button>
  );
}

/** 本地服务在线探测：进程退出/端口被占/代理假死时，明确告知用户而不是让页面一直转圈 */
function ServiceBanner() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const wasOffline = useRef(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      await get('/api/health', { timeoutMs: 8000 });
      if (wasOffline.current) {
        // 服务恢复：重新加载以刷新所有页面数据
        wasOffline.current = false;
        location.reload();
        return;
      }
      setOffline(false);
    } catch {
      wasOffline.current = true;
      setOffline(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [check]);

  if (!offline) return null;

  return (
    <Card className="px-4 py-3 mb-4 border-red-200 bg-red-50 flex flex-wrap items-center gap-3 animate-fade-in">
      <IconWarning className="w-4 h-4 text-red-500 shrink-0" />
      <div className="text-sm text-red-700 leading-relaxed">
        <b>本地服务已断开</b>
        <span className="text-red-600/90">
          {' '}
          —— 界面数据无法刷新。请在项目目录执行 <span className="font-mono text-xs bg-white/70 rounded px-1 py-0.5">npm start</span> 启动服务，或直接运行{' '}
          <span className="font-mono text-xs bg-white/70 rounded px-1 py-0.5">npm run app</span> 打开桌面应用。
        </span>
      </div>
      <div className="ml-auto">
        <Button size="sm" variant="subtle" loading={checking} onClick={check}>
          <IconRefresh className="w-3.5 h-3.5" />
          重新连接
        </Button>
      </div>
    </Card>
  );
}

/** 顶栏：WorkBuddy 进程状态（30s 轮询），有未生效配置时高亮提示 */
function WorkBuddyStatus({ onClick }: { onClick: () => void }) {
  const [info, setInfo] = useState<LoadedInfo | null>(null);

  useEffect(() => {
    const load = () => get<LoadedInfo>('/api/workbuddy/status').then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!info) return null;

  if (info.running && info.pendingRestart) {
    return (
      <button onClick={onClick} title="models.json 在 WorkBuddy 运行期间被修改，需重启才会加载最新模型配置">
        <Badge color="amber" dot>
          配置待重启
        </Badge>
      </button>
    );
  }
  // 探测失败时不能断言"未运行"，否则会出现 WorkBuddy 开着却显示未运行
  if (!info.running && info.detectError) {
    return (
      <span title={`无法确认 WorkBuddy 运行状态：${info.detectError}`}>
        <Badge color="amber" dot>
          WorkBuddy 状态未知
        </Badge>
      </span>
    );
  }
  return (
    <span
      title={
        (info.running
          ? `WorkBuddy 正在运行（${info.exePath || '路径未知'}）${info.processCount ? ` · ${info.processCount} 个进程` : ''}`
          : 'WorkBuddy 未运行，载入的模型将在下次启动时生效') + (info.detectWarning ? `\n注意：${info.detectWarning}` : '')
      }
    >
      <Badge color={info.running ? 'green' : 'gray'} dot>
        WorkBuddy {info.running ? '运行中' : '未运行'}
      </Badge>
    </span>
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

  const meta = TABS.find((t) => t.id === tab)!;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="h-full flex">
          {/* 侧栏 */}
          <aside className="w-56 shrink-0 bg-white border-r border-zinc-200 flex flex-col max-md:hidden">
            <div className="px-4 py-5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-indigo-600/30">
                FT
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 leading-tight">Free Token</div>
                <div className="text-[11px] text-zinc-400 leading-tight">多平台免费模型管理</div>
              </div>
            </div>

            <nav className="px-2.5 mt-1 flex flex-col gap-0.5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const on = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    className={`relative flex items-center gap-2.5 px-3 h-9.5 rounded-lg text-sm transition-all duration-150 ${
                      on ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-indigo-600" />}
                    <Icon className={`w-4 h-4 transition-colors ${on ? 'text-indigo-600' : 'text-zinc-400'}`} />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto px-3.5 py-4 space-y-2">
              <WorkBuddyStatus onClick={() => go('models')} />
              <div className="text-[11px] text-zinc-400 leading-relaxed">
                数据仅存本机：Key 保存在 <span className="font-mono">~/.free-token</span>，模型写入{' '}
                <span className="font-mono">~/.workbuddy/models.json</span>
              </div>
            </div>
          </aside>

          {/* 主区域 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-16 shrink-0 bg-white/85 backdrop-blur border-b border-zinc-200 flex items-center px-5 gap-3">
              {/* 小屏导航 */}
              <div className="hidden max-md:flex items-center gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    className={`px-3 h-8 rounded-lg text-xs whitespace-nowrap transition-colors ${
                      tab === t.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-zinc-500 hover:bg-zinc-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="max-md:hidden min-w-0">
                <div className="text-[15px] font-semibold text-zinc-900 leading-tight">{meta.label}</div>
                <div className="text-xs text-zinc-400 leading-tight mt-0.5 truncate">{meta.desc}</div>
              </div>

              <div className="ml-auto flex items-center gap-2.5 shrink-0">
                <div className="max-md:hidden">
                  <WorkBuddyStatus onClick={() => go('models')} />
                </div>
                <HeaderQuotaChip onGoQuota={() => go('quota')} />
              </div>
            </header>

            <main className="flex-1 overflow-y-auto">
              <div className="max-w-[1400px] mx-auto p-5">
                <ServiceBanner />
                {[...visited].map((id) => (
                  <div key={id} className={tab === id ? '' : 'hidden'}>
                    {id === 'models' && <ModelsPage active={tab === 'models'} />}
                    {id === 'quota' && <QuotaPage active={tab === 'quota'} />}
                    {id === 'stats' && <StatsPage />}
                    {id === 'settings' && <SettingsPage />}
                  </div>
                ))}
              </div>
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
