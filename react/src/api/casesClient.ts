/* ------------------------------------------------------------------ *
 *  Cases API client
 *
 *  Talks to the Customer Support SLA backend over fetch. The backed
 *  exposes the following endpoints (see
 *  `backend/src/.../CasesController.cs`):
 *
 *    GET  /api/cases/{id}              — full case detail
 *    GET  /api/cases                   — paged case list
 *    GET  /api/cases/default           — default case id
 *    POST /api/cases/{id}/resolve      — resolve a case
 *    POST /api/cases/{id}/escalate     — escalate a case
 *    POST /api/cases/{id}/reassign     — reassign a case
 *    POST /api/cases/{id}/replies      — add a public reply
 *    POST /api/cases/{id}/notes        — add an internal note
 *
 *  The SPA's Vite dev server is allow-listed in the backend CORS
 *  policy, so the browser can call this origin directly without a
 *  proxy. A `VITE_API_BASE_URL` env var can override the base URL.
 * ------------------------------------------------------------------ */

import type {
  CaseDetail,
  GeneratedAgent,
  GeneratedCustomer,
  GeneratedTimelineEvent,
  PriorityKey,
  ChipTone,
  ChannelKey,
} from '../data/caseDetails';
import { generateCaseDetail } from '../data/caseDetails';
import type { Severity, TicketStatus } from '../data/tickets';

/* ---------- Base URL ---------- */

const DEFAULT_BASE = '';

function apiBase(): string {
  const fromEnv = (
    import.meta.env.VITE_API_BASE_URL as string | undefined
  )?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return DEFAULT_BASE;
}

/* ---------- Wire types (mirror the .NET DTOs) ---------- */

export interface CaseListItem {
  id: string;
  title: string;
  status: TicketStatus;
  priority: PriorityKey;
}

type TimelineEventKind = GeneratedTimelineEvent['kind'];

export interface ApiTimelineEvent {
  kind: TimelineEventKind;
  author: string;
  time: string;
  body: string;
  chips?: { label: string; tone: ChipTone }[];
  attachment?: { label: string; tone: ChipTone };
}

export interface ApiNote {
  initials: string;
  name: string;
  role: string;
  time: string;
  body: string;
  chips?: { label: string; tone: ChipTone }[];
}

export interface ApiRelatedCase {
  id: string;
  priority: PriorityKey;
  title: string;
  sub: string;
}

export interface ApiSlaPolicy {
  name: string;
  badge: string;
  badgeTone: ChipTone;
  deadlineMs: number;
  pills?: { label: string; value: string }[];
}

export interface ApiCaseDetail {
  id: string;
  subject: string;
  customer: string;
  queue: string;
  priority: PriorityKey;
  status: TicketStatus;
  assignee: {
    kind: string;
    id?: string | null;
    name?: string | null;
    tier?: string | null;
  };
  sla: {
    deadlineMs: number;
    severity: Severity;
  };
  openedAt: string; // ISO-8601
  ageMinutes: number;
  resolvedAt?: string | null;
  tags: string[];
  bodyHtml: string;
  activity: {
    id: string;
    kind: string;
    title: string;
    sub: string;
    at: string;
    actor?: string | null;
  }[];
  timeline: {
    id: string;
    kind: string;
    title: string;
    sub: string;
    at: string;
    actor?: string | null;
  }[];
  relatedCases: {
    id: string;
    subject: string;
    customer: string;
    priority: PriorityKey;
    status: TicketStatus;
  }[];
  channel: ChannelKey;
}

export interface DefaultCaseResponse {
  id: string;
}

export interface MutationResult {
  caseId: string;
  at: string;
}

/* ---------- Adapter helpers ---------- */

function openedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function priorityLabel(priority: PriorityKey): string {
  const labels: Record<PriorityKey, string> = {
    p1: 'P1 — Critical',
    p2: 'P2 — High',
    p3: 'P3 — Normal',
    p4: 'P4 — Low',
  };
  return labels[priority];
}

function timelineKind(kind: string): GeneratedTimelineEvent['kind'] {
  if (kind === 'reply') return 'customer';
  if (kind === 'note') return 'note';
  if (kind === 'assignment') return 'agent';
  return 'system';
}

