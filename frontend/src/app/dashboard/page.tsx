"use client";

import { Shell } from "@/components/Shell";
import { Avatar, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { api, API, getToken } from "@/lib/api";
import type { Dashboard, Issue, Project } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Flame,
  GitFork,
  Kanban,
  ListOrdered,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

/* ── Animated KPI card ─────────────────────────────── */
function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  badge,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  icon?: React.ElementType;
  badge?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const isNum = typeof value === "number";

  useEffect(() => {
    if (!isNum) return;
    const target = value as number;
    const step = Math.max(1, Math.ceil(target / 25));
    let cur = 0;
    const iv = setInterval(() => {
      cur = Math.min(cur + step, target);
      setDisplayed(cur);
      if (cur >= target) clearInterval(iv);
    }, 25);
    return () => clearInterval(iv);
  }, [value, isNum]);

  return (
    <div className="card p-5 flex flex-col justify-between gap-3 anim-fade-in hover:border-[var(--line-bright)] transition-all group relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.015] rounded-full blur-xl pointer-events-none group-hover:bg-white/[0.04] transition-all" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="p-1.5 rounded-lg bg-white/5 text-[var(--muted)] group-hover:text-white transition-colors">
              <Icon size={15} />
            </span>
          )}
          <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">{label}</span>
        </div>
        {badge && (
          <span className="pill bg-white/5 text-[10px] text-[var(--accent)] font-mono">{badge}</span>
        )}
      </div>

      <div
        className="text-4xl font-extrabold tracking-tight anim-count"
        style={{ color: color || "var(--text)" }}
      >
        {isNum ? displayed : value}
      </div>

      {sub && <div className="text-xs text-[var(--muted-2)] font-medium">{sub}</div>}
    </div>
  );
}

/* ── Animated horizontal bar ───────────────────────── */
function AnimBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1.5" data-tooltip={`${value} issues`}>
      <div className="flex justify-between text-xs">
        <span className="capitalize text-[var(--muted)] font-medium">{label.replaceAll("_", " ")}</span>
        <span className="font-mono font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full origin-left"
          style={{
            width: `${pct}%`,
            background: color,
            animation: "bar-grow 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        />
      </div>
    </div>
  );
}

