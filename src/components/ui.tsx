import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

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
export const IconInfo = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M12 12v4" /></>);
export const IconExternalLink = icon(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>);

/* ---------------- Button ---------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'subtle', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/25',
    ghost: 'text-zinc-600 hover:bg-zinc-200/70',
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

export function Badge({ color = 'gray', className = '', children }: { color?: keyof typeof badgeColors | string; className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium ${badgeColors[color] || badgeColors.gray} ${className}`}>
      {children}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-white rounded-xl border border-zinc-200 shadow-sm ${className}`}>{children}</div>;
}

/* ---------------- ProgressBar ---------------- */

export function ProgressBar({ percent, color = 'bg-indigo-500', className = '' }: { percent: number; color?: string; className?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={`h-2 w-full bg-zinc-100 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex bg-zinc-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md transition-colors ${size === 'sm' ? 'px-2.5 h-6 text-xs' : 'px-3 h-7 text-xs'} ${
            value === o.value ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${width} max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 sticky top-0 bg-white rounded-t-xl">
          <div className="font-semibold text-zinc-900">{title}</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <IconX />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Spinner / EmptyState ---------------- */

export function Spinner({ className = 'w-5 h-5' }: IconProps) {
  return <IconLoader className={`${className} animate-spin text-zinc-400`} />;
}

export function EmptyState({ icon, title, desc, action }: { icon?: React.ReactNode; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-zinc-300 mb-3 [&>svg]:w-10 [&>svg]:h-10">{icon}</div>}
      <div className="text-zinc-700 font-medium">{title}</div>
      {desc && <div className="text-sm text-zinc-400 mt-1 max-w-md">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
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
    setItems((arr) => [...arr, { id, type, text }]);
    setTimeout(() => setItems((arr) => arr.filter((t) => t.id !== id)), type === 'err' ? 6000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-xl w-auto flex items-center gap-2 rounded-lg px-4 py-2.5 shadow-lg text-sm ${
              t.type === 'ok' ? 'bg-emerald-600 text-white' : t.type === 'err' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-white'
            }`}
          >
            {t.type === 'ok' ? <IconCheck className="w-4 h-4 shrink-0" /> : t.type === 'err' ? <IconX className="w-4 h-4 shrink-0" /> : <IconInfo className="w-4 h-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
