import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  IconChevronDown,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconKey,
  IconRefresh,
  IconShield,
  IconTrash,
  Spinner,
  useConfirm,
  useToast,
} from '../components/ui';
import { del, get, post, put } from '../lib/api';
import type { DetectResult, KeyInfo, KeysResponse, PlatformInfo, SettingsInfo } from '../lib/types';
import { fmtDate, fmtRelative, showsMask } from '../lib/format';

function MarkerBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge color={ok ? 'green' : 'gray'}>
      {ok ? '✓' : '—'} {label}
    </Badge>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [activeKeys, setActiveKeys] = useState<Record<string, string | null>>({});
  const [newPlatform, setNewPlatform] = useState('openrouter');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [wbDir, setWbDir] = useState('');
  const [savingDir, setSavingDir] = useState(false);
  const [wbRunning, setWbRunning] = useState<boolean | null>(null);
  const [wbDetectError, setWbDetectError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [proxyInput, setProxyInput] = useState('');
  const [savingProxy, setSavingProxy] = useState(false);

  const platformMeta = platforms.find((p) => p.id === newPlatform);

  const loadKeys = useCallback(() => {
    get<KeysResponse>('/api/keys')
      .then((r) => {
        setKeys(r.keys);
        setActiveKeys(r.activeKeys || {});
      })
      .catch((e) => toast('err', e.message));
  }, [toast]);

  const loadSettings = useCallback(() => {
    get<SettingsInfo>('/api/settings')
      .then((r) => {
        setSettings(r);
        setWbDir(r.workbuddyDir || '');
        setProxyInput(r.proxyUrl || '');
      })
      .catch((e) => toast('err', e.message));
  }, [toast]);

  const redetect = useCallback(
    async (silent = false) => {
      setDetecting(true);
      try {
        const r = await get<DetectResult>('/api/workbuddy/detect');
        setSettings((prev) => (prev ? { ...prev, detected: r.detected } : prev));
        setWbRunning(r.running);
        setWbDetectError(r.detectError || null);
        if (!silent) {
          if (r.detected.valid) {
            toast('ok', `已检测到 WorkBuddy 数据目录：${r.detected.dir}`);
          } else {
            toast('err', '未检测到 WorkBuddy 数据目录，请确认已安装并运行过 WorkBuddy，或手动指定');
          }
          if (!r.running && r.detectError) toast('err', `无法确认 WorkBuddy 运行状态：${r.detectError}`);
        }
      } catch (e: any) {
        if (!silent) toast('err', e?.message || '检测失败');
      } finally {
        setDetecting(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    get<{ platforms: PlatformInfo[] }>('/api/platforms')
      .then((r) => setPlatforms(r.platforms || []))
      .catch(() => {});
    loadKeys();
    loadSettings();
    redetect(true);
  }, [loadKeys, loadSettings, redetect]);

  /** 保存手动指定的目录（留空恢复自动检测） */
  const saveDir = async (dir: string) => {
    setSavingDir(true);
    try {
      const r = await put<{ workbuddyDir: string; detected: SettingsInfo['detected'] }>('/api/settings', { workbuddyDir: dir });
      setSettings((prev) => (prev ? { ...prev, workbuddyDir: r.workbuddyDir, detected: r.detected } : prev));
      setWbDir(r.workbuddyDir);
      if (r.detected.valid) {
        setShowManual(false);
        toast('ok', `已保存，检测到 WorkBuddy 数据：${r.detected.dir}`);
      } else {
        toast('err', '已保存，但该目录未检测到 WorkBuddy 数据特征（models.json / 会话日志等）');
      }
    } catch (e: any) {
      toast('err', e?.message || '保存失败');
    } finally {
      setSavingDir(false);
    }
  };

  /** 保存出站代理地址（留空恢复自动探测） */
  const saveProxy = async (url: string) => {
    setSavingProxy(true);
    try {
      const r = await put<{ ok: boolean; proxyUrl: string; effectiveProxy: string | null }>('/api/settings', { proxyUrl: url });
      setSettings((prev) => (prev ? { ...prev, proxyUrl: r.proxyUrl, effectiveProxy: r.effectiveProxy } : prev));
      setProxyInput(r.proxyUrl);
      toast('ok', r.proxyUrl ? `代理已保存，出站请求将走 ${r.effectiveProxy || r.proxyUrl}` : '代理已清空，恢复自动探测（环境变量 / 系统代理）');
    } catch (e: any) {
      toast('err', e?.message || '保存失败');
    } finally {
      setSavingProxy(false);
    }
  };

  const addKey = async () => {
    const key = newKey.trim();
    if (!key) return;
    setAdding(true);
    try {
      const r = await post<{ id: string; label: string; platform: string }>('/api/keys', {
        platform: newPlatform,
        key,
        label: newLabel.trim() || undefined,
      });
      toast('ok', `${platformMeta?.name || r.platform} 的 Key「${r.label}」已添加`);
      setNewKey('');
      setNewLabel('');
      loadKeys();
    } catch (e: any) {
      toast('err', e?.message || '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const removeKey = async (k: KeyInfo) => {
    const pname = platforms.find((p) => p.id === k.platform)?.name || k.platform;
    const ok = await confirm({
      title: '删除平台 Key',
      message: (
        <>
          确定删除 <b className="text-zinc-800">{pname}</b> 的 Key「{k.label}」吗？
          <br />
          仅从本工具移除（<span className="font-mono text-xs">~/.free-token/config.json</span>），不影响平台账号，也不会改动已载入 WorkBuddy 的模型。
        </>
      ),
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/api/keys/${k.id}`);
      toast('ok', '已删除');
      loadKeys();
    } catch (e: any) {
      toast('err', e?.message || '删除失败');
    }
  };

  const activateKey = async (k: KeyInfo) => {
    try {
      await post(`/api/keys/${k.id}/activate`);
      toast('ok', `已将「${k.label}」设为该平台活跃 Key，新载入的模型默认使用它`);
      loadKeys();
    } catch (e: any) {
      toast('err', e?.message || '操作失败');
    }
  };

  const testKey = async (k: KeyInfo) => {
    setTestingId(k.id);
    try {
      const r = await post<{ ok: boolean; error?: string }>(`/api/keys/${k.id}/test`);
      if (r.ok) toast('ok', `「${k.label}」有效`);
      else toast('err', `「${k.label}」无效或已撤销${r.error ? `（${r.error}）` : ''}`);
      loadKeys();
    } catch (e: any) {
      toast('err', e?.message || '测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const clearCache = async () => {
    try {
      await post('/api/cache/clear', {});
      toast('ok', '全部平台的模型列表缓存已清除，下次进入模型页会重新拉取');
      loadSettings();
    } catch (e: any) {
      toast('err', e?.message || '操作失败');
    }
  };

  // 按平台分组展示已配置的 key（无 key 的平台不显示）
  const groupedKeys = platforms
    .map((p) => ({ platform: p, keys: keys.filter((k) => k.platform === p.id) }))
    .filter((g) => g.keys.length > 0);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Key 管理（按平台） */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <IconKey className="w-4 h-4 text-indigo-500" />
          <div className="font-medium text-zinc-900">平台 API Keys</div>
          {keys.length > 0 && (
            <>
              <Badge color="blue">{keys.length} 个 Key</Badge>
              <Badge color="gray">{groupedKeys.length} 个平台</Badge>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-zinc-400">
            <IconShield className="w-3.5 h-3.5" />
            仅存本机，不上传
          </span>
        </div>
        <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
          每个平台的 Key 分开管理、可配多个轮换。Key 只保存在本机 <span className="font-mono">~/.free-token/config.json</span>
          ，仅用于调用对应平台的官方接口，不会发送到其他任何地方。
        </div>

        {keys.length === 0 ? (
          <div className="text-sm text-zinc-500 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg px-4 py-6 text-center mb-4">
            <div className="font-medium text-zinc-700">还没有添加任何 Key</div>
            <div className="text-xs text-zinc-400 mt-1">在下方选择平台，粘贴该平台的 API Key 后会自动校验并保存。</div>
          </div>
        ) : (
          <div className="mb-4">
            {groupedKeys.map(({ platform: p, keys: ks }) => (
              <div key={p.id} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-zinc-500">{p.name}</span>
                  {p.keyUrl && (
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-600" title="打开该平台 Key 管理页">
                      <IconExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {p.uiDisabled && <Badge color="gray">{p.uiDisabled === 'region' ? '地区受限' : '平台限制'}</Badge>}
                </div>
                <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                  {ks.map((k) => (
                    <div key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-zinc-50/70 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-800 font-medium truncate max-w-48">{k.label}</span>
                          {k.id === activeKeys[k.platform] ? <Badge color="green">活跃</Badge> : k.lastStatus === 'invalid' ? <Badge color="red">无效</Badge> : null}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">
                          {showsMask(k.label, k.masked) && <span className="mr-1">{k.masked} ·</span>}
                          添加于 {fmtDate(k.addedAt)}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        {k.id !== activeKeys[k.platform] && (
                          <Button size="sm" variant="subtle" onClick={() => activateKey(k)}>
                            设为活跃
                          </Button>
                        )}
                        <Button size="sm" variant="subtle" loading={testingId === k.id} onClick={() => testKey(k)}>
                          <IconRefresh className="w-3.5 h-3.5" />
                          测试
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeKey(k)}>
                          <IconTrash className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加 Key：先选平台 */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 shrink-0">添加到平台</span>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-zinc-200 text-sm bg-white outline-none focus:border-indigo-400"
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id} disabled={!!p.uiDisabled}>
                  {p.name}
                  {p.uiDisabled ? (p.uiDisabled === 'region' ? '（地区受限）' : '（平台限制）') : ''}
                </option>
              ))}
            </select>
            {platformMeta?.site && (
              <a
                href={platformMeta.site}
                target="_blank"
                rel="noreferrer"
                title={`打开 ${platformMeta.name} 官网`}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-600"
              >
                <IconExternalLink className="w-3 h-3" />
                平台官网
              </a>
            )}
            {platformMeta?.keyUrl && (
              <a
                href={platformMeta.keyUrl}
                target="_blank"
                rel="noreferrer"
                title={`打开 ${platformMeta.name} 的 Key 管理页`}
                className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600"
              >
                <IconKey className="w-3 h-3" />
                获取 / 管理 Key
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-56">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKey()}
                placeholder={platformMeta?.keyPlaceholder || '粘贴 API Key'}
                className="w-full h-9 px-3 pr-10 rounded-lg border border-zinc-200 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? '隐藏 Key' : '显示 Key'}
                aria-label={showKey ? '隐藏 Key' : '显示 Key'}
              >
                {showKey ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </button>
            </div>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="备注名（可选）"
              className="w-40 h-9 px-3 rounded-lg border border-zinc-200 text-sm outline-none focus:border-indigo-400"
            />
            <Button variant="primary" loading={adding} disabled={!newKey.trim()} onClick={addKey}>
              验证并添加
            </Button>
          </div>
          {platformMeta?.note && (
            <div className="text-[11px] text-zinc-400 leading-relaxed">{platformMeta.note}</div>
          )}
          {platformMeta?.modelsPublic && (
            <div className="text-[11px] text-amber-600 leading-relaxed">
              该平台模型列表无需 Key 即可浏览；Key 仅在载入模型到 WorkBuddy 与实际对话时使用。点击「测试」会消耗一次极小的调用（1 token）。
            </div>
          )}
        </div>
      </Card>

      {/* WorkBuddy 数据目录（自动检测） */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <div className="font-medium text-zinc-900">WorkBuddy 数据目录</div>
          {settings?.detected && (
            <Badge color={settings.detected.source === 'override' ? 'blue' : 'gray'}>{settings.detected.sourceLabel}</Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="subtle" loading={detecting} onClick={() => redetect(false)}>
              <IconRefresh className="w-3.5 h-3.5" />
              重新检测
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowManual((v) => !v)}>
              <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? '' : '-rotate-90'}`} />
              手动指定
            </Button>
          </div>
        </div>
        <div className="text-xs text-zinc-400 mb-3">自动检测 WorkBuddy 的数据位置（模型配置与 会话日志），一般无需手动干预。</div>

        {!settings ? (
          <div className="py-6 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className={`rounded-lg border px-3.5 py-3 ${settings.detected.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-zinc-800 break-all">{settings.detected.dir}</span>
                <div className="ml-auto">
                  {settings.detected.valid ? <Badge color="green">已检测到</Badge> : <Badge color="amber">未检测到</Badge>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <MarkerBadge ok={settings.detected.markers.modelsJson} label="models.json" />
                <MarkerBadge ok={settings.detected.markers.projects} label="会话日志" />
                <MarkerBadge ok={settings.detected.markers.sessions} label="sessions" />
                <MarkerBadge ok={settings.detected.markers.db} label="workbuddy.db" />
                {wbRunning != null && (
                  <span title={wbDetectError ? `无法确认运行状态：${wbDetectError}` : undefined}>
                    <Badge color={wbRunning ? 'green' : wbDetectError ? 'amber' : 'gray'} dot>
                      WorkBuddy {wbRunning ? '运行中' : wbDetectError ? '状态未知' : '未运行'}
                    </Badge>
                  </span>
                )}
              </div>
              {!settings.detected.valid && (
                <div className="mt-2 text-xs text-amber-600">
                  未找到 WorkBuddy 数据特征文件。请先安装并运行一次 WorkBuddy，或展开「手动指定」填写数据目录。
                </div>
              )}
            </div>

            {showManual && (
              <div className="mt-3 rounded-lg border border-zinc-200 p-3">
                <div className="text-xs text-zinc-500 mb-2">手动指定数据目录（一般无需修改；留空保存即恢复自动检测）：</div>
                <div className="flex items-center gap-2">
                  <input
                    value={wbDir}
                    onChange={(e) => setWbDir(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveDir(wbDir)}
                    placeholder="例如 C:\Users\你\.workbuddy"
                    className="flex-1 h-9 px-3 rounded-lg border border-zinc-200 text-sm font-mono outline-none focus:border-indigo-400"
                  />
                  <Button variant="primary" loading={savingDir} onClick={() => saveDir(wbDir)}>
                    保存
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* 网络代理 */}
      <Card className="p-5">
        <div className="font-medium text-zinc-900 mb-1">网络代理</div>
        <div className="text-xs text-zinc-400 mb-3 leading-relaxed">
          OpenRouter 等海外平台在国内网络下可能无法直连。工具的出站请求默认不走系统代理，此处的代理地址用于访问这些平台；留空时自动探测环境变量（
          <span className="font-mono">HTTPS_PROXY</span>）与 Windows 系统代理，均未命中则直连。
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={proxyInput}
            onChange={(e) => setProxyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveProxy(proxyInput)}
            placeholder="例如 http://127.0.0.1:7890"
            className="flex-1 min-w-56 h-9 px-3 rounded-lg border border-zinc-200 text-sm font-mono outline-none focus:border-indigo-400"
          />
          <Button variant="primary" loading={savingProxy} onClick={() => saveProxy(proxyInput)}>
            保存
          </Button>
        </div>
        <div className="text-xs text-zinc-400 mt-2">
          当前出站状态：
          {settings ? (
            settings.effectiveProxy ? (
              <span className="text-emerald-600 font-mono">走代理 {settings.effectiveProxy}</span>
            ) : (
              <span className="text-amber-600">直连（未配置代理，需 VPN 的平台将无法访问）</span>
            )
          ) : (
            '…'
          )}
        </div>
      </Card>

      {/* 缓存 */}
      <Card className="p-5">
        <div className="font-medium text-zinc-900 mb-1">模型列表缓存</div>
        <div className="text-xs text-zinc-400 mb-3">
          {settings?.modelsCaches?.length
            ? '各平台模型列表缓存于本机（进入模型广场对应平台时自动刷新）：'
            : '暂无缓存，进入模型广场时会自动拉取'}
        </div>
        {!!settings?.modelsCaches?.length && (
          <div className="space-y-1 mb-4">
            {settings.modelsCaches.map((c) => (
              <div key={c.platform} className="text-xs text-zinc-500 flex flex-wrap gap-x-2">
                <span className="font-medium text-zinc-600">{c.platformName}</span>
                <span>{c.count} 个模型</span>
                <span>
                  {fmtRelative(c.fetchedAt)}（{new Date(c.fetchedAt).toLocaleString('zh-CN')}）
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-zinc-400 mb-3 break-all">缓存目录：{settings?.cacheDir}</div>
        <Button variant="subtle" onClick={clearCache} disabled={!settings?.modelsCaches?.length}>
          <IconTrash className="w-4 h-4" />
          清除全部缓存
        </Button>
      </Card>

      {/* 关于 */}
      <Card className="p-5 text-xs text-zinc-400 leading-relaxed space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="font-medium text-zinc-600 text-sm">关于 Free Token</div>
          <Badge color="gray">v0.1.0</Badge>
        </div>
        <div>
          多平台免费模型管理工具 · 目标应用：<span className="text-zinc-500">WorkBuddy</span>
        </div>
        <div>
          当前可用平台：OpenRouter、Agnes AI、硅基流动、魔搭；地区受限平台（Groq、Google AI Studio、NVIDIA、GitHub Models、OpenCode Zen）仅在模型广场展示，不可浏览与载入。
        </div>
        <div className="flex items-start gap-1.5">
          <IconShield className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-500" />
          <span>隐私：API Key 与统计数据均只保存在本机，不经过任何第三方服务器；界面访问仅限 127.0.0.1。</span>
        </div>
      </Card>
    </div>
  );
}
