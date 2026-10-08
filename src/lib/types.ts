export type OutputKind = 'text' | 'image' | 'video';

export interface ORModel {
  id: string;
  platform?: string;
  name: string;
  vendor: string;
  created: number | null;
  description: string;
  contextLength: number | null;
  pricing: { prompt: number | null; completion: number | null; request: number | null; image: number | null } | null;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  isFree: boolean;
  outputKind: OutputKind;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsImageInput: boolean;
  /** false = 协议不兼容等原因不可载入 WorkBuddy（缺省视为可载入） */
  loadable?: boolean;
}

export interface ModelsResponse {
  fetchedAt: number;
  count: number;
  models: ORModel[];
  platform?: string;
  platformName?: string;
  note?: string | null;
}

export interface PlatformInfo {
  id: string;
  name: string;
  shortName: string;
  site: string;
  /** 该平台创建/管理 API Key 的入口页 */
  keyUrl: string | null;
  keyPlaceholder: string | null;
  modelsPublic: boolean;
  quotaKind: 'openrouter' | 'balance' | 'none';
  note: string | null;
  keyCount?: number;
  modelCount?: number | null;
  /** 置灰原因：region = 地区受限；platform = 平台限制外部使用；null = 正常可用 */
  uiDisabled?: 'region' | 'platform' | null;
}

export interface FreeDailyRequests {
  used: number;
  limit: number;
  remaining: number;
}

export interface KeyQuota {
  keyId: string;
  platform: string;
  label: string;
  masked: string;
  status: 'ok' | 'invalid' | 'error' | 'unknown';
  error?: string;
  /** 该平台未提供额度查询接口时的提示 */
  note?: string | null;
  unavailable?: string | null;
  freeModelDailyRequests?: FreeDailyRequests | null;
  usage?: number | null;
  usageDaily?: number | null;
  usageWeekly?: number | null;
  usageMonthly?: number | null;
  limit?: number | null;
  limitRemaining?: number | null;
  isFreeTier?: boolean;
  expiresAt?: string | null;
  credits?: { total: number | null; used: number | null } | null;
  /** 余额型平台的余额信息（单位见平台说明） */
  balance?: { total: number | null; charge: number | null; gift: number | null } | null;
}

export interface PlatformQuotaGroup {
  platform: string;
  platformName: string;
  quotaKind: 'openrouter' | 'balance' | 'none';
  note: string | null;
  keys: KeyQuota[];
}

export interface QuotaResponse {
  fetchedAt: number;
  activeKeys: Record<string, string | null>;
  platforms: PlatformQuotaGroup[];
}

export interface KeyInfo {
  id: string;
  platform: string;
  label: string;
  masked: string;
  addedAt: number;
  lastStatus?: string | null;
}

export interface KeysResponse {
  activeKeys: Record<string, string | null>;
  activeKeyId?: string | null;
  keys: KeyInfo[];
  configFile: string;
}

export interface LoadedEntry {
  id: string;
  name: string;
  platform: string;
  keyTail: string;
  supportsToolCall: boolean;
  supportsImages: boolean;
  supportsReasoning: boolean;
}

export interface LoadedInfo {
  exists: boolean;
  invalid?: boolean;
  dir: string;
  modelsJsonPath: string;
  loaded: LoadedEntry[];
  running?: boolean;
  exePath?: string | null;
  /** 进程探测本身失败时的原因（非空表示状态不可信，不能断定"未运行"） */
  detectError?: string | null;
  /** 探测方式：powershell / tasklist / pgrep */
  detectMethod?: string | null;
  /** 降级探测导致的能力缺失说明（例如拿不到启动时间） */
  detectWarning?: string | null;
  /** 检测到的同名进程数（Electron 应用会有多个） */
  processCount?: number | null;
  modelsJsonMtime?: number | null;
  pendingRestart?: boolean;
}

export interface LoadResult {
  added: number;
  updated: number;
  backup: string | null;
  total: number;
  keyUsed: string;
  skipped: { id: string; reason: string }[];
}

export interface StatsBucket {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface SessionStat {
  sessionId: string;
  title: string;
  project: string;
  requests: number;
  input: number;
  output: number;
  total: number;
  lastActive: number | null;
  topModels: { model: string; tokens: number }[];
}

export interface StatsResponse {
  range: string;
  modelFilter: string | null;
  freeOnly: boolean;
  generatedAt: number;
  dir: string;
  filesScanned: number;
  parseErrors: number;
  coverageStartAt: number | null;
  coverageEndAt: number | null;
  summary: StatsBucket;
  models: (StatsBucket & { name: string })[];
  projects: (StatsBucket & { name: string })[];
  sessions: SessionStat[];
  daily: { date: string; requests: number; total: number; byModel: Record<string, number> }[];
  hours: Record<string, number>;
}

export interface WorkbuddyDetection {
  dir: string;
  source: 'override' | 'default' | 'scan';
  sourceLabel: string;
  valid: boolean;
  markers: {
    modelsJson: boolean;
    projects: boolean;
    sessions: boolean;
    db: boolean;
    score: number;
    exists: boolean;
  };
}

export interface DetectResult {
  detected: WorkbuddyDetection;
  running: boolean;
  exePath: string | null;
  detectError?: string | null;
  detectMethod?: string | null;
}

export interface PlatformCacheInfo {
  platform: string;
  platformName: string;
  fetchedAt: number;
  count: number;
}

export interface SettingsInfo {
  workbuddyDir: string;
  proxyUrl: string;
  effectiveProxy: string | null;
  detected: WorkbuddyDetection;
  cacheDir: string;
  modelsCaches: PlatformCacheInfo[];
}
