/**
 * 隔离验证 models.json 备份 / 回滚机制（不触碰真实 ~/.workbuddy 与 ~/.free-token）。
 * 运行：FREE_TOKEN_CONFIG_DIR=<tmp> node scripts/test-backup-rollback.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadModels, removeModels, listLoaded } from '../server/targets/workbuddy.mjs';

// 把 WorkBuddy 数据目录重定向到临时目录（通过 FREE_TOKEN_CONFIG_DIR 下的 settings.workbuddyDir）
const wbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-wb-'));
const cfgDir = process.env.FREE_TOKEN_CONFIG_DIR;
if (!cfgDir) throw new Error('请设置 FREE_TOKEN_CONFIG_DIR 指向临时目录');
fs.mkdirSync(cfgDir, { recursive: true });
fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ version: 1, keys: [], settings: { workbuddyDir: wbDir } }));

const modelsJson = path.join(wbDir, 'models.json');
let pass = 0;
let total = 0;
const ok = (cond, msg) => {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (cond) pass++;
};

// 初始：1 条本工具的 OpenRouter 条目 + 1 条用户手动的未知条目
fs.writeFileSync(
  modelsJson,
  JSON.stringify([
    { id: 'manual-model', name: '用户手动加的', url: 'https://example.com/v1', apiKey: 'xxx' },
    { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder (free)', url: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-old', supportsToolCall: true },
  ])
);

const entry = {
  id: 'groq/llama-3.3-70b-versatile',
  name: 'Llama 3.3 70B',
  vendor: 'Custom',
  url: 'https://api.groq.com/openai/v1',
  apiKey: 'gsk_test',
  supportsToolCall: true,
  supportsImages: false,
  supportsReasoning: false,
  useCustomProtocol: false,
};

// 1. 载入：备份生成 + 合并写入 + 回读校验
const r1 = loadModels([entry]);
ok(r1.added === 1 && r1.updated === 0, `载入新增 1 条（added=${r1.added}）`);
ok(r1.backup && fs.existsSync(r1.backup), `已生成备份 ${path.basename(r1.backup || '')}`);
const after = JSON.parse(fs.readFileSync(modelsJson, 'utf8'));
ok(after.length === 3, `models.json 共 3 条（实际 ${after.length}）`);
ok(after.find((e) => e.id === 'manual-model')?.apiKey === 'xxx', '用户手动条目原样保留');

// 2. 更新已有条目（同一 id 再次载入 → updated）；两次写入发生在同一秒内，备份文件名不得碰撞
const r2 = loadModels([{ ...entry, apiKey: 'gsk_new' }]);
ok(r2.updated === 1, `重复载入按更新处理（updated=${r2.updated}）`);
ok(r2.backup !== r1.backup && fs.existsSync(r2.backup), '同秒两次载入的备份文件名互不覆盖');
ok(JSON.parse(fs.readFileSync(modelsJson, 'utf8')).find((e) => e.id === entry.id).apiKey === 'gsk_new', 'apiKey 已更新');

// 3. 移除：只删受管条目，用户手动条目不动
const r3 = removeModels([entry.id, 'qwen/qwen3-coder:free']);
ok(r3.removed === 2, `移除 2 条受管条目（removed=${r3.removed}）`);
ok(JSON.parse(fs.readFileSync(modelsJson, 'utf8')).every((e) => e.id === 'manual-model'), '仅剩用户手动条目');

// 4. 写坏保护：models.json 不是数组时拒绝修改
fs.writeFileSync(modelsJson, '{"broken": true');
const r4 = removeModels(['manual-model']);
ok(r4.invalid === true && fs.existsSync(modelsJson), '损坏的 models.json 被拒绝修改（invalid=true）');

// 5. listLoaded 对损坏文件不抛异常
const r5 = listLoaded();
ok(r5.invalid === true && Array.isArray(r5.loaded), 'listLoaded 对损坏文件返回 invalid 标记而非崩溃');

console.log(`\n${pass}/${total} 通过`);
fs.rmSync(wbDir, { recursive: true, force: true });
process.exit(pass === total ? 0 : 1);
