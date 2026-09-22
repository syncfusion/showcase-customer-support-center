/* ------------------------------------------------------------------ *
 *  Automation API client
 *
 *  Talks to the Customer Support SLA backend over fetch. The
 *  backend is a minimal-ASP.NET app that exposes the following
 *  endpoints (see
 *  `backend/src/CustomerSupportSla.Api/Controllers/AutomationController.cs`):
 *
 *    GET  /api/automation/routing-rules
 *    GET  /api/automation/sla-policies
 *    GET  /api/automation/escalation-workflows/{id}
 *    GET  /api/automation/macros
 *    GET  /api/automation/impact
 *
 *  The SPA's Vite dev server (`localhost:5180` / `5181`) is
 *  allow-listed in the backend CORS policy, so the browser can
 *  call this origin directly without a proxy. A `VITE_API_BASE_URL`
 *  env var can override the base URL for other environments.
 *
 *  The wire types mirror the .NET DTOs in
 *  `CustomerSupportSla.Application.Dtos` and the anonymous
 *  shapes the `AutomationRepository` returns. Adapters in this
 *  file convert each wire DTO into the domain shapes the React
 *  tree already understands (`RoutingRule`, `SlaPolicy`,
 *  `BuilderStep`, `MacroCard`, `KpiSummary`, `ImpactMetric`,
 *  `CoverageSeries`) so `AutomationTab.tsx` doesn't have to
 *  learn the wire format.
 *
 *  Notes on wire-shape drift
 *  -------------------------
 *  The contract in `frontend/datamodels/automation.txt` is the
 *  aspirational wire shape — the repository currently emits a
 *  slightly simpler form. The adapters below tolerate both
 *  shapes so the client doesn't break when the repository
 *  fills in the additional fields later. Specifically:
 *
 *   • SLA policies: wire is `{ name, badge, badgeTone, deadlineMs,
 *     pills: [{label, value}] }`. The domain shape is
 *     `{ id, title, sub, strictness, strictnessTone, pills }`. We
 *     derive `id` from a slug of `name`, `title` from `name`, `sub`
 *     from a derived description, `strictness` from `badge`, and
 *     `strictnessTone` from `badgeTone`.
 *
 *   • KPI cards: wire is `{ id, label, value, chip, sub, spark,
 *     sparkColor }`. The domain shape is `{ id, label, value,
 *     chip, breakdown, spark, severity }`. We split the `sub` text
 *     ("12 routing · 8 escalation · 6 SLA") on `·` to synthesize
 *     the `breakdown` array, and we map the `sparkColor` to one
 *     of the four `KpiSeverity` values.
 *
 *   • Impact metrics: wire is `{ id, label, value, chip, pct,
 *     barTone, helper }`. The domain shape is identical except
 *     `barTone` is constrained to `'success' | 'info' | 'primary'`
 *     — we coerce the wire value to that union.
 *
 *   • Coverage: wire is `{ xLabels, series: { autoRouted,
 *     autoResolved, sla } }` (double-nested `series`). The
 *     domain shape is `{ xLabels, series: { autoRouted,
 *     autoResolved, sla } }` — we unwrap the outer nesting.
 * ------------------------------------------------------------------ */

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

export type EnvironmentKey = 'all' | 'prod' | 'staging' | 'dev';
export type TeamKey =
  | 'all'
  | 'platform'
  | 'billing'
  | 'account'
  | 'general';
export type RangeKey = '7d' | '30d' | '90d';
export type ImpactRange = '7d' | '30d' | '90d';

/* ---------- Routing rules ---------- */

export interface ApiRoutingRule {
  id: string;
  title: string;
  subtitle?: string;
  sub?: string;
  matchTeam?: string;
  matchPriority?: string;
  matchChannel?: string;
  routeToTeam?: string;
  routeToAgent?: string;
  active?: boolean;
  owner?: string;
  target?: string;
  matched?: number;
  /* Signed delta string for the match-count column,
   * e.g. `"+12%"`, `"−4%"`, `"0"`. Drives the small
   * coloured delta pill next to the formatted count. Not
   * produced by the backend today (the live server only
   * has the raw count); the adapter falls back to `"0"` if
   * the field is absent. */
  matchedDelta?: string;
  /* Most recent match timestamp as an ISO 8601 string
   * (e.g. `"2026-09-17T18:23:45Z"`). The grid formats this
   * into a relative label via `formatRelativeLastRun()`.
   * Empty string means "never matched". */
  lastRun?: string;
  status?: string;
  enabled?: boolean;
}

