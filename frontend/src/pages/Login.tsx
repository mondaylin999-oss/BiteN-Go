// ===========================================================================
//  Login.tsx — the way into all four portals.
//  Students can also create their own account here; staff accounts (agent,
//  transport agent, admin) are created by the administrator.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Bus, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { useAuth, homePathFor } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

const DEMO_LOGINS = [
  { username: "admin", label: "Administrator" },
  { username: "agent01", label: "Canteen agent" },
  { username: "driver01", label: "Transport agent" },
  { username: "student01", label: "Student" },
];

export default function Login() {
  const { login, register, health, error: connectionError, refresh } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const user =
        mode === "login"
          ? await login(username.trim(), password)
          : await register({ name: name.trim(), username: username.trim() || undefined, email: email.trim() || undefined, password });
      navigate(homePathFor(user.role));
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-gutter py-10 lg:flex-row lg:items-center lg:gap-16 lg:px-container-margin">
        {/* ---------- brand panel ---------- */}
        <section className="flex-1">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-on-primary">
              <UtensilsCrossed className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-headline-lg font-bold tracking-[-0.02em] text-on-surface">BiteN Go</h1>
              <p className="text-[13px] uppercase tracking-wider text-on-surface-variant">Smart canteen &amp; ferry bus</p>
            </div>
          </div>

          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-on-surface-variant">
            Pre-order lunch before the kitchen closes its window, keep a campus wallet in kyat, and book a seat on the ferry bus —
            all on one account, all kept on your own computer.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="card card-pad">
              <span className="chip bg-secondary-container text-on-secondary-container">Canteen</span>
              <p className="mt-3 text-[14px] text-on-surface-variant">
                Menus, pre-order window, kitchen display board and cash-or-wallet payment.
              </p>
            </div>
            <div className="card card-pad">
              <span className="chip bg-tertiary-container text-on-tertiary-container">Ferry</span>
              <p className="mt-3 text-[14px] text-on-surface-variant">A seat for the whole month, the daily timetable, and the road drawn on a real map.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px] text-on-surface-variant">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {health ? "Server ready" : "Server not answering"}
            </span>
            {health?.myanmarTime ? (
              <span className="tabular inline-flex items-center gap-2">
                <Bus className="h-4 w-4" />
                {health.myanmarTime} Yangon
              </span>
            ) : null}
          </div>
        </section>

        {/* ---------- form ---------- */}
        <section className="w-full lg:max-w-md">
          <div className="card p-6">
            <div className="mb-5 flex rounded-lg bg-surface-container-low p-1">
              {(["login", "register"] as const).map(value => (
                <button
                  key={value}
                  className={`flex-1 rounded-[6px] px-3 py-2 text-[14px] font-semibold transition-colors ${
                    mode === value ? "bg-surface-container-lowest text-on-surface shadow-card" : "text-on-surface-variant"
                  }`}
                  onClick={() => {
                    setMode(value);
                    setMessage(null);
                  }}
                  type="button"
                >
                  {value === "login" ? "Sign in" : "New student"}
                </button>
              ))}
            </div>

            {connectionError ? (
              <div className="mb-4">
                <ErrorNote message={connectionError} onRetry={() => void refresh()} />
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={submit}>
              {mode === "register" ? (
                <>
                  <Field label="Full name">
                    <Input value={name} onChange={event => setName(event.target.value)} required minLength={2} placeholder="Aye Aye" autoComplete="name" />
                  </Field>
                  <Field label="Email (optional)">
                    <Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ayeaye@campus.edu" autoComplete="email" />
                  </Field>
                </>
              ) : null}

              <Field label="Username" hint={mode === "register" ? "Leave empty and one will be made from your name." : undefined}>
                <Input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  required={mode === "login"}
                  placeholder="student01"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={mode === "register" ? 6 : 1}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </Field>

              {message ? <p className="rounded-lg bg-error-container px-3 py-2 text-[13px] font-medium text-on-error-container">{message}</p> : null}

              <Button type="submit" className="w-full" busy={busy}>
                {mode === "login" ? "Sign in" : "Create my student account"}
              </Button>
            </form>

            {mode === "login" ? (
              <div className="mt-5 border-t border-outline-variant pt-4">
                <p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">Starter accounts (password: biten123)</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {DEMO_LOGINS.map(demo => (
                    <button
                      key={demo.username}
                      type="button"
                      className="rounded-lg border border-outline-variant px-3 py-2 text-left transition-colors hover:bg-surface-container-high"
                      onClick={() => {
                        setUsername(demo.username);
                        setPassword("biten123");
                      }}
                    >
                      <span className="tabular block text-[13px] font-semibold text-on-surface">{demo.username}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant">{demo.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
