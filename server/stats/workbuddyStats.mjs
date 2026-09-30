import fs from 'node:fs';
import path from 'node:path';
import { workbuddyDir } from '../targets/workbuddy.mjs';

/**
 * WorkBuddy Token 统计：扫描 ~/.workbuddy/projects 下所有 .jsonl 会话日志（递归，跳过 subagents）。
 * 每行一个 JSON 事件，用量取值优先级 providerData.usage > providerData.rawUsage > message.usage，
 * 字段别名兼容 camel/snake（与 workbuddy-switch 的 token_stats 同源）。
 */

// 进程内文件级缓存：路径 -> { mtimeMs, size, records, meta }
const fileCache = new Map();

function walkJsonl(dir, out = []) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name === 'subagents') continue;
      walkJsonl(p, out);
    } else if (it.isFile() && it.name.endsWith('.jsonl')) {
      out.push(p);
    }
  }
  return out;
}

function pickPositive(...vals) {
  for (const v of vals) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function usageFromLine(line) {
  const pd = line.providerData ?? {};
  const u = pd.usage ?? {};
  const ru = pd.rawUsage ?? {};
  const mu = line.message?.usage ?? {};
  const input = pickPositive(u.inputTokens, ru.prompt_tokens, mu.input_tokens, mu.prompt_tokens, ru.input_tokens);
  const output = pickPositive(u.outputTokens, ru.completion_tokens, mu.output_tokens, mu.completion_tokens);
  const cacheRead = pickPositive(
    ru.cache_read_input_tokens,
    ru.prompt_cache_hit_tokens,
    ru.prompt_tokens_details?.cached_tokens,
    ru.cached_tokens
  );
  const cacheWrite = pickPositive(
    ru.cache_write_input_tokens,
    ru.cache_creation_input_tokens,
    ru.prompt_cache_write_tokens
  );
  const requests = Number.isFinite(u.requests) && u.requests > 0 ? u.requests : 0;
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0 && requests === 0) return null;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    requests: requests || 1, // 有 token 而无 requests 计数时按 1 次请求计
    model: pd.model || pd.requestModelId || 'unknown',
  };
}

function parseFile(file) {
  const records = [];
  const meta = { sessionId: null, title: '', project: '' };
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return { records, meta };
  }
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line || line.length > 4_000_000) continue; // 超长行跳过，防坏档
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    if (!meta.sessionId && obj.sessionId) meta.sessionId = obj.sessionId;
    if (!meta.title) {
      const t = obj.aiTitle || obj.summary || obj.title;
      if (typeof t === 'string' && t.trim()) meta.title = t.trim().slice(0, 200);
    }
    if (!meta.project && typeof obj.cwd === 'string' && obj.cwd) {
      meta.project = obj.cwd.split(/[\\/]/).filter(Boolean).pop() || obj.cwd;
    }
    const u = usageFromLine(obj);
    if (u) {
      const ts = Number(obj.timestamp ?? obj.ts) || null;
      records.push({ ts, sid: obj.sessionId || meta.sessionId || path.basename(file, '.jsonl'), ...u });
    }
  }
  if (!meta.sessionId) meta.sessionId = path.basename(file, '.jsonl');
  // 项目名兜底：projects/<dirname>/
  if (!meta.project) {
    const dir = path.basename(path.dirname(file));
    meta.project = dir === 'projects' ? '未命名' : dir;
  }
  return { records, meta };
}

function localDate(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function isFreeModelName(model) {
  const m = String(model || '');
  return m.endsWith(':free') || /(^|\/)free$/i.test(m);
}

function cutoffFor(range, now) {
  const DAY = 24 * 3600 * 1000;
  switch (range) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '7d':
      return now - 7 * DAY;
    case '30d':
      return now - 30 * DAY;
    default:
      return null; // all
  }
}