export interface ApiRoutingRulesResponse {
  items: ApiRoutingRule[];
}

/* ---------- SLA policies ---------- */

export interface ApiSlaPill {
  label: string;
  value: string;
}

export interface ApiSlaPolicy {
  id?: string;
  name?: string;
  badge?: string;
  badgeTone?: string;
  deadlineMs?: number;
  pills?: ApiSlaPill[];
  /* Aspirational contract fields — present when the repository
   * grows the richer shape. The adapter tolerates either. */
  title?: string;
  sub?: string;
  strictness?: string;
  strictnessTone?: string;
  queue?: string;
  priority?: string;
  responseMinutes?: number;
  resolutionMinutes?: number;
}

export interface ApiSlaPoliciesResponse {
  items: ApiSlaPolicy[];
}

/* ---------- Escalation workflows ---------- */

export interface ApiWorkflowStep {
  id: string;
  kind: string;
  title: string;
  expr?: string;
  sub?: string;
}

export interface ApiWorkflowPaletteItem {
  id?: string;
  label?: string;
  kind?: string;
  title?: string;
  sub?: string;
}

export interface ApiWorkflow {
  id: string;
  title: string;
  subtitle: string;
  steps: ApiWorkflowStep[];
  palette: ApiWorkflowPaletteItem[];
}

export interface ApiWorkflowResponse {
  workflow: ApiWorkflow;
}

/* ---------- Macros ---------- */

export interface ApiMacro {
  id: string;
  name?: string;
  shortcut?: string;
  body?: string;
  usage?: string;
  status?: string;
  title?: string;
  subtitle?: string;
  useCount?: number;
  ownerName?: string;
}

export interface ApiItemsResponse<T> {
  items: T[];
}

/* ---------- Impact (KPI strip + metrics + coverage) ---------- */

export interface ApiKpiCard {
  id?: string;
  label: string;
  value: string;
  chip?: { label: string; tone: ChipToneWire | string };
  /* Wire has `sub`; the domain shape wants `breakdown`. The
   * adapter splits `sub` on `·` to synthesize the breakdown
   * array, and tolerates an already-shaped `breakdown` for
   * forward compatibility. */
  sub?: string;
  breakdown?: Array<{ count: number; label: string; tone: ChipToneWire | string }>;
  spark?: Array<[number, number]>;
  sparkColor?: string;
  trend?: string;
  trendText?: string;
  tone?: ChipToneWire | string;
  /* Aspirational field — repository may return a `severity` enum
   * directly once the contract is fully wired up. */
  severity?: string;
}

export interface ApiKpiStrip {
  cards: ApiKpiCard[];
}

export interface ApiKpiStripEnvelope {
  cards: ApiKpiStrip;
}

export interface ApiImpactMetric {
  id?: string;
  label: string;
  value: string | number;
  chip?: { label: string; tone: ChipToneWire | string };
  pct?: number;
  barTone?: ChipToneWire | string;
  helper?: string;
  unit?: string;
  trend?: string;
  tone?: ChipToneWire | string;
}

export interface ApiImpactMetricEnvelope {
  card: ApiImpactMetric;
}

export interface ApiCoverageSeries {
  autoRouted: number[];
  autoResolved: number[];
  sla: number[];
}

export interface ApiCoverage {
  xLabels?: string[];
  series?: ApiCoverageSeries;
  /* Wire shape for the per-period coverage rows. Each
   * "row" is one x-axis bucket for the coverage chart:
   * the bucket label text (`period`) feeds the x-axis,
   * and the three percentages (`autoRouted` /
   * `autoResolved` / `sla`) feed the three line series.
   * The shape used to be per-channel (`channel` only),
   * but the wire was refactored so 7/30/90 day reporting
   * could surface N differently-shaped buckets per range
   * (daily / weekly / monthly). */
  rows?: Array<{
    period?: string;
    autoRouted?: number;
    autoResolved?: number;
    sla?: number;
    /* Legacy per-channel fields kept around for
     * back-compat with any older payload that still uses
     * them. The adapter ignores these — `period` + the
     * new percentages win. */
    channel?: string;
    automated?: number;
    total?: number;
    pct?: number;
  }>;
  /* The range the server synthesized these rows for
   * (e.g. `"7d"`, `"30d"`, `"90d"`). Forwarded to the SPA
   * so the chart subtitle ("Daily, last X days" /
   * "Weekly, last 30 days" / "Monthly, last 90 days")
   * + the CSV export stamp + the per-series data all
   * agree on a single range. Falls back to the URL param
   * the SPA already knows about when the envelope omits
   * the field. */
  range?: string;
}

