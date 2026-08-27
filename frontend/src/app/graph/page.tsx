"use client";

import { StatusBadge } from "@/components/Badges";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import type { GraphPayload, Project } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const EDGE_COLORS: Record<string, string> = {
  blocks:     "var(--danger)",
  related:    "var(--accent-2)",
  duplicates: "var(--warn)",
};

const STATUS_COLORS: Record<string, string> = {
  NEW:              "var(--status-new)",
  TRIAGED:          "var(--status-triaged)",
  IN_PROGRESS:      "var(--status-progress)",
  IN_REVIEW:        "var(--status-review)",
  RESOLVED:         "var(--status-resolved)",
  VERIFIED:         "var(--status-verified)",
  CLOSED:           "var(--status-closed)",
  WONTFIX:          "var(--muted-2)",
  DUPLICATE:        "var(--warn)",
  CANNOT_REPRODUCE: "var(--muted)",
  REOPENED:         "var(--accent-2)",
};

/* Force-directed-style layout using a simple layered DAG algorithm */
function computeLayout(nodes: GraphPayload["nodes"], edges: GraphPayload["edges"]) {
  const W = 640, H = 440;
  const n = nodes.length;
  if (n === 0) return {};

  // Build adjacency for rough depth
  const depth: Record<number, number> = {};
  nodes.forEach((nd) => (depth[nd.id] = 0));
  edges.forEach((e) => {
    if (e.type === "blocks") depth[e.to] = Math.max(depth[e.to] ?? 0, (depth[e.from] ?? 0) + 1);
  });

  // Group by depth
  const layers: number[][] = [];
  for (const nd of nodes) {
    const d = depth[nd.id] ?? 0;
    if (!layers[d]) layers[d] = [];
    layers[d].push(nd.id);
  }

  const pos: Record<number, { x: number; y: number }> = {};
  layers.forEach((layer, di) => {
    const x = 80 + (di / Math.max(layers.length - 1, 1)) * (W - 160);
    layer.forEach((id, j) => {
      const y = 60 + (j / Math.max(layer.length - 1, 1)) * (H - 120);
      pos[id] = { x, y: layer.length === 1 ? H / 2 : y };
    });
  });

  return pos;
}

