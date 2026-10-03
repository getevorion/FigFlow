import type { ReactNode } from 'react';
import { SilkBackdrop } from "./silk-backdrop";

export const AUTH_PRIMARY_SHADOW =
  'inset 0 -1.5px 2px #7fb0ff, inset 0 0 12px #3b82f6, inset 0 0 8px #3b82f6';
export const AUTH_CARD_SHADOW =
  '0 0 1.76px rgba(0,0,0,0.08), 0 1px 1.76px rgba(25,28,33,0.06), 0 0 0 1px rgba(25,28,33,0.04)';

export function AuthExperienceShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="relative grid min-h-screen w-full place-items-center overflow-hidden px-4 py-10 [min-height:100dvh]"
      style={{
        fontFamily: '"Sora", ui-rounded, sans-serif',
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap"
      />
      <style>{`
        .auth-field {
          border: 1px solid #eaeaea;
          outline: none;
          box-shadow: none;
          transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
        }
        .auth-field:focus,
        .auth-field:focus-visible {
          border-color: #93b4f6;
          background: #fff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
        }
        .auth-field.auth-field-error {
          border-color: #fca5a5;
          background: rgba(254, 242, 242, 0.5);
        }
        .auth-field-readonly {
          background: #f5f6f8;
          color: #5f6368;
        }
      `}</style>
      <SilkBackdrop />

      <div className="relative z-10 w-full" style={{ maxWidth: 380 }}>
        <div style={{ padding: 6, borderRadius: 14, background: '#fafafb' }}>
          <div
            className="bg-white"
            style={{ padding: 24, borderRadius: 10, boxShadow: AUTH_CARD_SHADOW }}
          >
            <div className="mb-4 text-center">
              <h1
                className="text-[15px] font-semibold leading-snug text-[#171717]"
                style={{ letterSpacing: '-0.012em' }}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-[13px] leading-relaxed text-[#8b919a]">{subtitle}</p>
              ) : null}
            </div>
            {children}
            {footer ? <div className="mt-4 text-center">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  error,
  readOnly,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  readOnly?: boolean;
}) {
  return (
    <input
      {...props}
      readOnly={readOnly}
      className={[
        'auth-field h-10 w-full rounded-full px-4 text-[14px] text-[#171717]',
        readOnly ? 'auth-field-readonly' : 'bg-[#f5f6f8]',
        'placeholder:text-[#9aa0a6]',
        error ? 'auth-field-error' : '',
        className || '',
      ].join(' ')}
      style={{ letterSpacing: '-0.012em', ...(props.style || {}) }}
    />
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
  type = 'button',
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center rounded-full text-[14px] font-semibold leading-none text-white disabled:opacity-60"
      style={{
        background: 'linear-gradient(180deg,#1e3a8a,#2563eb)',
        boxShadow: AUTH_PRIMARY_SHADOW,
        letterSpacing: '-0.012em',
      }}
    >
      {children}
    </button>
  );
}

export function AuthSummaryList({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2 rounded-[10px] bg-[#f5f6f8] px-3 py-3 text-left text-[12px] text-[#5f6368]">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <span className="shrink-0 font-medium text-[#171717]">{item.label}</span>
          <span className="min-w-0 break-words">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
