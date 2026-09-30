<div align="center">

<img src="assets/logo.svg" width="140" alt="Free Token logo" />

# Free Token

**给 WorkBuddy 免费接上 12 个 AI 平台的大牌模型**

不用充值、不用读文档 —— 挑好模型，一键写进 WorkBuddy。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-6366f1)
![License](https://img.shields.io/badge/license-MIT-10b981)
![Electron](https://img.shields.io/badge/Electron-44-47848f)
![价格](https://img.shields.io/badge/%E5%B7%A5%E5%85%B7-%E5%85%8D%E8%B4%B9-f59e0b)

</div>

---

## ✨ 它能帮你做什么？

WorkBuddy 里想用 Claude、GPT、DeepSeek、Qwen……但一个个去官网注册、充值、抄配置太麻烦？

**Free Token 把"找免费模型 → 配置到 WorkBuddy"这件事变成点几下鼠标：**

| 页面 | 一句话说明 |
| --- | --- |
| 🔍 **模型广场** | 12 个平台的模型摆在一起，按"免费"筛选，勾选后一键载入 |
| 🔑 **设置** | 各平台 API Key 集中管理，旁边就是"去申请"的直达链接 |
| 📊 **额度与积分** | 今天还能免费调用多少次，一眼看清 |
| 📈 **Token 统计** | 纯本机分析你的会话日志，看省了多少、用在哪 |

数据全部只存在你自己的电脑上，没有任何中间服务器。

---

## 🚀 三步开始用（照着点就行）

### ① 拿到一个 API Key（约 2 分钟）

API Key 就像这个平台的"会员卡号"，免费注册就有。

以最推荐的 **OpenRouter** 为例（一个 Key 能用几十个免费模型）：

1. 打开 👉 [openrouter.ai/keys](https://openrouter.ai/settings/keys)
2. 用邮箱或 GitHub 账号注册登录
3. 点 **Create Key** → 复制生成的 `sk-or-v1-...` 一长串

> 其他平台（智谱、硅基流动、Groq……）同样是在官网注册后生成 Key，工具的「设置」页里每个平台旁边都有直达链接，不怕找不到。

### ② 把 Key 粘贴进 Free Token

1. 打开 Free Token → 左侧进「**设置**」
2. 「添加到平台」选 **OpenRouter**
3. 粘贴刚才复制的 Key → 点「**验证并添加**」✅

### ③ 挑免费模型，一键载入

1. 进「**模型广场**」，顶部选平台（默认 OpenRouter）
2. 筛选栏选「**免费**」
3. 勾选想要的模型（**点整行任意位置就能勾选**）→ 点「**载入到 WorkBuddy**」
4. 如果 WorkBuddy 正开着，按提示点「**重启 WorkBuddy**」

🎉 搞定！打开 WorkBuddy 的自定义模型列表，刚才选的模型已经在里面了。

---

## 📥 下载安装

### 方式一：下载安装包（推荐）

到 [**Releases 页面**](https://github.com/walter-io/workbuddy-free-token-manage/releases) 下载：

- 🪟 Windows：`Free-Token-Setup-x.x.x.exe`，双击安装
- 🍎 macOS：`Free-Token-x.x.x.dmg`，拖进「应用程序」

> **macOS 首次打开提示"无法验证开发者"？**
> 安装包没有做苹果签名（签名要年费）。处理办法：在应用程序文件夹里**右键点 Free Token → 打开 → 再点打开**，之后就不会再拦了。
> 如果还不行，在终端执行：`xattr -cr /Applications/Free\ Token.app`

### 方式二：源码运行（会敲命令行的看这里）

<details>
<summary><b>展开开发者运行方式</b></summary>

```bash
git clone https://github.com/walter-io/workbuddy-free-token-manage.git
cd free-token
npm install
npm run build
npm start        # Web 版：浏览器打开 http://127.0.0.1:57891
npm run app      # 或桌面版：弹出应用窗口
```

开发模式（改前端实时热更）：

```bash
npm run dev:server   # 终端 1：API 服务
npm run dev          # 终端 2：Vite 开发服务器（http://localhost:5174）
```

</details>

---

## 🆓 支持的免费平台（12 个）

| 平台 | 免费情况 | 需要 Key？ |
| --- | --- | --- |
| [OpenRouter](https://openrouter.ai) | 几十个 `:free` 模型，每天每账号 50 次 | ✅ |
| [OpenCode Zen](https://opencode.ai/docs/zen) | 一批限时免费模型（部分会收集对话数据） | 载入时需要 |
| [Agnes AI](https://agnes-ai.com) | 推广期文本/图像/视频全免费 | ✅ |
| [硅基流动](https://siliconflow.cn) | 部分小模型永久免费，国内直连快 | ✅ |
| [魔搭 ModelScope](https://modelscope.cn) | 每个模型每天 2000 次 | ✅（`ms-` 开头） |
| [智谱 BigModel](https://open.bigmodel.cn) | GLM flash 系列免费，国内直连 | ✅ |
| [Groq](https://groq.com) | 全部模型免费档限速，速度极快 | ✅ |
| [Cerebras](https://cloud.cerebras.ai) | 全部模型免费档限速，速度极快 | ✅ |
| [Mistral](https://console.mistral.ai) | Experiment 免费档限速 | ✅ |
| [Google AI Studio](https://aistudio.google.com) | Gemini 免费档限速（国内需代理） | ✅ |
| [NVIDIA NIM](https://build.nvidia.com) | 注册送开发积分 | 载入时需要 |
| [GitHub Models](https://github.com/marketplace/models) | GitHub 账号就能用，按档位限速 | ✅（GitHub Token） |

> 💡 **不用全注册**：先弄一个 OpenRouter 就够日常用了；想要更快速度或国产直连，再按需加。
> ⚠️ 各平台免费政策随时会调整，以官网为准。

---

## ❓ 新手常见问题

<details>
<summary><b>要花钱吗？会不会偷偷扣费？</b></summary>

工具本身开源免费。上面列的平台都有**免费档**，不绑卡也能用（个别平台需要绑定手机号/阿里云账号）。只要你不主动去这些平台充值，就不会产生任何费用。工具只调用免费额度，不会替你付费。
</details>

<details>
<summary><b>每天能免费用多少？</b></summary>

以 OpenRouter 为例：免费模型**每分钟 20 次、每天 50 次**（账号累计充值满 $10 后提升到每天 1000 次），北京时间早上 8 点重置。「额度与积分」页会实时显示今天还剩多少次。其他平台各有自己的限额，见各平台文档。
</details>

<details>
<summary><b>我的 Key 安全吗？</b></summary>

Key 只保存在你电脑的 <code>~/.free-token/config.json</code> 里，只在调用对应平台官方接口时使用，**不经过任何第三方服务器**。工具的网络界面只监听本机（127.0.0.1），局域网里别人也看不到。
</details>

<details>
<summary><b>为什么有些模型显示"协议不兼容"、不能载入？</b></summary>

OpenCode Zen 上的 <code>claude-*</code>、<code>gpt-*</code>、<code>grok-*</code> 系列走的是 Anthropic / Responses 协议，不是通用的 OpenAI 接口，WorkBuddy 的自定义模型只认后者，所以标灰不可选。同平台其余模型不受影响。
</details>

<details>
<summary><b>载入了，但 WorkBuddy 里看不到新模型？</b></summary>

WorkBuddy 只在**启动时**读取模型配置。把 WorkBuddy 完全退出再打开即可（模型广场的载入完成弹窗里有「重启 WorkBuddy」按钮，点一下就行）。
</details>

<details>
<summary><b>图像生成 / 视频生成模型能用吗？</b></summary>

可以在模型广场里浏览，但**载入仅支持文本对话模型**——WorkBuddy 的自定义模型是给对话用的。图像/视频模型在表格里显示为"不支持载入"。
</details>

<details>
<summary><b>WorkBuddy 装在非默认位置怎么办？</b></summary>

工具会自动检测常见位置；实在找不到，去「设置 → WorkBuddy 数据目录 → 手动指定」填一下数据目录就好。
</details>

---

## 🔒 数据与隐私

- API Key、统计缓存只存本机（`~/.free-token/`），不上传任何服务器
- Token 统计直接读取本机 WorkBuddy 会话日志，纯本地解析
- 修改 WorkBuddy 的 `models.json` 前自动备份，写坏自动回滚
- 「移除」只动本工具载入的条目，你手动配的其他模型不受影响

---

## 🛠️ 进阶玩法（开发者）

<details>
<summary><b>新增一个平台（约 30 行代码）</b></summary>

大多数平台都是 OpenAI 兼容的，在 `server/providers/` 新建一个文件：

```js
import { defineOpenAIPlatform } from './genericOpenAI.mjs';

export const platform = defineOpenAIPlatform({
  id: 'xxx',
  name: 'XXX 平台',
  baseUrl: 'https://api.xxx.com/v1',
  modelsPublic: false,              // 模型列表是否免鉴权
  isFree: (m) => /free/.test(m.id), // 或 true / false
  loadable: (m) => true,            // 协议不兼容时返回 false
  keyFormat: /^xxx_/,
  site: 'https://xxx.com',          // 官网（设置页直达链接）
  keyUrl: 'https://xxx.com/keys',   // Key 管理页
  note: '界面展示的注意事项',
});
```

再到 `server/providers/registry.mjs` 里 import 并加入 `PLATFORM_ORDER`，前端自动出现新平台。

</details>

<details>
<summary><b>桌面应用打包（Windows / macOS）</b></summary>

Electron 壳把 Express 服务跑在主进程里，**用户机器无需安装 Node**；端口被占自动顺延、单实例锁、外链系统浏览器打开。

```bash
npm run app:dir    # 免安装目录（release/win-unpacked）
npm run app:win    # Windows 安装包（release/*.exe）
npm run app:mac    # macOS 镜像（需在 macOS 上执行）
```

macOS 包无法在 Windows 上构建：推送代码后打个 tag（如 `v0.1.0`），[Release 工作流](.github/workflows/release.yml)会在双平台自动构建并挂到 Release。

</details>

<details>
<summary><b>调研储备：下一批候选平台</b></summary>

- **Cloudflare Workers AI**：免费 neurons 额度，边缘推理
- **阿里云百炼**：每模型 100 万 tokens 免费且永久有效
- **火山方舟（豆包）**：每日 200 万 tokens（当前最高日额度）
- **腾讯混元**：hunyuan-lite 免费，100 万 tokens/年
- **百度千帆**：ERNIE Speed/Lite 等免费
- **Together AI**：少数模型永久免费
- **OVHcloud / Scaleway**：欧洲厂商，beta 期免费
- **Cohere**：trial key 免费限速
- **Pollinations**：完全无 Key（稳定性一般）

参考：[腾讯云 2026 免费 API 汇总](https://developer.cloud.tencent.com/article/2626756) · [ai-bot.cn 免费 Token 指南](https://ai-bot.cn/free-token-api/) · [SiliconFlow 更新公告](https://docs.siliconflow.cn/cn/release-notes/overview)

</details>

<details>
<summary><b>技术栈</b></summary>

Node.js ≥18 · Electron · Express · Vite · React 18 · TypeScript · Tailwind CSS v4 · Recharts

</details>

---

## License

[MIT](LICENSE) © Free Token contributors
