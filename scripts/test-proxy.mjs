/**
 * 验证 proxyFetch 的代理路由与优先级（本地 mock 代理 + 本地目标，不依赖外网）。
 * 注意：
 * - systemProxy:false 跳过 Windows 系统代理探测（沙箱内 reg.exe 被安全策略拦截会杀进程）。
 * - 直连场景放在最后：部分沙箱（透明代理模式）会拦截直连出站并 SIGTERM，不影响前面的断言。
 * 运行：node scripts/test-proxy.mjs
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const out = (s) => fs.writeSync(1, s + '\n'); // 无缓冲输出，SIGTERM 也不丢
let pass = 0;
let total = 0;
const ok = (cond, msg) => {
  total++;
  out(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond) pass++;
};

// 清空外部注入的代理环境变量（沙箱/CI 可能自带 HTTPS_PROXY，避免污染断言）
for (const k of Object.keys(process.env)) {
  if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(k)) delete process.env[k];
}

// 场景用：手动配置代理（隔离配置目录 + settings.proxyUrl）
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-cfg-'));
process.env.FREE_TOKEN_CONFIG_DIR = cfgDir;
fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ version: 1, keys: [], settings: {} }));

const { getProxyUrl, proxyFetch } = await import('../server/proxy.mjs');

// 目标服务器
const target = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: 1, via: 'target' }));
});
await new Promise((r) => target.listen(0, '127.0.0.1', r));
const targetUrl = `http://127.0.0.1:${target.address().port}/hello`;

// 转发代理：支持 CONNECT 隧道（undici ProxyAgent 对所有目标都用 CONNECT）与绝对 URI 两种形态
let proxyHit = false;
const proxy = http.createServer((req, res) => {
  proxyHit = true;
  const url = new URL(req.url, 'http://placeholder');
  const outReq = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: req.method, headers: { ...req.headers, host: url.host } }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  outReq.on('error', () => {
    res.writeHead(502);
    res.end('proxy upstream error');
  });
  req.pipe(outReq);
});
proxy.on('connect', (req, clientSocket, head) => {
  proxyHit = true;
  const idx = req.url.lastIndexOf(':');
  const host = req.url.slice(0, idx);
  const port = Number(req.url.slice(idx + 1)) || 80;
  const up = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) up.write(head);
    up.pipe(clientSocket);
    clientSocket.pipe(up);
  });
  up.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => up.destroy());
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
const OPTS = { systemProxy: false };

// 场景 1：手动配置的代理优先级最高（即使环境变量指向别处）
fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ version: 1, keys: [], settings: { proxyUrl } }));
process.env.HTTP_PROXY = 'http://127.0.0.1:1'; // 干扰项
ok((await getProxyUrl(OPTS)) === proxyUrl, '手动配置代理优先于环境变量');
const r1 = await proxyFetch(targetUrl, OPTS);
ok(r1.status === 200 && proxyHit, `手动配置代理生效：请求经代理到达目标（status=${r1.status}）`);

// 场景 2：清空手动配置 → 环境变量生效
proxyHit = false;
process.env.HTTP_PROXY = proxyUrl;
fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ version: 1, keys: [], settings: {} }));
ok((await getProxyUrl(OPTS)) === proxyUrl, '无手动配置时读环境变量');
const r2 = await proxyFetch(targetUrl, OPTS);
ok(r2.status === 200 && proxyHit, `环境变量代理生效（status=${r2.status}）`);

// 场景 3：代理不可达 → 报错信息包含排障提示
process.env.HTTP_PROXY = 'http://127.0.0.1:1';
let errMsg = '';
try {
  await proxyFetch(targetUrl, OPTS);
} catch (e) {
  errMsg = e.message;
}
ok(errMsg.includes('网络请求失败') && errMsg.includes('设置 → 网络代理'), `代理不可达时报错可读：${errMsg.slice(0, 46)}…`);

// 场景 4（最后）：全部清空 → 直连。部分沙箱会拦截直连并 SIGTERM，故单独收尾。
delete process.env.HTTP_PROXY;
const onTerm = () => {
  out(`SKIP  直连场景被沙箱拦截（透明代理模式），不影响其余断言`);
  out(`\n${pass}/${total} 通过（含跳过）`);
  process.exit(pass === total - 1 ? 0 : 1);
};
process.on('SIGTERM', onTerm);
process.on('SIGINT', onTerm);
proxyHit = false;
const r3 = await proxyFetch(targetUrl, OPTS);
process.off('SIGTERM', onTerm);
process.off('SIGINT', onTerm);
ok(r3.status === 200 && !proxyHit, '无任何配置时直连目标');
ok((await getProxyUrl(OPTS)) === null, 'getProxyUrl 无配置时返回 null（直连）');

target.close();
proxy.close();
fs.rmSync(cfgDir, { recursive: true, force: true });
out(`\n${pass}/${total} 通过`);
process.exit(pass === total ? 0 : 1);
