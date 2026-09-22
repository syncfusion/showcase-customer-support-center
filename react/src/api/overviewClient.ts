/* ------------------------------------------------------------------ *
 *  Overview API client
 *
 *  Talks to the Customer Support SLA backend over fetch. The
 *  backend is a minimal-ASP.NET app that exposes the following
 *  endpoints (see `backend/src/.../OverviewController.cs`):
 *
 *    GET  /api/overview/kpis                — 4 KPI cards + chart y-axis
 *    GET  /api/overview/trend               — volume / response series
 *    GET  /api/overview/channel-mix         — donut chart + legend
 *    GET  /api/overview/activity            — recent activity feed
 *    GET  /api/overview/workload            — agent workload list
 *    GET  /api/overview/at-risk-tickets     — at-risk & breached grid
 *    GET  /api/overview/breach-alert        — breach-alert banner
 *    GET  /api/overview/filter-options      — dateRange/queue/priority/...
 *                                             lookups for the toolbar
 *
 *  The SPA's Vite dev server (`localhost:5180`) is allow-listed in
 *  the backend CORS policy, so the browser can call this origin
 *  directly without a proxy. A `VITE_API_BASE_URL` env var can
 *  override the base URL for other environments.
 *
 *  The wire types mirror the .NET DTOs in
 *  `CustomerSupportSla.Application.Dtos`. Adapters in this file
 *  convert each wire DTO into the domain shapes the React tree
 *  already understands (`Ticket`, `Channel`, `ChipTone`, etc.) so
 *  `OverviewTab.tsx` doesn't have to learn the wire format.
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

/* ---------- Shared wire types ---------- */

export type ChipToneWire =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral';

export type RangeKey = '24h' | '7d' | '30d' | 'quarter' | 'custom';

export type ChannelFilterKey =
  | 'all'
  | 'Email'
  | 'Chat'
  | 'Phone'
  | 'Portal'
  | 'Social';

export type QueueFilterKey =
  | 'all'
  | 'Billing'
  | 'Platform'
  | 'Account'
  | 'General';

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

/* ---------- KPI ---------- */

export interface ApiKpiSparkPoint {
  x: number;
  y: number;
}

export interface ApiKpiCard {
  label: string;
  trend: 'up' | 'down' | 'flat';
  trendText: string;
  chip: { label: string; tone: ChipToneWire };
  spark: ApiKpiSparkPoint[];
  sparkColor: string;
}

export interface ApiKpisResponse {
  range: string;
  maxY: number;
  slaCompliance: ApiKpiCard;
  activeBreaches: ApiKpiCard;
  atRisk: ApiKpiCard;
  avgFirstResponse: ApiKpiCard;
}

/* ---------- Trend chart ---------- */

export interface ApiTrendResponse {
  range: string;
  labels: string[];
  maxY: number;
  interval: number;
  ticketsReceived: number[];
  ticketsResolved: number[];
  breaches: number[];
  responseTimeTarget: number[];
}

/* ---------- Channel mix ---------- */

export interface ApiChannelSlice {
  label: string;
  pct: number;
  color: string;
}

export interface ApiChannelMixResponse {
  range: string;
  total: number;
  slices: ApiChannelSlice[];
}

/* ---------- Activity feed ---------- */

export type ActivityIconKey =
  | 'shield'
  | 'trending'
  | 'settings'
  | 'check'
  | 'mail';

export interface ApiActivityItem {
  id: string;
  kind: string;
  title: string;
  subject: string;
  ticketId: string;
  ticketHref: string;
  sub: string;
  at: string; // ISO-8601
  tone: ChipToneWire;
  iconKey: ActivityIconKey;
  queue: Exclude<QueueFilterKey, 'all'>;
  priority: PriorityKey;
  channel: ChannelKey;
}

export interface ApiActivityResponse {
  items: ApiActivityItem[];
  nextCursor?: string | null;
}

/* ---------- Workload ---------- */

export interface ApiWorkloadItem {
  initials: string;
  name: string;
  sub: string;
  openCount: number;
  cap: number;
  loadPct: number;
  loadTone: Severity;
}

export interface ApiWorkloadResponse {
  items: ApiWorkloadItem[];
  onlineCount: number;
}

/* ---------- At-risk tickets (the grid) ---------- */

export interface ApiAssigneeWire {
  kind: 'agent' | 'unassigned';
  id: string;
  initials: string;
  name: string;
}

export interface ApiSla {
  deadlineMs: number;
  severity: Severity;
}

