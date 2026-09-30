import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  loadConfig,
  saveConfig,
  newId,
  maskKey,
  CONFIG_FILE,
  cachePath,
  activeKeyFor,
} from './store/config.mjs';
import { providers, getProvider, listPlatforms, PLATFORM_ORDER } from './providers/registry.mjs';
import { clearModelsCache, modelsCacheFile } from './providers/genericOpenAI.mjs';
import {
  detectWorkbuddyDir,
  detectWorkbuddyProcess,
  listLoaded,
  loadModels,
  removeModels,
  restartWorkbuddy,
} from './targets/workbuddy.mjs';
import { getStats } from './stats/workbuddyStats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 57891);

const app = express();
app.use(express.json({ limit: '1mb' }));

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[api] ${req.method} ${req.path}:`, err?.message || err);
    res.status(500).json({ error: err?.message || '服务器内部错误' });
  });
};

const platformFromReq = (req) => {
  const id = String(req.query.platform || req.body?.platform || 'openrouter');
  return getProvider(id);
};

/* ---------------- 平台与模型 ---------------- */

app.get('/api/platforms', (req, res) => {
  const cfg = loadConfig();
  const platforms = listPlatforms().map((p) => ({
    ...p,
    keyCount: cfg.keys.filter((k) => k.platform === p.id).length,
    modelCount: providers[p.id].peek?.()?.count ?? null,
  }));
  res.json({ platforms });
});

app.get(
  '/api/models',
  wrap(async (req, res) => {
    const provider = platformFromReq(req);
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const key = activeKeyFor(loadConfig(), provider.id);
    const data = await provider.getModels({ refresh, apiKey: key?.key || undefined });
    res.json({ ...data, platform: provider.id, platformName: provider.name, note: provider.note });
  })
);

/* ---------------- 额度（按平台聚合，只查已配置 key 的平台） ---------------- */

app.get(
  '/api/quota',
  wrap(async (req, res) => {
    const cfg = loadConfig();
    const groups = [];
    for (const pid of PLATFORM_ORDER) {
      const provider = providers[pid];
      const keys = cfg.keys.filter((k) => k.platform === pid);
      if (!keys.length) continue;
      const list = await Promise.all(
        keys.map(async (k) => {
          const base = { keyId: k.id, platform: pid, label: k.label || maskKey(k.key), masked: maskKey(k.key) };
          // 无额度接口的平台不发起任何网络请求，仅展示本地保存的 key 状态
          if (!provider.fetchQuotaForKey) {
            const st = k.lastStatus;
            return { ...base, status: st === 'ok' || st === 'invalid' ? st : 'unknown', note: '该平台未提供额度查询接口' };
          }
          try {
            const q = await provider.fetchQuotaForKey(k.key);
            if (!q.ok) return { ...base, status: 'invalid', error: 'Key 无效或已撤销' };
            if (q.unavailable) return { ...base, status: 'ok', unavailable: q.unavailable };
            if (provider.quotaKind === 'balance') {
              return { ...base, status: 'ok', balance: q.balance || null };
            }
            const { key: info, credits } = q;
            return {
              ...base,
              status: 'ok',
              freeModelDailyRequests: info.free_model_daily_requests || null,
              usage: info.usage ?? null,
              usageDaily: info.usage_daily ?? null,
              usageWeekly: info.usage_weekly ?? null,
              usageMonthly: info.usage_monthly ?? null,
              limit: info.limit ?? null,
              limitRemaining: info.limit_remaining ?? null,
              isFreeTier: !!info.is_free_tier,
              expiresAt: info.expires_at || null,
              credits: credits ? { total: credits.total_credits ?? null, used: credits.total_usage ?? null } : null,
            };
          } catch (err) {
            return { ...base, status: 'error', error: err?.message || '查询失败' };
          }
        })
      );
      groups.push({ platform: pid, platformName: provider.name, quotaKind: provider.quotaKind, note: provider.note, keys: list });
    }
    res.json({ fetchedAt: Date.now(), activeKeys: cfg.activeKeys || {}, platforms: groups });
  })
);

/* ---------------- Keys 管理（按平台） ---------------- */

app.get('/api/keys', (req, res) => {
  const cfg = loadConfig();
  res.json({
    activeKeys: cfg.activeKeys || {},
    activeKeyId: cfg.activeKeyId,
    keys: cfg.keys.map((k) => ({
      id: k.id,
      platform: k.platform,
      label: k.label || maskKey(k.key),
      masked: maskKey(k.key),
      addedAt: k.addedAt,
      lastStatus: k.lastStatus || null,
    })),
    configFile: CONFIG_FILE,
  });
});

app.post(
  '/api/keys',
  wrap(async (req, res) => {
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    const provider = getProvider(String(req.body?.platform || 'openrouter'));
    if (provider.keyFormat && !provider.keyFormat.test(key)) {
      return res.status(400).json({ error: `Key 格式不符合 ${provider.name} 的要求，请检查是否复制完整` });
    }
    const cfg = loadConfig();
    if (cfg.keys.some((k) => k.platform === provider.id && k.key === key)) {
      return res.status(400).json({ error: '这个 Key 已经添加过了' });
    }
    // 先验真伪再入库
    const t = await provider.testKey(key);
    if (!t.ok) {
      const why = t.invalid ? '平台返回未授权（401），请检查是否复制完整' : t.error || '校验失败';
      return res.status(400).json({ error: `Key 无效：${why}` });
    }
    const item = {
      id: newId('key'),
      platform: provider.id,
      key,
      label: label || t.label || `${provider.name} ${maskKey(key)}`,
      addedAt: Date.now(),
      lastStatus: 'ok',
    };
    cfg.keys.push(item);
    cfg.activeKeys = { ...(cfg.activeKeys || {}) };
    if (!cfg.activeKeys[provider.id]) cfg.activeKeys[provider.id] = item.id;
    if (provider.id === 'openrouter') cfg.activeKeyId = item.id;
    saveConfig(cfg);
    res.json({ id: item.id, platform: provider.id, label: item.label, masked: maskKey(key), isFreeTier: t.isFreeTier });
  })
);

app.delete('/api/keys/:id', (req, res) => {
  const cfg = loadConfig();
  const target = cfg.keys.find((k) => k.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Key 不存在' });
  cfg.keys = cfg.keys.filter((k) => k.id !== req.params.id);
  if ((cfg.activeKeys || {})[target.platform] === req.params.id) {
    cfg.activeKeys[target.platform] = cfg.keys.find((k) => k.platform === target.platform)?.id || null;
  }
  if (cfg.activeKeyId === req.params.id) cfg.activeKeyId = cfg.keys.find((k) => k.platform === 'openrouter')?.id || null;
  saveConfig(cfg);
  res.json({ ok: true });
});

app.post('/api/keys/:id/activate', (req, res) => {
  const cfg = loadConfig();
  const target = cfg.keys.find((k) => k.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Key 不存在' });
  cfg.activeKeys = { ...(cfg.activeKeys || {}), [target.platform]: target.id };
  if (target.platform === 'openrouter') cfg.activeKeyId = target.id;
  saveConfig(cfg);
  res.json({ ok: true });
});

app.post(
  '/api/keys/:id/test',
  wrap(async (req, res) => {
    const cfg = loadConfig();
    const k = cfg.keys.find((x) => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: 'Key 不存在' });
    try {
      const t = await getProvider(k.platform).testKey(k.key);
      k.lastStatus = t.ok ? 'ok' : 'invalid';
      saveConfig(cfg);
      res.json(t.ok ? { ok: true, isFreeTier: t.isFreeTier } : { ok: false, error: t.error || 'Key 无效' });
    } catch (err) {
      res.status(502).json({ ok: false, error: err?.message || '测试失败' });
    }
  })
);

/* ---------------- WorkBuddy ---------------- */

app.get(
  '/api/workbuddy/status',
  wrap(async (req, res) => {
    const loaded = listLoaded();
    const proc = await detectWorkbuddyProcess();
    res.json({ ...loaded, running: proc.running, exePath: proc.exePath || null });
  })
);

app.get('/api/workbuddy/loaded', (req, res) => {
  res.json(listLoaded());
});

app.post(
  '/api/workbuddy/load',
  wrap(async (req, res) => {
    const modelIds = Array.isArray(req.body?.modelIds) ? req.body.modelIds.filter(Boolean) : [];
    const provider = platformFromReq(req);
    if (!modelIds.length) return res.status(400).json({ error: '请先选择要载入的模型' });

    const cfg = loadConfig();
    const keyId = req.body?.keyId || null;
    const target =
      cfg.keys.find((k) => k.platform === provider.id && k.id === keyId) || activeKeyFor(cfg, provider.id);
    if (!target) {
      return res.status(400).json({ error: `尚未配置 ${provider.name} API Key，请先到「设置」添加` });
    }

    const cached = provider.peek?.();
    if (!cached?.models?.length) {
      return res.status(409).json({ error: `${provider.name} 模型列表尚未加载，请先在模型页查看一次该平台` });
    }
    const index = new Map(cached.models.map((m) => [m.id, m]));

    const entries = [];
    const skipped = [];
    for (const id of modelIds) {
      const m = index.get(id);
      if (!m) {
        skipped.push({ id, reason: '模型列表中未找到' });
        continue;
      }
      if (m.outputKind !== 'text') {
        skipped.push({ id, reason: '图像/视频生成模型暂不支持载入 WorkBuddy' });
        continue;
      }
      if (m.loadable === false) {
        skipped.push({ id, reason: '该模型协议不兼容，不支持载入 WorkBuddy' });
        continue;
      }
      entries.push(provider.buildEntry(m, target.key));
    }
    if (!entries.length) {
      return res.status(400).json({ error: '没有可载入的模型', skipped });
    }
    const result = loadModels(entries);
    res.json({ ...result, keyUsed: maskKey(target.key), skipped });
  })
);

app.post('/api/workbuddy/remove', (req, res) => {
  const ids = Array.isArray(req.body?.modelIds) ? req.body.modelIds.filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: '请选择要移除的模型' });
  res.json(removeModels(ids));
});

app.post(
  '/api/workbuddy/restart',
  wrap(async (req, res) => {
    res.json(await restartWorkbuddy());
  })
);

/* ---------------- Token 统计 ---------------- */

app.get('/api/stats', (req, res) => {
  const range = ['today', '7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '30d';
  res.json(
    getStats({
      range,
      model: String(req.query.model || ''),
      freeOnly: req.query.freeOnly === '1',
      force: req.query.force === '1', // 手动刷新时绕过结果缓存强制重扫
    })
  );
});

/* ---------------- 设置 ---------------- */

function readCacheInfos() {
  return listPlatforms()
    .map((p) => {
      try {
        const raw = JSON.parse(fs.readFileSync(modelsCacheFile(p.id), 'utf8'));
        if (Array.isArray(raw?.models) && raw.models.length) {
          return { platform: p.id, platformName: p.name, fetchedAt: raw.fetchedAt, count: raw.count };
        }
      } catch {
        /* 无缓存 */
      }
      return null;
    })
    .filter(Boolean);
}

app.get('/api/settings', (req, res) => {
  const cfg = loadConfig();
  res.json({
    workbuddyDir: cfg.settings.workbuddyDir || '',
    detected: detectWorkbuddyDir(),
    cacheDir: cachePath(''),
    modelsCaches: readCacheInfos(),
  });
});

app.put('/api/settings', (req, res) => {
  const cfg = loadConfig();
  if (typeof req.body?.workbuddyDir === 'string') {
    cfg.settings.workbuddyDir = req.body.workbuddyDir.trim();
  }
  saveConfig(cfg);
  res.json({ ok: true, workbuddyDir: cfg.settings.workbuddyDir, detected: detectWorkbuddyDir() });
});

// 重新自动检测 WorkBuddy 数据目录（并附带运行状态）
app.get(
  '/api/workbuddy/detect',
  wrap(async (req, res) => {
    const detected = detectWorkbuddyDir();
    const proc = await detectWorkbuddyProcess();
    res.json({ detected, running: proc.running, exePath: proc.exePath || null });
  })
);

app.post('/api/cache/clear', (req, res) => {
  clearModelsCache(String(req.body?.platform || '')); // 空字符串 = 清全部平台
  res.json({ ok: true });
});

/* ---------------- 静态资源 + SPA ---------------- */

app.use(express.static(DIST));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`free-token 已启动: ${url}`);
  if (process.env.NO_OPEN !== '1') {
    const cmd =
      process.platform === 'win32'
        ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
        : process.platform === 'darwin'
          ? spawn('open', [url], { detached: true, stdio: 'ignore' })
          : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    cmd.unref();
  }
});
