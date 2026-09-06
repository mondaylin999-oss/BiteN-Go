// ===========================================================================
//  Login.tsx — the way in.
//
//  TWO DOORS, ONE FORM
//  -------------------
//  "/"        the public door. Students sign in or create an account. It says
//             nothing about staff: no roles, no job titles, no sample logins.
//  "/admin"   the staff door — also /agent and /driver. Same form, different
//             heading, and no "create an account" tab, because staff accounts
//             are made by the office rather than self-served.
//
//  The staff door is NOT a security boundary; it only keeps staff wording out
//  of the public page. Who may see what is decided by the server on every
//  request, and by the role gate in App.tsx.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Bus, Lock, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { useAuth, homePathFor } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

/** The paths that mean "someone from the campus team is signing in". */
const STAFF_PATHS = ["/admin", "/agent", "/driver"];

export default function Login() {
  const { login, register, health, error: connectionError, refresh } = useAuth();
  const [location, navigate] = useLocation();
  const staffDoor = STAFF_PATHS.includes(location);

  // Only the public door offers account creation.
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const registering = !staffDoor && mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const user = registering
        ? await register({ name: name.trim(), username: username.trim() || undefined, email: email.trim() || undefined, password })
        : await login(username.trim(), password);
      navigate(homePathFor(user.role));
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <div className="card p-6">
      {staffDoor ? (
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-headline-md font-bold leading-tight text-on-surface">Campus team sign in</h2>
            <p className="text-[13px] text-on-surface-variant">Use the account the office gave you.</p>
          </div>
        </div>
      ) : (
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
              {value === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      {connectionError ? (
        <div className="mb-4">
          <ErrorNote message={connectionError} onRetry={() => void refresh()} />
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={submit}>
        {registering ? (
          <>
            <Field label="Full name">
              <Input value={name} onChange={event => setName(event.target.value)} required minLength={2} placeholder="Aye Aye" autoComplete="name" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ayeaye@campus.edu" autoComplete="email" />
            </Field>
          </>
        ) : null}

        <Field label="Username" hint={registering ? "Leave empty and one will be made from your name." : undefined}>
          <Input
            value={username}
            onChange={event => setUsername(event.target.value)}
            required={!registering}
            placeholder={staffDoor ? "your username" : "student01"}
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
            minLength={registering ? 6 : 1}
            placeholder="••••••••"
            autoComplete={registering ? "new-password" : "current-password"}
          />
        </Field>

        {message ? <p className="rounded-lg bg-error-container px-3 py-2 text-[13px] font-medium text-on-error-container">{message}</p> : null}

        <Button type="submit" className="w-full" busy={busy}>
          {registering ? "Create my account" : "Sign in"}
        </Button>
      </form>

      {staffDoor ? (
        <p className="mt-4 border-t border-outline-variant pt-4 text-[13px] text-on-surface-variant">
          Looking for the student app?{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => navigate("/")}>
            Go to BiteN Go
          </button>
        </p>
      ) : null}
    </div>
  );

  // The staff door is a plain, quiet page — no marketing, nothing to explore.
  if (staffDoor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-gutter py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-headline-md font-bold tracking-[-0.02em] text-on-surface">BiteN Go</span>
          </div>
          {form}
        </div>
      </div>
    );
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
            all on one account.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="card card-pad">
              <span className="chip bg-secondary-container text-on-secondary-container">Canteen</span>
              <p className="mt-3 text-[14px] text-on-surface-variant">Today's menu, pre-order before the window closes, pay by wallet or cash.</p>
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
        <section className="w-full lg:max-w-md">{form}</section>
      </div>
    </div>
  );
}
