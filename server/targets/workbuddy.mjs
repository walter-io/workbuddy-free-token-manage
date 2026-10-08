import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { loadConfig } from '../store/config.mjs';
import { matchPlatformUrl } from '../providers/registry.mjs';

/** 检查目录是否具备 WorkBuddy 数据目录的特征文件 */
function inspectDir(dir) {
  const has = (p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };
  const markers = {
    modelsJson: has(path.join(dir, 'models.json')),
    projects: has(path.join(dir, 'projects')),
    sessions: has(path.join(dir, 'sessions')),
    db: has(path.join(dir, 'workbuddy.db')),
  };
  const score = Object.values(markers).filter(Boolean).length;
  return { ...markers, score, exists: score > 0 };
}

/**
 * 自动检测 WorkBuddy 数据目录：
 * 1. 用户手动指定的目录（settings.workbuddyDir，优先但需通过特征校验才标记 valid）
 * 2. 默认位置 ~/.workbuddy（WorkBuddy 桌面端约定位置）
 * 3. 常见安装位置的候选目录，按特征文件（models.json/projects/sessions/workbuddy.db）命中判定
 */
export function detectWorkbuddyDir() {
  const cfg = loadConfig();
  const override = String(cfg.settings?.workbuddyDir || '').trim();
  const home = os.homedir();

  const candidates = [];
  if (override) candidates.push({ dir: path.resolve(override), source: 'override', sourceLabel: '手动指定' });
  candidates.push({ dir: path.join(home, '.workbuddy'), source: 'default', sourceLabel: '默认位置' });
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) candidates.push({ dir: path.join(process.env.LOCALAPPDATA, 'WorkBuddy'), source: 'scan', sourceLabel: '自动检测' });
    if (process.env.APPDATA) candidates.push({ dir: path.join(process.env.APPDATA, 'WorkBuddy'), source: 'scan', sourceLabel: '自动检测' });
  } else {
    candidates.push({ dir: path.join(home, 'Library', 'Application Support', 'WorkBuddy'), source: 'scan', sourceLabel: '自动检测' });
    candidates.push({ dir: path.join(home, '.config', 'WorkBuddy'), source: 'scan', sourceLabel: '自动检测' });
  }

  for (const c of candidates) {
    const markers = inspectDir(c.dir);
    if (markers.score > 0) return { ...c, markers, valid: true };
  }
  // 全部未命中：返回最高优先级候选并标记未检测到（手动指定优先，其次默认位置）
  const fallback = candidates[0] || { dir: path.join(home, '.workbuddy'), source: 'default', sourceLabel: '默认位置' };
  return { ...fallback, markers: inspectDir(fallback.dir), valid: false };
}

export function workbuddyDir() {
  return detectWorkbuddyDir().dir;
}

export function modelsJsonPath() {
  return path.join(workbuddyDir(), 'models.json');
}

export function readModelsJson() {
  const p = modelsJsonPath();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(raw)) return { entries: raw, exists: true };
    return { entries: [], exists: true, invalid: true };
  } catch (err) {
    if (err?.code === 'ENOENT') return { entries: [], exists: false };
    // 语法级损坏同样标记 invalid，让调用方优雅降级（载入拒绝 / 移除拒绝 / 列表提示），而非抛异常
    return { entries: [], exists: true, invalid: true, parseError: err?.message };
  }
}

/** 仅认定指向已注册平台端点的自定义条目属于本工具的管理范围（用户手动加的其他条目永不触碰） */
export function isManagedEntry(e) {
  return !!matchPlatformUrl(e?.url);
}

const BACKUP_KEEP = 10;

