/* ------------------------------------------------------------------ *
 *  Queue API client
 *
 *  Talks to the Customer Support SLA backend over fetch. The
 *  backend is a minimal-ASP.NET app that exposes the following
 *  endpoints (see `backend/src/.../QueueController.cs`):
 *
 *    GET  /api/queue/tickets        — paged list of tickets
 *    GET  /api/queue/views          — counts for the saved-view pills
 *    GET  /api/queue/summary        — top-line summary tiles
 *    GET  /api/queue/filter-options — queue / channel / priority / agent
 *                                     lookups
 *    POST /api/queue/tickets        — create a ticket
 *
 *  The SPA's Vite dev server (`localhost:5180` / `5181`) is
 *  allow-listed in the backend CORS policy, so the browser can call
 *  this origin directly without a proxy. A `VITE_API_BASE_URL`
 *  env var can override the base URL for other environments.
 * ------------------------------------------------------------------ */

import type {
  AssigneeRef,
  ChannelKey,
  PriorityKey,
  Severity,
  Ticket,
  TicketStatus,
} from '../data/tickets';

/* ---------- Base URL ---------- */

const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || '';

function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return DEFAULT_BASE;
}

/* ---------- Wire types (mirror the .NET DTOs) ---------- */

export interface ApiAssignee {
  kind: 'agent' | 'unassigned';
  id: string;
  initials: string;
  name: string;
}

export interface ApiSla {
  deadlineMs: number;
  severity: Severity;
}

export interface ApiTicket {
  id: string;
  subject: string;
  customer: string;
  status: TicketStatus;
  priority: PriorityKey;
  queue: string;
  assignee: ApiAssignee;
  sla: ApiSla;
  channel: ChannelKey;
  ageMinutes: number;
}

export interface ApiPagedTickets {
  items: ApiTicket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiQueueSummary {
  open: number;
  breached: number;
  atRisk: number;
  unassigned: number;
  waiting: number;
  avgAgeMinutes: number;
}

export type ApiViewCounts = Record<string, number>;

export interface ApiLookupItem {
  id: string;
  label: string;
}

export interface ApiFilterOptions {
  dateRanges: ApiLookupItem[];
  queues: ApiLookupItem[];
  channels: ApiLookupItem[];
  priorities: ApiLookupItem[];
  agents: ApiLookupItem[];
  tiers: ApiLookupItem[];
}

/* ---------- Filters ---------- */

export interface QueueFilters {
  queue?: string;
  status?: string;
  priority?: string[];
  channel?: string[];
  search?: string;
  assignee?: string;
  sla?: string;
  age?: string;
  view?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(filters: QueueFilters): string {
  const sp = new URLSearchParams();
  if (filters.queue && filters.queue !== 'all') sp.set('queue', filters.queue);
  if (filters.status && filters.status !== 'all') sp.set('status', filters.status);
  if (filters.priority?.length) sp.set('priority', filters.priority.join(','));
  if (filters.channel?.length) sp.set('channel', filters.channel.join(','));
  if (filters.search?.trim()) sp.set('search', filters.search.trim());
  if (filters.assignee && filters.assignee !== 'all') sp.set('assignee', filters.assignee);
  if (filters.sla && filters.sla !== 'all') sp.set('sla', filters.sla);
  if (filters.age) sp.set('age', filters.age);
  if (filters.view && filters.view !== 'all') sp.set('view', filters.view);
  if (filters.page && filters.page > 1) sp.set('page', String(filters.page));
  if (filters.pageSize) sp.set('pageSize', String(filters.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/* ---------- Adapter (ApiTicket → domain Ticket) ---------- */

function normalizeId(id: string): string {
  return id.startsWith('#') ? id : `#${id}`;
}

function toAssigneeRef(a: ApiAssignee): AssigneeRef {
  if (a.kind === 'agent' && a.name) {
    return { kind: 'agent', initials: a.initials, name: a.name };
  }
  return { kind: 'unassigned' };
}

export function toDomainTicket(api: ApiTicket): Ticket {
  return {
    id: normalizeId(api.id),
    subject: api.subject,
    customer: api.customer,
    status: api.status,
    priority: api.priority,
    queue: api.queue as Ticket['queue'],
    assignee: toAssigneeRef(api.assignee),
    sla: { deadlineMs: api.sla.deadlineMs, severity: api.sla.severity },
    channel: api.channel,
    ageMinutes: api.ageMinutes,
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
  // 204 No Content / empty body
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

/* ---------- Public API ---------- */

export function fetchTickets(
  filters: QueueFilters,
  signal?: AbortSignal,
): Promise<ApiPagedTickets> {
  return request<ApiPagedTickets>(
    'GET',
    `/api/queue/tickets${buildQuery(filters)}`,
    undefined,
    signal,
  );
}

export function fetchViewCounts(signal?: AbortSignal): Promise<ApiViewCounts> {
  return request<ApiViewCounts>(
    'GET',
    '/api/queue/views?status=open',
    undefined,
    signal,
  );
}

export function fetchSummary(
  queue: string,
  signal?: AbortSignal,
): Promise<ApiQueueSummary> {
  const params = new URLSearchParams();
  if (queue && queue !== 'all') params.set('queue', queue);
  params.set('status', 'open');
  const q = params.toString();
  return request<ApiQueueSummary>(
    'GET',
    `/api/queue/summary?${q}`,
    undefined,
    signal,
  );
}

export function fetchFilterOptions(
  signal?: AbortSignal,
): Promise<ApiFilterOptions> {
  return request<ApiFilterOptions>(
    'GET',
    '/api/queue/filter-options',
    undefined,
    signal,
  );
}

export interface CreateTicketInput {
  subject: string;
  customer: string;
  queue: string;
  priority: PriorityKey;
  channel?: ChannelKey;
  assigneeId?: string | null;
}

export function createTicket(
  input: CreateTicketInput,
  signal?: AbortSignal,
): Promise<ApiTicket> {
  return request<ApiTicket>('POST', '/api/queue/tickets', input, signal);
}