/* ── SVG trend chart ───────────────────────────────── */
function TrendChart({ data }: { data: { date: string; opened: number; closed: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxVal = Math.max(...data.flatMap((d) => [d.opened, d.closed]), 1);
  const H = 120, W = 100;
  const pts = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * W,
    open: H - (d.opened / maxVal) * H,
    close: H - (d.closed / maxVal) * H,
    ...d,
  }));

  const polyline = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${H + 10}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={0} y1={H * t} x2={W} y2={H * t} stroke="#1e2535" strokeWidth="0.5" />
        ))}
        {/* closed area */}
        <polyline
          points={polyline(pts.map((p) => ({ x: p.x, y: p.close })))}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* opened area */}
        <polyline
          points={polyline(pts.map((p) => ({ x: p.x, y: p.open })))}
          fill="none"
          stroke="var(--accent-2)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* hover dots */}
        {hover !== null && pts[hover] && (
          <>
            <circle cx={pts[hover].x} cy={pts[hover].close} r="2.5" fill="var(--ok)" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover].x} cy={pts[hover].open} r="2.5" fill="var(--accent-2)" vectorEffect="non-scaling-stroke" />
            <line x1={pts[hover].x} y1={0} x2={pts[hover].x} y2={H} stroke="#3b4861" strokeWidth="0.75" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {/* invisible hover targets */}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - W / data.length / 2}
            y={0}
            width={W / data.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && pts[hover] && (
        <div
          className="absolute top-0 card px-2.5 py-1.5 text-xs pointer-events-none z-10 shadow-xl border-[var(--line-bright)]"
          style={{ left: `${(pts[hover].x / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          <div className="text-[var(--muted)] text-[10px] font-mono">{pts[hover].date}</div>
          <div className="flex gap-3 font-semibold text-xs mt-0.5">
            <span style={{ color: "var(--ok)" }}>▲ {pts[hover].closed} closed</span>
            <span style={{ color: "var(--accent-2)" }}>▼ {pts[hover].opened} opened</span>
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-5 text-[11px] text-[var(--muted)]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-1 bg-[var(--ok)] rounded-full" /> Closed issues</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-1 bg-[var(--accent-2)] rounded-full" /> Opened issues</span>
      </div>
    </div>
  );
}

/* ── CFD stacked columns ───────────────────────────── */
const CFD_COLORS = ["#5a6a80", "#6b93ff", "#60b8ff", "#a78bfa", "#3dd68c", "#2ed8b4"];
const CFD_STATUS_LABELS = ["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "CLOSED"];

function CfdChart({ data }: { data: Record<string, string | number>[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;

  return (
    <div className="relative">
      <div className="flex items-end gap-1 h-44 overflow-hidden pt-2">
        {data.map((row, i) => {
          const vals = CFD_STATUS_LABELS.map((k) => Number(row[k] || 0));
          const sum = vals.reduce((a, v) => a + v, 0) || 1;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col-reverse h-full cursor-pointer relative transition-opacity rounded-t-sm"
              style={{ opacity: hover === null || hover === i ? 1 : 0.35 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {vals.map((v, j) => (
                <div
                  key={j}
                  style={{
                    height: `${(v / sum) * 100}%`,
                    background: CFD_COLORS[j],
                    opacity: 0.9,
                    minHeight: v > 0 ? 2 : 0,
                    transition: "height 0.4s ease",
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      {hover !== null && data[hover] && (
        <div className="mt-2.5 card p-2.5 text-xs flex flex-wrap gap-x-4 gap-y-1.5 anim-fade-in border-[var(--line-bright)]">
          <span className="text-[var(--text)] font-mono font-semibold text-[11px]">{String(data[hover].date)}</span>
          {CFD_STATUS_LABELS.map((k, j) => (
            <span key={k} style={{ color: CFD_COLORS[j] }} className="font-medium">
              {k.replaceAll("_", " ")}: {data[hover][k] ?? 0}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {CFD_STATUS_LABELS.map((k, j) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CFD_COLORS[j] }} />
            {k.replaceAll("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Severity donut ────────────────────────────────── */
const SEV_COLORS: Record<string, string> = {
  blocker: "var(--sev-blocker)",
  critical: "var(--sev-critical)",
  major: "var(--sev-major)",
  minor: "var(--sev-minor)",
  trivial: "var(--sev-trivial)",
};

function SeverityDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  let offset = 0;
  const R = 40, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * R;
  const gaps: { key: string; value: number; color: string; stroke: number; dashOffset: number }[] = [];
  for (const [key, value] of entries) {
    const pct = value / total;
    gaps.push({ key, value, color: SEV_COLORS[key] || "#5a6a80", stroke: pct * circumference, dashOffset: -offset * circumference });
    offset += pct;
  }

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--bg-soft)" strokeWidth="14" />
        {gaps.map((g) => (
          <circle
            key={g.key}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={g.color}
            strokeWidth="14"
            strokeDasharray={`${g.stroke} ${circumference - g.stroke}`}
            strokeDashoffset={g.dashOffset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.5s ease" }}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text)">{total}</text>
      </svg>
      <div className="space-y-2 flex-1">
        {gaps.map((g) => (
          <div key={g.key} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
              <span className="capitalize text-[var(--muted)] font-medium">{g.key}</span>
            </span>
            <span className="font-mono font-bold" style={{ color: g.color }}>{g.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Issue list card ───────────────────────────────── */
function IssueList({ title, items, warn }: { title: string; items: Issue[]; warn?: boolean }) {
  return (
    <div className="card p-5 flex flex-col justify-between">
      <div>
        <h2 className="font-bold text-sm mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            {warn && <AlertTriangle size={15} className="text-[var(--danger)]" />}
            {title}
          </span>
          <span className="pill bg-white/5 text-[var(--muted)] normal-case text-[10px]">{items.length}</span>
        </h2>
        <div className="space-y-1.5">
          {items.length === 0 && <p className="text-xs text-[var(--muted)] py-3 text-center">No issues matching criteria 🎉</p>}
          {items.slice(0, 6).map((i) => (
            <Link key={i.id} href={`/issues/${i.id}`} className="flex items-center gap-2.5 rounded-xl p-2.5 hover:bg-white/5 transition-colors group">
              <span className="font-mono text-[11px] text-[var(--accent)] w-16 flex-shrink-0">{i.key}</span>
              <span className="flex-1 text-xs truncate group-hover:text-white transition-colors">{i.title}</span>
              {warn && i.sla?.breached && <span className="pill bg-[var(--danger-dim)] text-[var(--danger)] flex-shrink-0 text-[9px]">BREACH</span>}
              <PriorityBadge value={i.priority} />
              <SeverityBadge value={i.severity} />
              <StatusBadge value={i.status} />
            </Link>
          ))}
        </div>
      </div>
      {items.length > 6 && (
        <div className="pt-3 mt-2 border-t border-[var(--line)] text-right">
          <Link href="/issues" className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-medium">
            View all ({items.length}) <ArrowUpRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard Page ────────────────────────────── */
export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api<Project[]>("/projects")
      .then((ps) => setProjects(ps))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const url = projectId ? `/dashboard?project_id=${projectId}` : "/dashboard";
    api<Dashboard>(url).then(setData).catch((e) => setErr(String(e.message || e)));
  }, [projectId]);

  async function exportCsv() {
    setExporting(true);
    try {
      const url = projectId ? `${API}/dashboard/export.csv?project_id=${projectId}` : `${API}/dashboard/export.csv`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "nexustrack-issues.csv";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Shell>
      {/* Top Header & Project Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Team Pulse</h1>
            <span className="pill bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-bold">LIVE</span>
          </div>
          <p className="text-xs md:text-sm text-[var(--muted)] mt-1">
            Real-time telemetry · MTTR breakdown · Cumulative flow · SLA monitoring
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input input-select text-xs font-medium"
              style={{ width: "auto", minWidth: 170 }}
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>
          )}

          <Link href="/issues/new" className="btn btn-primary text-xs py-2">
            <Plus size={14} /> File Issue
          </Link>

          <button
            onClick={exportCsv}
            disabled={exporting}
            className="btn btn-ghost text-xs py-2"
          >
            {exporting ? <span className="spinner" /> : <Download size={14} />} Export CSV
          </button>
        </div>
      </div>

      {/* Quick Access Shortcuts Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Link
          href="/board"
          className="card p-3.5 flex items-center gap-3 hover:border-[var(--accent)] hover:bg-white/[0.03] transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] grid place-items-center flex-shrink-0">
            <Kanban size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-[var(--accent)] transition-colors">Kanban Board</div>
            <div className="text-[10.5px] text-[var(--muted)]">Drag & drop workflow</div>
          </div>
        </Link>

        <Link
          href="/issues"
          className="card p-3.5 flex items-center gap-3 hover:border-[var(--accent-2)] hover:bg-white/[0.03] transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-2-dim)] text-[var(--accent-2)] grid place-items-center flex-shrink-0">
            <ListOrdered size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-[var(--accent-2)] transition-colors">Issue Registry</div>
            <div className="text-[10.5px] text-[var(--muted)]">Filtered bug lists</div>
          </div>
        </Link>

        <Link
          href="/search"
          className="card p-3.5 flex items-center gap-3 hover:border-[var(--purple)] hover:bg-white/[0.03] transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--purple-dim)] text-[var(--purple)] grid place-items-center flex-shrink-0">
            <Search size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-[var(--purple)] transition-colors">Query Builder</div>
            <div className="text-[10.5px] text-[var(--muted)]">Boolean chart queries</div>
          </div>
        </Link>

        <Link
          href="/graph"
          className="card p-3.5 flex items-center gap-3 hover:border-[var(--warn)] hover:bg-white/[0.03] transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--warn-dim)] text-[var(--warn)] grid place-items-center flex-shrink-0">
            <GitFork size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-[var(--warn)] transition-colors">Dependency Map</div>
            <div className="text-[10.5px] text-[var(--muted)]">Blockers & graph view</div>
          </div>
        </Link>
      </div>

      {err && <p className="text-[var(--danger)] text-sm mb-4 card p-3 border-[var(--danger-dim)]">⚠ {err}</p>}

      {!data && !err && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Active Open Issues"
              value={data.totals.open}
              sub={`${data.totals.closed} resolved / closed all-time`}
              color="var(--accent-2)"
              icon={Flame}
              badge="IN FLIGHT"
            />
            <KpiCard
              label="Resolution Rate"
              value={`${data.totals.resolution_rate ?? 0}%`}
              sub="Closed vs total filed issues"
              color="var(--ok)"
              icon={CheckCircle2}
              badge="HEALTH"
            />
            <KpiCard
              label="Weekly Velocity"
              value={data.velocity}
              sub="Avg closed issues per day (7d)"
              color="var(--accent)"
              icon={Zap}
              badge="SPEED"
            />
            <KpiCard
              label="MTTR (Resolution)"
              value={`${data.mttr_hours}h`}
              sub="Avg hours to resolve blocker/bug"
              color="var(--warn)"
              icon={Clock}
              badge="EFFICIENCY"
            />
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            {/* Severity donut */}
            <div className="card p-5">
              <h2 className="font-bold text-sm mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                  Severity Distribution
                </span>
                <span className="text-[10px] text-[var(--muted)]">By priority level</span>
              </h2>
              <SeverityDonut data={data.by_severity} />
            </div>

            {/* Status breakdown */}
            <div className="card p-5 space-y-3">
              <h2 className="font-bold text-sm mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-2)]" />
                  Lifecycle Status
                </span>
                <span className="text-[10px] text-[var(--muted)]">Server state machine</span>
              </h2>
              {Object.entries(data.by_status).map(([k, v]) => (
                <AnimBar
                  key={k}
                  label={k}
                  value={v}
                  max={Math.max(...Object.values(data.by_status), 1)}
                  color="var(--accent-2)"
                />
              ))}
            </div>

            {/* Trend chart */}
            <div className="card p-5">
              <h2 className="font-bold text-sm mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--ok)]" />
                  Daily Throughput (14d)
                </span>
                <span className="text-[10px] text-[var(--muted)]">Opened vs Closed</span>
              </h2>
              <TrendChart data={data.trend} />
            </div>
          </div>

          {/* Cumulative Flow Diagram (CFD) */}
          <div className="card p-5 mb-4">
            <h2 className="font-bold text-sm mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--purple)]" />
                Cumulative Flow Diagram (14d)
              </span>
              <span className="text-[11px] text-[var(--muted)] font-normal hidden sm:inline">
                Hover columns to inspect state volumes
              </span>
            </h2>
            <CfdChart data={data.cfd} />
          </div>

          {/* Team Workload & Leaderboard */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* Engineer Workload */}
            <div className="card p-5">
              <h2 className="font-bold text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users size={16} className="text-[var(--accent)]" />
                  Engineer Workload Distribution
                </span>
                <span className="text-[10.5px] text-[var(--muted)]">Assigned open bugs</span>
              </h2>

              <div className="space-y-2">
                {(!data.workload || data.workload.length === 0) && (
                  <p className="text-xs text-[var(--muted)] py-3 text-center">No assigned open issues</p>
                )}
                {data.workload?.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-[var(--line)] hover:border-[var(--line-bright)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={w.name} avatar={w.avatar} size={26} />
                      <div>
                        <div className="text-xs font-semibold text-white">{w.name}</div>
                        <div className="text-[10px] text-[var(--muted)] capitalize">{w.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden hidden sm:block">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{
                            width: `${Math.min((w.count / Math.max(...(data.workload?.map((x) => x.count) || [1]), 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="pill bg-[var(--accent-dim)] text-[var(--accent)] font-mono text-[10px]">
                        {w.count} open
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reporter Leaderboard */}
            <div className="card p-5">
              <h2 className="font-bold text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-[var(--accent-2)]" />
                  Top Bug Reporters
                </span>
                <span className="text-[10.5px] text-[var(--muted)]">All-time filed</span>
              </h2>

              <div className="grid sm:grid-cols-2 gap-2">
                {data.leaderboard.map((r, i) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between card p-2.5 bg-white/[0.02] border-[var(--line)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[var(--muted-2)] font-bold w-5">
                        #{i + 1}
                      </span>
                      <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                        {r.name}
                      </span>
                    </div>
                    <span className="pill bg-white/5 text-[var(--muted)] text-[10px] font-mono">
                      {r.count} bugs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SLA Breaches & Assigned to Me */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <IssueList title="My Assigned Issues" items={data.mine} />
            <IssueList title="SLA Breaches / Stale Issues" items={data.stale} warn />
          </div>

          {/* Recent Live Activity Stream */}
          {data.recent && data.recent.length > 0 && (
            <div className="card p-5 mb-4">
              <h2 className="font-bold text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--purple)]" />
                  Recent Activity Stream
                </span>
                <span className="text-[10.5px] text-[var(--muted)]">Last updated issues</span>
              </h2>
              <div className="space-y-1.5">
                {data.recent.slice(0, 5).map((i) => (
                  <Link
                    key={i.id}
                    href={`/issues/${i.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                  >
                    <span className="font-mono text-[11px] text-[var(--accent)] w-16 flex-shrink-0">{i.key}</span>
                    <span className="flex-1 text-xs truncate group-hover:text-white transition-colors">{i.title}</span>
                    {i.assignee && <Avatar name={i.assignee.name} avatar={i.assignee.avatar} size={22} />}
                    <PriorityBadge value={i.priority} />
                    <SeverityBadge value={i.severity} />
                    <StatusBadge value={i.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
