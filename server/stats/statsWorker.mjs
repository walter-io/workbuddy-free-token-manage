import { parentPort } from 'node:worker_threads';
import { runStats } from './scan.mjs';

/**
 * 统计 worker 入口：在独立线程里跑重扫描，主进程事件循环零阻塞。
 * 消息串行处理（同一时刻只跑一个扫描任务），文件级缓存在本线程常驻，二次扫描近乎零开销。
 */

let chain = Promise.resolve();

parentPort.on('message', ({ id, opts }) => {
  chain = chain
    .then(async () => {
      const payload = await runStats(opts || {});
      parentPort.postMessage({ id, ok: true, payload });
    })
    .catch((err) => {
      parentPort.postMessage({ id, ok: false, error: err?.message || String(err) });
    });
});