export function toCaseDetail(api: ApiCaseDetail): CaseDetail {
  const customerName = api.customer || 'Unknown customer';
  const agentName = api.assignee?.name || 'Unassigned';
  const generatedCustomer = generateCaseDetail(api.id).customer;
  const timeline = api.timeline ?? [];
  const notes = (api.activity ?? []).filter((event) => event.kind === 'note');
  const deadlineMs = api.sla?.deadlineMs ?? Date.now();
  const slaTone: ChipTone =
    api.sla?.severity === 'breach'
      ? 'error'
      : api.sla?.severity === 'risk'
        ? 'warning'
        : 'success';

  return {
    id: api.id,
    priority: api.priority,
    priorityLabel: priorityLabel(api.priority),
    category: api.queue,
    opened: openedLabel(api.openedAt),
    channel: api.channel,
    title: api.subject,
    subtitle: api.bodyHtml.replace(/<[^>]*>/g, '').trim(),
    customer: {
      ...generatedCustomer,
      name: customerName,
      initials: initialsFor(customerName),
    } satisfies GeneratedCustomer,
    agent: {
      name: agentName,
      initials: initialsFor(agentName),
      tier: api.assignee?.tier || 'Unassigned',
      role: api.assignee?.kind === 'agent' ? 'Primary' : 'Unassigned',
    } satisfies GeneratedAgent,
    slas: [
      {
        label: 'Resolution target',
        deadlineMs,
        tag: api.sla?.severity === 'breach' ? 'Critical' : api.sla?.severity === 'risk' ? 'At risk' : 'On track',
        tagTone: slaTone,
      },
    ],
    slaPolicy: {
      name: `${api.priority.toUpperCase()} response policy`,
      badge: api.sla?.severity === 'breach' ? 'Breached' : 'Active',
      badgeTone: slaTone,
    },
    timeline: timeline.map((event) => ({
      kind: timelineKind(event.kind),
      author: event.actor || 'System',
      time: openedLabel(event.at),
      body: [event.title, event.sub].filter(Boolean).join(' — '),
    })),
    internalNotes: notes.map((note) => ({
      initials: initialsFor(note.actor || 'System'),
      name: note.actor || 'System',
      role: 'Support',
      time: openedLabel(note.at),
      body: [note.title, note.sub].filter(Boolean).join(' — '),
    })),
    relatedCases: (api.relatedCases ?? []).map((related) => ({
      id: related.id,
      priority: related.priority,
      title: related.subject,
      sub: related.customer,
    })),
  };
}

/* ---------- HTTP helpers ---------- */

interface ApiError extends Error {
  status: number;
  body?: string;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      `${method} ${path} failed: ${res.status} ${res.statusText}`,
    ) as ApiError;
    err.status = res.status;
    err.body = text;
    throw err;
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

function cleanCaseId(id: string): string {
  return encodeURIComponent(id.replace(/^#/, ''));
}

/* ---------- Public API ---------- */

export function fetchCaseDetail(
  id: string,
  signal?: AbortSignal,
): Promise<CaseDetail> {
  return request<ApiCaseDetail>(
    'GET',
    `/api/cases/${cleanCaseId(id)}`,
    undefined,
    signal,
  ).then(toCaseDetail);
}

export function fetchCaseList(signal?: AbortSignal): Promise<CaseListItem[]> {
  return request<CaseListItem[]>(
    'GET',
    '/api/cases?status=all&limit=500',
    undefined,
    signal,
  );
}

export function fetchDefaultCaseId(
  signal?: AbortSignal,
): Promise<DefaultCaseResponse> {
  return request<DefaultCaseResponse>(
    'GET',
    '/api/cases/default',
    undefined,
    signal,
  );
}

export function resolveCase(
  id: string,
  signal?: AbortSignal,
): Promise<MutationResult> {
  return request<MutationResult>(
    'POST',
    `/api/cases/${cleanCaseId(id)}/resolve`,
    { sendNotification: true },
    signal,
  );
}

export function escalateCase(
  id: string,
  targetTier = 'tier3',
  signal?: AbortSignal,
): Promise<MutationResult> {
  return request<MutationResult>(
    'POST',
    `/api/cases/${cleanCaseId(id)}/escalate`,
    { targetTier, reason: '' },
    signal,
  );
}

export function reassignCase(
  id: string,
  targetAgentId: string,
  signal?: AbortSignal,
): Promise<MutationResult> {
  return request<MutationResult>(
    'POST',
    `/api/cases/${cleanCaseId(id)}/reassign`,
    { targetAgentId },
    signal,
  );
}

export function addReply(
  id: string,
  bodyHtml: string,
  signal?: AbortSignal,
): Promise<MutationResult> {
  return request<MutationResult>(
    'POST',
    `/api/cases/${cleanCaseId(id)}/replies`,
    { bodyHtml, isInternal: false },
    signal,
  );
}

export function addNote(
  id: string,
  bodyHtml: string,
  signal?: AbortSignal,
): Promise<MutationResult> {
  return request<MutationResult>(
    'POST',
    `/api/cases/${cleanCaseId(id)}/notes`,
    { bodyHtml, visibility: 'internal' },
    signal,
  );
}
