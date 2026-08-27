"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  LayoutDashboard,
  Kanban,
  Plus,
  Search,
  GitFork,
  LogOut,
  Command,
  List,
} from "lucide-react";
import { api, clearSession, getUser } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { User } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

type Notif = { id: number; message: string; issue_id?: number };

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const [notes, setNotes] = useState<Notif[]>([]);
  const [openNotes, setOpenNotes] = useState(false);
  const [palette, setPalette] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    api<{ unread: number; items: Notif[] }>("/notifications")
      .then((r) => {
        setUnread(r.unread);
        setNotes(r.items.slice(0, 15));
      })
      .catch(() => undefined);
  }, [router]);

  /* Real-time notification push via WebSocket */
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    // Listen for any notification event the server may emit
    const onNotif = (n: Notif) => {
      setUnread((u) => u + 1);
      setNotes((prev) => [n, ...prev].slice(0, 15));
    };
    s.on("notification", onNotif);
    return () => { s.off("notification", onNotif); };
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") { setPalette(false); setOpenNotes(false); setMobileNav(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/board",     label: "Board",      icon: Kanban },
      { href: "/issues",    label: "Issues",      icon: List },
      { href: "/search",    label: "Query",       icon: Search },
      { href: "/graph",     label: "Graph",       icon: GitFork },
      { href: "/issues/new", label: "New issue",  icon: Plus },
    ],
    [],
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] animate-pulse" />
          <p className="text-sm text-[var(--muted)]">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-0 z-40 md:static md:flex flex-col gap-5 border-r border-[var(--line)] bg-[var(--bg-elev)]/80 backdrop-blur-xl p-4 transition-transform ${
          mobileNav ? "flex" : "hidden md:flex"
        }`}
        style={{ maxWidth: 240 }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileNav(false)}>
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] grid place-items-center font-black text-black text-lg flex-shrink-0 shadow-lg shadow-[var(--accent)]/20">
            N
          </span>
          <div>
            <div className="font-bold tracking-tight text-[var(--text)]">NexusTrack</div>
            <div className="text-[10.5px] text-[var(--muted)]">Bugzilla, rebuilt</div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href) && n.href !== "/issues/new");
            const isNewIssue = n.href === "/issues/new";
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMobileNav(false)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  isNewIssue
                    ? "mt-2 btn btn-primary justify-center"
                    : active
                    ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20"
                    : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                <n.icon size={15} className="flex-shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Command palette trigger */}
        <button
          onClick={() => setPalette(true)}
          className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-all group"
        >
          <span className="flex items-center gap-2">
            <Command size={13} />
            <span className="group-hover:text-[var(--text)] transition-colors">Jump to…</span>
          </span>
          <kbd>⌘K</kbd>
        </button>

        {/* User footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] grid place-items-center text-black font-bold text-xs flex-shrink-0"
            >
              {user.avatar || user.name[0]}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text)] truncate">{user.name}</div>
              <div className="text-[10.5px] text-[var(--muted)] capitalize">{user.role}</div>
            </div>
          </div>
          <button
            aria-label="Sign out"
            onClick={() => { clearSession(); router.push("/login"); }}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)] transition-all"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileNav && (
        <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setMobileNav(false)} />
      )}

      {/* Main area */}
      <div className="min-h-screen flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-14 border-b border-[var(--line)] flex items-center justify-between px-4 md:px-6 gap-3 flex-shrink-0 bg-[var(--bg)]/80 backdrop-blur-sm sticky top-0 z-20">
          {/* Mobile hamburger */}
          <button
            className="md:hidden text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            onClick={() => setMobileNav(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          <div className="text-xs text-[var(--muted)] hidden md:block">
            NT · NexusTrack Core
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Dark/Light Mode Switcher */}
            <ThemeToggle />

            {/* Notifications */}
            <div className="relative">
              <button
                className="relative rounded-xl p-2 hover:bg-[var(--bg-hover)] transition-all text-[var(--muted)] hover:text-[var(--text)]"
                onClick={async () => {
                  setOpenNotes((v) => !v);
                  if (unread > 0) {
                    await api("/notifications/read", { method: "POST" });
                    setUnread(0);
                  }
                }}
                aria-label="Notifications"
              >
                <Bell size={17} />
                {unread > 0 && (
                  <span className="notif-badge">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {openNotes && (
                <div className="absolute right-0 top-full mt-2 w-80 card p-2 z-50 anim-fade-in">
                  <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide px-2 py-1.5 mb-1">
                    Notifications
                  </div>
                  {notes.length === 0 && (
                    <div className="text-sm text-[var(--muted)] p-3 text-center">
                      <div className="text-2xl mb-1">🔔</div>
                      No notifications yet
                    </div>
                  )}
                  {notes.map((n) => (
                    <Link
                      key={n.id}
                      href={n.issue_id ? `/issues/${n.issue_id}` : "/dashboard"}
                      className="block px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm transition-colors"
                      onClick={() => setOpenNotes(false)}
                    >
                      {n.message}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
