"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API, setSession } from "@/lib/api";
import type { Role, User } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

const DEMOS = [
  { email: "maya@nexustrack.dev", role: "Admin", desc: "Full control" },
  { email: "jamal@nexustrack.dev", role: "Maintainer", desc: "Triage & triage lead" },
  { email: "priya@nexustrack.dev", role: "Developer", desc: "Code, internal notes & PRs" },
  { email: "sofia@nexustrack.dev", role: "Reporter", desc: "Filing & feedback" },
];

const ROLES: { role: Role; label: string; icon: string; desc: string }[] = [
  { role: "developer", label: "Developer", icon: "⚡", desc: "Fix issues, merge PRs & write internal notes" },
  { role: "maintainer", label: "Maintainer", icon: "🛡️", desc: "Triage incoming bugs & manage components" },
  { role: "admin", label: "Admin", icon: "👑", desc: "Full organization & workspace management" },
  { role: "reporter", label: "Reporter", icon: "📝", desc: "File bugs, test features & comment" },
  { role: "guest", label: "Guest", icon: "👁️", desc: "Read-only access to public issues" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  
  // Login states
  const [email, setEmail] = useState("maya@nexustrack.dev");
  const [password, setPassword] = useState("demo1234");
  
  // Register states
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<Role>("developer");
  
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");
      setSession(data.access_token, data.user as User);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          role: regRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      setSession(data.access_token, data.user as User);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left hero banner */}
      <section className="hidden lg:flex flex-col justify-between p-12 border-r border-[var(--line)] bg-[var(--bg-elev)]/50 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--accent-2)]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 relative z-10">
          <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-300 via-teal-400 to-indigo-500 grid place-items-center font-black text-black text-xl shadow-lg shadow-emerald-500/20">
            N
          </span>
          <div>
            <span className="text-xl font-bold tracking-tight">NexusTrack</span>
            <span className="text-[11px] text-[var(--accent)] block font-mono">v2026.1</span>
          </div>
        </div>

        <div className="relative z-10 my-auto py-12">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)] font-semibold mb-3">
            Reimagining Bugzilla for 2026
          </p>
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight text-white">
            Keep the rigor.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-indigo-300">
              Replace the ritual.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-sm text-[var(--muted)] leading-relaxed">
            Enterprise-grade issue lifecycle, immutable audit trail, and multi-field queries — paired with AI triage, real-time collaboration, and git-native developer workflows.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg">
            <div className="card p-3.5 border-white/5 bg-white/[0.02]">
              <div className="text-lg mb-1">⚡</div>
              <div className="text-xs font-semibold text-white">AI Duplicate Shield</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">Catches duplicate issues before they are submitted</div>
            </div>
            <div className="card p-3.5 border-white/5 bg-white/[0.02]">
              <div className="text-lg mb-1">🔒</div>
              <div className="text-xs font-semibold text-white">Server-Enforced RBAC</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">Strict state machine & hidden internal threads</div>
            </div>
            <div className="card p-3.5 border-white/5 bg-white/[0.02]">
              <div className="text-lg mb-1">📊</div>
              <div className="text-xs font-semibold text-white">Real-Time Pulse</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">Live presence, MTTR tracker & Kanban flow</div>
            </div>
            <div className="card p-3.5 border-white/5 bg-white/[0.02]">
              <div className="text-lg mb-1">🐙</div>
              <div className="text-xs font-semibold text-white">Git-Native Sync</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">PR merge hooks, CI status badges & auto-links</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--muted)] relative z-10 pt-4 border-t border-[var(--line)]">
          <span>Password for all demo accounts: <code className="text-[var(--accent)] font-mono">demo1234</code></span>
          <span className="flex items-center gap-1.5"><span className="dot-live" /> All systems live</span>
        </div>
      </section>

      {/* Right form section */}
      <section className="flex flex-col items-center justify-center p-6 md:p-12 relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="card w-full max-w-md p-6 md:p-8 space-y-6 anim-fade-in">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-xl p-1 bg-[var(--bg)] border border-[var(--line)]">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "login"
                  ? "bg-[var(--bg-soft)] text-white shadow-sm border border-[var(--line-bright)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "register"
                  ? "bg-[var(--accent)] text-black shadow-sm font-bold"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              + Create account
            </button>
          </div>

          {/* SIGN IN FORM */}
          {mode === "login" && (
            <form onSubmit={onLogin} className="space-y-4 anim-fade-in">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Welcome back</h2>
                <p className="text-xs text-[var(--muted)] mt-1">Sign in to your NexusTrack workspace</p>
              </div>

              <label className="block text-xs font-medium space-y-1.5">
                <span className="text-[var(--muted)]">Email address</span>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@company.dev"
                  required
                />
              </label>

              <label className="block text-xs font-medium space-y-1.5">
                <span className="text-[var(--muted)]">Password</span>
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                />
              </label>

              {error && (
                <div className="text-xs text-[var(--danger)] card p-3 border-[var(--danger-dim)] bg-[var(--danger-dim)]/20 anim-fade-in">
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary w-full py-2.5 text-sm font-semibold"
              >
                {busy ? <><span className="spinner" /> Signing in…</> : "Enter workspace →"}
              </button>

              <div className="pt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-2)] mb-2.5">
                  Quick demo login:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEMOS.map((d) => (
                    <button
                      type="button"
                      key={d.email}
                      onClick={() => { setEmail(d.email); setPassword("demo1234"); }}
                      className={`text-left rounded-xl border p-2.5 transition-all group ${
                        email === d.email
                          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                          : "border-[var(--line)] hover:border-[var(--line-bright)] hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white group-hover:text-[var(--accent)] transition-colors">
                          {d.role}
                        </span>
                        {email === d.email && <span className="text-[10px] text-[var(--accent)]">●</span>}
                      </div>
                      <div className="text-[10px] text-[var(--muted)] truncate mt-0.5">{d.email}</div>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === "register" && (
            <form onSubmit={onRegister} className="space-y-4 anim-fade-in">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Create an account</h2>
                <p className="text-xs text-[var(--muted)] mt-1">Choose your name, credentials, and access role</p>
              </div>

              <label className="block text-xs font-medium space-y-1.5">
                <span className="text-[var(--muted)]">Full name <span className="text-[var(--danger)]">*</span></span>
                <input
                  className="input"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  required
                />
              </label>

              <label className="block text-xs font-medium space-y-1.5">
                <span className="text-[var(--muted)]">Work email <span className="text-[var(--danger)]">*</span></span>
                <input
                  className="input"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  type="email"
                  placeholder="alex@nexustrack.dev"
                  required
                />
              </label>

              <label className="block text-xs font-medium space-y-1.5">
                <span className="text-[var(--muted)]">Password (min 6 chars) <span className="text-[var(--danger)]">*</span></span>
                <input
                  className="input"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  type="password"
                  minLength={6}
                  placeholder="••••••••"
                  required
                />
              </label>

              {/* Role Selection */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--muted)]">
                  Select Role & Permissions:
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ROLES.map((r) => {
                    const active = regRole === r.role;
                    return (
                      <div
                        key={r.role}
                        onClick={() => setRegRole(r.role)}
                        className={`cursor-pointer rounded-xl border p-2.5 transition-all flex items-start gap-2.5 ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-dim)] shadow-sm"
                            : "border-[var(--line)] hover:border-[var(--line-bright)] hover:bg-white/3"
                        }`}
                      >
                        <span className="text-base">{r.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white capitalize">{r.label}</span>
                            {active && <span className="pill bg-[var(--accent)] text-black text-[9px] font-black">SELECTED</span>}
                          </div>
                          <p className="text-[10.5px] text-[var(--muted)] leading-tight mt-0.5">{r.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="text-xs text-[var(--danger)] card p-3 border-[var(--danger-dim)] bg-[var(--danger-dim)]/20 anim-fade-in">
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary w-full py-2.5 text-sm font-semibold"
              >
                {busy ? <><span className="spinner" /> Creating account…</> : `Join as ${regRole.toUpperCase()} →`}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
