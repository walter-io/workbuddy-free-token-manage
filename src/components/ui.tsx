import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------------- Icons（内联 SVG，避免额外依赖） ---------------- */

type IconProps = { className?: string };
const icon = (path: React.ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ className = 'w-4 h-4' }: IconProps) {
    return (
      <svg className={className} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    );
  };

export const IconRefresh = icon(<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>);
export const IconSearch = icon(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const IconPlus = icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconTrash = icon(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);
export const IconCheck = icon(<path d="M20 6 9 17l-5-5" />);
export const IconX = icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const IconLoader = icon(<path d="M21 12a9 9 0 1 1-6.22-8.56" />);
export const IconDownload = icon(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>);
export const IconKey = icon(<><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m16.5 6.5 3 3" /></>);
export const IconChart = icon(<><path d="M3 3v18h18" /><path d="M7 15v3" /><path d="M12 10v8" /><path d="M17 6v12" /></>);
export const IconGrid = icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);
export const IconGauge = icon(<><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="m14 10 3-3" /><path d="M3.3 17a9 9 0 1 1 17.4 0" /></>);
export const IconSettings = icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" /></>);
export const IconCopy = icon(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const IconChevronLeft = icon(<path d="m15 18-6-6 6-6" />);
export const IconChevronRight = icon(<path d="m9 18 6-6-6-6" />);
export const IconChevronDown = icon(<path d="m6 9 6 6 6-6" />);
export const IconChevronUp = icon(<path d="m18 15-6-6-6 6" />);
export const IconInfo = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M12 12v4" /></>);
export const IconExternalLink = icon(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>);
export const IconSliders = icon(<><path d="M4 6h10" /><path d="M18 6h2" /><path d="M4 12h4" /><path d="M12 12h8" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></>);
export const IconWarning = icon(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);
export const IconSparkles = icon(<><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m6.3 6.3 2.4 2.4" /><path d="m15.3 15.3 2.4 2.4" /><path d="m17.7 6.3-2.4 2.4" /><path d="m8.7 15.3-2.4 2.4" /></>);
export const IconInbox = icon(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z" /></>);
export const IconClock = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconEye = icon(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = icon(<><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6" /><path d="M6.2 6.2A17 17 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 3.8-.8" /><path d="m2 2 20 20" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconShield = icon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>);

/* ---------------- Button ---------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle' | 'outline';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'subtle', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap';
  const sizes = { xs: 'h-6 px-2 text-[11px]', sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-600/25',
    ghost: 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
    subtle: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 shadow-sm',
    outline: 'bg-transparent text-indigo-600 border border-indigo-300 hover:bg-indigo-50',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <IconLoader className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------- Badge ---------------- */

const badgeColors: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
  gray: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

const dotColors: Record<string, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  gray: 'bg-zinc-400',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
};

export function Badge({
  color = 'gray',
  className = '',
  dot,
  children,
}: {
  color?: keyof typeof badgeColors | string;
  className?: string;
  /** 前置状态圆点，用于「运行中 / 已连接」等状态语义 */
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium ${badgeColors[color] || badgeColors.gray} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[color] || dotColors.gray}`} />}
      {children}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-white rounded-xl border border-zinc-200 shadow-sm ${className}`}>{children}</div>;
}

/** 卡片内的统一小节标题：图标 + 标题 + 右侧操作 */
export function SectionHeader({
  icon,
  title,
  desc,
  actions,
  className = '',
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start gap-3 ${className}`}>
      {icon && <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-zinc-900 leading-tight">{title}</div>
        {desc && <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{desc}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/* ---------------- ProgressBar ---------------- */

export function ProgressBar({
  percent,
  color = 'bg-indigo-500',
  size = 'md',
  className = '',
}: {
  percent: number;
  color?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={`${size === 'sm' ? 'h-1.5' : 'h-2'} w-full bg-zinc-100 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className = '' }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={`inline-flex bg-zinc-100 rounded-lg p-0.5 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md transition-all duration-150 ${size === 'sm' ? 'px-2.5 h-6 text-xs' : 'px-3 h-7 text-xs'} ${
            value === o.value ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 rounded ${className}`} />;
}

/* ---------------- Modal ---------------- */

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  // ESC 关闭 + 打开期间锁定背景滚动（长列表下避免"滚动穿透"）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-900/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl ring-1 ring-zinc-900/5 w-full ${width} max-h-[85vh] flex flex-col animate-pop-in`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-100 shrink-0">
          <div className="min-w-0">
            <div className="font-semibold text-zinc-900">{title}</div>
            {subtitle && <div className="text-xs text-zinc-400 mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-0.5 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <IconX />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-zinc-100 bg-zinc-50/70 rounded-b-2xl flex flex-wrap justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Confirm（替代原生 window.confirm，样式统一且支持长文案） ---------------- */

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ o: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise<boolean>((resolve) => setState({ o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => done(false)} title={state?.o.title || ''} width="max-w-md">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 [&>svg]:w-4.5 [&>svg]:h-4.5 ${state?.o.danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
            <IconWarning />
          </div>
          <div className="text-sm text-zinc-600 leading-relaxed min-w-0 flex-1">{state?.o.message}</div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={() => done(false)}>{state?.o.cancelText || '取消'}</Button>
          <Button variant={state?.o.danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>
            {state?.o.confirmText || '确定'}
          </Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ---------------- Spinner / EmptyState ---------------- */

export function Spinner({ className = 'w-5 h-5' }: IconProps) {
  return <IconLoader className={`${className} animate-spin text-zinc-400`} />;
}

export function EmptyState({ icon, title, desc, action }: { icon?: React.ReactNode; title: string; desc?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-100 text-zinc-300 flex items-center justify-center mb-4 [&>svg]:w-6 [&>svg]:h-6">
          {icon}
        </div>
      )}
      <div className="text-zinc-800 font-medium">{title}</div>
      {desc && <div className="text-sm text-zinc-400 mt-1.5 max-w-md leading-relaxed">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Toast ---------------- */

type ToastItem = { id: number; type: 'ok' | 'err' | 'info'; text: string };
const ToastCtx = createContext<(type: ToastItem['type'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((type: ToastItem['type'], text: string) => {
    const id = ++seq.current;
    setItems((arr) => [...arr.slice(-3), { id, type, text }]);
    setTimeout(() => setItems((arr) => arr.filter((t) => t.id !== id)), type === 'err' ? 6000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-2xl flex items-start gap-2.5 rounded-xl px-4 py-2.5 shadow-lg shadow-zinc-900/10 text-sm animate-slide-up ${
              t.type === 'ok' ? 'bg-emerald-600 text-white' : t.type === 'err' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white'
            }`}
          >
            <span className="shrink-0 mt-0.5 [&>svg]:w-4 [&>svg]:h-4">
              {t.type === 'ok' ? <IconCheck /> : t.type === 'err' ? <IconWarning /> : <IconInfo />}
            </span>
            <span className="leading-relaxed break-words">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
