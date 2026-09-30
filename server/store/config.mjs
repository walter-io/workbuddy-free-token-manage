import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const CONFIG_DIR = path.join(os.homedir(), '.free-token');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const CACHE_DIR = path.join(CONFIG_DIR, 'cache');

const DEFAULT_SETTINGS = {
  workbuddyDir: '', // 覆盖默认 ~/.workbuddy
};

const DEFAULT_CONFIG = {
  version: 1,
  activeKeyId: null, // 兼容字段：openrouter 的活跃 key
  activeKeys: {}, // platform -> 活跃 keyId（如 { openrouter: 'key-xxx', zen: 'key-yyy' }）
  keys: [], // { id, platform, label, key, addedAt, lastStatus }
  settings: { ...DEFAULT_SETTINGS },
};

export function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function atomicWriteJson(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  ensureDirs();
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const cfg = {
      ...structuredClone(DEFAULT_CONFIG),
      ...raw,
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      activeKeys: { ...(raw.activeKeys || {}) },
    };
    // 迁移：旧版 key 不分平台，全部归入 openrouter；activeKeyId 迁移为 activeKeys.openrouter
    let migrated = false;
    for (const k of cfg.keys) {
      if (!k.platform) {
        k.platform = 'openrouter';
        migrated = true;
      }
    }
    if (!cfg.activeKeys.openrouter && cfg.activeKeyId && cfg.keys.some((k) => k.id === cfg.activeKeyId)) {
      cfg.activeKeys.openrouter = cfg.activeKeyId;
      migrated = true;
    }
    if (migrated) saveConfig(cfg);
    return cfg;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

/** 某平台当前活跃的 key 记录（找不到时回退到该平台第一个 key） */
export function activeKeyFor(cfg, platform) {
  const keys = cfg.keys.filter((k) => k.platform === platform);
  const activeId = cfg.activeKeys?.[platform] || (platform === 'openrouter' ? cfg.activeKeyId : null);
  return keys.find((k) => k.id === activeId) || keys[0] || null;
}

export function saveConfig(cfg) {
  ensureDirs();
  atomicWriteJson(CONFIG_FILE, cfg);
}

export function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

/** key 只保留末 4 位用于界面区分，完整值永不返回给前端 */
export function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  return `••••${key.slice(-4)}`;
}

export function cachePath(name) {
  ensureDirs();
  return path.join(CACHE_DIR, name);
}
