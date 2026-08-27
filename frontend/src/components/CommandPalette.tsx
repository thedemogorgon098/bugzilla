"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Issue } from "@/lib/types";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      api<Issue[]>(`/issues?q=${encodeURIComponent(q)}`).then(setIssues).catch(() => undefined);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="card mx-auto mt-[12vh] max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search issues, or go: board · dashboard · new · query"
          className="w-full bg-transparent px-4 py-3 outline-none text-sm border-b border-[var(--line)]"
        />
        <div className="max-h-80 overflow-auto p-2">
          {[
            ["Dashboard", "/dashboard"],
            ["Kanban board", "/board"],
            ["New issue", "/issues/new"],
            ["Query builder", "/search"],
            ["Dependency graph", "/graph"],
          ]
            .filter(([label]) => label.toLowerCase().includes(q.toLowerCase()) || !q)
            .map(([label, href]) => (
              <button
                key={href}
                onClick={() => go(href)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5"
              >
                {label}
              </button>
            ))}
          {issues.slice(0, 8).map((i) => (
            <button
              key={i.id}
              onClick={() => go(`/issues/${i.id}`)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5"
            >
              <span className="font-mono text-[var(--accent)] mr-2">{i.key}</span>
              {i.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
