/**
 * API 层。当前走 HTTP（本地 Express 服务）。
 * 未来桌面化（Tauri）时在此切换为 invoke 通道，页面代码无需改动。
 */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new Error('无法连接本地服务，请确认 free-token 服务已启动');
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    throw new Error(body?.error || `请求失败（HTTP ${res.status}）`);
  }
  return body as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined });
export const put = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body != null ? JSON.stringify(body) : undefined });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
