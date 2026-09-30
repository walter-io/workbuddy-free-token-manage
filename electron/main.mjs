import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

/**
 * Electron 主进程：把现有 Express 服务（server/index.mjs）直接跑在主进程里，
 * 无需系统安装 Node，也无需 sidecar 二进制；窗口加载 http://127.0.0.1:<port>。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 单实例锁：二次启动唤起已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// 阻止 Express 服务自动打开系统浏览器（由窗口代替）
process.env.NO_OPEN = '1';

/** 从 start 开始找到第一个可绑定的端口 */
function getFreePort(start) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const srv = net.createServer();
      srv.once('error', () => tryPort(port + 1));
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* 未就绪，继续等待 */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('本地服务启动超时');
}

async function createWindow() {
  const port = await getFreePort(57891);
  process.env.PORT = String(port);
  await import('../server/index.mjs');
  await waitForServer(`http://127.0.0.1:${port}/api/platforms`);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Free Token',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f4f4f5',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 平台官网等外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith('http://127.0.0.1')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
  return win;
}

app.whenReady().then(createWindow).catch((err) => {
  // 服务启动失败时弹出系统对话框而不是白屏
  dialog.showErrorBox('Free Token 启动失败', String(err?.message || err));
  app.quit();
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  // 服务随进程一起退出
  app.quit();
});
