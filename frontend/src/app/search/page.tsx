"use client";

import { PriorityBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import type { Issue } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

type Rule = { field: string; op: string; value: string };
type Saved = { id: number; name: string; filter_json: string; is_shared: boolean };

const FIELDS = ["status", "severity", "priority", "type", "title", "labels", "environment"];
const OPS = ["eq", "neq", "contains"];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [combiner, setCombiner] = useState<"AND" | "OR">("AND");
  const [rules, setRules] = useState<Rule[]>([{ field: "status", op: "neq", value: "CLOSED" }]);
  const [items, setItems] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("Open except closed");
  const [error, setError] = useState("");

  function group() {
    return {
      op: combiner,
      rules: rules.filter((r) => r.value !== "").map((r) => ({
        ...r,
        value: r.field === "priority" && r.value.includes(",") ? r.value.split(",") : r.value,
      })),
      groups: [],
    };
  }

  async function run() {
    setError("");
    try {
      const res = await api<{ total: number; items: Issue[] }>("/search", {
        method: "POST",
        body: JSON.stringify({ q, group: group(), page: 1, page_size: 50, sort: "-updated_at" }),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    }
  }

  useEffect(() => {
    api<Saved[]>("/saved-queries").then(setSaved).catch(() => undefined);
    run().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Query builder</h1>
        <p className="text-sm text-[var(--muted)]">
          Bugzilla Boolean Charts, without the learning curve. AND/OR groups compile to a shareable saved query.
        </p>
      </div>
      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <aside className="card p-4 space-y-3 h-fit">
          <div className="text-xs uppercase text-[var(--muted)]">Saved queries</div>
          {saved.map((s) => (
            <button
              key={s.id}
              className="block w-full text-left text-sm rounded-lg p-2 hover:bg-white/5"
              onClick={() => {
                try {
                  const g = JSON.parse(s.filter_json);
                  setCombiner((g.op || "AND").toUpperCase() === "OR" ? "OR" : "AND");
                  setRules(g.rules?.length ? g.rules : [{ field: "status", op: "eq", value: "NEW" }]);
                  setName(s.name);
                } catch {
                  /* ignore */
                }
              }}
            >
              {s.name} {s.is_shared && <span className="text-[10px] text-[var(--muted)]">shared</span>}
            </button>
          ))}
        </aside>
        <div>
          <div className="card p-4 space-y-3 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Full-text across title, description, labels"
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2 text-sm">
              Match
              <select
                value={combiner}
                onChange={(e) => setCombiner(e.target.value as "AND" | "OR")}
                className="rounded-lg bg-[var(--bg)] border border-[var(--line)] px-2 py-1"
              >
                <option>AND</option>
                <option>OR</option>
              </select>
              all rules
            </div>
            {rules.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  value={r.field}
                  onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                  className="rounded-lg bg-[var(--bg)] border border-[var(--line)] px-2 py-1 text-sm"
                >
                  {FIELDS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <select
                  value={r.op}
                  onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
                  className="rounded-lg bg-[var(--bg)] border border-[var(--line)] px-2 py-1 text-sm"
                >
                  {OPS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <input
                  value={r.value}
                  onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  className="flex-1 min-w-[120px] rounded-lg bg-[var(--bg)] border border-[var(--line)] px-2 py-1 text-sm"
                  placeholder="value"
                />
                <button className="text-xs text-[var(--muted)]" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                  remove
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={() => setRules((rs) => [...rs, { field: "severity", op: "eq", value: "blocker" }])}
              >
                Add rule
              </button>
              <button className="rounded-lg bg-[var(--accent)] text-black font-semibold px-3 py-1.5 text-sm" onClick={run}>
                Run query
              </button>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg bg-[var(--bg)] border border-[var(--line)] px-2 py-1 text-sm"
              />
              <button
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                onClick={async () => {
                  await api("/saved-queries", {
                    method: "POST",
                    body: JSON.stringify({ name, filter_json: JSON.stringify(group()), is_shared: true }),
                  });
                  setSaved(await api("/saved-queries"));
                }}
              >
                Save & share
              </button>
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
          <p className="text-xs text-[var(--muted)] mb-2">{total} matches</p>
          <div className="space-y-1">
            {items.map((i) => (
              <Link key={i.id} href={`/issues/${i.id}`} className="card p-3 flex items-center gap-3 hover:bg-white/5">
                <span className="font-mono text-xs text-[var(--accent)] w-14">{i.key}</span>
                <span className="flex-1 text-sm truncate">{i.title}</span>
                <PriorityBadge value={i.priority} />
                <SeverityBadge value={i.severity} />
                <StatusBadge value={i.status} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