export interface ApiCoverageEnvelope {
  series: ApiCoverage;
}

export interface ApiImpactResponse {
  kpis: { kpis: ApiKpiCard[] };
  metrics: { metrics: ApiImpactMetric[] };
  coverage: ApiCoverageEnvelope;
}

/* ---------- Filters ---------- */

export interface AutomationFilters {
  environment?: EnvironmentKey;
  team?: TeamKey;
  range?: RangeKey;
}

function buildQuery(filters: AutomationFilters): string {
  const sp = new URLSearchParams();
  if (filters.environment) sp.set('environment', filters.environment);
  if (filters.team) sp.set('team', filters.team);
  if (filters.range) sp.set('range', filters.range);
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

/* ---------- Domain types (mirror the AutomationTab interfaces) ---------- */

export type RuleStatus = 'active' | 'paused';
export type SlaStrictness = 'Strictest' | 'Tight' | 'Standard' | 'Relaxed';
export type BuilderKind = 'trigger' | 'condition' | 'action';
export type MacroStatus = 'active' | 'draft';
export type KpiSeverity = 'normal' | 'info' | 'warning' | 'critical';
export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface RoutingRule {
  id: string;
  title: string;
  sub: string;
  owner: string;
  target: string;
  matched: number;
  matchedDelta: string;
  lastRun: string;
  status: RuleStatus;
  enabled: boolean;
}

export interface SlaPolicy {
  id: string;
  title: string;
  sub: string;
  strictness: SlaStrictness;
  strictnessTone: ChipTone;
  pills: ApiSlaPill[];
}

export interface BuilderStep {
  id: string;
  kind: BuilderKind;
  title: string;
  expr: string;
}

export interface Workflow {
  id: string;
  title: string;
  subtitle: string;
  steps: BuilderStep[];
  palette: ApiWorkflowPaletteItem[];
}

export interface MacroCard {
  id: string;
  name: string;
  shortcut: string;
  body: string;
  usage: string;
  status: MacroStatus;
}

export interface KpiSummary {
  id: string;
  label: string;
  value: string;
  chip: { label: string; tone: ChipTone };
  breakdown: Array<{ count: number; label: string; tone: ChipTone }>;
  spark: Array<[number, number]>;
  severity: KpiSeverity;
}

export interface ImpactMetric {
  id: string;
  label: string;
  value: string;
  chip: { label: string; tone: ChipTone };
  pct: number;
  barTone: 'success' | 'info' | 'primary';
  helper: string;
}

export interface CoverageSeries {
  xLabels: string[];
  series: {
    autoRouted: number[];
    autoResolved: number[];
    sla: number[];
  };
}

/* ---------- Adapters (wire → domain) ---------- */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64) || 'item';
}

function normalizeChipTone(tone: string | undefined | null): ChipTone {
  switch ((tone ?? '').toLowerCase()) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
    case 'danger':
      return 'error';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}

function normalizeRuleStatus(status: string | undefined | null): RuleStatus {
  const s = (status ?? '').toLowerCase();
  if (s === 'paused' || s === 'disabled') return 'paused';
  return 'active';
}

function normalizeBuilderKind(kind: string | undefined | null): BuilderKind {
  const k = (kind ?? '').toLowerCase();
  if (k === 'condition' || k === 'c') return 'condition';
  if (k === 'action' || k === 'a' || k === 's') return 'action';
  return 'trigger';
}

function normalizeMacroStatus(status: string | undefined | null): MacroStatus {
  const s = (status ?? '').toLowerCase();
  if (s === 'draft') return 'draft';
  return 'active';
}

function normalizeSlaStrictness(badge: string | undefined | null): SlaStrictness {
  const b = (badge ?? '').toLowerCase();
  if (b === 'strictest') return 'Strictest';
  if (b === 'tight') return 'Tight';
  if (b === 'standard') return 'Standard';
  if (b === 'relaxed') return 'Relaxed';
  return 'Standard';
}

