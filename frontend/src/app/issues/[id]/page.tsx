"use client";

import { Avatar, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { Shell } from "@/components/Shell";
import { API, api, getToken, getUser } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Comment, GraphPayload, HistoryEvent, Investigation, Issue, User } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "comments" | "activity" | "graph" | "files";

const STATUS_COLORS: Record<string, string> = {
  blocks: "var(--danger)", related: "var(--accent-2)", duplicates: "var(--warn)",
};

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const me = getUser();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [files, setFiles] = useState<{ id: number; filename: string; url: string; is_patch: boolean; size: number; content_type: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [watching, setWatching] = useState(false);
  const [viewers, setViewers] = useState<{ id?: number; name?: string; avatar?: string; typing?: boolean }[]>([]);
  const [tab, setTab] = useState<Tab>("comments");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [depFrom, setDepFrom] = useState<string>("");
  const [depType, setDepType] = useState("blocks");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [iss, cm, hist, deps, atts, watch] = await Promise.all([
      api<Issue>(`/issues/${id}`),
      api<Comment[]>(`/issues/${id}/comments`),
      api<HistoryEvent[]>(`/issues/${id}/history`),
      api<GraphPayload>(`/issues/${id}/dependencies`),
      api<{ id: number; filename: string; url: string; is_patch: boolean; size: number; content_type: string }[]>(`/issues/${id}/attachments`),
      api<{ watching: boolean }>(`/issues/${id}/watch`),
    ]);
    setIssue(iss);
    setComments(cm);
    setHistory(hist);
    setGraph(deps);
    setFiles(atts);
    setWatching(watch.watching);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(String(e.message || e)));
    api<User[]>("/users").then(setUsers).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    s.emit("join_issue", { issue_id: id });
    const onPresence = (p: { issue_id: number; viewers: typeof viewers }) => {
      if (p.issue_id === id) setViewers(p.viewers || []);
    };
    const onIssue = (p: Issue & { investigation?: Investigation }) => {
      if (p.id === id) setIssue((current) => current ? { ...current, ...p } : p);
    };
    const onInvestigation = (p: { id: number; investigation: Investigation }) => {
      if (p.id === id) setIssue((current) => current ? { ...current, investigation: p.investigation } : current);
    };
    const onComment = (c: Comment) => {
      if (c.issue_id === id) setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    };
    s.on("presence", onPresence);
    s.on("issue_updated", onIssue);
    s.on("investigation_updated", onInvestigation);
    s.on("comment_added", onComment);
    return () => {
      s.emit("leave_issue", { issue_id: id });
      s.off("presence", onPresence);
      s.off("issue_updated", onIssue);
      s.off("investigation_updated", onInvestigation);
      s.off("comment_added", onComment);
    };
  }, [id]);

  const typing = viewers.filter((v) => v.typing && v.id !== me?.id);
  const canInternal = me && ["admin", "maintainer", "developer"].includes(me.role);

  async function transition(status: string) {
    setBusy(status);
    setError("");
    try {
      const next = await api<Issue>(`/issues/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note: `Moved to ${status}` }),
      });
      setIssue(next);
      setHistory(await api<HistoryEvent[]>(`/issues/${id}/history`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Illegal transition");
    } finally {
      setBusy("");
    }
  }

  async function assign(assignee_id: number) {
    const next = await api<Issue>(`/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee_id: assignee_id || null }),
    });
    setIssue(next);
  }

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const c = await api<Comment>(`/issues/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, is_internal: internal }),
    });
    setComments((prev) => [...prev, c]);
    setBody("");
    getSocket().emit("typing", { issue_id: id, typing: false });
  }

  async function summarize() {
    setBusy("sum");
    const r = await api<{ summary: string }>(`/ai/issues/${id}/summarize`, { method: "POST" });
    setIssue((iss) => (iss ? { ...iss, summary: r.summary } : iss));
    setBusy("");
  }

  async function investigate() {
    setBusy("investigate");
    setError("");
    try {
      const next = await api<Investigation>(`/ai/issues/${id}/investigate`, { method: "POST" });
      setIssue((iss) => iss ? { ...iss, investigation: next } : iss);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation could not start");
    } finally {
      setBusy("");
    }
  }

  async function simulatePr() {
    setBusy("pr");
    try {
      const next = await api<Issue>(`/integrations/github/demo-merge/${id}`, { method: "POST" });
      setIssue(next);
      setHistory(await api<HistoryEvent[]>(`/issues/${id}/history`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "PR simulation failed");
    } finally {
      setBusy("");
    }
  }

  async function addDependency() {
    if (!depFrom) return;
    setError("");
    try {
      await api(`/issues/${id}/dependencies`, {
        method: "POST",
        body: JSON.stringify({ depends_on_issue_id: Number(depFrom), type: depType }),
      });
      const deps = await api<GraphPayload>(`/issues/${id}/dependencies`);
      setGraph(deps);
      setDepFrom("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link dependency");
    }
  }

  async function uploadFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    setError("");
    try {
      const res = await fetch(`${API}/issues/${id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        let msg = "Upload rejected (type or size)";
        try {
          const errData = await res.json();
          msg = errData.detail || msg;
        } catch {
          /* ignore */
        }
        setError(msg);
        return;
      }
      setFiles(await api(`/issues/${id}/attachments`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "File upload failed");
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  const threads = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);

  if (!issue && !error) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="skeleton h-7 w-1/2" />
          <div className="skeleton h-4 w-1/4" />
          <div className="grid lg:grid-cols-[1fr_300px] gap-6 mt-4">
            <div className="space-y-3">
              <div className="skeleton h-36" style={{ borderRadius: 14 }} />
              <div className="skeleton h-24" style={{ borderRadius: 14 }} />
            </div>
            <div className="space-y-3">
              <div className="skeleton h-28" style={{ borderRadius: 14 }} />
            </div>
          </div>
        </div>
      </Shell>
    );
  }
  if (!issue) {
    return <Shell><p className="text-[var(--danger)]">{error}</p></Shell>;
  }

  return (
    <Shell>
      {/* Breadcrumb + title */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-1.5">
            <Link href="/board" className="hover:text-white transition-colors">Board</Link>
            <span>/</span>
            <Link href="/issues" className="hover:text-white transition-colors">Issues</Link>
            <span>/</span>
            <span className="font-mono text-[var(--accent)]">{issue.key}</span>
            {issue.sla?.breached && (
              <span className="pill bg-[var(--danger-dim)] text-[var(--danger)]">SLA breach</span>
            )}
            {issue.ci_status && (
              <span className={`pill ${issue.ci_status === "success" ? "bg-[var(--ok-dim)] text-[var(--ok)]" : issue.ci_status === "failure" ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-white/5 text-[var(--muted)]"}`}>
                CI {issue.ci_status}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-snug">{issue.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge value={issue.status} />
            <SeverityBadge value={issue.severity} />
            <PriorityBadge value={issue.priority} />
            <span className="pill bg-white/5 text-[var(--muted)]">{issue.type}</span>
            {issue.labels.split(",").filter(Boolean).map((l) => (
              <span key={l} className="pill bg-white/5 text-[var(--muted)]">{l}</span>
            ))}
          </div>
        </div>
        {/* Live viewers */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {viewers.length > 0 && (
            <>
              <div className="flex -space-x-1.5">
                {viewers.slice(0, 5).map((v, i) => (
                  <Avatar key={`${v.id}-${i}`} name={v.name || "?"} avatar={v.avatar || "?"} size={28} />
                ))}
              </div>
              <span className="text-xs text-[var(--muted)]">
                <span className="dot-live inline-block mr-1" />{viewers.length} viewing
              </span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="card p-3 mb-4 text-sm text-[var(--danger)] border-[var(--danger-dim)] anim-fade-in">⚠ {error}</div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Main column */}
        <div className="space-y-4 min-w-0">
          {/* TL;DR summary */}
          {issue.summary && (
            <div className="card p-4 border-[var(--accent)]/20 bg-[var(--accent-dim)]/20 anim-fade-in">
              <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-1.5 font-semibold flex items-center gap-1.5">
                <span>✦</span> TL;DR — AI generated
              </div>
              <p className="text-sm leading-relaxed">{issue.summary}</p>
            </div>
          )}

          {/* AI root-cause investigation */}
          <div className="card p-5 border-[var(--accent-2)]/30 bg-[var(--accent-2)]/5 anim-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--accent-2)] font-semibold">AI Investigation</div>
                <h2 className="text-lg font-semibold mt-1">Root cause intelligence</h2>
              </div>
              <button onClick={investigate} disabled={busy === "investigate" || issue.investigation?.status === "running"} className="btn btn-accent2 text-xs">
                {busy === "investigate" ? <><span className="spinner" /> Starting…</> : "Run investigation"}
              </button>
            </div>
            {!issue.investigation && <p className="text-sm text-[var(--muted)]">Investigation is queued when a bug is created.</p>}
            {issue.investigation && issue.investigation.status !== "completed" && (
              <p className="text-sm text-[var(--muted)]">Status: <span className="text-white">{issue.investigation.status}</span>{issue.investigation.error ? ` — ${issue.investigation.error}` : ""}</p>
            )}
            {issue.investigation?.status === "completed" && issue.investigation.report && (() => {
              const report = issue.investigation.report;
              return <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-2">
                  <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] uppercase text-[var(--muted)]">Likely component</div><div className="font-semibold mt-1">{report.component}</div></div>
                  <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] uppercase text-[var(--muted)]">Confidence</div><div className="font-semibold text-[var(--ok)] mt-1">{Math.round((report.confidence || 0) * 100)}%</div></div>
                  <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] uppercase text-[var(--muted)]">Suggested owner</div><div className="font-semibold mt-1">{report.suggested_owner?.name || "Unassigned"}</div></div>
                </div>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{report.reasoning}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Most likely change</div><div className="text-sm">{report.likely_commit?.message || "No linked commit yet"}</div>{report.likely_commit?.sha && <div className="font-mono text-[11px] text-[var(--muted)] mt-1">{report.likely_commit.sha} · {report.likely_commit.author}</div>}</div>
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Blast radius</div><div className="flex flex-wrap gap-1.5">{(report.affected_modules || []).map((module) => <span key={module} className="pill bg-white/5 text-[var(--muted)]">{module}</span>)}</div></div>
                </div>
                <div><div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Commit → Deployment → Error Spike → Bug Report</div><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{(report.sequence || []).map((event) => <div key={event.label} className="border-l-2 border-[var(--accent-2)] pl-2"><div className="text-xs font-semibold">{event.label}</div><div className="text-[11px] text-[var(--muted)] mt-1">{event.detail}</div></div>)}</div></div>
                {(report.similar_bugs || []).length > 0 && <div><div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Similar historical bugs</div><div className="space-y-1">{report.similar_bugs?.map((similar) => <Link key={similar.id} href={`/issues/${similar.id}`} className="flex gap-2 text-xs hover:text-[var(--accent)]"><span className="font-mono">#{similar.number}</span><span className="truncate">{similar.title}</span><span className="text-[var(--muted)] ml-auto">{Math.round(similar.score * 100)}%</span></Link>)}</div></div>}
              </div>;
            })()}
          </div>

          {/* Description */}
          <article className="card p-5">
            <div className="prose-nt text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: issue.description_html || issue.description }} />
          </article>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-[var(--line)]">
            {(["comments", "activity", "graph", "files"] as Tab[]).map((k) => {
              const labels: Record<Tab, string> = {
                comments: `💬 Discussion${threads.length > 0 ? ` (${threads.length})` : ""}`,
                activity: "📋 Audit trail",
                graph: `🔗 Dependencies${graph.edges.length > 0 ? ` (${graph.edges.length})` : ""}`,
                files: `📎 Attachments${files.length > 0 ? ` (${files.length})` : ""}`,
              };
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-4 py-2.5 text-sm font-medium transition-all -mb-px ${
                    tab === k
                      ? "text-white border-b-2 border-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-white border-b-2 border-transparent"
                  }`}
                >
                  {labels[k]}
                </button>
              );
            })}
          </div>

          {/* Comments */}
          {tab === "comments" && (
            <div className="space-y-3 anim-fade-in">
              {threads.map((c) => (
                <div
                  key={c.id}
                  className={`card p-4 ${c.is_internal ? "border-[var(--warn)]/30 bg-[var(--warn-dim)]" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {c.author && <Avatar name={c.author.name} avatar={c.author.avatar} />}
                    <span className="text-sm font-semibold">{c.author?.name}</span>
                    {c.is_internal && (
                      <span className="pill bg-[var(--warn-dim)] text-[var(--warn)] border border-[var(--warn)]/20">🔒 Internal</span>
                    )}
                    <span className="text-xs text-[var(--muted)] ml-auto">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                    </span>
                  </div>
                  <div className="prose-nt text-sm" dangerouslySetInnerHTML={{ __html: c.body_html || c.body }} />
                </div>
              ))}

              {typing.length > 0 && (
                <p className="text-xs text-[var(--accent)] flex items-center gap-1.5">
                  <span className="dot-live" />{typing.map((t) => t.name).join(", ")} is typing…
                </p>
              )}

              {/* Comment form */}
              <form onSubmit={onComment} className="card p-4 space-y-3">
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    getSocket().emit("typing", { issue_id: id, typing: e.target.value.length > 0 });
                  }}
                  placeholder="Leave a comment — use @name to mention, markdown supported"
                  className="input text-sm"
                />
                <div className="flex items-center justify-between">
                  {canInternal ? (
                    <label className="text-xs text-[var(--muted)] flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                        className="accent-[var(--warn)]"
                      />
                      Internal note (hidden from reporters/guests)
                    </label>
                  ) : <span />}
                  <button type="submit" className="btn btn-primary text-sm">Post</button>
                </div>
              </form>
            </div>
          )}

          {/* Activity / Audit trail */}
          {tab === "activity" && (
            <ol className="space-y-2 anim-fade-in">
              {history.map((h) => (
                <li key={h.id} className="card p-3 flex gap-3 text-sm items-start">
                  <span className="font-mono text-[11px] text-[var(--muted)] w-36 flex-shrink-0 mt-0.5">
                    {h.changed_at ? new Date(h.changed_at).toLocaleString() : ""}
                  </span>
                  <div>
                    <span className="font-semibold">{h.actor?.name || "system"}</span>
                    {" moved "}
                    <code className="text-[var(--muted)] text-xs">{h.from_status}</code>
                    {" → "}
                    <code className="text-[var(--accent)] text-xs">{h.to_status}</code>
                    {h.note && <span className="text-[var(--muted)] text-xs block mt-0.5">{h.note}</span>}
                  </div>
                </li>
              ))}
              {history.length === 0 && <p className="text-sm text-[var(--muted)]">No status history yet.</p>}
            </ol>
          )}

          {/* Dependencies graph */}
          {tab === "graph" && (
            <div className="space-y-3 anim-fade-in">
              <div className="card p-4 space-y-2">
                {graph.nodes.map((n) => (
                  <Link key={n.id} href={`/issues/${n.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5 transition-colors group">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: n.id === id ? "var(--accent)" : "var(--muted)" }}
                    />
                    <span className="font-mono text-[11px] text-[var(--accent)]">{n.key}</span>
                    <span className="flex-1 text-sm truncate group-hover:text-white transition-colors">{n.title}</span>
                    <StatusBadge value={n.status} />
                  </Link>
                ))}
                {graph.edges.map((e, i) => (
                  <p key={i} className="text-xs px-2" style={{ color: STATUS_COLORS[e.type] || "var(--muted)" }}>
                    #{e.from} <span className="font-semibold">{e.type}</span> #{e.to}
                  </p>
                ))}
                {graph.nodes.length <= 1 && (
                  <p className="text-sm text-[var(--muted)] py-2">No dependency links yet.</p>
                )}
              </div>

              {/* Add dependency */}
              <div className="card p-4 space-y-3">
                <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide">Add dependency</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={depFrom}
                    onChange={(e) => setDepFrom(e.target.value)}
                    placeholder="Issue ID"
                    className="input text-sm w-28"
                  />
                  <select
                    value={depType}
                    onChange={(e) => setDepType(e.target.value)}
                    className="input input-select text-sm flex-1"
                  >
                    <option value="blocks">blocks</option>
                    <option value="related">related to</option>
                    <option value="duplicates">duplicates</option>
                  </select>
                  <button onClick={addDependency} className="btn btn-ghost text-sm flex-shrink-0">Link</button>
                </div>
              </div>
            </div>
          )}

          {/* Attachments */}
          {tab === "files" && (
            <div className="space-y-3 anim-fade-in">
              {/* Drop zone */}
              <div
                className={`rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                  dragActive
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--line)] hover:border-[var(--line-bright)] hover:bg-white/3"
                }`}
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-3xl mb-2">{dragActive ? "📥" : "📎"}</div>
                <p className="text-sm text-[var(--muted)]">
                  {dragActive ? "Drop to upload" : "Drag & drop or click to attach"}
                </p>
                <p className="text-xs text-[var(--muted-2)] mt-1">PNG, JPEG, PDF, .patch · max 8 MB</p>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }} />
              </div>

              {/* File list */}
              <div className="space-y-1.5">
                {files.map((f) => (
                  <a
                    key={f.id}
                    href={`${API}${f.url}`}
                    target="_blank"
                    className="card flex items-center gap-3 px-4 py-2.5 hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-lg">
                      {f.content_type?.startsWith("image") ? "🖼" : f.is_patch ? "🩹" : "📄"}
                    </span>
                    <span className="flex-1 text-sm group-hover:text-[var(--accent)] transition-colors truncate">{f.filename}</span>
                    {f.is_patch && <span className="pill bg-[var(--purple-dim)] text-[var(--purple)]">patch</span>}
                    <span className="text-xs text-[var(--muted)]">{(f.size / 1024).toFixed(1)} KB</span>
                  </a>
                ))}
                {files.length === 0 && (
                  <p className="text-sm text-[var(--muted)] text-center py-2">No attachments yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          {/* Lifecycle */}
          <div className="card p-4 space-y-3">
            <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide">Lifecycle transitions</div>
            <div className="flex flex-wrap gap-1.5">
              {issue.allowed_transitions.map((s) => (
                <button
                  key={s}
                  disabled={busy === s}
                  onClick={() => transition(s)}
                  className="btn btn-ghost text-[11px] px-2.5 py-1"
                >
                  {busy === s ? <span className="spinner" style={{ width: 10, height: 10 }} /> : null}
                  {s.replaceAll("_", " ")}
                </button>
              ))}
              {issue.allowed_transitions.length === 0 && (
                <p className="text-xs text-[var(--muted)]">No transitions available from this state.</p>
              )}
            </div>
            <p className="text-[10.5px] text-[var(--muted-2)]">Illegal jumps are rejected server-side.</p>
          </div>

          {/* People */}
          <div className="card p-4 space-y-4">
            <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide">People</div>
            {issue.reporter && (
              <div className="flex items-center gap-2 text-sm">
                <Avatar name={issue.reporter.name} avatar={issue.reporter.avatar} size={24} />
                <div>
                  <div className="text-[10.5px] text-[var(--muted)]">Reporter</div>
                  <div className="font-medium text-xs">{issue.reporter.name}</div>
                </div>
              </div>
            )}
            <label className="text-xs font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Assignee</span>
              <select
                className="input input-select text-sm"
                value={issue.assignee_id || ""}
                onChange={(e) => assign(Number(e.target.value))}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <button
              onClick={async () => {
                if (watching) {
                  await api(`/issues/${id}/watch`, { method: "DELETE" });
                  setWatching(false);
                } else {
                  await api(`/issues/${id}/watch`, { method: "POST" });
                  setWatching(true);
                }
              }}
              className={`btn w-full text-sm ${watching ? "btn-accent2" : "btn-ghost"}`}
            >
              {watching ? "👁 Watching" : "Watch issue"}
            </button>
          </div>

          {/* SLA */}
          {issue.sla && (
            <div className="card p-4 text-sm space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide">SLA</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--muted)]">{issue.sla.hours_open}h open</span>
                <span className={`pill ${issue.sla.breached ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-[var(--ok-dim)] text-[var(--ok)]"}`}>
                  {issue.sla.breached ? "Breached" : "On track"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((issue.sla.hours_open / (issue.sla.hours_open + issue.sla.countdown_hours)) * 100, 100)}%`,
                    background: issue.sla.breached ? "var(--danger)" : "var(--ok)",
                  }}
                />
              </div>
              <p className="text-xs text-[var(--muted)]">{issue.sla.countdown_hours}h remaining</p>
            </div>
          )}

          {/* AI tools */}
          <div className="card p-4 space-y-2.5">
            <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide">AI tools</div>
            <button
              onClick={summarize}
              disabled={busy === "sum"}
              className="btn btn-ghost w-full text-sm"
            >
              {busy === "sum" ? <><span className="spinner" /> Summarizing…</> : "✦ Generate thread TL;DR"}
            </button>
            <button
              onClick={simulatePr}
              disabled={busy === "pr"}
              className="btn btn-accent2 w-full text-sm"
            >
              {busy === "pr" ? <><span className="spinner" /> Merging…</> : "⬡ Simulate GitHub Fixes # merge"}
            </button>
            {issue.github_pr && (
              <a
                href={issue.github_pr}
                className="block text-xs text-[var(--accent)] truncate hover:underline"
                target="_blank"
              >
                🔗 {issue.github_pr}
              </a>
            )}
          </div>

          {/* Similar issues */}
          {issue.similar && issue.similar.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase text-[var(--muted)] tracking-wide mb-3">Semantic neighbors</div>
              <div className="space-y-1.5">
                {issue.similar.map((s) => (
                  <Link key={s.id} href={`/issues/${s.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors group">
                    <span className="font-mono text-[11px] text-[var(--accent)] flex-shrink-0">#{s.number}</span>
                    <span className="flex-1 text-xs truncate group-hover:text-white transition-colors">{s.title}</span>
                    <span className="text-[10px] font-mono text-[var(--muted)]">{Math.round(s.score * 100)}%</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="card p-4 text-xs space-y-1.5 text-[var(--muted)]">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-2">Metadata</div>
            {issue.environment && <div><span className="text-[var(--muted-2)]">Environment:</span> {issue.environment}</div>}
            {issue.version && <div><span className="text-[var(--muted-2)]">Version:</span> {issue.version}</div>}
            {issue.created_at && <div><span className="text-[var(--muted-2)]">Created:</span> {new Date(issue.created_at).toLocaleDateString()}</div>}
            {issue.updated_at && <div><span className="text-[var(--muted-2)]">Updated:</span> {new Date(issue.updated_at).toLocaleDateString()}</div>}
          </div>
        </aside>
      </div>
    </Shell>
  );
}