export interface ApiAtRiskTicket {
  id: string;
  subject: string;
  customer: string;
  status: TicketStatus;
  priority: PriorityKey;
  queue: Exclude<QueueFilterKey, 'all'>;
  assignee?: ApiAssigneeWire;
  assigneeName?: string | null;
  sla: ApiSla;
  channel: ChannelKey;
  ageMinutes: number;
}

export interface ApiAtRiskTicketsResponse {
  items: ApiAtRiskTicket[];
  total: number;
}

/* ---------- Breach alert ---------- */

export interface ApiBreachAlert {
  active: boolean;
  heading: string;
  subheading: string;
  ticketIds: string[];
  viewCasesHref: string;
}

/* ---------- Filters (shared) ---------- */

export interface OverviewFilters {
  range?: RangeKey;
  queue?: QueueFilterKey;
  priority?: PriorityKey[];
  channel?: ChannelFilterKey;
  expanded?: boolean;
  limit?: number;
  cursor?: string;
}

function buildQuery(filters: OverviewFilters): string {
  const sp = new URLSearchParams();
  if (filters.range) sp.set('range', filters.range);
  if (filters.queue && filters.queue !== 'all') sp.set('queue', filters.queue);
  if (filters.channel && filters.channel !== 'all') {
    sp.set('channel', filters.channel);
  }
  if (filters.priority?.length) {
    sp.set('priority', filters.priority.join(','));
  }
  if (filters.expanded !== undefined) {
    sp.set('expanded', filters.expanded ? 'true' : 'false');
  }
  if (filters.limit !== undefined) sp.set('limit', String(filters.limit));
  if (filters.cursor) sp.set('cursor', filters.cursor);
  const s = sp.toString();
  return s ? `?${s}` : '';
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

/* ---------- Adapters (wire → domain) ---------- */

function normalizeId(id: string | null | undefined): string {
  const raw = (id ?? '').toString();
  if (!raw) return '#UNKNOWN';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function toAssigneeRef(
  a: ApiAssigneeWire | null | undefined,
  assigneeName?: string | null,
): AssigneeRef {
  // The API may omit `assignee` for tickets that have just been
  // received and haven't been routed yet. Treat a missing payload
  // (and any unknown `kind`) as "unassigned" so the grid renders
  // the `Unassigned` placeholder cell instead of throwing.
  if (a && a.kind === 'agent' && a.name) {
    return { kind: 'agent', initials: a.initials, name: a.name };
  }
  if (assigneeName?.trim()) {
    const name = assigneeName.trim();
    const initials = name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return { kind: 'agent', initials, name };
  }
  return { kind: 'unassigned' };
}

/* Safe defaults for a "missing field" row. Picked so the SLA live
 * timer never crashes (deadlineMs is a future timestamp) and the
 * chip/priority/channel enum contracts are satisfied with the
 * least-alarming tone. The grid template treats subject/queue as
 * plain text, so the empty strings render as a blank row. */
const TICKET_DEFAULTS = {
  subject: '',
  customer: '',
  status: 'open' as TicketStatus,
  priority: 'p3' as PriorityKey,
  queue: 'General' as Ticket['queue'],
  channel: 'email' as ChannelKey,
  severity: 'ok' as Severity,
  ageMinutes: 0,
};

export function toDomainTicket(api: ApiAtRiskTicket | null | undefined): Ticket {
  // The backend may emit partially-formed tickets while a row is
  // mid-routing (no `sla`, no `assignee`, missing `id`, …). Rather
  // than crash the grid, synthesise a placeholder row from safe
  // defaults. If `api` itself is null/undefined — e.g. an element
  // inside `items` came back as `null` — fall through to the same
  // placeholder so the surrounding `.map` never short-circuits.
  //
  // Wire contract: GET /api/overview/at-risk-tickets returns a nested
  // `sla: { deadlineMs, severity }` field (matching the Queue / Cases
  // / Automation ticket SLA shape). Previously the backend returned
  // two flat fields — `slaDeadline: DateTime` + `slaSeverity: Severity`
  // — and the missing `sla` object tripped a `Date.now() + 60min`
  // fallback that made every row display the same `59m 38s left`. We
  // keep an api-null guard on the entire payload, but the inner `sla`
  // fallback is now 24h-ahead instead of 1h-ahead so a genuine
  // missing-sla row never masquerades as a healthy P1 / P2 ticket.
  const slaFromWire = api?.sla;
  const fallbackSla: ApiSla = slaFromWire
    ? slaFromWire
    : (() => {
        if (api && typeof console !== 'undefined') {
          console.warn(
            '[overviewClient] At-risk ticket row missing `sla` — check the AtRiskTicketDto wire contract.',
            api,
          );
        }
        return {
          deadlineMs: Date.now() + 24 * 60 * 60_000,
          severity: TICKET_DEFAULTS.severity,
        };
      })();
  return {
    id: normalizeId(api?.id),
    subject: api?.subject ?? TICKET_DEFAULTS.subject,
    customer: api?.customer ?? TICKET_DEFAULTS.customer,
    status: api?.status ?? TICKET_DEFAULTS.status,
    priority: api?.priority ?? TICKET_DEFAULTS.priority,
    queue: (api?.queue ?? TICKET_DEFAULTS.queue) as Ticket['queue'],
    assignee: toAssigneeRef(api?.assignee, api?.assigneeName),
    sla: fallbackSla,
    channel: api?.channel ?? TICKET_DEFAULTS.channel,
    ageMinutes: api?.ageMinutes ?? TICKET_DEFAULTS.ageMinutes,
  };
}

/* ---------- Public API ---------- */

export function fetchKpis(
  filters: OverviewFilters,
  signal?: AbortSignal,
): Promise<ApiKpisResponse> {
  /* The wire response wraps the four KPI cards in a `kpis` envelope
   * (`{ range, maxY, kpis: { slaCompliance, activeBreaches, ... } }`),
   * but the React consumer reads the card fields directly at the top
   * level of `useOverviewData().kpis.data`. Without flattening here
   * each `kpiSlaCompliance?.label` reads from the envelope object and
   * falls back to the placeholder (`—`).
   *
   * KPIs now honour the full filter set (`range` + `queue` +
   * `priority` + `channel`) on the wire so the card counts actually
   * change when the user changes anything in the toolbar. The
   * canonical `ApiKpisResponse` shape is preserved so every call-site
   * (the `data.kpis.data?.slaCompliance` chain in `OverviewTab.tsx`,
   * the hook's `DataSlice<ApiKpisResponse>`, and the trend chart's
   * `trendData.maxY`) keeps working without changes — we just unpack
   * the `kpis` envelope into the top level. */
  return request<
    ApiKpisResponse & {
      kpis?: {
        slaCompliance: ApiKpiCard;
        activeBreaches: ApiKpiCard;
        atRisk: ApiKpiCard;
        avgFirstResponse: ApiKpiCard;
      };
    }
  >(
    'GET',
    `/api/overview/kpis${buildQuery(filters)}`,
    undefined,
    signal,
  ).then((res) => {
    const bundle =
      res.kpis ?? {
        slaCompliance: res.slaCompliance,
        activeBreaches: res.activeBreaches,
        atRisk: res.atRisk,
        avgFirstResponse: res.avgFirstResponse,
      };
    const { kpis: _unused, ...flat } = res as ApiKpisResponse & {
      kpis?: unknown;
    };
    void _unused;
    return {
      ...flat,
      slaCompliance: bundle.slaCompliance,
      activeBreaches: bundle.activeBreaches,
      atRisk: bundle.atRisk,
      avgFirstResponse: bundle.avgFirstResponse,
    } satisfies ApiKpisResponse;
  });
}

export function fetchTrend(
  range: RangeKey,
  signal?: AbortSignal,
): Promise<ApiTrendResponse> {
  return request<ApiTrendResponse>(
    'GET',
    `/api/overview/trend?range=${encodeURIComponent(range)}`,
    undefined,
    signal,
  );
}

export function fetchChannelMix(
  range: RangeKey,
  signal?: AbortSignal,
): Promise<ApiChannelMixResponse> {
  return request<ApiChannelMixResponse>(
    'GET',
    `/api/overview/channel-mix?range=${encodeURIComponent(range)}`,
    undefined,
    signal,
  );
}

export function fetchActivity(
  filters: OverviewFilters,
  signal?: AbortSignal,
): Promise<ApiActivityResponse> {
  return request<ApiActivityResponse>(
    'GET',
    `/api/overview/activity${buildQuery(filters)}`,
    undefined,
    signal,
  );
}

export function fetchWorkload(
  expanded: boolean,
  limit: number,
  signal?: AbortSignal,
): Promise<ApiWorkloadResponse> {
  return request<ApiWorkloadResponse>(
    'GET',
    `/api/overview/workload?expanded=${expanded ? 'true' : 'false'}&limit=${limit}`,
    undefined,
    signal,
  );
}

export function fetchAtRiskTickets(
  filters: OverviewFilters,
  signal?: AbortSignal,
): Promise<ApiAtRiskTicketsResponse> {
  return request<ApiAtRiskTicketsResponse>(
    'GET',
    `/api/overview/at-risk-tickets${buildQuery(filters)}`,
    undefined,
    signal,
  );
}

export function fetchBreachAlert(
  range: RangeKey,
  signal?: AbortSignal,
): Promise<ApiBreachAlert> {
  return request<ApiBreachAlert>(
    'GET',
    `/api/overview/breach-alert?range=${encodeURIComponent(range)}`,
    undefined,
    signal,
  );
}

export function fetchFilterOptions(
  signal?: AbortSignal,
): Promise<ApiFilterOptions> {
  return request<ApiFilterOptions>(
    'GET',
    '/api/overview/filter-options',
    undefined,
    signal,
  );
}

/* ---------- Mutations (§9) ----------
 *
 * Each helper is a thin `request('POST', ...)` wrapper that hits the
 * matching backend endpoint and returns the typed wire response. The
 * Overview dialogs fire a toast on success and re-fetch the relevant
 * GET slice (at-risk tickets / breach alert) so the UI stays in sync
 * with the server.
 */

export interface OverviewAssigneeWire {
  initials: string;
  name: string;
}

export interface ReassignedRefWire {
  ticketId: string;
  newAssignee: OverviewAssigneeWire;
}

export interface SkippedRefWire {
  ticketId: string;
  reason: string;
}

export interface BreachAlertReassignRequest {
  ticketIds: string[];
  targetAgentId: string;
  reason?: string;
}

export interface BreachAlertReassignResponse {
  reassigned: ReassignedRefWire[];
  skipped: SkippedRefWire[];
}

export interface TicketReassignRequest {
  intent: 'reassign' | 'escalate';
  targetAgentId: string;
  note?: string;
}

export interface TicketReassignResponse {
  ticketId: string;
  newAssignee: OverviewAssigneeWire;
  intent: 'reassign' | 'escalate';
  at: string;
}

export interface BulkEscalateRequest {
  ticketIds: string[];
  targetTier: 'tier1' | 'tier2' | 'tier3';
  reason?: string;
}

export interface BulkEscalateResponse {
  escalated: ReassignedRefWire[];
  skipped: SkippedRefWire[];
}

export interface NoteAddRequest {
  body: string;
  visibility?: 'internal' | 'public';
}

export interface NoteAddResponse {
  ticketId: string;
  noteId: string;
  at: string;
}

export interface CloseDuplicateRequest {
  mergedIntoTicketId: string;
  reason?: string;
}

export interface CloseDuplicateResponse {
  ticketId: string;
  mergedInto: string;
  at: string;
}

export function reassignBreachAlert(
  body: BreachAlertReassignRequest,
  signal?: AbortSignal,
): Promise<BreachAlertReassignResponse> {
  return request<BreachAlertReassignResponse>(
    'POST',
    '/api/overview/breach-alert/reassign',
    body,
    signal,
  );
}

export function reassignTicket(
  ticketId: string,
  body: TicketReassignRequest,
  signal?: AbortSignal,
): Promise<TicketReassignResponse> {
  return request<TicketReassignResponse>(
    'POST',
    `/api/overview/tickets/${encodeURIComponent(ticketId)}/reassign`,
    body,
    signal,
  );
}

export function bulkEscalate(
  body: BulkEscalateRequest,
  signal?: AbortSignal,
): Promise<BulkEscalateResponse> {
  return request<BulkEscalateResponse>(
    'POST',
    '/api/overview/tickets/bulk-escalate',
    body,
    signal,
  );
}

export function addTicketNote(
  ticketId: string,
  body: NoteAddRequest,
  signal?: AbortSignal,
): Promise<NoteAddResponse> {
  return request<NoteAddResponse>(
    'POST',
    `/api/overview/tickets/${encodeURIComponent(ticketId)}/notes`,
    body,
    signal,
  );
}

export function closeTicketAsDuplicate(
  ticketId: string,
  body: CloseDuplicateRequest,
  signal?: AbortSignal,
): Promise<CloseDuplicateResponse> {
  return request<CloseDuplicateResponse>(
    'POST',
    `/api/overview/tickets/${encodeURIComponent(ticketId)}/close-duplicate`,
    body,
    signal,
  );
}