/* Map a `sparkColor` (CSS variable) to a `KpiSeverity`. The
 * repository currently sets `sparkColor` to one of the four
 * primary state colors; we use that as a stand-in for the
 * aspirational `severity` enum. */
function sparkColorToSeverity(sparkColor: string | undefined | null): KpiSeverity {
  const c = (sparkColor ?? '').toLowerCase();
  if (c.includes('success')) return 'normal';
  if (c.includes('warning')) return 'warning';
  if (c.includes('danger') || c.includes('critical')) return 'critical';
  if (c.includes('info')) return 'info';
  return 'info';
}

/* Coerce the wire `barTone` to the domain union. The repository
 * currently emits `'success' | 'info' | 'neutral'`; we map
 * `neutral` to `'primary'` so the progress bar still picks up
 * a color. */
function normalizeBarTone(tone: string | undefined | null): 'success' | 'info' | 'primary' {
  const t = (tone ?? '').toLowerCase();
  if (t === 'success') return 'success';
  if (t === 'info') return 'info';
  return 'primary';
}

/* Derive the `breakdown` array from the wire `sub` string when
 * the repository hasn't filled in the richer shape yet. The
 * sub-line in the wire is something like
 * "12 routing · 8 escalation · 6 SLA" — we split on `·` and
 * each fragment yields one breakdown entry whose count is the
 * leading number and whose label is the trailing text. */
function deriveBreakdown(
  breakdown: ApiKpiCard['breakdown'],
  sub: string | undefined,
  tone: ChipTone,
): Array<{ count: number; label: string; tone: ChipTone }> {
  if (breakdown && breakdown.length) {
    return breakdown.map((b) => ({
      count: b.count,
      label: b.label,
      tone: normalizeChipTone(b.tone),
    }));
  }
  if (!sub) return [];
  const parts = sub
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^(\d[\d,]*)\s+(.+)$/);
    if (match) {
      const count = parseInt(match[1].replace(/,/g, ''), 10);
      return { count: Number.isFinite(count) ? count : 0, label: match[2], tone };
    }
    return { count: 0, label: part, tone };
  });
}

export function toDomainRoutingRule(api: ApiRoutingRule): RoutingRule {
  const enabled = api.enabled ?? api.active ?? false;
  return {
    id: api.id,
    title: api.title,
    sub: api.sub ?? api.subtitle ?? '',
    owner: api.owner ?? api.routeToAgent ?? '',
    target: api.target ?? api.routeToTeam ?? '',
    matched: api.matched ?? 0,
    matchedDelta: api.matchedDelta ?? '0',
    lastRun: api.lastRun ?? '',
    status: normalizeRuleStatus(api.status ?? (enabled ? 'active' : 'paused')),
    enabled,
  };
}

/* Relative-time formatter for the "Last run" column.
 *
 * Why this lives here: the wire ships `lastRun` as an
 * ISO-8601 string (from `RoutingRuleDto.LastRun`), but the
 * SPA's grid renders a human label like "12m ago" or
 * "3 days ago". Syncfusion's React `GridComponent` will
 * pass the raw `field` value through `format` if provided,
 * but our `lastRun` is an ISO string with no clean culture-
 * neutral default formatter, so we resolve to a friendly
 * string client-side instead. Returning the raw ISO when
 * `null` would render as the literal string "Invalid Date"
 * for empty values — we collapse that to `"Never"` so the
 * cell stays presentable. */
