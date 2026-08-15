/**
 * UI primitives, ported from the React Native app's `src/components/ui/`.
 * Soft filled surfaces, ~18px radius, no borders — hierarchy from fill and type.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const CARD_BASE = 'block w-full rounded-card bg-surface p-4 text-left';

export function Card({
  children,
  className,
  to,
}: {
  children: ReactNode;
  className?: string;
  to?: string;
}) {
  if (to) {
    return (
      <Link
        to={to}
        className={cx(
          CARD_BASE,
          'flex flex-col gap-1.5 transition-colors active:bg-surface-active hover:bg-surface-active',
          className
        )}
      >
        {children}
      </Link>
    );
  }
  return <div className={cx(CARD_BASE, 'flex flex-col gap-2', className)}>{children}</div>;
}

export function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={cx(
        'inline-block rounded-full px-2.5 py-1 text-xs font-semibold',
        accent ? 'bg-accent-soft text-accent' : 'bg-surface-active text-fg-muted'
      )}
    >
      {label}
    </span>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('flex flex-col gap-2', className)}>
      <h2 className="text-xs font-bold tracking-wide text-fg-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  loading,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'subtle' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variants = {
    primary: 'bg-accent text-white',
    subtle: 'bg-surface text-fg',
    danger: 'bg-surface text-danger',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        'rounded-card px-5 py-3.5 text-base font-semibold transition-opacity',
        'disabled:opacity-50',
        variants[variant],
        className
      )}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
      <p className="text-lg font-bold">{title}</p>
      {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20" role="status">
      <div className="size-7 animate-spin rounded-full border-2 border-surface-active border-t-accent" />
      {label && <p className="text-sm text-fg-muted">{label}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card bg-surface p-4 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

/** Labelled text input / textarea sharing the soft-surface treatment. */
export function Field({
  label,
  hint,
  value,
  onChange,
  multiline,
  placeholder,
  maxLength,
  autoFocus,
  type = 'text',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  type?: 'text' | 'password';
}) {
  const shared =
    'w-full rounded-card bg-surface px-4 py-3 outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-accent';

  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-wide text-fg-faint uppercase">{label}</span>
      {hint && <span className="-mt-1 text-sm text-fg-muted">{hint}</span>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={5}
          autoFocus={autoFocus}
          className={cx(shared, 'resize-y')}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className={shared}
        />
      )}
    </label>
  );
}