function emptyBucket() {
  return { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function addUsage(bucket, r) {
  bucket.requests += r.requests;
  bucket.input += r.input;
  bucket.output += r.output;
  bucket.cacheRead += r.cacheRead;
  bucket.cacheWrite += r.cacheWrite;
  bucket.total += r.input + r.output + r.cacheRead + r.cacheWrite;
}

/**
 * 聚合统计。model 传子串过滤（不区分大小写），freeOnly=true 时只看 OpenRouter 免费模型。
 * 扫描分片让出事件循环（避免阻塞其他请求）；相同参数并发请求共享同一结果；
 * 不同参数的扫描串行排队，扫描结果按文件 mtime 缓存，二次调用近乎零开销。
 */
const scanQueue = [];
let scanning = false;

function enqueueScan(task) {
  return new Promise((resolve, reject) => {
    scanQueue.push({ task, resolve, reject });
    if (!scanning) drainScanQueue();
  });
}

async function drainScanQueue() {
  scanning = true;
  while (scanQueue.length) {
    const { task, resolve, reject } = scanQueue.shift();
    try {
      resolve(await task());
    } catch (err) {
      reject(err);
    }
  }
  scanning = false;
}

const inflightByKey = new Map();

/** 结果级缓存：同一筛选参数 30 秒内直接复用（定时刷新近乎零开销），force=1 强制重扫 */
const RESULT_TTL = 30_000;
const resultCache = new Map();

export function getStats(opts = {}) {
  const key = JSON.stringify({ range: opts.range, model: opts.model, freeOnly: opts.freeOnly });
  if (!opts.force) {
    const hit = resultCache.get(key);
    if (hit && Date.now() - hit.at < RESULT_TTL) return Promise.resolve(hit.payload);
  }
  if (inflightByKey.has(key)) return inflightByKey.get(key);
  const p = enqueueScan(() => runStats(opts))
    .then((payload) => {
      if (resultCache.size > 50) resultCache.clear();
      resultCache.set(key, { at: Date.now(), payload });
      return payload;
    })
    .finally(() => inflightByKey.delete(key));
  inflightByKey.set(key, p);
  return p;
}

const YIELD_EVERY = 40; // 每处理 N 个文件让出一次事件循环
const yieldToLoop = () => new Promise((r) => setImmediate(r));

async function runStats({ range = '30d', model = '', freeOnly = false } = {}) {
  const dir = workbuddyDir();
  const projectsDir = path.join(dir, 'projects');
  const now = Date.now();
  const cutoff = cutoffFor(range, now);
  const modelFilter = String(model || '').trim().toLowerCase();

  const summary = emptyBucket();
  const byModel = new Map();
  const byProject = new Map();
  const sessions = new Map(); // sid -> bucket + meta
  const daily = new Map(); // date -> bucket + byModel
  const hours = new Map(); // '周一-9' -> requests
  let filesScanned = 0;
  let parseErrors = 0;
  let coverageStartAt = null;
  let coverageEndAt = null;

  const files = walkJsonl(projectsDir);
  for (const file of files) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    filesScanned++;
    let entry = fileCache.get(file);
    if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
      try {
        entry = { mtimeMs: st.mtimeMs, size: st.size, ...parseFile(file) };
      } catch {
        parseErrors++;
        continue;
      }
      fileCache.set(file, entry);
    }
    const { records, meta } = entry;

    for (const r of records) {
      if (cutoff != null && (r.ts == null || r.ts < cutoff || r.ts > now)) continue;
      const modelLower = String(r.model).toLowerCase();
      if (modelFilter && !modelLower.includes(modelFilter)) continue;
      if (freeOnly && !isFreeModelName(r.model)) continue;

      addUsage(summary, r);
      if (r.ts) {
        if (coverageStartAt == null || r.ts < coverageStartAt) coverageStartAt = r.ts;
        if (coverageEndAt == null || r.ts > coverageEndAt) coverageEndAt = r.ts;
      }

      const mb = byModel.get(r.model) || emptyBucket();
      addUsage(mb, r);
      byModel.set(r.model, mb);

      const pb = byProject.get(meta.project) || emptyBucket();
      addUsage(pb, r);
      byProject.set(meta.project, pb);

      const sb = sessions.get(r.sid) || { ...emptyBucket(), meta, models: new Map(), lastActive: 0 };
      addUsage(sb, r);
      sb.models.set(r.model, (sb.models.get(r.model) || 0) + (r.input + r.output + r.cacheRead + r.cacheWrite));
      if (r.ts && r.ts > sb.lastActive) sb.lastActive = r.ts;
      sessions.set(r.sid, sb);

      if (r.ts) {
        const date = localDate(r.ts);
        const db = daily.get(date) || { ...emptyBucket(), byModel: new Map() };
        addUsage(db, r);
        db.byModel.set(r.model, (db.byModel.get(r.model) || 0) + (r.input + r.output + r.cacheRead + r.cacheWrite));
        daily.set(date, db);

        const d = new Date(r.ts);
        const hk = `${WEEKDAYS[d.getDay()]}-${d.getHours()}`;
        hours.set(hk, (hours.get(hk) || 0) + r.requests);
      }
    }
  }

  const sortBuckets = (m) =>
    [...m.entries()]
      .map(([name, b]) => ({ name, ...b }))
      .sort((a, b) => b.total - a.total);

  const models = sortBuckets(byModel);
  const projects = sortBuckets(byProject);
  const sessionList = [...sessions.entries()]
    .map(([sid, s]) => ({
      sessionId: sid,
      title: s.meta?.title || '',
      project: s.meta?.project || '',
      requests: s.requests,
      input: s.input,
      output: s.output,
      total: s.total,
      lastActive: s.lastActive || null,
      topModels: [...s.models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, t]) => ({ model: m, tokens: t })),
    }))
    .sort((a, b) => b.total - a.total);
  const dailyList = [...daily.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, b]) => ({
      date,
      requests: b.requests,
      total: b.total,
      byModel: Object.fromEntries([...b.byModel.entries()].sort((x, y) => y[1] - x[1])),
    }));

  return {
    range,
    modelFilter: model || null,
    freeOnly: !!freeOnly,
    generatedAt: now,
    dir,
    filesScanned,
    parseErrors,
    coverageStartAt,
    coverageEndAt,
    summary,
    models,
    projects,
    sessions: sessionList,
    daily: dailyList,
    hours: Object.fromEntries([...hours.entries()].sort((a, b) => b[1] - a[1])),
  };
}
