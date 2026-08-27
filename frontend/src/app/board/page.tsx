"use client";

import { Shell } from "@/components/Shell";
import { Avatar, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Issue, Project } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

const COLS = ["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "VERIFIED", "CLOSED"] as const;

const COL_META: Record<string, { color: string; className: string; emoji: string }> = {
  NEW:         { color: "var(--status-new)",      className: "col-new",      emoji: "🆕" },
  TRIAGED:     { color: "var(--status-triaged)",  className: "col-triaged",  emoji: "🏷" },
  IN_PROGRESS: { color: "var(--status-progress)", className: "col-progress", emoji: "⚡" },
  IN_REVIEW:   { color: "var(--status-review)",   className: "col-review",   emoji: "👁" },
  RESOLVED:    { color: "var(--status-resolved)", className: "col-resolved", emoji: "✅" },
  VERIFIED:    { color: "var(--status-verified)", className: "col-verified", emoji: "🔍" },
  CLOSED:      { color: "var(--status-closed)",   className: "col-closed",   emoji: "🔒" },
};

export default function BoardPage() {
  const [board, setBoard] = useState<Record<string, Issue[]>>({});
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load(pid: number) {
    const data = await api<Record<string, Issue[]>>(`/issues/board?project_id=${pid}`);
    setBoard(data);
  }

  useEffect(() => {
    api<Project[]>("/projects")
      .then((ps) => {
        setProjects(ps);
        const id = ps[0]?.id;
        if (!id) return;
        setProjectId(id);
        return load(id);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const s = getSocket();
    s.emit("join_board");
    const reload = () => load(projectId);
    s.on("board_invalidate", reload);
    s.on("issue_updated", reload);
    return () => {
      s.off("board_invalidate", reload);
      s.off("issue_updated", reload);
    };
  }, [projectId]);

  async function onDrop(status: string, issue: Issue) {
    if (!projectId || status === issue.status) return;
    setBusyId(issue.id);
    setError("");
    try {
      await api(`/issues/${issue.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note: "Moved on board" }),
      });
      await load(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Illegal transition — server rejected");
    } finally {
      setBusyId(null);
    }
  }

  const totalIssues = COLS.reduce((a, c) => a + (board[c]?.length || 0), 0);

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Drag to change status · Illegal transitions rejected server-side · {totalIssues} issues
          </p>
        </div>
        <div className="flex items-center gap-3">
          {projects.length > 1 && (
            <select
              value={projectId || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setProjectId(id);
                load(id).catch(() => undefined);
              }}
              className="input input-select text-sm"
              style={{ width: "auto", minWidth: 160 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
              ))}
            </select>
          )}
          <Link href="/issues/new" className="btn btn-primary text-sm">+ New</Link>
        </div>
      </div>

      {error && (
        <div className="card p-3 mb-4 text-sm text-[var(--danger)] border-[var(--danger-dim)] anim-fade-in">
          ⚠ {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-6 scroll-x">
        {COLS.map((col) => {
          const meta = COL_META[col];
          const isOver = dragOver === col;
          const cards = board[col] || [];

          return (
            <div
              key={col}
              className={`min-w-[262px] w-[262px] rounded-2xl border p-3 flex flex-col gap-2 transition-all duration-200 ${meta.className} ${
                isOver
                  ? "bg-[var(--accent-dim)] border-[var(--accent)] scale-[1.01]"
                  : "bg-white/[0.02] border-[var(--line)]"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                setDragOver(null);
                const raw = e.dataTransfer.getData("issue");
                if (!raw) return;
                onDrop(col, JSON.parse(raw) as Issue);
              }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{meta.emoji}</span>
                  <h2
                    className="text-xs font-bold tracking-wide uppercase"
                    style={{ color: meta.color }}
                  >
                    {col.replaceAll("_", " ")}
                  </h2>
                </div>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: `${meta.color}22`, color: meta.color }}
                >
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[80px] flex-1">
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-xs text-[var(--muted-2)]">
                    {isOver ? "Drop here" : "Empty"}
                  </div>
                )}
                {cards.map((i) => (
                  <article
                    key={i.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("issue", JSON.stringify(i));
                      setDragId(i.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`card p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                      dragId === i.id ? "opacity-40 scale-95" : "hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg"
                    } ${busyId === i.id ? "animate-pulse" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Link
                        href={`/issues/${i.id}`}
                        className="font-mono text-[11px] text-[var(--accent)] hover:text-[var(--text)] transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {i.key}
                      </Link>
                      <PriorityBadge value={i.priority} />
                    </div>
                    <Link href={`/issues/${i.id}`} className="block text-xs leading-snug line-clamp-2 mb-2 hover:text-[var(--accent)] transition-colors">
                      {i.title}
                    </Link>
                    <div className="flex items-center justify-between">
                      <SeverityBadge value={i.severity} />
                      <div className="flex items-center gap-1.5">
                        {i.sla?.breached && (
                          <span className="pill bg-[var(--danger-dim)] text-[var(--danger)] text-[9px]">SLA</span>
                        )}
                        {i.ci_status === "success" && (
                          <span className="pill bg-[var(--ok-dim)] text-[var(--ok)] text-[9px]">CI ✓</span>
                        )}
                        {i.ci_status === "failure" && (
                          <span className="pill bg-[var(--danger-dim)] text-[var(--danger)] text-[9px]">CI ✗</span>
                        )}
                        {i.assignee && <Avatar name={i.assignee.name} avatar={i.assignee.avatar} size={20} />}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
