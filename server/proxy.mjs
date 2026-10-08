import { execFile } from 'node:child_process';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { loadConfig } from './store/config.mjs';

/**
 * 出站请求代理支持：Node 的 fetch 默认不走系统代理，国内用户即使开了 Clash/V2Ray 的
 * "系统代理"，直连 Google/Groq/NVIDIA 等仍会 "fetch failed"。
 *
 * 代理来源优先级：设置页手动填写 > 环境变量（HTTPS_PROXY 等）> Windows 系统代理（注册表）。
 * proxyFetch 是全站出站请求的统一入口，网络层失败时附带可操作的排障提示。
 */

const SYS_PROXY_TTL = 60_000;
let sysCache = { at: 0, url: null };

function regQuery(key, value, timeoutMs = 4000) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/v', value], { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

/** 读 Windows 系统代理（IE/WinINET 设置，Clash 等开启"系统代理"时写在这里） */
async function detectSystemProxy() {
  if (process.platform !== 'win32') return null;
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const [enableOut, serverOut] = await Promise.all([
      regQuery(key, 'ProxyEnable'),
      regQuery(key, 'ProxyServer'),
    ]);
    if (!/0x1\b/.test(enableOut)) return null;
    const m = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
    if (!m) return null;
    let server = m[1];
    // "host:port" 或按协议分段 "http=...;https=..."，取 http/https 段
    if (server.includes('=')) {
      const seg = server.split(';').find((s) => /^(https?|all)=/.test(s.trim()));
      if (!seg) return null;
      server = seg.split('=')[1];
    }
    if (!server) return null;
    const withScheme = /^(https?|socks5h?):\/\//.test(server) ? server : `http://${server}`;
    return new URL(withScheme).host ? withScheme : null;
  } catch {
    return null;
  }
}

/** 解析当前应使用的代理地址（null = 直连）。
 * opts.systemProxy=false 时跳过 Windows 系统代理探测（隔离测试用，避免触发 reg.exe）。 */
export async function getProxyUrl(opts = {}) {
  const cfg = loadConfig();
  const manual = String(cfg.settings?.proxyUrl || '').trim();
  if (manual) return manual;

  const env =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    '';
  if (env.trim()) return env.trim();

  if (opts.systemProxy === false) return null;
  if (Date.now() - sysCache.at < SYS_PROXY_TTL) return sysCache.url;
  sysCache.at = Date.now();
  sysCache.url = await detectSystemProxy();
  return sysCache.url;
}

const agentCache = new Map(); // proxyUrl -> ProxyAgent（进程内复用连接池）
function agentFor(proxyUrl) {
  let agent = agentCache.get(proxyUrl);
  if (!agent) {
    agent = new ProxyAgent(proxyUrl);
    agentCache.set(proxyUrl, agent);
  }
  return agent;
}

function friendlyNetError(err, proxyUrl) {
  const cause = err?.cause || err;
  const code = cause?.code || cause?.message || err?.message || '未知网络错误';
  const via = proxyUrl ? `（经代理 ${proxyUrl}）` : '（直连）';
  return (
    `网络请求失败 ${via}：${code}。` +
    `需要 VPN 的平台（Google / Groq / NVIDIA / OpenRouter 等）请确认代理软件已开启；` +
    `若代理不是系统级模式，请到「设置 → 网络代理」手动填写代理地址（如 http://127.0.0.1:7890）`
  );
}

/** 统一出站请求入口：自动带代理；网络层失败时给出可排障的错误信息。
 * opts 透传给 fetch；内部解析代理时同样支持 { systemProxy } 透传（测试用）。 */
export async function proxyFetch(url, opts = {}) {
  const { systemProxy, ...fetchOpts } = opts;
  const proxyUrl = await getProxyUrl({ systemProxy });
  try {
    if (proxyUrl) {
      return await undiciFetch(url, { ...fetchOpts, dispatcher: agentFor(proxyUrl) });
    }
    return await fetch(url, fetchOpts);
  } catch (err) {
    throw new Error(friendlyNetError(err, proxyUrl));
  }
}
