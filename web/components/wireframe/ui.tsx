import { forwardRef, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const PILL: Record<string, string> = {
  pending: "bg-[var(--wait-bg)] text-[var(--wait)]",
  approved: "bg-[var(--good-bg)] text-[var(--good)]",
  opened: "bg-[var(--good-bg)] text-[var(--good)]",
  revoked: "bg-[var(--bad-bg)] text-[var(--bad)]",
  expired: "bg-[var(--wait-bg)] text-[var(--wait)]",
  deid: "bg-[var(--deid-bg)] text-[var(--deid)]",
  verified: "bg-[var(--good-bg)] text-[var(--good)]",
  example: "bg-[var(--wait-bg)] text-[var(--wait)]",
  soon: "bg-[var(--neutral-bg)] text-[var(--neutral)]",
  wired: "bg-[var(--neutral-bg)] text-[var(--neutral)]",
  neutral: "bg-[var(--neutral-bg)] text-[var(--neutral)]",
};

export function Pill({
  tone = "neutral",
  children,
  testId,
}: {
  tone?: keyof typeof PILL;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cx(
        "inline-flex h-6 items-center rounded-[4px] border-0 px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.05em]",
        PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tone?: "default" | "solid" | "quiet" | "danger";
    testId?: string;
    type?: "button" | "submit";
    guide?: string;
  }
>(function Button({ children, onClick, disabled = false, tone = "default", testId, type = "button", guide }, ref) {
  const tones = {
    default: "rr-default border border-[var(--ink)] bg-white text-[var(--ink)] hover:bg-[var(--sunken)]",
    solid: "rr-solid border border-transparent bg-[var(--ink)] text-[#F4F6F8] hover:brightness-110",
    quiet: "rr-quiet border border-transparent bg-transparent text-[var(--teal-deep)] underline-offset-2 hover:underline",
    danger: "rr-danger border border-[var(--deny)] bg-white text-[var(--deny)] hover:bg-[var(--bad-bg)]",
  };
  return (
    <button
      ref={ref}
      type={type}
      data-testid={testId}
      data-guide={guide}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[4px] px-[18px] text-[15px] font-medium tracking-[-0.01em] disabled:pointer-events-none disabled:border disabled:border-[var(--line)] disabled:bg-[var(--sunken)] disabled:text-[var(--muted)]",
        tones[tone],
      )}
    >
      {children}
    </button>
  );
});

export function IconButton({
  label,
  onClick,
  children,
  testId,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  extra,
  children,
  testId,
  className,
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cx("rounded-[2px] border border-[var(--line)] bg-[var(--card)] px-[22px] py-5", className)}
    >
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  titleAs = "h1",
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  titleAs?: "h1" | "h2";
}) {
  const Title = titleAs;
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{eyebrow}</p>
        ) : null}
        <Title className="mt-3 text-[40px] font-semibold leading-[0.98] tracking-[-0.035em]">{title}</Title>
        {lede ? <p className="mt-1.5 max-w-[58ch] text-[15.5px] leading-normal text-[var(--muted)]">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  testId,
  disabled = false,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "h-9 rounded-[6px] border px-3 text-sm font-medium disabled:opacity-50",
        pressed
          ? "border-[var(--ink)] bg-[var(--ink)] text-[#F4F6F8]"
          : "border-[var(--line)] bg-white text-[var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--muted)]">{body}</p>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[6px] border border-[var(--rule)] bg-[var(--sunken)] px-4 py-3 text-base leading-normal text-[var(--ink)]";
