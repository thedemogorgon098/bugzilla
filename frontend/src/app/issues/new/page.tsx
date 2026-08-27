"use client";

import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import type { Component, Project } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Triage = {
  severity: string;
  priority: string;
  confidence: number;
  engine: string;
  assignee?: { id: number; name: string } | null;
  duplicates: { id: number; number: number; title: string; status: string; score: number }[];
};

const SEVERITY_COLORS: Record<string, string> = {
  blocker: "var(--sev-blocker)",
  critical: "var(--sev-critical)",
  major: "var(--sev-major)",
  minor: "var(--sev-minor)",
  trivial: "var(--sev-trivial)",
};

export default function NewIssuePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [projectId, setProjectId] = useState<number>();
  const [componentId, setComponentId] = useState<number>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("prod");
  const [labels, setLabels] = useState("");
  const [version, setVersion] = useState("");
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Project[]>("/projects").then((ps) => {
      setProjects(ps);
      if (ps[0]) setProjectId(ps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api<Component[]>(`/projects/${projectId}/components`).then(setComponents);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || title.length < 8) {
      setTriage(null);
      return;
    }
    setTriageLoading(true);
    const t = setTimeout(() => {
      api<Triage>("/ai/triage", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, title, description, component_id: componentId }),
      })
        .then((r) => { setTriage(r); setTriageLoading(false); })
        .catch(() => setTriageLoading(false));
    }, 450);
    return () => clearTimeout(t);
  }, [title, description, projectId, componentId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: number }>("/issues", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          component_id: componentId,
          title,
          description,
          environment,
          labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
          version,
          accept_ai: true,
        }),
      });
      router.push(`/issues/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const confidencePct = triage ? Math.round(triage.confidence * 100) : 0;
  const sevColor = triage ? SEVERITY_COLORS[triage.severity] || "var(--muted)" : "var(--muted)";

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">File an issue</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          AI flags likely duplicates in real-time — Bugzilla&apos;s #1 pain point, attacked at the source.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <form onSubmit={onSubmit} className="card p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Project</span>
              <select
                className="input input-select"
                value={projectId || ""}
                onChange={(e) => setProjectId(Number(e.target.value))}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Component</span>
              <select
                className="input input-select"
                value={componentId || ""}
                onChange={(e) => setComponentId(Number(e.target.value) || undefined)}
              >
                <option value="">Auto-route by AI</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-sm font-medium block space-y-1.5">
            <span className="text-[var(--muted)]">Title <span className="text-[var(--danger)]">*</span></span>
            <input
              required
              minLength={4}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What broke, for whom, and where?"
            />
          </label>

          <label className="text-sm font-medium block space-y-1.5">
            <span className="text-[var(--muted)]">Description (markdown)</span>
            <textarea
              rows={10}
              className="input font-mono text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"## Repro\n1.\n2.\n\n## Expected\n\n## Actual\n\n## Environment"}
            />
          </label>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="text-sm font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Environment</span>
              <input className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="prod / staging" />
            </label>
            <label className="text-sm font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Version</span>
              <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026.8" />
            </label>
            <label className="text-sm font-medium block space-y-1.5">
              <span className="text-[var(--muted)]">Labels</span>
              <input className="input" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="auth, regression" />
            </label>
          </div>

          {error && (
            <div className="text-sm text-[var(--danger)] card p-3 border-[var(--danger-dim)] anim-fade-in">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary w-full text-sm py-2.5"
          >
            {busy ? <><span className="spinner" /> Filing…</> : "Submit issue"}
          </button>
        </form>

        {/* AI Triage sidebar */}
        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">AI triage</h2>
              {triageLoading && <span className="spinner" />}
              {triage && !triageLoading && (
                <span className="pill bg-[var(--accent-dim)] text-[var(--accent)] text-[10px]">
                  {triage.engine}
                </span>
              )}
            </div>

            {!triage && !triageLoading && (
              <p className="text-sm text-[var(--muted)]">Type a title (8+ chars) to see AI suggestions.</p>
            )}

            {triageLoading && !triage && (
              <div className="space-y-3">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
              </div>
            )}

            {triage && (
              <div className="space-y-4 anim-fade-in">
                {/* Severity + Priority */}
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ background: `${sevColor}15`, border: `1px solid ${sevColor}30` }}>
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">Severity</div>
                    <div className="font-bold capitalize" style={{ color: sevColor }}>{triage.severity}</div>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center bg-white/5 border border-[var(--line)]">
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">Priority</div>
                    <div className="font-bold text-[var(--text)]">{triage.priority}</div>
                  </div>
                </div>

                {/* Confidence bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted)]">Confidence</span>
                    <span className="font-mono font-semibold" style={{ color: sevColor }}>{confidencePct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full origin-left"
                      style={{
                        width: `${confidencePct}%`,
                        background: sevColor,
                        animation: "bar-grow 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
                      }}
                    />
                  </div>
                </div>

                {/* Smart routing */}
                {triage.assignee && (
                  <div className="rounded-xl p-3 bg-[var(--accent-2-dim)] border border-[var(--accent-2)]/20">
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">Smart routing</div>
                    <div className="text-sm font-semibold text-[var(--accent-2)]">{triage.assignee.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">Based on historical resolution speed</div>
                  </div>
                )}

                {/* Duplicate detection */}
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
                    Semantic duplicate detection
                  </div>
                  {triage.duplicates.length === 0 ? (
                    <div className="text-sm text-[var(--ok)] flex items-center gap-1.5">
                      <span className="text-base">✓</span> No close matches found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {triage.duplicates.map((d) => (
                        <Link
                          key={d.id}
                          href={`/issues/${d.id}`}
                          target="_blank"
                          className="block rounded-xl p-2.5 bg-[var(--warn-dim)] border border-[var(--warn)]/20 hover:border-[var(--warn)]/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[11px] text-[var(--warn)]">#{d.number}</span>
                            <span className="text-[10px] text-[var(--muted)]">{d.status.replaceAll("_", " ")}</span>
                          </div>
                          <div className="text-xs text-[var(--text)] line-clamp-2 mb-1.5">{d.title}</div>
                          {/* Similarity bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-white/5">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.round(d.score * 100)}%`, background: "var(--warn)" }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-[var(--warn)]">{Math.round(d.score * 100)}%</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tips card */}
          <div className="card p-4 space-y-2 text-xs text-[var(--muted)]">
            <div className="font-semibold text-[var(--text)] text-sm">Filing tips</div>
            <p>• Use <code className="text-[var(--accent)]">## Repro</code> sections for structured bug reports</p>
            <p>• @mention teammates in descriptions for smart routing</p>
            <p>• Labels speed up search — use <code className="text-[var(--accent)]">auth, regression</code> style</p>
            <p>• The AI scores ≥0.42 cosine similarity as a duplicate candidate</p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
