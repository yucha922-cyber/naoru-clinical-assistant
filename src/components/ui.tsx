import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 shadow-md shadow-navy-900/20",
  gold: "bg-gold text-white hover:brightness-105 shadow-md shadow-gold/30",
  secondary: "bg-white text-navy-900 border border-navy-100 hover:border-navy-700 shadow-sm",
  ghost: "text-navy-700 hover:bg-navy-100",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    md: "px-4 py-2.5 text-[15px] rounded-xl",
    lg: "px-6 py-4 text-base rounded-2xl",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy-100 sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ step, title, hint }: { step?: string; title: string; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-3 text-lg font-bold text-navy-900">
        {step && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-navy-900 px-2 text-sm text-white">
            {step}
          </span>
        )}
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

const NOTICE: Record<"info" | "warn" | "error" | "ok", string> = {
  info: "bg-navy-50 text-navy-800 ring-navy-100",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  error: "bg-red-50 text-red-800 ring-red-200",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: keyof typeof NOTICE;
  title?: string;
  children?: ReactNode;
  role?: string;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${NOTICE[tone]}`} role={role ?? (tone === "error" ? "alert" : undefined)}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800 ring-1 ring-navy-100 hover:ring-navy-700"
      }`}
    >
      {children}
    </button>
  );
}
