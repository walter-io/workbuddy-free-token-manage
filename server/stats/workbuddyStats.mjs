import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

export { isFreeModelName } from './scan.mjs';

/**
 * 统计调度层（主线程）：把重扫描派给常驻 worker 线程，保证 Express / Electron 主进程永不阻塞。
 * 相同筛选参数 30 秒内直接复用结果（定时刷新近乎零开销），force=1 强制重扫；
 * 并发去重：同参数请求共享同一在途 Promise。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let worker = null;
let msgSeq = 0;
const pending = new Map(); // msgId -> { resolve, reject }

function killWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* 忽略 */
    }
    worker = null;
  }
}

function failAllPending(err) {
  for (const [, p] of pending) p.reject(err);
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(path.join(__dirname, 'statsWorker.mjs'));
  worker.on('message', ({ id, ok, payload, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(payload);
    else p.reject(new Error(error || '统计扫描失败'));
  });
  worker.on('error', (err) => {
    failAllPending(err);
    worker = null;
  });
  worker.on('exit', (code) => {
    if (code !== 0 && pending.size) failAllPending(new Error(`统计线程异常退出（代码 ${code}）`));
    worker = null;
  });
  return worker;
}

function runInWorker(opts) {
  const id = ++msgSeq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, opts });
    } catch (err) {
      pending.delete(id);
      killWorker();
      reject(err);
    }
  });
}

/** 结果级缓存：同一筛选参数 30 秒内直接复用（定时刷新近乎零开销），force=1 强制重扫 */
const RESULT_TTL = 30_000;
const resultCache = new Map();
const inflightByKey = new Map();

export function getStats(opts = {}) {
  const key = JSON.stringify({ range: opts.range, model: opts.model, freeOnly: opts.freeOnly });
  if (!opts.force) {
    const hit = resultCache.get(key);
    if (hit && Date.now() - hit.at < RESULT_TTL) return Promise.resolve(hit.payload);
  }
  if (inflightByKey.has(key)) return inflightByKey.get(key);
  const p = runInWorker({ range: opts.range, model: opts.model, freeOnly: opts.freeOnly })
    .then((payload) => {
      if (resultCache.size > 50) resultCache.clear();
      resultCache.set(key, { at: Date.now(), payload });
      return payload;
    })
    .finally(() => inflightByKey.delete(key));
  inflightByKey.set(key, p);
  return p;
}