export function formatRelativeLastRun(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return 'Never';
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return 'Never';
  const diffMs = now.getTime() - ts.getTime();
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

export function toDomainSlaPolicy(api: ApiSlaPolicy): SlaPolicy {
  const title = api.title ?? api.name ?? 'SLA policy';
  const pills = api.pills ?? [
    { label: 'First response', value: `${api.responseMinutes ?? 0}m` },
    { label: 'Resolution', value: `${api.resolutionMinutes ?? 0}m` },
  ];
  const strictness = (api.strictness as SlaStrictness) ?? normalizeSlaStrictness(api.badge);
  const strictnessTone = api.strictnessTone
    ? normalizeChipTone(api.strictnessTone)
    : normalizeChipTone(api.badgeTone);
  /* The wire doesn't carry a free-form sub-line; the UI renders
   * a scope line. We synthesize it from the pill labels so the
   * row still has a meaningful sub-line. */
  const sub =
    api.sub ??
    pills.map((p) => p.label).join(' · ') ??
    '';
  return {
    id: api.id ?? `sla-${slugify(title)}`,
    title,
    sub,
    strictness,
    strictnessTone,
    pills,
  };
}

export function toDomainWorkflowStep(api: ApiWorkflowStep): BuilderStep {
  return {
    id: api.id,
    kind: normalizeBuilderKind(api.kind),
    title: api.title,
    expr: api.expr ?? api.sub ?? '',
  };
}

export function toDomainWorkflow(api: ApiWorkflow): Workflow {
  return {
    id: api.id,
    title: api.title,
    subtitle: api.subtitle,
    steps: api.steps.map(toDomainWorkflowStep),
    palette: api.palette.map((item, index) => ({
      id: item.id ?? `palette-${index}`,
      label: item.label ?? item.title ?? item.kind ?? '',
    })),
  };
}

export function toDomainMacro(api: ApiMacro): MacroCard {
  return {
    id: api.id,
    name: api.name ?? api.title ?? 'Macro',
    shortcut: api.shortcut ?? '',
    body: api.body ?? api.subtitle ?? '',
    usage: api.usage ?? `Used ${api.useCount ?? 0}x`,
    status: normalizeMacroStatus(api.status),
  };
}

export function toDomainKpiSummary(api: ApiKpiCard): KpiSummary {
  const chipTone = normalizeChipTone(api.chip?.tone ?? api.tone);
  const severity = (api.severity as KpiSeverity | undefined) ?? sparkColorToSeverity(api.sparkColor ?? api.tone);
  return {
    id: api.id ?? slugify(api.label),
    label: api.label,
    value: api.value,
    chip: {
      label: api.chip?.label ?? api.trendText ?? '',
      tone: chipTone,
    },
    breakdown: deriveBreakdown(api.breakdown, api.sub, chipTone),
    /* The wire format on this endpoint is currently
     * `Array<{x: number, y: number}>` (objects) rather than the
     * `Array<[number, number]>` tuples the contract documents.
     * Normalize both shapes into the tuple form so the
     * Syncfusion `SparklineComponent` (which only reads `x` /
     * `y` properties) keeps working when the repository
     * eventually fills in the richer `breakdown` array. */
    spark: (api.spark ?? []).map((p) => {
      if (Array.isArray(p)) {
        return [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number];
      }
      const obj = p as { x?: number; y?: number };
      return [Number(obj.x ?? 0), Number(obj.y ?? 0)] as [number, number];
    }),
    severity,
  };
}

export function toDomainImpactMetric(api: ApiImpactMetric): ImpactMetric {
  const numericValue = Number(api.value) || 0;
  const isPercent = api.unit === '%';
  return {
    id: api.id ?? slugify(api.label),
    label: api.label,
    value: `${api.value}${api.unit && !isPercent ? ` ${api.unit}` : ''}`,
    chip: {
      label: api.chip?.label ?? api.trend ?? '',
      tone: normalizeChipTone(api.chip?.tone ?? api.tone),
    },
    pct: api.pct ?? (isPercent ? numericValue : 0),
    barTone: normalizeBarTone(api.barTone ?? api.tone),
    helper: api.helper ?? api.unit ?? '',
  };
}

export function toDomainCoverage(api: ApiCoverage): CoverageSeries {
  const rows = api.rows ?? [];
  if (rows.length > 0) {
    /* Each row now carries one x-axis bucket (`period`)
     * + three independent percentages (autoRouted,
     * autoResolved, sla) that feed the chart's three
     * line series directly. The range the server used
     * to synthesize the rows is also surfaced via
     * `range` on the envelope so the SPA can stamp
     * it into the chart subtitle + CSV export. The
     * legacy per-channel fields (`channel`, `automated`,
     * `total`, `pct`) are still tolerated so an older
     * payload shape doesn't break — when `period` is
     * absent we fall back to `channel` for the label,
     * and when no per-line percentage is present we
     * substitute the channel-level `pct` (matching the
     * pre-refactor behavior). */
    const rangeText = api.range;
    const labels = rows.map((row) => row.period ?? row.channel ?? '');
    const autoRouted = rows.map((row) =>
      Number(row.autoRouted ?? row.pct ?? 0),
    );
    const autoResolved = rows.map((row) =>
      Number(row.autoResolved ?? row.pct ?? 0),
    );
    const sla = rows.map((row) => Number(row.sla ?? 0));
    /* `range` is printed in the chart subtitle and the
     * CSV footer so the user can verify the export
     * matches what's on screen. The router also reads it
     * to drive the chart's x-axis bucket cadence. */
    void rangeText;
    return {
      xLabels: labels,
      series: { autoRouted, autoResolved, sla },
    };
  }
  const series = api.series ?? { autoRouted: [], autoResolved: [], sla: [] };
  return {
    xLabels: api.xLabels ?? [],
    series: {
      autoRouted: series.autoRouted,
      autoResolved: series.autoResolved,
      sla: series.sla,
    },
  };
}

/* ---------- Public API ---------- */

export function fetchRoutingRules(
  filters: AutomationFilters = {},
  signal?: AbortSignal,
): Promise<RoutingRule[]> {
  return request<ApiRoutingRulesResponse | ApiRoutingRule[]>(
    'GET',
    `/api/automation/routing-rules${buildQuery(filters)}`,
    undefined,
    signal,
  ).then((response) => {
    const rows = Array.isArray(response) ? response : response.items;
    return rows.map(toDomainRoutingRule);
  });
}

export function fetchSlaPolicies(
  filters: AutomationFilters = {},
  signal?: AbortSignal,
): Promise<SlaPolicy[]> {
  return request<ApiSlaPoliciesResponse | ApiSlaPolicy[]>(
    'GET',
    `/api/automation/sla-policies${buildQuery(filters)}`,
    undefined,
    signal,
  ).then((response) => {
    const rows = Array.isArray(response) ? response : response.items;
    return rows.map(toDomainSlaPolicy);
  });
}

export function fetchEscalationWorkflow(
  id: string,
  filters: AutomationFilters = {},
  signal?: AbortSignal,
): Promise<Workflow> {
  return request<ApiWorkflowResponse>(
    'GET',
    `/api/automation/escalation-workflows/${encodeURIComponent(id)}${buildQuery(filters)}`,
    undefined,
    signal,
  ).then((res) => toDomainWorkflow(res.workflow));
}

export function fetchMacros(
  filters: AutomationFilters = {},
  signal?: AbortSignal,
): Promise<MacroCard[]> {
  return request<ApiItemsResponse<ApiMacro> | ApiMacro[]>(
    'GET',
    `/api/automation/macros${buildQuery(filters)}`,
    undefined,
    signal,
  ).then((response) => {
    const rows = Array.isArray(response) ? response : response.items;
    return rows.map(toDomainMacro);
  });
}

export interface ImpactData {
  kpis: KpiSummary[];
  metrics: ImpactMetric[];
  coverage: CoverageSeries;
  /* The range the server's coverage payload reflects.
   * Either the FAQ-parsed string echoed back by the
   * coverage envelope or the URL parameter the SPA
   * passed — the SPA prefers the echoed value so a
   * server-side override (e.g. degraded range) is
   * honored without resorting back to the URL param.
   * The chart subtitle, the KPI strip label, and the
   * CSV export footer all read from here. */
  range: string;
}

export function fetchImpact(
  range: ImpactRange = '30d',
  signal?: AbortSignal,
): Promise<ImpactData> {
  return request<ApiImpactResponse>(
    'GET',
    `/api/automation/impact?range=${encodeURIComponent(range)}`,
    undefined,
    signal,
  ).then((res) => {
    const coverageWire = res.coverage.series ?? res.coverage;
    const coverage = toDomainCoverage(coverageWire);
    /* The server echoes the range it synthesized the
     * coverage rows for. When it's omitted (older
     * payload shape), fall back to the URL parameter
     * — the SPA still has a single, consistent value
     * to feed into the chart subtitle / CSV export. */
    const echoedRange = (coverageWire as { range?: string }).range ?? range;
    return {
      kpis: res.kpis.kpis.map(toDomainKpiSummary),
      metrics: res.metrics.metrics.map((metric) => toDomainImpactMetric(metric)),
      coverage,
      range: echoedRange,
    };
  });
}
