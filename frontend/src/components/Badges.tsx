const SEV: Record<string, string> = {
  blocker: "bg-rose-500/20 text-rose-200 border-rose-400/30",
  critical: "bg-orange-500/20 text-orange-200 border-orange-400/30",
  major: "bg-amber-500/15 text-amber-100 border-amber-400/25",
  minor: "bg-sky-500/15 text-sky-100 border-sky-400/25",
  trivial: "bg-zinc-500/20 text-zinc-200 border-zinc-400/25",
};

const PRI: Record<string, string> = {
  P0: "text-rose-300",
  P1: "text-orange-300",
  P2: "text-amber-200",
  P3: "text-sky-200",
  P4: "text-zinc-400",
};

const ST: Record<string, string> = {
  NEW: "bg-zinc-500/20 text-zinc-100",
  TRIAGED: "bg-indigo-500/20 text-indigo-100",
  IN_PROGRESS: "bg-sky-500/20 text-sky-100",
  IN_REVIEW: "bg-violet-500/20 text-violet-100",
  RESOLVED: "bg-emerald-500/20 text-emerald-100",
  VERIFIED: "bg-teal-500/20 text-teal-100",
  CLOSED: "bg-zinc-600/30 text-zinc-300",
  REOPENED: "bg-yellow-500/20 text-yellow-100",
  DUPLICATE: "bg-fuchsia-500/20 text-fuchsia-100",
  WONTFIX: "bg-stone-500/20 text-stone-200",
  CANNOT_REPRODUCE: "bg-slate-500/20 text-slate-200",
};

export function SeverityBadge({ value }: { value: string }) {
  return <span className={`pill border ${SEV[value] || SEV.major}`}>{value}</span>;
}

export function PriorityBadge({ value }: { value: string }) {
  return <span className={`font-mono text-xs font-bold ${PRI[value] || PRI.P2}`}>{value}</span>;
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`pill ${ST[value] || ST.NEW}`}>{value.replaceAll("_", " ")}</span>;
}

export function Avatar({ name, avatar, size = 28 }: { name: string; avatar: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/80 to-indigo-500/80 text-[10px] font-bold text-black"
      style={{ width: size, height: size }}
    >
      {avatar}
    </span>
  );
}
