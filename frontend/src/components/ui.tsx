// ===========================================================================
//  ui.tsx — the small set of shapes the Nexus design repeats everywhere:
//  cards, stat tiles, badges, buttons, inputs, tables, empty and error states.
//
//  Everything here is plain React + the design tokens in index.css, so there
//  is no component library to install and nothing to fight when you restyle.
// ===========================================================================

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import { useT } from "@/lib/prefs";

/**
 * TRANSLATION HAPPENS HERE, ONCE.
 *
 * Every screen builds its headings, buttons, tiles and empty states out of the
 * components below, and they all pass plain English strings. So translating
 * inside these components translates most of the app at a stroke — no screen
 * has to know the language exists.
 *
 * `maybe` only touches actual strings: numbers, elements and anything already
 * built out of JSX pass straight through untouched.
 */
function useMaybeTranslate() {
  const t = useT();
  return (value: ReactNode): ReactNode => (typeof value === "string" ? t(value) : value);
}

type Tone = "neutral" | "canteen" | "ferry" | "warning" | "error";

const toneChip: Record<Tone, string> = {
  neutral: "bg-surface-container-high text-on-surface",
  canteen: "bg-secondary-container text-on-secondary-container",
  ferry: "bg-tertiary-container text-on-tertiary-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
};

// --- layout ---------------------------------------------------------------

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const tr = useMaybeTranslate();
  title = String(tr(title));
  subtitle = tr(subtitle);
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-on-surface sm:text-headline-lg">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, subtitle, actions, children, className = "", accent }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: Tone;
}) {
  const tr = useMaybeTranslate();
  title = tr(title);
  subtitle = tr(subtitle);
  const accentBar =
    accent === "canteen" ? "bg-secondary" : accent === "ferry" ? "bg-tertiary" : accent === "error" ? "bg-error" : accent === "warning" ? "bg-warning" : "";
  return (
    <section className={`card relative overflow-hidden ${className}`}>
      {accentBar ? <div className={`absolute inset-x-0 top-0 h-1 ${accentBar}`} /> : null}
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <div>
            <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-on-surface-variant">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-pad">{children}</div>
    </section>
  );
}

/** The KPI tile used across the dashboards: label, big monospace value, hint. */
export function StatTile({ label, value, hint, tone = "neutral", icon }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const tr = useMaybeTranslate();
  label = String(tr(label));
  value = tr(value);
  hint = tr(hint);
  const ring =
    tone === "canteen"
      ? "border-secondary/30"
      : tone === "ferry"
        ? "border-tertiary/30"
        : tone === "error"
          ? "border-error/30"
          : tone === "warning"
            ? "border-warning/40"
            : "border-outline-variant";
  // BIG NUMBERS MUST STAY READABLE.
  //
  // This used to be `truncate`, which quietly cut a figure off with an
  // ellipsis — so an administrator holding Ks 100,000,000,000 saw a number
  // that was not the number. Nothing is ever hidden now: the text steps down
  // in size as it grows, wraps if it still does not fit, and the tile scrolls
  // sideways as a last resort. The full figure is also on the tile's tooltip.
  const text = typeof value === "string" ? value : "";
  const size = text.length > 26 ? "text-[15px]" : text.length > 20 ? "text-[17px]" : text.length > 15 ? "text-[19px]" : "text-[22px]";

  return (
    <div className={`card card-pad flex items-start justify-between gap-3 ${ring}`}>
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p
          className={`tabular mt-2 max-w-full overflow-x-auto whitespace-nowrap pb-0.5 font-bold leading-tight text-on-surface ${size}`}
          title={text || undefined}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-[12px] text-on-surface-variant">{hint}</p> : null}
      </div>
      {icon ? <div className={`chip ${toneChip[tone]} h-9 w-9 shrink-0 justify-center p-0`}>{icon}</div> : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const tr = useMaybeTranslate();
  return <span className={`chip ${toneChip[tone]}`}>{tr(children)}</span>;
}

// --- controls --------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "canteen" | "ferry" | "ghost" | "danger"; busy?: boolean };

export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...rest }: ButtonProps) {
  const tr = useMaybeTranslate();
  children = tr(children);
  const variantClass = { primary: "btn-primary", canteen: "btn-canteen", ferry: "btn-ferry", ghost: "btn-ghost", danger: "btn-danger" }[variant];
  return (
    <button className={`btn ${variantClass} ${className}`} disabled={disabled || busy} {...rest}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const tr = useMaybeTranslate();
  label = String(tr(label));
  hint = tr(hint);
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`input ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`input ${className}`} {...rest}>
      {children}
    </select>
  );
}

// --- states ----------------------------------------------------------------

export function Spinner({ label = "Loading…" }: { label?: string }) {
  const t = useT();
  label = t(label);
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-on-surface-variant">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card card-pad border-error/40 bg-error-container/40">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line text-[14px] font-medium text-on-error-container">{message}</p>
          {onRetry ? (
            <Button variant="ghost" className="mt-3 h-9" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const t = useT();
  title = t(title);
  description = description ? t(description) : description;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant px-6 py-10 text-center">
      <Inbox className="h-6 w-6 text-outline" />
      <p className="text-[15px] font-semibold text-on-surface">{title}</p>
      {description ? <p className="max-w-md text-[13px] text-on-surface-variant">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const tr = useMaybeTranslate();
  children = tr(children);
  return <div className={`rounded-lg px-4 py-3 text-[14px] ${toneChip[tone]} normal-case tracking-normal`}>{children}</div>;
}

// --- overlay ---------------------------------------------------------------

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  title = t(title);
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-inverse-surface/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface-container-lowest shadow-raised sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
          <button className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-outline-variant px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// --- domain-shaped helpers -------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "available" || status === "confirmed" || status === "completed" || status === "active" || status === "operational" || status === "paid"
      ? "canteen"
      : status === "cancelled" || status === "inactive" || status === "sold_out" || status === "unavailable"
        ? "error"
        : status === "pending" || status === "awaiting_confirmation" || status === "reported" || status === "maintenance"
          ? "warning"
          : status === "boarding" || status === "in_progress" || status === "scheduled" || status === "ready" || status === "preparing"
            ? "ferry"
            : "neutral";
  // "awaiting_confirmation" -> "Awaiting confirmation", then translated.
  const readable = status.replace(/_/g, " ").replace(/^./, first => first.toUpperCase());
  return <Badge tone={tone}>{readable}</Badge>;
}

/** A thin load bar used for ferry seat occupancy. */
export function LoadBar({ percent, tone = "ferry" }: { percent: number; tone?: Tone }) {
  const width = Math.max(0, Math.min(100, percent));
  const fill = tone === "canteen" ? "bg-secondary" : tone === "error" ? "bg-error" : "bg-tertiary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}