function backupModelsJson() {
  const p = modelsJsonPath();
  if (!fs.existsSync(p)) return null;
  // 文件名保留毫秒且查重递增：同一秒内连续两次写入也不得互相覆盖（真实踩过的坑）
  const base = new Date().toISOString().replace(/[:.]/g, '-');
  let bak = `${p}.bak-${base}`;
  for (let i = 1; fs.existsSync(bak); i++) bak = `${p}.bak-${base}-${i}`;
  fs.copyFileSync(p, bak);
  // 备份保留策略：只留最近 N 份，避免无限累积
  try {
    const dir = path.dirname(p);
    const olds = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${path.basename(p)}.bak-`))
      .sort()
      .slice(0, -BACKUP_KEEP);
    for (const f of olds) fs.unlinkSync(path.join(dir, f));
  } catch {
    /* 清理失败不影响主流程 */
  }
  return bak;
}

function atomicWriteJson(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function verifyEntries(ids, apiKey) {
  const check = JSON.parse(fs.readFileSync(modelsJsonPath(), 'utf8'));
  if (!Array.isArray(check)) throw new Error('回读校验失败：models.json 不是数组');
  for (const id of ids) {
    const e = check.find((x) => x && x.id === id);
    if (!e) throw new Error(`回读校验失败：缺少 ${id}`);
    if (apiKey && e.apiKey !== apiKey) throw new Error(`回读校验失败：${id} 的 apiKey 不一致`);
  }
}

/**
 * 批量载入模型到 WorkBuddy：备份 -> 按 id 合并（已存在则更新）-> 原子写 -> 回读校验 -> 失败回滚
 */
export function loadModels(entries) {
  if (!entries?.length) throw new Error('没有可载入的模型');
  if (!fs.existsSync(workbuddyDir())) {
    throw new Error(`WorkBuddy 数据目录不存在：${workbuddyDir()}（请先安装并运行一次 WorkBuddy）`);
  }
  const { entries: current, invalid } = readModelsJson();
  if (invalid) throw new Error('models.json 格式异常（不是数组），请先在 WorkBuddy 中检查自定义模型配置');

  const backup = backupModelsJson();
  const byId = new Map(current.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const m of entries) {
    const existing = byId.get(m.id);
    if (existing) {
      Object.assign(existing, m);
      updated++;
    } else {
      current.push(m);
      byId.set(m.id, m);
      added++;
    }
  }
  try {
    atomicWriteJson(modelsJsonPath(), current);
    verifyEntries(entries.map((e) => e.id), entries[0]?.apiKey);
    return { added, updated, backup, total: current.length };
  } catch (err) {
    if (backup && fs.existsSync(backup)) fs.copyFileSync(backup, modelsJsonPath());
    throw err;
  }
}

/** 从 models.json 移除本工具载入的条目（任何平台的；用户手动加的其他条目永不触碰） */
export function removeModels(ids) {
  const { entries, invalid } = readModelsJson();
  if (invalid) return { invalid: true, removed: 0 };
  const idSet = new Set(ids);
  const kept = entries.filter((e) => !(idSet.has(e?.id) && isManagedEntry(e)));
  const removed = entries.length - kept.length;
  const backup = backupModelsJson();
  try {
    atomicWriteJson(modelsJsonPath(), kept);
    return { removed, backup, total: kept.length };
  } catch (err) {
    if (backup && fs.existsSync(backup)) fs.copyFileSync(backup, modelsJsonPath());
    throw err;
  }
}

/** models.json 最后修改时间（null = 文件不存在） */
export function modelsJsonMtime() {
  try {
    return fs.statSync(modelsJsonPath()).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * 检测"模型配置已变更但 WorkBuddy 尚未读取"：
 * WorkBuddy 只在启动时读取 models.json，若文件修改时间晚于其进程启动时间（留 3 秒容差），
 * 则运行中的 WorkBuddy 需要重启才能让新增/移除的模型生效。
 */
export function isPendingRestart(proc) {
  const mtime = modelsJsonMtime();
  if (!proc?.running || !proc?.startTime || mtime == null) return false;
  return mtime > proc.startTime + 3000;
}

/** 已载入的本工具条目（key 脱敏，标注来源平台） */
export function listLoaded() {
  const { entries, exists, invalid } = readModelsJson();
  const loaded = entries.filter(isManagedEntry).map((e) => ({
    id: e.id,
    name: e.name || e.id,
    platform: matchPlatformUrl(e.url) || 'unknown',
    keyTail: typeof e.apiKey === 'string' ? e.apiKey.slice(-4) : '',
    supportsToolCall: !!e.supportsToolCall,
    supportsImages: !!e.supportsImages,
    supportsReasoning: !!e.supportsReasoning,
  }));
  return { exists, invalid, dir: workbuddyDir(), modelsJsonPath: modelsJsonPath(), loaded };
}

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }));
      resolve(stdout);
    });
  });
}

/** 把 execFile 的报错压成一句可读原因（原始 message 会带上整条命令行，不适合展示） */
function shortExecError(err) {
  const code = err?.code;
  if (code && typeof code === 'string') return code; // EPERM / EACCES / ENOENT ...
  const first = String(err?.stderr || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  return first ? first.slice(0, 120) : '命令执行失败或不被允许';
}

/** 解析 PowerShell 序列化的启动时间：PS 5.1 为 "/Date(ms)/"，PS 7 为 ISO 字符串 */
function parseStartTime(v) {
  if (!v) return null;
  const m = String(v).match(/Date\((\d+)/);
  if (m) return Number(m[1]);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/** Windows 主路径：PowerShell 能拿到可执行文件路径与启动时间 */
async function detectViaPowerShell() {
  // 不再用 Sort-Object StartTime：个别进程取不到 StartTime 时会让整条管道报错，
  // 改为取回全部进程后在 JS 里排序。
  const ps =
    `Get-Process -Name WorkBuddy,CodeBuddy -ErrorAction SilentlyContinue | ` +
    `Select-Object Id,ProcessName,Path,StartTime | ConvertTo-Json -Compress`;
  const stdout = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 15000);
  const t = stdout.trim();
  if (!t) return null;
  const parsed = JSON.parse(t);
  const arr = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  if (!arr.length) return null;
  // WorkBuddy 基于 Electron，会有多个进程（主进程 + 渲染/GPU/工具子进程）。
  // 取启动最早的那个 = 应用真正启动的时刻，用于判断 models.json 是否在其启动后被改写。
  const rows = arr.map((o) => ({ ...o, _t: parseStartTime(o.StartTime) }));
  rows.sort((a, b) => (a._t || Number.MAX_SAFE_INTEGER) - (b._t || Number.MAX_SAFE_INTEGER));
  const main = rows[0];
  return {
    running: true,
    pid: main.Id,
    name: main.ProcessName,
    exePath: main.Path || null,
    startTime: main._t,
    processCount: arr.length,
    platform: 'win32',
    method: 'powershell',
  };
}

/** Windows 兜底：tasklist 不依赖 PowerShell，被安全策略限制的环境下通常仍可用 */
async function detectViaTasklist() {
  for (const exe of ['WorkBuddy.exe', 'CodeBuddy.exe']) {
    let stdout = '';
    try {
      stdout = await run('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/FO', 'CSV', '/NH'], 10000);
    } catch {
      continue;
    }
    const line = stdout
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.toLowerCase().includes(exe.toLowerCase()));
    if (!line) continue;
    const cols = line.split('","').map((s) => s.replace(/^"|"$/g, ''));
    const pid = Number(cols[1]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    return {
      running: true,
      pid,
      name: exe.replace(/\.exe$/i, ''),
      exePath: null,
      startTime: null, // tasklist 不提供启动时间，因此无法判断配置是否"待重启"
      platform: 'win32',
      method: 'tasklist',
      startTimeUnknown: true,
    };
  }
  return null;
}

export async function detectWorkbuddyProcess() {
  const platform = process.platform;

  if (platform === 'win32') {
    const errors = [];
    try {
      const r = await detectViaPowerShell();
      if (r) return r;
    } catch (err) {
      errors.push(`PowerShell 不可用（${shortExecError(err)}）`);
    }
    try {
      const r = await detectViaTasklist();
      if (r) return { ...r, warning: errors.length ? errors.join('；') : null };
    } catch (err) {
      errors.push(`tasklist 不可用（${shortExecError(err)}）`);
    }
    // 两条路径都没发现进程。若其中任一方式本身报错，说明是"检测失败"而不是"确实未运行"，
    // 必须把 error 透出给界面，否则会出现 WorkBuddy 明明开着却显示"未运行"的误导。
    return { running: false, platform, error: errors.length ? errors.join('; ') : null };
  }

  // macOS / Linux 粗略探测（同 workbuddy-switch 的进程命名习惯）
  try {
    const stdout = await run('pgrep', ['-if', 'workbuddy|codebuddy'], 8000);
    const pid = parseInt(String(stdout).split('\n')[0], 10);
    if (Number.isFinite(pid) && pid > 0) return { running: true, pid, exePath: null, platform, method: 'pgrep' };
    return { running: false, platform, method: 'pgrep' };
  } catch (err) {
    return { running: false, error: err.message, platform };
  }
}

/** 定位 WorkBuddy 可执行文件：优先检测到的真实路径，再按常见安装位置兜底 */
function findWorkbuddyExe(detectedPath) {
  const candidates = [
    detectedPath,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'WorkBuddy', 'WorkBuddy.exe'),
    'C:\\Program Files\\WorkBuddy\\WorkBuddy.exe',
    'C:\\Program Files (x86)\\WorkBuddy\\WorkBuddy.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'WorkBuddy', 'WorkBuddy.exe'),
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

export async function restartWorkbuddy() {
  const proc = await detectWorkbuddyProcess();
  if (!proc.running) throw new Error('未检测到运行中的 WorkBuddy 进程，无需重启（下次启动自动生效）');
  if (process.platform === 'win32') {
    if (!proc.pid) throw new Error('未获取到进程 ID，无法重启');
    await run('taskkill', ['/PID', String(proc.pid), '/T', '/F'], 10000);
    await new Promise((r) => setTimeout(r, 1500));
    const exe = findWorkbuddyExe(proc.exePath);
    if (!exe) {
      throw new Error(
        '未能定位 WorkBuddy 可执行文件，请手动重新打开 WorkBuddy。' +
          (proc.exePath ? `（检测到的路径：${proc.exePath}）` : '')
      );
    }
    const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
    child.unref();
    return { restarted: true, exePath: exe };
  }
  throw new Error(`当前平台（${process.platform}）暂不支持自动重启，请手动重启 WorkBuddy`);
}