export default function GraphPage() {
  const [data, setData] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api<Project[]>("/projects")
      .then(async (ps) => {
        setProjects(ps);
        const id = ps[0]?.id;
        if (!id) return;
        setProjectId(id);
        setData(await api<GraphPayload>(`/projects/${id}/graph`));
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  async function switchProject(id: number) {
    setProjectId(id);
    setHovered(null);
    const d = await api<GraphPayload>(`/projects/${id}/graph`);
    setData(d);
  }

  const filteredEdges = useMemo(
    () => (filter === "all" ? data.edges : data.edges.filter((e) => e.type === filter)),
    [data.edges, filter],
  );

  const pos = useMemo(() => computeLayout(data.nodes, data.edges), [data.nodes, data.edges]);

  const hoveredEdges = useMemo(() => {
    if (hovered === null) return new Set<number>();
    return new Set(
      filteredEdges.filter((e) => e.from === hovered || e.to === hovered).flatMap((e) => [e.from, e.to]),
    );
  }, [hovered, filteredEdges]);

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dependency graph</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Blocks / related / duplicates — the view Bugzilla hid in a list.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {projects.length > 1 && (
            <select
              value={projectId || ""}
              onChange={(e) => switchProject(Number(e.target.value))}
              className="input input-select text-sm"
              style={{ width: "auto", minWidth: 160 }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.key} · {p.name}</option>
              ))}
            </select>
          )}
          {/* Edge type filter */}
          {["all", "blocks", "related", "duplicates"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`pill cursor-pointer capitalize transition-all ${
                filter === f
                  ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "bg-white/5 text-[var(--muted)] hover:bg-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[var(--danger)] text-sm card p-3 mb-4">{error}</p>}

      {/* SVG Graph */}
      <div className="card p-3 overflow-hidden mb-5">
        {data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-[var(--muted)] text-sm">
            No dependencies found for this project.
          </div>
        ) : (
          <svg viewBox="0 0 640 440" className="w-full" style={{ minHeight: 360 }}>
            <defs>
              {/* Arrowhead markers per edge type */}
              {["blocks", "related", "duplicates"].map((t) => (
                <marker
                  key={t}
                  id={`arrow-${t}`}
                  markerWidth="8" markerHeight="8"
                  refX="7" refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill={EDGE_COLORS[t]} opacity={0.8} />
                </marker>
              ))}
              <filter id="node-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {filteredEdges.map((e, i) => {
              const a = pos[e.from], b = pos[e.to];
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              const isActive = hovered !== null && (e.from === hovered || e.to === hovered);
              const color = EDGE_COLORS[e.type] || "var(--muted)";
              // Curved path
              const dx = b.x - a.x, dy = b.y - a.y;
              const cx1 = a.x + dx * 0.35, cy1 = a.y - 30;
              const cx2 = b.x - dx * 0.35, cy2 = b.y - 30;
              return (
                <g key={i}>
                  <path
                    d={`M${a.x},${a.y} C${cx1},${cy1} ${cx2},${cy2} ${b.x},${b.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={isActive ? 2 : 1}
                    strokeOpacity={isActive ? 1 : hovered !== null ? 0.15 : 0.45}
                    markerEnd={`url(#arrow-${e.type})`}
                    style={{ transition: "stroke-opacity 0.2s ease" }}
                  />
                  <text x={mx} y={my - 8} textAnchor="middle" fontSize="9" fill={color} opacity={isActive ? 1 : 0.5}>
                    {e.type}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {data.nodes.map((nd) => {
              const p = pos[nd.id];
              if (!p) return null;
              const isHover = hovered === nd.id;
              const isRelated = hoveredEdges.has(nd.id);
              const color = STATUS_COLORS[nd.status] || "var(--muted)";
              const opacity = hovered === null ? 1 : isHover || isRelated ? 1 : 0.3;

              return (
                <g
                  key={nd.id}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ cursor: "pointer", transition: "opacity 0.2s ease", opacity }}
                  onMouseEnter={() => setHovered(nd.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle
                    r={isHover ? 32 : 28}
                    fill="#0f1117"
                    stroke={color}
                    strokeWidth={isHover ? 2.5 : 1.5}
                    filter={isHover ? "url(#node-glow)" : undefined}
                    style={{ transition: "r 0.15s ease, stroke-width 0.15s ease" }}
                  />
                  <text
                    textAnchor="middle"
                    dy={-6}
                    fontSize={isHover ? 9.5 : 9}
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                    fill={color}
                  >
                    {nd.key}
                  </text>
                  <text
                    textAnchor="middle"
                    dy={8}
                    fontSize="7.5"
                    fill="var(--muted)"
                  >
                    {nd.status.replaceAll("_", " ")}
                  </text>
                  {/* Hover tooltip */}
                  {isHover && (
                    <foreignObject x={-90} y={-76} width={180} height={60}>
                      <div
                        style={{
                          background: "var(--bg-soft)",
                          border: "1px solid var(--line-bright)",
                          borderRadius: 8,
                          padding: "5px 8px",
                          fontSize: 10.5,
                          color: "var(--text)",
                          lineHeight: 1.4,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {nd.title}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-5 text-xs text-[var(--muted)]">
        <span className="font-medium">Edge types:</span>
        {Object.entries(EDGE_COLORS).map(([t, c]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5" style={{ background: c }} />
            <span className="capitalize">{t}</span>
          </span>
        ))}
      </div>

      {/* Issue list */}
      <div className="grid sm:grid-cols-2 gap-2">
        {data.nodes.map((nd) => (
          <Link
            key={nd.id}
            href={`/issues/${nd.id}`}
            className="card p-3 flex items-center gap-3 hover:border-[var(--accent)] transition-all group"
            onMouseEnter={() => setHovered(nd.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: STATUS_COLORS[nd.status] || "var(--muted)" }}
            />
            <span className="font-mono text-[11px] text-[var(--accent)]">{nd.key}</span>
            <span className="flex-1 text-xs truncate group-hover:text-white transition-colors">{nd.title}</span>
            <StatusBadge value={nd.status} />
          </Link>
        ))}
      </div>
    </Shell>
  );
}
