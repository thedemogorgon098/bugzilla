"use client";

import { PriorityBadge, SeverityBadge, StatusBadge, Avatar } from "@/components/Badges";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import type { Issue, Project } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

const STATUSES = ["", "NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "VERIFIED", "CLOSED", "REOPENED", "DUPLICATE", "WONTFIX", "CANNOT_REPRODUCE"];
const SEVERITIES = ["", "blocker", "critical", "major", "minor", "trivial"];

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (q) params.set("q", q);
    const data = await api<Issue[]>(`/issues?${params}`);
    setIssues(data);
    setLoading(false);
  }

  useEffect(() => {
    api<Project[]>("/projects").then((ps) => {
      setProjects(ps);
      if (ps[0]) setProjectId(String(ps[0].id));
    });
  }, []);

  useEffect(() => {
    if (projectId !== undefined) load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status, severity]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load().catch(() => undefined);
  }

  const statusCounts = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">{issues.length} issues</p>
        </div>
        <Link href="/issues/new" className="btn btn-primary text-sm">
          + New issue
        </Link>
      </div>

      {/* Filter bar */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="input input-select w-auto text-sm"
          style={{ width: "auto", minWidth: 160 }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input input-select text-sm"
          style={{ width: "auto", minWidth: 140 }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="input input-select text-sm"
          style={{ width: "auto", minWidth: 130 }}
        >
          {SEVERITIES.map((s) => <option key={s} value={s}>{s || "All severities"}</option>)}
        </select>
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 min-w-[200px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or description…"
            className="input text-sm flex-1"
          />
          <button type="submit" className="btn btn-ghost text-sm px-3">Search</button>
        </form>
      </div>

      {/* Quick status chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(statusCounts).sort(([,a],[,b]) => b - a).map(([s, n]) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`pill cursor-pointer transition-all ${status === s ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"}`}
          >
            {s.replaceAll("_", " ")} · {n}
          </button>
        ))}
      </div>

      {/* Issue table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="skeleton h-3 w-14" />
              <div className="skeleton h-3 flex-1" />
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-3 w-14" />
            </div>
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="card p-12 text-center text-[var(--muted)]">
          <div className="text-3xl mb-2">🔍</div>
          <p className="font-medium">No issues match your filters</p>
          <p className="text-sm mt-1">Try adjusting the filters above</p>
        </div>
      ) : (
        <div className="space-y-1">
          {issues.map((i, idx) => (
            <Link
              key={i.id}
              href={`/issues/${i.id}`}
              className="card flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group anim-fade-in"
              style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}
            >
              <span className="font-mono text-[11px] text-[var(--accent)] w-16 flex-shrink-0">{i.key}</span>
              <span className="flex-1 text-sm truncate group-hover:text-white transition-colors">{i.title}</span>
              {i.sla?.breached && (
                <span className="pill bg-[var(--danger-dim)] text-[var(--danger)] flex-shrink-0">SLA</span>
              )}
              {i.assignee && <Avatar name={i.assignee.name} avatar={i.assignee.avatar} size={22} />}
              <PriorityBadge value={i.priority} />
              <SeverityBadge value={i.severity} />
              <StatusBadge value={i.status} />
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
