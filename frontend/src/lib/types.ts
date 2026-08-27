export type Role = "admin" | "maintainer" | "developer" | "reporter" | "guest";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  team_id?: number | null;
};

export type HistoryEvent = {
  id: number;
  from_status: string;
  to_status: string;
  note: string;
  changed_at?: string;
  actor?: User | null;
};

export type GraphPayload = {
  nodes: { id: number; key: string; title: string; status: string; severity?: string }[];
  edges: { from: number; to: number; type: string }[];
};

export type Project = {
  id: number;
  name: string;
  key: string;
  description: string;
  github_repo: string;
};

export type Component = {
  id: number;
  project_id: number;
  name: string;
  default_owner_id?: number | null;
};

export type Sla = {
  response_hours: number;
  resolution_hours: number;
  hours_open: number;
  responded: boolean;
  resolved: boolean;
  response_breach: boolean;
  resolution_breach: boolean;
  breached: boolean;
  countdown_hours: number;
};

export type Issue = {
  id: number;
  number: number;
  key: string;
  project_id: number;
  component_id?: number | null;
  title: string;
  description: string;
  type: string;
  severity: string;
  priority: string;
  status: string;
  resolution: string;
  reporter_id: number;
  assignee_id?: number | null;
  environment: string;
  labels: string;
  cc: string;
  version: string;
  github_pr: string;
  ci_status: string;
  summary: string;
  description_html?: string;
  created_at?: string;
  updated_at?: string;
  reporter?: User | null;
  assignee?: User | null;
  sla?: Sla;
  allowed_transitions: string[];
  similar?: { id: number; number: number; title: string; status: string; score: number }[];
  investigation?: Investigation | null;
};

export type Investigation = {
  id?: number;
  status: "queued" | "running" | "completed" | "failed" | "not_started";
  provider?: string;
  error?: string;
  report?: {
    component?: string;
    confidence?: number;
    reasoning?: string;
    likely_commit?: { sha?: string; message?: string; author?: string; date?: string; url?: string } | null;
    likely_deployment?: { environment?: string; at?: string; status?: string };
    affected_modules?: string[];
    suggested_owner?: { id: number; name: string; avatar: string } | null;
    similar_bugs?: { id: number; number: number; title: string; status: string; score: number }[];
    sequence?: { label: string; at?: string | null; detail: string }[];
  };
};

export type Comment = {
  id: number;
  issue_id: number;
  author_id: number;
  parent_id?: number | null;
  body: string;
  body_html: string;
  is_internal: boolean;
  created_at?: string;
  author?: User;
};

export type Dashboard = {
  totals: { issues: number; open: number; closed: number; resolution_rate?: number };
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_priority: Record<string, number>;
  mttr_hours: number;
  trend: { date: string; opened: number; closed: number }[];
  cfd: Record<string, string | number>[];
  leaderboard: { name: string; count: number }[];
  workload?: { id: number; name: string; avatar: string; role: string; count: number }[];
  recent?: Issue[];
  stale: Issue[];
  mine: Issue[];
  velocity: number;
};
