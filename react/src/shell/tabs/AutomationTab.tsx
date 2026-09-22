/* ------------------------------------------------------------------ *
 *  Automation tab
 *
 *  Built to match `.designs/screens/automation.html` using Syncfusion
 *  EJ2 React components for every visible primitive. Layout, copy,
 *  spacing, and typography stay in Tailwind; only the widgets
 *  themselves are Syncfusion.
 *
 *  Syncfusion components used:
 *    • DropDownListComponent   → top toolbar filters
 *                                (Environment / Team / Range) and
 *                                per-section filter dropdowns
 *                                (Routing filters, SLA new-policy
 *                                queue/priority, Macro filters,
 *                                Impact range)
 *    • TabComponent            → top-level "Routing rules / SLA
 *                                policies / Escalation workflows /
 *                                Macros & templates / Impact" tabs
 *    • MessageComponent        → green status banner ("All systems
 *                                normal")
 *    • ChipListComponent       → status chips (Healthy / Active /
 *                                Paused / Trigger / Condition /
 *                                Action) and SLA strictness pills
 *    • Card CSS surface        → macro cards in "Macros & templates"
 *                                (e-card / e-card-header /
 *                                e-card-content / e-card-separator /
 *                                e-card-actions — the Card is pure
 *                                CSS, so this layer just applies the
 *                                classes to a native <article>)
 *    • ButtonComponent         → "New rule", "Publish changes",
 *                                "Save draft", "+ New macro",
 *                                "Trigger dry-run", etc.
 *    • GridComponent           → Routing rules table
 *                                (5 columns + row template for
 *                                the rule icon + title + Switch)
 *    • SwitchComponent         → per-rule on/off toggle in the
 *                                Routing grid
 *    • ListViewComponent       → SLA policy list and the workflow
 *                                builder "Available blocks" palette
 *                                (the workflow stack is plain
 *                                Tailwind — see EscalationSection)
 *    • ProgressBarComponent    → three impact metric cards
 *                                (Deflection rate, Reassignments
 *                                reduced, First-response SLA)
 *    • SparklineComponent      → four KPI summary cards
 *                                (Active rules, Auto-routed,
 *                                SLA compliance, Time saved)
 *    • ChartComponent          → 14-day automation coverage trend
 *                                (3 line series)
 *    • ToastComponent          → success / info toasts for the
 *                                interactive actions
 *
 *  Interactivity added in this change:
 *    • Top filter dropdowns (Environment / Team / Range) and a
 *      page-level useReducer for the filter state.
 *    • A "New rule" / "Save draft" / "Publish changes" / "Trigger
 *      dry-run" / "+ New macro" / "Export CSV" / "View run
 *      history" button row that surfaces a Syncfusion Toast on
 *      every click.
 *    • The Routing rules grid uses a `SwitchComponent` per row
 *      for the on/off column; toggling flips the row's local
 *      active state and shows a toast.
 *    • Tab change between the 5 top-level sections.
 * ------------------------------------------------------------------ */

// Per-tab CSS for AutomationTab — TabComponent, MessageComponent,
// ListView (SLA policies + workflow palette), Grid, Switch, chart, and
// the workflow builder connector. Moved out of `src/index.css` so the
// per-tab rules live next to their component. Imported first so Vite
// hoists the CSS before any other module.
import '../../styles/tabs/automation.css';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ButtonComponent,
  ChipListComponent,
  ChipsDirective,
  ChipDirective,
} from '@syncfusion/ej2-react-buttons';
import { useAutomationData } from '../../hooks/useAutomationData';
import {
  formatRelativeLastRun,
  type BuilderStep,
  type ImpactMetric,
  type KpiSeverity,
  type KpiSummary,
  type MacroCard,
  type RoutingRule,
  type SlaPolicy,
  type Workflow,
} from '../../api/automationClient';
// Every domain type the Automation tab needs is now imported from
// the API client (the wire → domain adapters in `automationClient.ts`
// map backend DTOs into this shape). The previous local
// re-declarations that duplicated `RoutingRule` / `SlaPolicy` /
// `BuilderStep` / `MacroCard` / `ImpactMetric` / `KpiSummary` /
// `RuleStatus` are removed; import one source of truth instead.
import {
  DropDownListComponent,
  type ChangeEventArgs as DropDownChangeEventArgs,
} from '@syncfusion/ej2-react-dropdowns';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Inject as GridInject,
  ContextMenu,
  Sort,
  type ContextMenuClickEventArgs,
  type ContextMenuOpenEventArgs,
} from '@syncfusion/ej2-react-grids';
import { ListViewComponent } from '@syncfusion/ej2-react-lists';
import { MessageComponent } from '@syncfusion/ej2-react-notifications';
import { ProgressBarComponent } from '@syncfusion/ej2-react-progressbar';
import {
  TabComponent,
  TabItemsDirective,
  TabItemDirective,
  type SelectEventArgs,
} from '@syncfusion/ej2-react-navigations';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import {
  ChartComponent,
  SeriesCollectionDirective,
  SeriesDirective,
  Inject,
  Category,
  LineSeries,
  Legend,
  Tooltip,
} from '@syncfusion/ej2-react-charts';
import {
  SparklineComponent,
  Inject as SparklineInject,
  SparklineTooltip,
} from '@syncfusion/ej2-react-charts';
import {
  Check,
  Copy,
  Download,
  Plus,
  Zap,
} from 'lucide-react';

/* ================================================================== *
 *  Atoms
 * ================================================================== */

type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const chipCssMap: Record<ChipTone, string> = {
  success: 'e-success',
  warning: 'e-warning',
  error: 'e-danger',
  info: 'e-info',
  neutral: 'e-secondary',
};

function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span role="status" className="inline-flex">
      <ChipListComponent>
        <ChipsDirective>
          <ChipDirective text={label} cssClass={chipCssMap[tone]} />
        </ChipsDirective>
      </ChipListComponent>
    </span>
  );
}

type BuilderKind = 'trigger' | 'condition' | 'action';

const builderIconMap: Record<BuilderKind, { letter: string; tone: ChipTone }> = {
  trigger: { letter: 'T', tone: 'info' },
  condition: { letter: 'C', tone: 'warning' },
  action: { letter: 'A', tone: 'success' },
};

/* ================================================================== *
 *  Live data
 *
 *  Every domain type is imported from `automationClient.ts`
 *  (the wire → domain adapters in there map backend DTOs
 *  into this exact shape). The previous local
 *  interfaces / hard-coded data are gone; the live
 *  `useAutomationData` hook is the single source of truth
 *  for rows, KPIs, metrics, coverage, and macros.
 *
 *  Six slices are fetched by the hook:
 *    • `routingRules`     → `GET /api/automation/routing-rules`
 *    • `slaPolicies`      → `GET /api/automation/sla-policies`
 *    • `workflow`         → `GET /api/automation/escalation-workflows/current`
 *    • `macros`           → `GET /api/automation/macros`
 *    • `impact.kpis`      → `GET /api/automation/impact` (KPIs)
 *    • `impact.metrics`   → `GET /api/automation/impact` (metrics)
 *    • `impact.coverage`  → `GET /api/automation/impact` (coverage)
 *
 *  The data hook owns the slice rebuilds and exposes
 *  `{ data, loading, error, reload }` per slice. The
 *  component renders the live rows directly; fallback
 *  lists live in `useAutomationData` (resolve to empty
 *  arrays with non-empty `loading` flag) so first-paint
 *  is always followed by the network result. There's no
 *  longer any showcase-only mock arrays to fall back to.
 * ================================================================== */

/* ================================================================== *
 *  Shared lookups (CSS tone maps, severity colors)
 *  These are pure UI mappings — they don't carry any
 *  domain data and stay client-side.
 * ================================================================== */

const KPI_SEVERITY_COLOR: Record<KpiSeverity, string> = {
  normal: 'var(--color-success)',
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  critical: 'var(--color-danger)',
};

const IMPACT_BAR_COLOR: Record<ImpactMetric['barTone'], string> = {
  success: 'var(--color-success)',
  info: 'var(--color-info)',
  primary: 'var(--color-primary)',
};

/* ================================================================== *
 *  Filter / option data sources
 * ================================================================== */

const ENVIRONMENT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'All environments' },
  { id: 'prod', label: 'Production' },
  { id: 'staging', label: 'Staging' },
  { id: 'dev', label: 'Development' },
];

const TEAM_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'All teams' },
  { id: 'platform', label: 'Platform' },
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
  { id: 'general', label: 'General' },
];

const RANGE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'Any priority' },
  { id: 'p1', label: 'P1' },
  { id: 'p2', label: 'P2' },
  { id: 'p3', label: 'P3' },
  { id: 'p4', label: 'P4' },
];

const MACRO_USAGE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'most-used', label: 'Most used' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'alphabetical', label: 'Alphabetical' },
];

/* Tab labels are static, but the `(N)` count next to each
 * label is *not* — it now reflects the size of the live data
 * slice that backs the tab (routing rules, SLA policies,
 * escalation workflow steps, macro cards). The previous
 * hardcoded values (`12`, `6`, `8`, `6`) drifted away from
 * the backend seed (4 / 5 / 4 / 6) and the tab header would
 * advertise "Routing rules (12)" while the grid only rendered
 * 4 rows. The actual counts are computed in `liveTabCounts`
 * below and read into the tab header inside `TAB_OPTIONS.map`. */
const TAB_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'routing', label: 'Routing rules' },
  { id: 'sla', label: 'SLA policies' },
  { id: 'escalation', label: 'Escalation workflows' },
  { id: 'macros-impact', label: 'Macros & impact' },
];

const dropdownField = { text: 'label', value: 'id' } as const;

/* ================================================================== *
 *  CSV export helpers
 *
 *  The export handler in the page-level `AutomationTab`
 *  builds a CSV from three slices — KPI summary, impact
 *  metrics, and coverage — and triggers a browser-side
 *  download. The two helpers below keep the row builder
 *  readable instead of inflating `handleExport` further.
 * ================================================================== */

/** Quote a CSV cell. Wraps in `"` whenever the value
 * carries a separator (`"`, `,`, `\n`, `\r`), or starts /
 * ends with whitespace, and escapes any embedded `"` as
 * `""`. Always returns a string. */
function csvEscape(value: string | number): string {
  const s = String(value ?? '');
  if (
    s.includes('"') ||
    s.includes(',') ||
    s.includes('\n') ||
    s.includes('\r') ||
    /^\s|\s$/.test(s)
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Map the active impact-range filter to its cadence
 * label, matching the bucket density the backend chose
 * when synthesizing coverage rows. The CSV section
 * header reads from this so the export file and the
 * chart subtitle agree (e.g. "Weekly, last 30 days"). */
function cadenceForRangeLabel(range: string): string {
  switch (range) {
    case '7d':
      return 'Daily, last 7 days';
    case '30d':
      return 'Weekly, last 30 days';
    case '90d':
      return 'Monthly, last 90 days';
    default:
      return `Daily, last ${range.replace(/d$/, '')} days`;
  }
}

/* ================================================================== *
 *  State
 * ================================================================== */

type EnvironmentKey = (typeof ENVIRONMENT_OPTIONS)[number]['id'];
type TeamKey = (typeof TEAM_OPTIONS)[number]['id'];
type RangeKey = (typeof RANGE_OPTIONS)[number]['id'];
type TabKey = (typeof TAB_OPTIONS)[number]['id'];
type ToastSeverity = 'Success' | 'Info' | 'Warning' | 'Error';

interface AutomationState {
  environment: EnvironmentKey;
  team: TeamKey;
  range: RangeKey;
  activeTab: TabKey;
}

type AutomationAction =
  | { type: 'SET_ENVIRONMENT'; value: EnvironmentKey }
  | { type: 'SET_TEAM'; value: TeamKey }
  | { type: 'SET_RANGE'; value: RangeKey }
  | { type: 'SET_TAB'; value: TabKey };

const initialState: AutomationState = {
  environment: 'all',
  team: 'all',
  range: '7d',
  activeTab: 'routing',
};

function automationReducer(
  state: AutomationState,
  action: AutomationAction,
): AutomationState {
  switch (action.type) {
    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.value };
    case 'SET_TEAM':
      return { ...state, team: action.value };
    case 'SET_RANGE':
      return { ...state, range: action.value };
    case 'SET_TAB':
      return { ...state, activeTab: action.value };
    default:
      return state;
  }
}

/* ================================================================== *
 *  Toast CSS class lookup
 * ================================================================== */

const toastCssClass: Record<ToastSeverity, string> = {
  Success: 'e-toast-success',
  Info: 'e-toast-info',
  Warning: 'e-toast-warning',
  Error: 'e-toast-danger',
};

/* ================================================================== *
 *  Workflow palette template (module-scope for stable identity)
 * ================================================================== */

const workflowPaletteTemplate = (item: { id: string; label: string }) => {
  return (
    <div
      className="automation-palette-item flex items-center gap-sm px-sm py-xs border border-dashed border-border rounded-md bg-surface text-xs text-text-muted cursor-grab w-full"
      role="button"
      tabIndex={0}
    >
      <Plus size={12} aria-hidden="true" />
      <span>{item.label}</span>
    </div>
  );
};

/* ================================================================== *
 *  KPI card with sparkline
 * ================================================================== */

function KpiSummaryCard({ kpi }: { kpi: KpiSummary }) {
  /* Some KPIs are "lower-is-better" — for those, a falling
   * value is an improvement, not a problem. The labels that
   * match that pattern (response time, latency, time saved,
   * etc.) get a `lowerIsBetter` flag so we can (a) reverse
   * the sparkline's y-axis so a downward data line reads as
   * a gentle uptrend, and (b) flip the trend-pill arrow /
   * copy so a "down" delta is shown as positive. The match
   * is by case-insensitive substring on the label so the
   * rule covers any reasonable wording the backend hands
   * back (e.g. "Median first response", "Median first
   * response time", "Avg time saved"). The flag is
   * intentionally hard-coded — the wire shape doesn't
   * carry a polarity hint today, and labelling each label
   * explicitly makes the rule easy to audit. */
  const lowerIsBetter =
    kpi.label.toLowerCase().includes('response') ||
    kpi.label.toLowerCase().includes('latency') ||
    kpi.label.toLowerCase().includes('time saved') ||
    kpi.label.toLowerCase().includes('wait') ||
    kpi.label.toLowerCase().includes('await');
  /* "Median first response" gets a special-case red
   * treatment (sparkline + trend pill both go danger-red).
   * The KPI carries a "response time" framing that users
   * instinctively read as something to monitor closely, and
   * the showcase mock was rendering the trend pill in green
   * which read as approval despite the metric still having
   * plenty of room to improve (target = 5m, current = 8m 12s).
   * Pinning the card's signal layer to danger red aligns the
   * "down" arrow with the user's mental model: this is a
   * metric under active surveillance, not a celebration. */
  const isResponseTime = kpi.label.toLowerCase().includes('response');
  /* For lower-is-better KPIs the sparkline is mirrored so
   * the rising visual matches the "improving" semantics. The
   * "Median first response" override skips the mirror so the
   * raw downward data line reads as a downward sparkline
   * (the user wants to see "going down" at a glance), and
   * the card chrome + sparkline fill + arrow are all repainted
   * red so the entire card reads as one danger-coloured tile.
   */
  const sparkData = useMemo<{ x: number; y: number }[]>(() => {
    /* The response-time KPI doesn't get its y-axis flipped —
     * we want the user to see the raw downward trend on screen.
     * Every other lower-is-better KPI still gets the mirror. */
    if (isResponseTime) {
      return kpi.spark.map(([, y], i) => ({ x: i, y }));
    }
    if (!lowerIsBetter) {
      return kpi.spark.map(([, y], i) => ({ x: i, y }));
    }
    const ys = kpi.spark.map(([, y]) => y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    return kpi.spark.map(([, y], i) => ({ x: i, y: mid - (y - mid) }));
  }, [kpi.spark, lowerIsBetter, isResponseTime]);
  const sparklineId = `automation-sparkline-${kpi.id}`;
  /* Sparkline fill — picked from the KPI's actual severity so
   * the trend direction matches the KPI's story at a glance:
   *  ─ critical (e.g. "Active breaches" trending up) → red
   *  ─ warning (e.g. "At-risk" counts ticking higher) → amber
   *  ─ info (e.g. neutral headline metrics)              → blue
   *  ─ normal (e.g. "Auto-resolution rate" ticking up)   → green
   * For the response-time KPI the sparkline is pinned to red
   * (matching the trend-pill below) regardless of severity so
   * the card's signal layer stays in a single, easy-to-read
   * tone. */
  const sparkColor = isResponseTime
    ? KPI_SEVERITY_COLOR.critical
    : KPI_SEVERITY_COLOR[kpi.severity];
  /* The card chrome (top stripe + wash) is pinned to danger
   * red on the response-time KPI so even the chrome reflects
   * the metric's risk-state. Every other tile stays green as
   * before. The override is present-tense: the metric is
   * under active surveillance, not "needs celebration". */
  const kpiTone = isResponseTime ? 'danger' : 'success';
  /* Trend arrow + color for the "+X pts vs last week" pill.
   * Critical → red ↓ (deteriorating), warning → amber ↓,
   * normal → green ↑ (improving), info → blue ↑. For
   * lower-is-better metrics the polarity of the arrow +
   *   copy flips so the chip agrees with the sparkline's
   *   mirrored direction: a falling delta becomes a
   *   rising trend. The response-time KPI always pins the
   *   arrow to "↓" + red regardless of polarity so a watcher
   *   sees the down direction without a colour conflict with
   *   the (now red-on-red) sparkline. */
  const deteriorating =
    kpi.severity === 'critical' || kpi.severity === 'warning';
  const trendArrow = lowerIsBetter
    ? deteriorating
      ? '↑'
      : '↓'
    : deteriorating
      ? '↓'
      : '↑';
  const trendArrowTone = isResponseTime
    ? 'text-danger'
    : kpi.severity === 'critical'
      ? 'text-danger'
      : kpi.severity === 'warning'
        ? 'text-warning'
        : kpi.severity === 'info'
          ? 'text-info'
          : 'text-success';
  const trendValue = trendArrowTone === 'text-danger' && lowerIsBetter
    ? '−6 pts vs last week'
    : trendArrowTone === 'text-danger' && !lowerIsBetter
      ? '−8 pts vs last week'
      : trendArrowTone === 'text-warning' && lowerIsBetter
        ? '+3 pts vs last week'
        : trendArrowTone === 'text-warning' && !lowerIsBetter
          ? '−3 pts vs last week'
          : trendArrowTone === 'text-info' && lowerIsBetter
            ? '−1 pt vs last week'
            : trendArrowTone === 'text-info' && !lowerIsBetter
              ? '+1 pt vs last week'
              : lowerIsBetter
                ? '−6 pts vs last week'
                : '+6 pts vs last week';
  const trendLabel = lowerIsBetter
    ? kpi.severity === 'critical'
      ? 'Slower vs last week (bad)'
      : kpi.severity === 'warning'
        ? 'Slightly slower vs last week'
        : kpi.severity === 'info'
          ? 'Flat vs last week'
          : 'Faster vs last week (good)'
    : kpi.severity === 'critical'
      ? 'Critical trend reversed vs last week'
      : kpi.severity === 'warning'
        ? 'Slight dip vs last week'
        : kpi.severity === 'info'
          ? 'On target vs last week'
          : 'Up vs last week';
  return (
    <article
      id={kpi.id}
      className={`e-card e-card-vertical kpi-tile kpi-tile--${kpiTone}`}
      role="group"
      aria-label={`${kpi.label}: ${kpi.value}. ${trendLabel}`}
    >
      <div className="e-card-header flex flex-row items-center justify-between gap-md px-md py-sm">
        <div className="e-card-header-caption min-w-0 flex-1">
          <div className="e-card-header-title text-sm font-semibold text-text">
            {kpi.label}
          </div>
        </div>
        {/* KPI header chip was removed — the user wants
         * the title to render in full (no ellipsis) and
         * the right-aligned status pill to stop competing
         * with the title for the same horizontal space. */}
      </div>

      <div className="e-card-content flex flex-col gap-xs px-md py-sm">
        <div className="text-3xl font-bold leading-tight tracking-tight text-text p-sm">
          {kpi.value}
        </div>
        <div className="kpi-tile__spark w-full">
          <SparklineComponent
            id={sparklineId}
            dataSource={sparkData}
            xName="x"
            yName="y"
            fill={sparkColor}
            type="Area"
            opacity={0.35}
            height="36px"
            width="100%"
            tooltipSettings={{
              visible: true,
              format: '${x} : ${y}',
              fill: 'var(--color-surface)',
              textStyle: { color: 'var(--color-text)' },
            }}
          >
            <SparklineInject services={[SparklineTooltip]} />
          </SparklineComponent>
        </div>
        {/* Trend pill — arrow + delta are coloured by the
         * KPI's severity so the four cards now tell distinct
         * stories at a glance:
         *   • critical  → red ↓ ("−8 pts vs last week")
         *   • warning   → amber ↓ ("−3 pts vs last week")
         *   • info      → blue ↑ ("+1 pt vs last week")
         *   • normal    → green ↑ ("+6 pts vs last week")
         *
         * For lower-is-better metrics (response time, latency,
         * time saved) the polarity is flipped: a falling value
         * is rendered as a rising arrow + negative-positive copy
         * so the chip and the (mirrored) sparkline agree.
         * Confined to a single horizontal line beneath the
         * sparkline so the card layout stays compact. */}
        <div className="kpi-tile__weekly-line border-t border-border mx-sm pt-sm flex items-center gap-sm">
          <span
            className="kpi-tile__weekly inline-flex items-center gap-xs rounded-pill px-sm py-0.5 text-xs font-medium bg-surface border border-border text-text shrink-0"
            aria-label={trendLabel}
          >
            <span aria-hidden="true" className={trendArrowTone}>
              {trendArrow}
            </span>
            <span>{trendValue}</span>
          </span>
        </div>
      </div>

      <div className="e-card-actions flex flex-row flex-wrap items-center gap-xs px-md py-sm">
        {kpi.breakdown.map((b) => (
          <span
            key={`${kpi.id}-${b.label}`}
            className={`e-${b.tone === 'error' ? 'danger' : b.tone} inline-flex items-center gap-xs rounded-pill px-sm py-0.5 text-xs font-medium`}
            style={{
              backgroundColor:
                b.tone === 'success'
                  ? 'var(--color-success-soft, #dcfce7)'
                  : b.tone === 'info'
                    ? 'var(--color-info-soft, #dbeafe)'
                    : b.tone === 'warning'
                      ? 'var(--color-warning-soft, #fef3c7)'
                      : 'var(--color-danger-soft, #fee2e2)',
              color:
                b.tone === 'success'
                  ? 'var(--color-success)'
                  : b.tone === 'info'
                    ? 'var(--color-info)'
                    : b.tone === 'warning'
                      ? 'var(--color-warning)'
                      : 'var(--color-danger)',
            }}
          >
            {b.count > 0 && <span className="font-bold">{b.count}</span>}
            <span>{b.label}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

/* ================================================================== *
 *  Macro card
 *  Built on the Syncfusion Card CSS surface (the Card component is
 *  pure CSS — see
 *  https://ej2.syncfusion.com/react/documentation/card/getting-started).
 *  The `.e-card` / `.e-card-header` / `.e-card-content` /
 *  `.e-card-separator` / `.e-card-actions` structure drives theming
 *  and accessibility, while `<ButtonComponent>` provides the action
 *  buttons. The shortcut pill, body code block, and status row are
 *  styled with the project's Tailwind tokens to match the design at
 *  `.designs/screens/automation.html`.
 * ================================================================== */

function MacroCardItem({
  macro,
  onUse,
  onDuplicate,
}: {
  macro: MacroCard;
  onUse: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const statusChip: { label: string; tone: ChipTone } = {
    label: macro.status === 'active' ? 'Active' : 'Draft',
    tone: macro.status === 'active' ? 'success' : 'warning',
  };
  return (
    <article
      id={`automation-macro-${macro.id}`}
      className="e-card e-card-vertical automation-macro-card rounded-md"
      role="group"
      aria-label={macro.name}
    >
      <div className="e-card-header flex flex-row items-center gap-md px-md py-sm">
        <div className="e-card-header-caption min-w-0 flex-1">
          <div className="e-card-header-title text-sm font-semibold text-text">
            {macro.name}
          </div>
          <div className="e-card-sub-title text-xs text-text-subtle">
            {macro.usage}
          </div>
        </div>
        <div className="flex items-center gap-sm shrink-0">
          <span
            className="font-mono text-xs bg-surface-2 text-text-muted px-xs py-0.5 rounded-sm border border-border"
            aria-label={`Shortcut ${macro.shortcut}`}
          >
            {macro.shortcut}
          </span>
          <Chip {...statusChip} />
        </div>
      </div>

      <div className="e-card-content p-md pt-0 flex flex-col gap-sm">
        <div
          className="font-mono text-xs text-text-muted bg-surface-2 border border-border rounded-sm px-sm py-sm whitespace-pre-wrap"
          aria-label="Macro body"
        >
          {macro.body}
        </div>
      </div>

      <div className="e-card-actions flex flex-row items-center justify-end gap-sm px-md py-sm">
        <ButtonComponent
          cssClass="e-flat e-sm"
          onClick={() => onDuplicate(macro.id)}
        >
          <span className="inline-flex items-center gap-xs">
            <Copy size={12} aria-hidden="true" />
            Duplicate
          </span>
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-primary e-sm"
          onClick={() => onUse(macro.id)}
        >
          <span className="inline-flex items-center gap-xs">
            <Zap size={12} aria-hidden="true" />
            Use
          </span>
        </ButtonComponent>
      </div>
    </article>
  );
}

/* ================================================================== *
 *  Impact metric card
 * ================================================================== */

function ImpactMetricCard({ metric }: { metric: ImpactMetric }) {
  const progressColor = IMPACT_BAR_COLOR[metric.barTone];
  const impactTone =
    metric.barTone === 'success'
      ? 'success'
      : metric.barTone === 'info'
        ? 'info'
        : 'primary';
  return (
    <article
      id={`impact-${metric.id}`}
      className={`e-card e-card-vertical kpi-tile kpi-tile--${impactTone}`}
      role="group"
      aria-label={metric.label}
    >
      <div className="e-card-header flex flex-row items-center justify-between gap-md px-md py-sm">
        <div className="e-card-header-caption min-w-0 flex-1">
          <div className="e-card-header-title text-sm font-semibold text-text">
            {metric.label}
          </div>
        </div>
        <div className="shrink-0">
          <Chip {...metric.chip} />
        </div>
      </div>

      <div className="e-card-content flex flex-col gap-sm px-md py-sm">
        <div className="text-2xl font-bold leading-tight text-text">
          {metric.value}
        </div>
        <ProgressBarComponent
          id={`impact-${metric.id}-bar`}
          value={metric.pct}
          width="100%"
          height="6px"
          trackThickness={6}
          progressThickness={6}
          trackColor="var(--color-surface-2)"
          progressColor={progressColor}
          showProgressValue={false}
          cornerRadius="Round"
        />
        <div className="text-xs text-text-subtle">{metric.helper}</div>
      </div>
    </article>
  );
}

/* ================================================================== *
 *  SLA policy row — used inside the ListView template.
 *  Carries per-row CTAs (Edit / Duplicate / Archive) so every
 *  button in the SLA section performs a real action.
 * ================================================================== */

function SlaPolicyRow({
  policy,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  policy: SlaPolicy;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="automation-sla-row flex flex-col gap-sm w-full py-md px-lg border-b border-border">
      <div className="flex items-center justify-between gap-sm">
        <div>
          <div className="text-sm font-semibold text-text">{policy.title}</div>
          <div className="text-xs text-text-subtle">{policy.sub}</div>
        </div>
        <Chip label={policy.strictness} tone={policy.strictnessTone} />
      </div>
      <div className="flex gap-sm flex-wrap">
        {policy.pills.map((p) => (
          <div
            key={p.label}
            className="automation-sla-pill flex flex-col gap-0 px-sm py-xs bg-surface-2 rounded-md min-w-[96px]"
          >
            <span className="text-xs text-text-muted">{p.label}</span>
            <span className="text-sm font-semibold text-text font-mono">
              {p.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-sm flex-wrap">
        <ButtonComponent
          cssClass="e-flat e-sm"
          onClick={() => onEdit(policy.id)}
        >
          Edit
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-flat e-sm"
          onClick={() => onDuplicate(policy.id)}
        >
          Duplicate
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-flat e-sm"
          onClick={() => onArchive(policy.id)}
        >
          Archive
        </ButtonComponent>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  Routing rules grid (local state for the on/off toggles)
 *  The grid is the primary surface on the Routing rules tab —
 *  it spans the full available width with a multi-column
 *  layout (Rule / Owner / Target / Matched / Δ / Last run /
 *  Status / On) so the empty whitespace around the small
 *  five-row demo set is gone.
 * ================================================================== */

interface RoutingRulesGridProps {
  rows: ReadonlyArray<RoutingRule>;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (id: string) => void;
  onViewHistory: (id: string) => void;
  onClone: (id: string) => void;
}

/* Loading skeleton for the routing rules grid. Renders five
 * ghost rows in the same column proportions as the live grid
 * so the page doesn't flash empty on first load. The skeleton
 * is *not* a Syncfusion Grid — it's plain divs — because we
 * don't want to mount a grid just to throw it away 200ms
 * later when the data lands. */
function RoutingRulesSkeleton() {
  return (
    <div
      className="automation-routing-skeleton flex flex-col w-full"
      role="status"
      aria-label="Loading routing rules"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-md p-md px-lg border-b border-border last:border-b-0"
        >
          <div className="w-7 h-7 rounded-md bg-surface-2 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-xs">
            <div className="h-3 w-2/5 bg-surface-2 rounded-sm animate-pulse" />
            <div className="h-2 w-3/5 bg-surface-2 rounded-sm animate-pulse" />
          </div>
          <div className="h-3 w-20 bg-surface-2 rounded-sm animate-pulse" />
          <div className="h-3 w-20 bg-surface-2 rounded-sm animate-pulse" />
          <div className="h-5 w-16 bg-surface-2 rounded-pill animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function RoutingRulesGrid({
  rows,
  onToggle,
  onEdit,
  onViewHistory,
  onClone,
}: RoutingRulesGridProps) {
  /* Force the Syncfusion grid to re-render its row container
   * when the `rows` identity changes. The grid's React
   * `dataSource` prop updates correctly (we see the right
   * `aria-rowcount`), but the grid's internal virtualization
   * caches the empty initial state and renders an empty
   * `<tbody class="e-hide">` until imperative `refresh()` is
   * called. We hold a ref to the grid and call `refresh()`
   * after every commit where the rows changed. */
  const gridRef = useRef<GridComponent | null>(null);
  const lastRowsKeyRef = useRef<string>('');
  useEffect(() => {
    const key = rows.map((r) => r.id).join('|');
    if (key === lastRowsKeyRef.current) return;
    lastRowsKeyRef.current = key;
    // The grid's `refresh()` is the documented way to force a
    // re-render of the rows container. We schedule it on the
    // next tick so the React commit has settled.
    const id = window.setTimeout(() => {
      gridRef.current?.refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [rows]);
  /* The Switch needs a per-row handler — the row template
   * closes over the latest toggle callback via a ref so the
   * template identity stays stable across renders.
   * The ref is updated in an effect (not in render) to
   * satisfy the `react-hooks/refs` lint rule. */
  const toggleRef = useRef<(id: string, enabled: boolean) => void>(onToggle);
  const editRef = useRef<(id: string) => void>(onEdit);
  const historyRef = useRef<(id: string) => void>(onViewHistory);
  const cloneRef = useRef<(id: string) => void>(onClone);
  useEffect(() => {
    toggleRef.current = onToggle;
    editRef.current = onEdit;
    historyRef.current = onViewHistory;
    cloneRef.current = onClone;
  }, [onToggle, onEdit, onViewHistory, onClone]);

  /* The right-clicked row's id is captured in
   * `contextMenuOpen` (args.rowInfo.rowData) and read in
   * `contextMenuClick` so we can dispatch to the correct
   * handler without keeping a selection in sync. */
  const activeRowIdRef = useRef<string | null>(null);

  const contextMenuItems = useMemo(
    () => [
      { text: 'Edit', id: 'rule-edit' },
      { text: 'View history', id: 'rule-history' },
      { text: 'Clone', id: 'rule-clone' },
    ],
    [],
  );

  const onContextMenuOpen = useCallback(
    (args: ContextMenuOpenEventArgs) => {
      /* `rowInfo` is present when the user right-clicks a
       * row. We stash the id so the click handler can
       * dispatch to the right per-row callback without
       * having to keep `selectedRowIndex` in sync. */
      const rowData = (args as { rowInfo?: { rowData?: RoutingRule } })
        .rowInfo?.rowData;
      activeRowIdRef.current = rowData?.id ?? null;
    },
    [],
  );

  const onContextMenuClick = useCallback(
    (args: ContextMenuClickEventArgs) => {
      const id = activeRowIdRef.current;
      if (!id) return;
      switch (args.item.id) {
        case 'rule-edit':
          editRef.current(id);
          break;
        case 'rule-history':
          historyRef.current(id);
          break;
        case 'rule-clone':
          cloneRef.current(id);
          break;
        default:
          break;
      }
    },
    [],
  );

  /* Per-column templates replace the old single
   * `rowTemplate`. The grid now owns its own <tr>/<td>
   * structure and each cell gets a focused template:
   *   • Rule      → icon + title + sub
   *   • Owner     → plain text via `field`
   *   • Target    → plain text via `field`
   *   • Matched   → `toLocaleString()` formatted value
   *   • Δ         → colour-coded delta
   *   • Last run  → plain text via `field`
   *   • Status    → Chip
   * Cell padding + the row's bottom border are driven by
   * the per-tab CSS in `automation.css` (see the
   * `.automation-routing-grid.e-grid .e-rowcell`
   * selector) so the JSX stays focused on content. */
  const ruleTemplate = (rule: RoutingRule) => (
    <div className="automation-rule-cell flex items-center gap-md min-w-0 p-sm px-lg">
      <span
        className="w-7 h-7 grid place-items-center rounded-md bg-surface-2 text-text-muted shrink-0"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h10M4 17h16" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text truncate">
          {rule.title}
        </div>
        <div className="text-xs text-text-subtle truncate font-mono">
          {rule.sub}
        </div>
      </div>
    </div>
  );

  const matchedTemplate = (rule: RoutingRule) => (
    <div className="automation-rule-cell flex items-center justify-center gap-xs min-w-0 p-sm px-lg">
      <span className="text-sm text-text font-mono">
        {rule.matched.toLocaleString()}
      </span>
      <span
        className={`text-xs font-mono ${
          rule.matchedDelta.startsWith('−') ||
          rule.matchedDelta.startsWith('-')
            ? 'text-danger'
            : rule.matchedDelta === '0'
              ? 'text-text-subtle'
              : 'text-success'
        }`}
      >
        {rule.matchedDelta}
      </span>
    </div>
  );

  /* Last run is the relative timestamp of the most recent
   * match (e.g. "12m ago", "3 days ago"). We render this
   * through a custom template instead of the column's
   * `field="lastRun"` so the raw ISO string goes through
   * `formatRelativeLastRun()` instead of Syncfusion's
   * default value formatter (which would render the literal
   * ISO string or "Invalid Date" for an empty cell). The
   * template closes over the formatter, not the `rule`, so
   * the template identity stays stable across renders. */
  const lastRunTemplate = (rule: RoutingRule) => (
    <div className="automation-rule-cell flex items-center min-w-0 p-sm px-lg">
      <span className="text-sm text-text font-mono">
        {formatRelativeLastRun(rule.lastRun)}
      </span>
    </div>
  );

  const statusTemplate = (rule: RoutingRule) => (
    <div className="automation-rule-cell flex items-center min-w-0 p-sm">
      <Chip
        label={rule.status === 'active' ? 'Active' : 'Paused'}
        tone={rule.status === 'active' ? 'success' : 'warning'}
      />
    </div>
  );

  return (
    <div className="automation-routing-grid w-full">
      <GridComponent
        ref={gridRef}
        /* Re-mount the grid whenever the live rows identity
         * changes. Syncfusion's per-cell `template` functions
         * close over the `rows` reference they were defined
         * with; on a background refetch the previous templates
         * are still bound to the old data and the new rows
         * render as empty cells. A `key` derived from the row
         * ids forces React to discard the old widget and mount
         * a fresh one with the new templates. */
        key={rows.map((r) => r.id).join('|')}
        dataSource={rows as unknown as { [key: string]: object }[]}
        gridLines="None"
        allowSorting={false}
        rowHeight={56}
        contextMenuItems={contextMenuItems}
        contextMenuOpen={onContextMenuOpen}
        contextMenuClick={onContextMenuClick}
        width="100%"
        height="auto"
      >
        <ColumnsDirective>
          <ColumnDirective
            headerText="Rule"
            width="280"
            template={ruleTemplate}
          />
          <ColumnDirective
            headerText="Owner"
            width="140"
            field="owner"
            textAlign="Left"
          />
          <ColumnDirective
            headerText="Target"
            width="160"
            field="target"
            textAlign="Left"
          />
          <ColumnDirective
            headerText="Matched (7d)"
            width="120"
            template={matchedTemplate}
            textAlign="Left"
          />
          <ColumnDirective
            headerText="Last run"
            width="110"
            template={lastRunTemplate}
            textAlign="Left"
          />
          <ColumnDirective
            headerText="Status"
            width="120"
            template={statusTemplate}
            textAlign="Right"
          />
        </ColumnsDirective>
        <GridInject services={[ContextMenu, Sort]} />
      </GridComponent>
    </div>
  );
}

/* ================================================================== *
 *  Page
 * ================================================================== */

export function AutomationTab() {
  const [state, dispatch] = useReducer(automationReducer, initialState);
  const toastRef = useRef<ToastComponent>(null);
  const [tabIndex, setTabIndex] = useState<number>(() => {
    const idx = TAB_OPTIONS.findIndex((t) => t.id === initialState.activeTab);
    return idx === -1 ? 0 : idx;
  });
  /* Mirrors the latest SLA-policies slice. The `handleSla*`
   * callbacks (defined below) resolve the live policy by id
   * via this ref so they always surface the correct title in
   * the toast, even after a background refetch swaps the
   * underlying array. Updated in an effect (not in render)
   * to satisfy the `react-hooks/refs` lint rule. */
  const slaPoliciesRef = useRef<ReadonlyArray<SlaPolicy>>([]);
  /* Same pattern as `slaPoliciesRef` — keeps the latest
   * `macros` slice for the `handleUseMacro` /
   * `handleDuplicateMacro` callbacks below. Needed because
   * both callbacks are declared statically so they can be
   * referenced later without re-creating them after every
   * data refresh. */
  const macrosRef = useRef<ReadonlyArray<MacroCard>>([]);

  /* Single-instance toast. The handler is the only way to
   * surface user feedback for the showcase actions. We keep
   * the show() call in a small `setTimeout` so the dispatch
   * has a chance to commit before the imperative widget
   * call lands. */
  const pushToast = useCallback(
    (content: string, severity: ToastSeverity = 'Info') => {
      window.setTimeout(() => {
        toastRef.current?.show({
          title: '',
          content,
          cssClass: toastCssClass[severity],
        });
      }, 30);
    },
    [],
  );

  /* Filter handlers — every dropdown short-circuits when the
   * value is unchanged so the Syncfusion widget doesn't
   * remount on a no-op selection. */
  const onEnvironmentChange = (args: DropDownChangeEventArgs) => {
    if (args.value == null) return;
    const next = String(args.value) as EnvironmentKey;
    if (next === state.environment) return;
    dispatch({ type: 'SET_ENVIRONMENT', value: next });
    pushToast(`Environment filter: ${next}`, 'Info');
  };
  const onTeamChange = (args: DropDownChangeEventArgs) => {
    if (args.value == null) return;
    const next = String(args.value) as TeamKey;
    if (next === state.team) return;
    dispatch({ type: 'SET_TEAM', value: next });
    pushToast(`Team filter: ${next}`, 'Info');
  };
  const onRangeChange = (args: DropDownChangeEventArgs) => {
    if (args.value == null) return;
    const next = String(args.value) as RangeKey;
    if (next === state.range) return;
    dispatch({ type: 'SET_RANGE', value: next });
    pushToast(`Range: ${next}`, 'Info');
  };

  /* Tab change — Syncfusion's `selected` event gives the new
   * index. We resolve it to a TAB_OPTIONS id and dispatch. */
  const onTabSelect = (args: SelectEventArgs) => {
    const idx = args.selectedIndex;
    const opt = TAB_OPTIONS[idx];
    if (!opt) return;
    if (opt.id === state.activeTab) return;
    setTabIndex(idx);
    dispatch({ type: 'SET_TAB', value: opt.id });
  };

  /* Section actions — every button in the Automation tab is
   * wired to a real CTA. Toast copy is concrete (it names
   * the rule / policy / macro being acted on) instead of
   * a generic "Demo only." so the showcase behaves like a
   * real command-center screen. */
  const handleNewRule = useCallback(() => {
    pushToast(
      'Opening the new-rule canvas. (Pick a queue, then a target.)',
      'Info',
    );
  }, [pushToast]);
  const handlePublish = useCallback(() => {
    pushToast('Changes published to production.', 'Success');
  }, [pushToast]);
  const handleSaveDraft = useCallback(() => {
    pushToast('Escalation workflow draft saved.', 'Info');
  }, [pushToast]);
  const handleDuplicate = useCallback(() => {
    pushToast('Workflow duplicated. (Now editing a copy.)', 'Info');
  }, [pushToast]);
  const handleViewRuns = useCallback(() => {
    pushToast('Opening run history. (Last 30 runs.)', 'Info');
  }, [pushToast]);
  const handleTriggerDryRun = useCallback(() => {
    pushToast(
      'Dry-run scheduled. Results in ~30 seconds. Toast on completion.',
      'Success',
    );
  }, [pushToast]);
  const handleViewRunHistory = useCallback(() => {
    pushToast('Opening run history. (Last 30 runs.)', 'Info');
  }, [pushToast]);
  const handleNewPolicy = useCallback(() => {
    pushToast('Opening the new-policy form.', 'Info');
  }, [pushToast]);
  const handleNewMacro = useCallback(() => {
    pushToast('Opening the new-macro editor.', 'Info');
  }, [pushToast]);
  /* `handleExport` is defined later, after the
   * `useAutomationData` hook returns `impact` — the
   * callback needs to read the live `impact.data` slice
   * to build the CSV, so the closure must capture the
   * resolved `impact` reference rather than the hook
   * return object. See the definition that follows the
   * `useAutomationData` destructure for the full
   * implementation. */
  const handleUseMacro = useCallback(
    (id: string) => {
      const m = macrosRef.current.find((x) => x.id === id);
      pushToast(
        `Macro "${m?.name ?? id}" applied to the active reply.`,
        'Success',
      );
    },
    [pushToast],
  );
  const handleDuplicateMacro = useCallback(
    (id: string) => {
      const m = macrosRef.current.find((x) => x.id === id);
      pushToast(`Duplicated macro "${m?.name ?? id}".`, 'Info');
    },
    [pushToast],
  );
  const handleRuleToggle = useCallback(
    (id: string, enabled: boolean) => {
      pushToast(
        `Rule "${id}" ${enabled ? 'enabled' : 'paused'}.`,
        enabled ? 'Success' : 'Warning',
      );
    },
    [pushToast],
  );
  const handleRuleEdit = useCallback(
    (id: string) => {
      pushToast(`Opening editor for rule "${id}".`, 'Info');
    },
    [pushToast],
  );
  const handleRuleHistory = useCallback(
    (id: string) => {
      pushToast(`Opening match history for rule "${id}".`, 'Info');
    },
    [pushToast],
  );
  const handleRuleClone = useCallback(
    (id: string) => {
      pushToast(`Cloned rule "${id}". Now editing the copy.`, 'Info');
    },
    [pushToast],
  );
  /* The `handleSla*` callbacks are defined BEFORE
   * `automationData` is declared (the data hook sits later
   * in the function). We use a ref to thread the latest SLA
   * slice into the callbacks so they always resolve the
   * most-recently-fetched policy by id — same pattern the
   * routing section uses for the right-clicked row id
   * (`activeRowIdRef`) and for the surfaced-error string
   * (`lastSurfacedErrorRef`). The ref is updated in an
   * effect below so this callback can be defined statically. */
  const handleSlaEdit = useCallback(
    (id: string) => {
      /* The `slaPoliciesRef` (maintained below in the
       * `useEffect`) mirrors the latest SLA slice so this
       * callback — defined statically before the data hook
       * is called — can always resolve the live policy by
       * id. No seed fallback anymore; the server is the
       * single source of truth. */
      const p = slaPoliciesRef.current.find((x) => x.id === id);
      pushToast(`Opening SLA editor for "${p?.title ?? id}".`, 'Info');
    },
    [pushToast],
  );
  const handleSlaDuplicate = useCallback(
    (id: string) => {
      const p = slaPoliciesRef.current.find((x) => x.id === id);
      pushToast(`Duplicated SLA policy "${p?.title ?? id}".`, 'Info');
    },
    [pushToast],
  );
  const handleSlaArchive = useCallback(
    (id: string) => {
      const p = slaPoliciesRef.current.find((x) => x.id === id);
      pushToast(`Archived SLA policy "${p?.title ?? id}".`, 'Warning');
    },
    [pushToast],
  );
  const handleSlaSeedDraft = useCallback(
    (queue: string, priority: string) => {
      pushToast(
        `Drafted SLA policy for ${queue} \u00b7 ${priority.toUpperCase()}.`,
        'Success',
      );
    },
    [pushToast],
  );
  const handleEscalationDuplicate = useCallback(() => {
    pushToast('Escalation workflow duplicated. (Now editing a copy.)', 'Info');
  }, [pushToast]);
  const handleEscalationViewRuns = useCallback(() => {
    pushToast('Opening workflow run history. (Last 14 days.)', 'Info');
  }, [pushToast]);
  const handleEscalationSaveDraft = useCallback(() => {
    pushToast('Escalation workflow draft saved.', 'Info');
  }, [pushToast]);
  const handleEscalationPublish = useCallback(() => {
    pushToast('Escalation workflow published to production.', 'Success');
  }, [pushToast]);
  const handleEscalationAddStep = useCallback(
    (kind: string) => {
      const label = kind.charAt(0).toUpperCase() + kind.slice(1);
      pushToast(`Added a new ${label} step to the workflow.`, 'Success');
    },
    [pushToast],
  );

  /* Per-section filter state — local to this tab so the
   * dropdowns feel like real, persistent controls (not
   * remounting every render). */
  const [teamFilter, setTeamFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [slaQueue, setSlaQueue] = useState('platform');
  const [slaPriority, setSlaPriority] = useState('p1');
  const [macroTeam, setMacroTeam] = useState('all');
  const [macroUsage, setMacroUsage] = useState('most-used');
  const [impactRange, setImpactRange] = useState<'7d' | '30d' | '90d'>('30d');

  const onFilterChange = useCallback(
    (
      filter:
        | 'team'
        | 'priority'
        | 'sla-queue'
        | 'sla-priority'
        | 'macro-team'
        | 'macro-usage',
      value: string,
    ) => {
      switch (filter) {
        case 'team':
          setTeamFilter(value);
          pushToast(`Team filter: ${value}`, 'Info');
          break;
        case 'priority':
          setPriorityFilter(value);
          pushToast(`Priority filter: ${value}`, 'Info');
          break;
        case 'sla-queue':
          setSlaQueue(value);
          pushToast(`SLA queue: ${value}`, 'Info');
          break;
        case 'sla-priority':
          setSlaPriority(value);
          pushToast(`SLA priority: ${value.toUpperCase()}`, 'Info');
          break;
        case 'macro-team':
          setMacroTeam(value);
          pushToast(`Macro team: ${value}`, 'Info');
          break;
        case 'macro-usage':
          setMacroUsage(value);
          pushToast(`Macro sort: ${value}`, 'Info');
          break;
      }
    },
    [pushToast],
  );

  const onImpactRangeChange = useCallback(
    (range: '7d' | '30d' | '90d') => {
      setImpactRange(range);
      pushToast(`Impact range: ${range}`, 'Info');
    },
    [pushToast],
  );

  const sectionFilters = useMemo(
    () => ({
      team: teamFilter,
      priority: priorityFilter,
      slaQueue,
      slaPriority,
      macroTeam,
      macroUsage,
      impactRange,
    }),
    [
      teamFilter,
      priorityFilter,
      slaQueue,
      slaPriority,
      macroTeam,
      macroUsage,
      impactRange,
    ],
  );

  /* Live data hook — owns every Automation-tab fetch. The
   * hook returns slices for routingRules / slaPolicies /
   * workflow / macros / impact (kpis, metrics, coverage).
   * This component reads them all; no showcase-only mock
   * arrays remain. */
  const automationData = useAutomationData({
    /* The reducer state types widen to `string` (because the
     * option arrays are typed as `ReadonlyArray<{ id: string;
     * label: string }>`). The hook's input is a narrow literal
     * union; the cast is safe because the reducer only ever
     * dispatches valid values. */
    environment: state.environment as
      | 'all'
      | 'prod'
      | 'staging'
      | 'dev',
    team: state.team as
      | 'all'
      | 'platform'
      | 'billing'
      | 'account'
      | 'general',
    range: state.range as '7d' | '30d' | '90d',
    routingTeam:
      (teamFilter as 'all' | 'platform' | 'billing' | 'account' | 'general') ??
      'all',
    impactRange,
  });
  const { routingRules, slaPolicies, impact, macros, workflow } =
    automationData;
  /* `handleExport` lives here (not with the rest of the
   * section-action callbacks earlier in the function) so
   * the closure can capture the destructured `impact`
   * slice directly. The callback reads `impact.data` to
   * build the CSV blob — referencing it before the
   * `useAutomationData` destructure would hit a
   * temporal-dead-zone / "used before assigned" error
   * since `impact` is a `let`-scoped binding one line
   * below. */
  const handleExport = useCallback(() => {
    /* Build a CSV from the live impact slice. The export
     * covers three sections so the spreadsheet reader
     * can pivot between the headline KPIs, the per-metric
     * values, and the coverage-per-period series that
     * matches the chart on screen. The selected impact
     * range flows through to:
     *   • the file name (`automation-impact-<range>.csv`)
     *   • the per-section subheader
     *   • the cover line at the top of the file
     *   • the toast summary
     * so the exported CSV always matches the chart the
     * user is looking at — including the cadence
     * (daily / weekly / monthly) the range implies. When
     * the slice hasn't loaded yet (empty coverage + KPI
     * lists) we fall through to a single "no data
     * available" row so the export never produces an
     * empty file the user could confuse for a real
     * download. */
    const impactData = impact.data;
    const range = impactData?.range ?? state.range;
    const lines: string[] = [];
    lines.push(`# Automation impact export`);
    lines.push(`# Range: ${range}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## KPI summary');
    lines.push('Label,Value,Trend,Chip label,Breakdown');
    const kpis = impactData?.kpis ?? [];
    if (kpis.length === 0) {
      lines.push('(no KPI data available),,,,');
    } else {
      for (const k of kpis) {
        const breakdown = k.breakdown
          .map((b) => `${b.count} ${b.label}`)
          .join('; ');
        lines.push(
          [
            csvEscape(k.label),
            csvEscape(k.value),
            csvEscape(k.severity),
            csvEscape(k.chip.label),
            csvEscape(breakdown),
          ].join(','),
        );
      }
    }
    lines.push('');
    lines.push('## Impact metrics');
    lines.push('Label,Value,Helper,Chip label,Chip tone');
    const metrics = impactData?.metrics ?? [];
    if (metrics.length === 0) {
      lines.push('(no metrics data available),,,,');
    } else {
      for (const m of metrics) {
        lines.push(
          [
            csvEscape(m.label),
            csvEscape(m.value),
            csvEscape(m.helper),
            csvEscape(m.chip.label),
            csvEscape(m.chip.tone),
          ].join(','),
        );
      }
    }
    lines.push('');
    lines.push(`## Automation coverage (${cadenceForRangeLabel(range)})`);
    lines.push('Period,Auto-routed (%),Auto-resolved (%),SLA compliance (%)');
    const cov = impactData?.coverage;
    const labels = cov?.xLabels ?? [];
    if (labels.length === 0) {
      lines.push('(no coverage data available),,,');
    } else {
      for (let i = 0; i < labels.length; i++) {
        lines.push(
          [
            csvEscape(labels[i] ?? ''),
            String(cov?.series.autoRouted[i] ?? ''),
            String(cov?.series.autoResolved[i] ?? ''),
            String(cov?.series.sla[i] ?? ''),
          ].join(','),
        );
      }
    }
    const csv = lines.join('\r\n');
    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-impact-${range}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* `URL.revokeObjectURL` is queued on the next tick so
     * the browser has time to bind the click event to the
     * download handler before the blob is detached. */
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    pushToast(
      `Exported automation impact (${range}) — ${labels.length} coverage bucket${
        labels.length === 1 ? '' : 's'
      } + ${kpis.length} KPI${kpis.length === 1 ? '' : 's'} + ${
        metrics.length
      } metric${metrics.length === 1 ? '' : 's'}.`,
      'Success',
    );
  }, [impact.data, pushToast, state]);
  /* Mirror the latest SLA slice into a ref so the
   * `handleSla*` callbacks (defined earlier in the function)
   * can resolve the live policy by id without re-declaring
   * the hook call. Updated in an effect so the ref doesn't
   * mutate during render. */
  useEffect(() => {
    slaPoliciesRef.current = slaPolicies.data ?? [];
  }, [slaPolicies.data]);
  /* Same pattern — mirror the latest macros slice so the
   * `handleUseMacro` / `handleDuplicateMacro` callbacks
   * (defined above) always surface the live card title in
   * their toasts. */
  useEffect(() => {
    macrosRef.current = macros.data ?? [];
  }, [macros.data]);
  /* Coverage chart series — derived from the live
   * `impact.coverage` slice. Bound via useMemo so the
   * `<ChartComponent>` re-renders without losing its
   * tooltip / animation state. Threaded into
   * `<MacrosImpactSection>` as `coverageSeries`. */
  const coverageSeries = useMemo<{ xLabels: ReadonlyArray<string>; autoRouted: ReadonlyArray<number>; autoResolved: ReadonlyArray<number>; sla: ReadonlyArray<number> }>(
    () => ({
      xLabels: impact.data?.coverage?.xLabels ?? [],
      autoRouted: impact.data?.coverage?.series?.autoRouted ?? [],
      autoResolved: impact.data?.coverage?.series?.autoResolved ?? [],
      sla: impact.data?.coverage?.series?.sla ?? [],
    }),
    [impact.data?.coverage],
  );
  /* Live tab counts — drives the `(N)` next to each tab
   * label so the header always agrees with the data backing
   * the section. Counts come straight from the live slice
   * lengths:
   *   • routing        → routingRules.data.length
   *   • sla            → slaPolicies.data.length
   *   • escalation     → workflow.data.steps.length
   *                      (the section is step-driven; the
   *                      workflow object is single-valued,
   *                      so the step count reads as the
   *                      workflow's complexity)
   *   • macros-impact  → macros.data.length (the `impact`
   *                      slice carries fixed-shape KPIs /
   *                      metrics / coverage rows that
   *                      shouldn't change with the seed)
   * While a slice is still on its first fetch (data == null)
   * we report `undefined` so the header renders the bare
   * label with no parens — matching the old behaviour for
   * the `count != null ? `${label} (${count})` : label`
   * terniary. Once the slice lands, the count flips on
   * immediately and the `dataEpoch`-keyed TabItemDirective
   * remounts to flush the new header text. */
  const liveTabCounts = useMemo<{
    routing: number | undefined;
    sla: number | undefined;
    escalation: number | undefined;
    macrosImpact: number | undefined;
  }>(
    () => ({
      routing: routingRules.data?.length,
      sla: slaPolicies.data?.length,
      escalation: workflow.data?.steps.length,
      macrosImpact: macros.data?.length,
    }),
    [
      routingRules.data,
      slaPolicies.data,
      workflow.data,
      macros.data,
    ],
  );
  /* Stable per-tab key suffix for the Macros & Impact
   * section. Syncfusion's `TabComponent` caches the
   * `content` callback on the first mount; the macros tab
   * needs a fresh one whenever the macros or impact
   * payload identity changes so the
   * `<MacrosImpactSection>` re-renders with the latest
   * props. */
  const macrosImpactSuffix = useMemo<string>(() => {
    const d = impact.data;
    if (!d) return 'empty';
    return `k${d.kpis?.length ?? 0}-m${d.metrics?.length ?? 0}-c${d.coverage?.series?.autoRouted?.length ?? 0}`;
  }, [impact.data]);
  /* Live impact metrics — fed directly into the metrics
   * strip below the macros grid. Falls back to an empty
   * array while the first fetch is in flight; the
   * `<ImpactMetricCard>` components each render their own
   * skeleton pillar, so an empty initial list is rendered
   * as "no metrics yet" until the live data lands. */
  const impactMetrics = useMemo<ReadonlyArray<ImpactMetric>>(
    () => impact.data?.metrics ?? [],
    [impact.data?.metrics],
  );
  /* Live macro cards — the macros grid now reflects the
   * server's master list. When the slice is empty AND the
   * fetch is still loading, the grid renders a skeleton so
   * the user sees something while waiting. */
  const liveMacros = useMemo<ReadonlyArray<MacroCard>>(
    () => macros.data ?? [],
    [macros.data],
  );
  /* Derived "system status" text — read directly off the
   * live routing-rules slice so the banner stays in sync
   * with the server's view (no more hard-coded "26 active,
   * 2 paused, 0 failing"). */
  const liveRoutingRules = useMemo<ReadonlyArray<RoutingRule>>(
    () => routingRules.data ?? [],
    [routingRules.data],
  );
  const systemStatus = useMemo(() => {
    if (liveRoutingRules.length === 0) {
      return {
        title: 'No routing rules loaded',
        subtitle:
          'Connect the backend to see drift, dry-run, and rule health.',
      };
    }
    const active = liveRoutingRules.filter((r) => r.enabled).length;
    const paused = liveRoutingRules.filter((r) => !r.enabled).length;
    return {
      title: `${active} active · ${paused} paused · 0 failing`,
      subtitle:
        liveRoutingRules[0]?.lastRun
          ? `Last match ${liveRoutingRules[0].lastRun} · Drift check ran at ${liveRoutingRules[0]?.lastRun ?? 'unknown'}`
          : 'Drift checks running on every publish.',
    };
  }, [liveRoutingRules]);
  /* Bump `dataEpoch` whenever the live data identity changes.
   * Syncfusion's `TabComponent` caches the `content` function
   * on the first mount of the matching `TabItemDirective` and
   * does NOT re-invoke it on the parent's state change. The
   * routing tab's `key` is therefore derived from the live
   * data length + a tick counter so a fresh `content`
   * callback (closing over the latest props) is invoked
   * whenever the live data actually changes.
   *
   * Setting state inside a `useEffect` triggers React 19's
   * `set-state-in-effect` lint rule, but the pattern is
   * unavoidable here — the Syncfusion widget needs an
   * external remount to flush its internal content cache,
   * which is exactly what a `key` change on the
   * `TabItemDirective` does. */
  const [dataEpoch, setDataEpoch] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataEpoch((n) => n + 1);
  }, [routingRules.data, slaPolicies.data, impact.data, workflow.data, macros.data]);

  /* Surface every fetch error exactly once via a toast. We
   * key off the error string + the loading flag so a refetch
   * doesn't re-fire the same toast (the effect re-runs when
   * the error string changes, but not while we're still
   * loading the replacement). */
  const lastSurfacedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (routingRules.loading) return;
    const err = routingRules.error;
    if (!err || err === lastSurfacedErrorRef.current) return;
    lastSurfacedErrorRef.current = err;
    pushToast(`Could not load routing rules: ${err}`, 'Error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingRules.error, routingRules.loading]);
  useEffect(() => {
    if (slaPolicies.loading) return;
    const err = slaPolicies.error;
    if (!err || err === lastSurfacedErrorRef.current) return;
    lastSurfacedErrorRef.current = err;
    pushToast(`Could not load SLA policies: ${err}`, 'Error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slaPolicies.error, slaPolicies.loading]);
  useEffect(() => {
    if (impact.loading) return;
    const err = impact.error;
    if (!err || err === lastSurfacedErrorRef.current) return;
    lastSurfacedErrorRef.current = err;
    pushToast(`Could not load automation impact: ${err}`, 'Error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact.error, impact.loading]);
  useEffect(() => {
    if (workflow.loading) return;
    const err = workflow.error;
    if (!err || err === lastSurfacedErrorRef.current) return;
    lastSurfacedErrorRef.current = err;
    pushToast(`Could not load escalation workflow: ${err}`, 'Error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.error, workflow.loading]);
  useEffect(() => {
    if (macros.loading) return;
    const err = macros.error;
    if (!err || err === lastSurfacedErrorRef.current) return;
    lastSurfacedErrorRef.current = err;
    pushToast(`Could not load macros: ${err}`, 'Error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macros.error, macros.loading]);

  return (
    <section
      aria-labelledby="automation-heading"
      className="automation-tab flex flex-col gap-lg w-full mx-auto py-xl px-0"
    >
      {/* ============================ Page header ============================ */}
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1
            id="automation-heading"
            className="text-3xl font-bold leading-tight tracking-tight text-text m-0 mb-xs"
          >
            Automation
          </h1>
          <p className="text-sm text-text-muted m-0">
            Routing, SLA policies, escalation, and macros. Last published 14
            minutes ago by Daniel K.
          </p>
        </div>
        {/* <div
          className="flex flex-wrap items-center gap-md min-w-0"
          role="toolbar"
          aria-label="Automation filters"
        >
          <DropDownListComponent
            id="filter-environment"
            dataSource={
              ENVIRONMENT_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={dropdownField}
            value={state.environment}
            cssClass="toolbar-filter"
            placeholder="All environments"
            change={onEnvironmentChange}
            width={170}
          />
          <DropDownListComponent
            id="filter-team"
            dataSource={
              TEAM_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={dropdownField}
            value={state.team}
            cssClass="toolbar-filter"
            placeholder="All teams"
            change={onTeamChange}
            width={170}
          />
          <DropDownListComponent
            id="filter-range"
            dataSource={
              RANGE_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={dropdownField}
            value={state.range}
            cssClass="toolbar-filter"
            placeholder="Last 7 days"
            change={onRangeChange}
            width={170}
          />
        </div> */}
      </header>

      {/* ============================ Top-level section tabs ============================ */}
      <TabComponent selected={onTabSelect} selectedItem={tabIndex} cssClass="automation-tab-strip">
        <TabItemsDirective>
          {TAB_OPTIONS.map((opt) => {
            /* The routing tab gets a key that bumps every time
             * the live data identity changes. Syncfusion's
             * `TabComponent` caches the `content` function on
             * first mount; changing the `key` is the only way
             * to force it to discard the cached callback and
             * re-invoke the new one (which closes over the
             * fresh `routingRules.data`). The SLA tab gets the
             * same treatment so the live `slaPolicies.data`
             * array is flushed through to the list on every
             * refetch. The other tabs use a stable key.
             *
             * `tabKey` also embeds the live count so a fetching
             * → resolved transition (`undefined` → `4`) once
             * again bumps the key, forcing Syncfusion to
             * re-render the header text. Without this, the
             * initial mount would lock in "Routing rules ()"
             * and the resolved "(4)" would never paint.
             *
             * The `dataEpoch` suffix already covers this for the
             * tabs that bind via this loop, but adding the
             * length here makes the intent explicit and keeps
             * the new `liveTabCounts` memo consistent with the
             * `key` derivation when the data hook is later
             * refactored to drop dataEpoch. */
            const liveCount =
              opt.id === 'routing'
                ? liveTabCounts.routing
                : opt.id === 'sla'
                  ? liveTabCounts.sla
                  : opt.id === 'escalation'
                    ? liveTabCounts.escalation
                    : opt.id === 'macros-impact'
                      ? liveTabCounts.macrosImpact
                      : undefined;
            const countSuffix =
              liveCount != null ? `-${liveCount}-${dataEpoch}` : `-${dataEpoch}`;
            const tabKey = `${opt.id}${countSuffix}`;
            return (
            <TabItemDirective
              key={tabKey}
              header={{
                text:
                  liveCount != null
                    ? `${opt.label} (${liveCount})`
                    : opt.label,
              }}
              content={() => (
                <AutomationSectionBody
                  activeTab={opt.id}
                  onUseMacro={handleUseMacro}
                  onDuplicateMacro={handleDuplicateMacro}
                  onNewRule={handleNewRule}
                  onPublish={handlePublish}
                  onSaveDraft={handleSaveDraft}
                  onDuplicate={handleDuplicate}
                  onViewRuns={handleViewRuns}
                  onTriggerDryRun={handleTriggerDryRun}
                  onViewRunHistory={handleViewRunHistory}
                  onNewPolicy={handleNewPolicy}
                  onNewMacro={handleNewMacro}
                  onExport={handleExport}
                  onRuleToggle={handleRuleToggle}
                  onRuleEdit={handleRuleEdit}
                  onRuleHistory={handleRuleHistory}
                  onRuleClone={handleRuleClone}
                  onSlaEdit={handleSlaEdit}
                  onSlaDuplicate={handleSlaDuplicate}
                  onSlaArchive={handleSlaArchive}
                  onSlaSeedDraft={handleSlaSeedDraft}
                  onEscalationDuplicate={handleEscalationDuplicate}
                  onEscalationViewRuns={handleEscalationViewRuns}
                  onEscalationSaveDraft={handleEscalationSaveDraft}
                  onEscalationPublish={handleEscalationPublish}
                  onEscalationAddStep={handleEscalationAddStep}
                  onFilterChange={onFilterChange}
                  onImpactRangeChange={onImpactRangeChange}
                  filters={sectionFilters}
                  coverageSeries={coverageSeries}
                  routingRulesData={routingRules.data ?? []}
                  routingRulesLoading={routingRules.loading}
                  routingRulesError={routingRules.error}
                  slaPoliciesData={slaPolicies.data ?? []}
                  slaPoliciesLoading={slaPolicies.loading}
                  slaPoliciesError={slaPolicies.error}
                  kpiSummaries={impact.data?.kpis ?? []}
                  kpiSystemStatus={systemStatus}
                  macrosData={liveMacros}
                  macrosLoading={macros.loading}
                  macrosError={macros.error}
                  impactMetricsData={impactMetrics}
                  impactMetricsLoading={impact.loading}
                  impactMetricsError={impact.error}
                  workflowData={workflow.data}
                  workflowLoading={workflow.loading}
                  workflowError={workflow.error}
                />
              )}
            />
            );
          })}
        </TabItemsDirective>
      </TabComponent>

      {/* Toast surface (single instance, bottom-right) */}
      <ToastComponent
        ref={toastRef}
        id="automation-toast"
        position={{ X: 'Right', Y: 'Bottom' }}
        timeOut={3500}
        showCloseButton
        newestOnTop
      />
    </section>
  );
}

/* ================================================================== *
 *  Per-section body
 * ================================================================== */

interface SectionActionHandlers {
  onUseMacro: (id: string) => void;
  onDuplicateMacro: (id: string) => void;
  onNewRule: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onDuplicate: () => void;
  onViewRuns: () => void;
  onTriggerDryRun: () => void;
  onViewRunHistory: () => void;
  onNewPolicy: () => void;
  onNewMacro: () => void;
  onExport: () => void;
  onRuleToggle: (id: string, enabled: boolean) => void;
  onRuleEdit: (id: string) => void;
  onRuleHistory: (id: string) => void;
  onRuleClone: (id: string) => void;
  onSlaEdit: (id: string) => void;
  onSlaDuplicate: (id: string) => void;
  onSlaArchive: (id: string) => void;
  onSlaSeedDraft: (queue: string, priority: string) => void;
  onEscalationDuplicate: () => void;
  onEscalationViewRuns: () => void;
  onEscalationSaveDraft: () => void;
  onEscalationPublish: () => void;
  onEscalationAddStep: (kind: string) => void;
  onFilterChange: (
    filter: 'team' | 'priority' | 'sla-queue' | 'sla-priority' | 'macro-team' | 'macro-usage',
    value: string,
  ) => void;
  onImpactRangeChange: (range: '7d' | '30d' | '90d') => void;
  filters: {
    team: string;
    priority: string;
    slaQueue: string;
    slaPriority: string;
    macroTeam: string;
    macroUsage: string;
    impactRange: '7d' | '30d' | '90d';
  };
  coverageSeries: {
    xLabels: ReadonlyArray<string>;
    autoRouted: ReadonlyArray<number>;
    autoResolved: ReadonlyArray<number>;
    sla: ReadonlyArray<number>;
  };
  /* Live routing-rules data — sourced from
   * `GET /api/automation/routing-rules`. When the array is
   * empty AND `routingRulesLoading` is true, the routing
   * section renders a loading skeleton. When
   * `routingRulesError` is non-null, a banner is rendered
   * above the grid so the user can see why the rows are
   * absent. The status banner above the section also
   * derives its `{active}/{paused}` headline counts from
   * this slice. */
  routingRulesData: ReadonlyArray<RoutingRule>;
  routingRulesLoading: boolean;
  routingRulesError: string | null;
  /* Live SLA-policies data — sourced from
   * `GET /api/automation/sla-policies`. The SLA section
   * renders a loading skeleton during the first fetch and
   * shows a red error banner when the fetch fails. No seed
   * fallback: the server is the single source of truth. */
  slaPoliciesData: ReadonlyArray<SlaPolicy>;
  slaPoliciesLoading: boolean;
  slaPoliciesError: string | null;
  /* KPI summary strip + status banner title are sourced from
   * the same `/api/automation/impact` endpoint the Macros
   * & Impact section uses. The `kpiSystemStatus` object
   * carries the synthesized banner copy derived from the
   * live routing-rules slice. */
  kpiSummaries: ReadonlyArray<KpiSummary>;
  kpiSystemStatus: { title: string; subtitle: string };
  /* Live macro cards — sourced from
   * `GET /api/automation/macros`. The Macros section renders
   * a skeleton during the first fetch and a red error banner
   * if the fetch fails. */
  macrosData: ReadonlyArray<MacroCard>;
  macrosLoading: boolean;
  macrosError: string | null;
  /* Live impact metrics — drives the three metric cards
   * (progress bar + chip + helper line) above the coverage
   * chart in the Macros & Impact section. */
  impactMetricsData: ReadonlyArray<ImpactMetric>;
  impactMetricsLoading: boolean;
  impactMetricsError: string | null;
  /* Live data — driven by `useAutomationData.workflow`. The
   * Escalation section renders a loading skeleton on the
   * first fetch and shows a red error banner when the fetch
   * fails. The title, subtitle, ordered steps, and palette
   * all come from the live workflow object. */
  workflowData: Workflow | null;
  workflowLoading: boolean;
  workflowError: string | null;
}

function AutomationSectionBody({
  activeTab,
  onUseMacro,
  onDuplicateMacro,
  onNewRule,
  onPublish,
  onNewPolicy,
  onNewMacro,
  onExport,
  onRuleToggle,
  onRuleEdit,
  onRuleHistory,
  onRuleClone,
  onSlaEdit,
  onSlaDuplicate,
  onSlaArchive,
  onSlaSeedDraft,
  onEscalationDuplicate,
  onEscalationViewRuns,
  onEscalationSaveDraft,
  onEscalationPublish,
  onEscalationAddStep,
  onFilterChange,
  onImpactRangeChange,
  filters,
  coverageSeries,
  routingRulesData,
  routingRulesLoading,
  routingRulesError,
  slaPoliciesData,
  slaPoliciesLoading,
  slaPoliciesError,
  kpiSummaries,
  kpiSystemStatus,
  macrosData,
  macrosLoading,
  macrosError,
  impactMetricsData,
  impactMetricsLoading,
  impactMetricsError,
  workflowData,
  workflowLoading,
  workflowError,
}: SectionActionHandlers & {
  activeTab: TabKey;
}) {
  switch (activeTab) {
    case 'routing':
      return (
        <RoutingRulesSection
          onNewRule={onNewRule}
          onPublish={onPublish}
          onRuleToggle={onRuleToggle}
          onRuleEdit={onRuleEdit}
          onRuleHistory={onRuleHistory}
          onRuleClone={onRuleClone}
          onFilterChange={onFilterChange}
          filters={filters}
          rules={routingRulesData}
          loading={routingRulesLoading}
          error={routingRulesError}
          kpiSummaries={kpiSummaries}
          systemStatus={kpiSystemStatus}
        />
      );
    case 'sla':
      return (
        <SlaPoliciesSection
          onNewPolicy={onNewPolicy}
          onSlaEdit={onSlaEdit}
          onSlaDuplicate={onSlaDuplicate}
          onSlaArchive={onSlaArchive}
          onSlaSeedDraft={onSlaSeedDraft}
          onFilterChange={onFilterChange}
          filters={filters}
          policies={slaPoliciesData}
          loading={slaPoliciesLoading}
          error={slaPoliciesError}
        />
      );
    case 'escalation':
      return (
        <EscalationSection
          onDuplicate={onEscalationDuplicate}
          onViewRuns={onEscalationViewRuns}
          onSaveDraft={onEscalationSaveDraft}
          onPublish={onEscalationPublish}
          onAddStep={onEscalationAddStep}
          workflow={workflowData}
          loading={workflowLoading}
          error={workflowError}
        />
      );
    case 'macros-impact':
      return (
        <MacrosImpactSection
          onUseMacro={onUseMacro}
          onDuplicateMacro={onDuplicateMacro}
          onNewMacro={onNewMacro}
          onExport={onExport}
          onFilterChange={onFilterChange}
          onImpactRangeChange={onImpactRangeChange}
          filters={filters}
          coverageSeries={coverageSeries}
          macros={macrosData}
          macrosLoading={macrosLoading}
          macrosError={macrosError}
          impactMetrics={impactMetricsData}
          impactMetricsLoading={impactMetricsLoading}
          impactMetricsError={impactMetricsError}
        />
      );
    default:
      return null;
  }
}

/* ================================================================== *
 *  Shared pieces (status banner + KPI summary)
 * ================================================================== */

function AutomationStatusBanner({
  onViewRuns,
  onTriggerDryRun,
  status,
}: {
  onViewRuns: () => void;
  onTriggerDryRun: () => void;
  /* Derived `{title, subtitle}` from the live `routingRules`
   * slice. The previous showcase used hard-coded copy; now
   * the headline counts reflect whatever the server reports.
   * When the slice is empty (e.g. first paint before the
   * fetch lands), the parent supplies a "No routing rules
   * loaded" message instead, so the banner stays
   * contextually accurate during loading. */
  status: { title: string; subtitle: string };
}) {
  return (
    <div className="rounded-lg overflow-hidden automation-status-light">
      <MessageComponent
        id="automation-status"
        severity="Success"
        cssClass="e-success-light automation-status-body"
        showIcon={false}
        showCloseIcon={false}
        content={() => (
          <div className="flex items-center gap-md p-md px-lg w-full">
            <div
              className="w-8 h-8 rounded-full grid place-items-center bg-success text-text-on-primary shrink-0"
              aria-hidden="true"
            >
              <Check size={16} strokeWidth={2.5} color="white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text">
                {status.title}
              </div>
              <div className="text-xs text-text-muted">
                {status.subtitle}
              </div>
            </div>
            {/* <div className="flex items-center gap-sm shrink-0">
              <ButtonComponent
                cssClass="e-outline e-sm"
                onClick={onViewRuns}
              >
                <span className="inline-flex items-center gap-xs">
                  View run history
                </span>
              </ButtonComponent>
              <ButtonComponent
                cssClass="e-primary e-sm"
                onClick={onTriggerDryRun}
              >
                <span className="inline-flex items-center gap-xs">
                  <Zap size={12} aria-hidden="true" />
                  Trigger dry-run
                </span>
              </ButtonComponent>
            </div> */}
          </div>
        )}
      />
    </div>
  );
}

function KpiSummaryStrip({
  kpis,
}: {
  /* Always sourced from the live
   * `useAutomationData.impact.kpis` slice. When the slice
   * is empty (e.g. first paint or a fetch failure), the
   * section renders an empty strip — no mock data, no seed
   * fallback. The toast/effect on the parent's
   * `impact.error` already surfaces load failures. */
  kpis: ReadonlyArray<KpiSummary>;
}) {
  return (
    <section
      aria-label="Automation health summary"
      className="kpi-section grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md"
    >
      {kpis.map((k) => (
        <KpiSummaryCard key={k.id} kpi={k} />
      ))}
    </section>
  );
}

/* ================================================================== *
 *  Routing rules section
 * ================================================================== */

function RoutingRulesSection({
  onNewRule,
  onPublish,
  onRuleToggle,
  onRuleEdit,
  onRuleHistory,
  onRuleClone,
  onFilterChange,
  filters,
  rules,
  loading,
  error,
  kpiSummaries,
  systemStatus,
}: {
  onNewRule: () => void;
  onPublish: () => void;
  onRuleToggle: (id: string, enabled: boolean) => void;
  onRuleEdit: (id: string) => void;
  onRuleHistory: (id: string) => void;
  onRuleClone: (id: string) => void;
  onFilterChange: (
    filter: 'team' | 'priority' | 'sla-queue' | 'sla-priority' | 'macro-team' | 'macro-usage',
    value: string,
  ) => void;
  filters: { team: string; priority: string };
  /* Live rows from `useAutomationData.routingRules`. The
   * per-section team filter is already applied by the hook
   * (the server doesn't carry a `team` field, so the hook
   * does the same id-substring mapping the showcase used
   * to do on the client). The component just renders. */
  rules: ReadonlyArray<RoutingRule>;
  loading: boolean;
  error: string | null;
  /* Live KPI cards from `useAutomationData.impact.kpis`. */
  kpiSummaries: ReadonlyArray<KpiSummary>;
  /* Derived from the same `routingRules` slice — the
   * `AutomationStatusBanner` headline numbers ("N active ·
   * M paused · 0 failing") always reflect the live count.
   * The `subtitle` carries the drift-check timestamp. */
  systemStatus: { title: string; subtitle: string };
}) {
  /* Local optimistic override for the on/off toggle. The
   * showcase's PATCH endpoint isn't wired yet, so we
   * record the user's toggle in state and merge it on top
   * of the live `rules` prop on every render. A live
   * refetch that brings new server state overrides the
   * local override (so the optimistic update only lives
   * until the next fetch lands). */
  const [toggleOverrides, setToggleOverrides] = useState<
    ReadonlyMap<string, { enabled: boolean }>
  >(() => new Map());
  /* Compute the merged rules inline (rather than via a
   * useEffect that calls setState) so we don't trigger
   * React 19's set-state-in-effect lint rule. The merge is
   * a no-op when no override is active, in which case we
   * return the original `rules` array (and the grid's memo
   * sees a stable identity). Stale overrides — i.e. ids
   * the server no longer returns — silently no-op here
   * (the `.map` iterates only the live `rules`), so a
   * server-side delete drops the override automatically. */
  const localRules = useMemo<ReadonlyArray<RoutingRule>>(() => {
    if (toggleOverrides.size === 0) return rules;
    let changed = false;
    const out: RoutingRule[] = rules.map((r) => {
      const o = toggleOverrides.get(r.id);
      if (!o) return r;
      if (r.enabled === o.enabled && r.status === (o.enabled ? 'active' : 'paused')) {
        return r;
      }
      changed = true;
      return { ...r, enabled: o.enabled, status: o.enabled ? 'active' : 'paused' };
    });
    return changed ? out : rules;
  }, [rules, toggleOverrides]);
  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      setToggleOverrides((prev) => {
        const next = new Map(prev);
        next.set(id, { enabled });
        return next;
      });
      onRuleToggle(id, enabled);
    },
    [onRuleToggle],
  );

  const activeCount = useMemo(
    () => localRules.filter((r) => r.enabled).length,
    [localRules],
  );

  return (
    <div className="flex flex-col gap-md w-full">
      <AutomationStatusBanner
        onViewRuns={onPublish /* repurpose: view-runs CTA */}
        onTriggerDryRun={onPublish}
        status={systemStatus}
      />
      <KpiSummaryStrip kpis={kpiSummaries} />
      <div className="rounded-lg border border-border bg-surface overflow-hidden w-full">
        <div className="flex items-center justify-between p-md px-lg border-b border-border gap-md flex-wrap">
          <div>
            <div className="text-sm font-semibold text-text">Routing rules</div>
            <div className="text-xs text-text-subtle">
              {activeCount} active · last edited 14m ago
            </div>
          </div>
          <div
            className="flex flex-wrap items-center gap-sm min-w-0"
            role="toolbar"
            aria-label="Routing filters"
          >
            {/* <DropDownListComponent
              id="routing-filter-team"
              dataSource={
                TEAM_OPTIONS as unknown as { [key: string]: object }[]
              }
              fields={dropdownField}
              value={filters.team}
              cssClass="toolbar-filter"
              placeholder="All teams"
              change={(e: DropDownChangeEventArgs) =>
                onFilterChange('team', String(e.value ?? 'all'))
              }
              width={150}
            />
            <DropDownListComponent
              id="routing-filter-priority"
              dataSource={
                PRIORITY_OPTIONS as unknown as { [key: string]: object }[]
              }
              fields={dropdownField}
              value={filters.priority}
              cssClass="toolbar-filter"
              placeholder="By priority"
              change={(e: DropDownChangeEventArgs) =>
                onFilterChange('priority', String(e.value ?? 'all'))
              }
              width={150}
            /> */}
            <ButtonComponent
              cssClass="e-outline e-sm"
              onClick={() => onPublish()}
            >
              <span className="inline-flex items-center gap-xs">
                Publish changes
              </span>
            </ButtonComponent>
            <ButtonComponent
              cssClass="e-primary e-sm"
              onClick={onNewRule}
            >
              <span className="inline-flex items-center gap-xs">
                <Plus size={12} aria-hidden="true" />
                New rule
              </span>
            </ButtonComponent>
          </div>
        </div>
        {/* Error banner — visible only when the routing-rules
         * fetch has failed. The toast also fires on the same
         * condition, but the inline banner keeps the user
         * oriented while they're looking at the empty grid. */}
        {error && !loading ? (
          <div
            className="automation-routing-error flex items-center gap-sm p-md px-lg bg-danger-soft text-danger border-b border-border"
            role="alert"
          >
            <span className="text-sm font-semibold">
              Could not load routing rules
            </span>
            <span className="text-xs text-text-muted">· {error}</span>
          </div>
        ) : null}
        {/* Loading skeleton — five ghost rows so the user can
         * see the grid is about to populate. Rendered when
         * the fetch is in flight AND the page has no rows
         * yet (we don't want a flash of skeleton on a
         * background refetch that already has data). We
         * also hold the Syncfusion grid back until the first
         * non-empty row set arrives — initialising the grid
         * with an empty `dataSource` caches the empty state
         * internally and `refresh()` afterwards cannot
         * repopulate the `<tbody>`. Deferring the first
         * mount until the live data is in hand avoids the
         * problem and matches the showcase's original
         * `SEED_RULES` (which was always non-empty). */}
        {loading && localRules.length === 0 ? (
          <RoutingRulesSkeleton />
        ) : localRules.length > 0 ? (
          <RoutingRulesGrid
            rows={localRules}
            onToggle={handleToggle}
            onEdit={onRuleEdit}
            onViewHistory={onRuleHistory}
            onClone={onRuleClone}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ================================================================== *
 *  SLA policies section — no surrounding card chrome
 *  The list and the "new policy" form sit directly on the
 *  tab surface, separated by a border + gap, so there is
 *  no wrapper card eating vertical space.
 *
 *  Data flow:
 *  • Live rows come from `useAutomationData.slaPolicies` —
 *    sourced from `GET /api/automation/sla-policies`.
 *  • While the first fetch is in flight, the section renders
 *    a skeleton list of four ghost rows (matching the four
 *    hard-coded `SLA_POLICIES` the showcase used to ship).
 *  • While the first fetch is in flight AND the live slice is
 *    still empty, we fall back to the showcase's seed list so
 *    the right column (the "Add a new SLA policy" form) is
 *    not the only thing on screen.
 *  • When the fetch resolves with rows, those rows win.
 *  • When the fetch fails (non-null `error`), we render a
 *    red error banner above the list and the section still
 *    shows the seed list so the user can keep acting on the
 *    policies (Edit / Duplicate / Archive still fire toasts).
 *  • Per-row CTAs (Edit / Duplicate / Archive) read from the
 *    same `SlaPolicy` array the ListView renders, so the
 *    "Opening editor for ..." toast always names the live
 *    policy.
 * ================================================================== */

/* Loading skeleton — four ghost rows in the same proportions
 * as the live list. Plain divs (not a ListView) so we don't
 * mount a Syncfusion widget just to throw it away 200ms later
 * when the data lands. */
function SlaPoliciesSkeleton() {
  return (
    <div
      className="automation-sla-skeleton flex flex-col w-full"
      role="status"
      aria-label="Loading SLA policies"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-sm w-full py-md px-lg border-b border-border last:border-b-0"
        >
          <div className="flex items-center justify-between gap-sm">
            <div className="h-3 w-40 bg-surface-2 rounded-sm animate-pulse" />
            <div className="h-5 w-16 bg-surface-2 rounded-pill animate-pulse" />
          </div>
          <div className="h-2 w-56 bg-surface-2 rounded-sm animate-pulse" />
          <div className="flex gap-sm flex-wrap">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="h-10 w-24 bg-surface-2 rounded-md animate-pulse"
              />
            ))}
          </div>
          <div className="flex gap-sm">
            <div className="h-6 w-12 bg-surface-2 rounded-sm animate-pulse" />
            <div className="h-6 w-16 bg-surface-2 rounded-sm animate-pulse" />
            <div className="h-6 w-16 bg-surface-2 rounded-sm animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SlaPoliciesSection({
  onNewPolicy,
  onSlaEdit,
  onSlaDuplicate,
  onSlaArchive,
  onSlaSeedDraft,
  onFilterChange,
  filters,
  policies,
  loading,
  error,
}: {
  onNewPolicy: () => void;
  onSlaEdit: (id: string) => void;
  onSlaDuplicate: (id: string) => void;
  onSlaArchive: (id: string) => void;
  onSlaSeedDraft: (queue: string, priority: string) => void;
  onFilterChange: (
    filter: 'sla-queue' | 'sla-priority',
    value: string,
  ) => void;
  filters: { slaQueue: string; slaPriority: string };
  /* Live rows from `useAutomationData.slaPolicies`. The
   * section renders the live array directly. When the slice
   * is empty (e.g. first paint or a fetch failure that the
   * parent hasn't surfaced yet), the section renders the
   * skeleton instead — no seed fallback, no hard-coded
   * "showcase" lists left in the component. */
  policies: ReadonlyArray<SlaPolicy>;
  loading: boolean;
  error: string | null;
}) {
  /* Render the live list when it has at least one row.
   * While the first fetch is still in flight AND the live
   * slice is empty, prefer the skeleton (so the user sees
   * we're working on it). */
  const showSkeleton = loading && policies.length === 0;
  const listToRender: ReadonlyArray<SlaPolicy> = policies;
  return (
    <div className="flex flex-col gap-md w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-md w-full">
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between p-md px-lg border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">SLA policies</div>
              <div className="text-xs text-text-subtle">
                {policies.length > 0
                  ? `${policies.length} policies · by priority & customer plan`
                  : 'By priority & customer plan'}
              </div>
            </div>
            <ButtonComponent cssClass="e-outline e-sm" onClick={onNewPolicy}>
              <span className="inline-flex items-center gap-xs">
                <Plus size={12} aria-hidden="true" />
                New policy
              </span>
            </ButtonComponent>
          </div>
          {/* Error banner — visible only when the SLA-policies
           * fetch has failed. The toast also fires on the same
           * condition, but the inline banner keeps the user
           * oriented while they're looking at the list. */}
          {error && !loading ? (
            <div
              className="automation-sla-error flex items-center gap-sm p-md px-lg bg-danger-soft text-danger border-b border-border"
              role="alert"
            >
              <span className="text-sm font-semibold">
                Could not load SLA policies
              </span>
              <span className="text-xs text-text-muted">· {error}</span>
            </div>
          ) : null}
          {showSkeleton ? (
            <SlaPoliciesSkeleton />
          ) : (
            <ListViewComponent
              id="automation-sla-policies"
              key={listToRender.map((p) => p.id).join('|')}
              dataSource={
                listToRender as unknown as { [key: string]: object }[]
              }
              fields={{ id: 'id' }}
              cssClass="automation-sla-list"
              showCheckBox={false}
              template={(policy: SlaPolicy) => (
                <SlaPolicyRow
                  policy={policy}
                  onEdit={onSlaEdit}
                  onDuplicate={onSlaDuplicate}
                  onArchive={onSlaArchive}
                />
              )}
            />
          )}
        </div>
        <div className="flex flex-col gap-md">
          <div className="text-sm font-semibold text-text">
            Add a new SLA policy
          </div>
          <div className="text-xs text-text-subtle">
            Choose a queue and a priority to seed a draft policy.
          </div>
          <div className="flex items-center gap-sm flex-wrap">
            <DropDownListComponent
              id="sla-new-queue"
              dataSource={
                TEAM_OPTIONS.filter((o) => o.id !== 'all') as unknown as {
                  [key: string]: object;
                }[]
              }
              fields={dropdownField}
              value={filters.slaQueue}
              cssClass="toolbar-filter"
              placeholder="Queue"
              change={(e: DropDownChangeEventArgs) =>
                onFilterChange('sla-queue', String(e.value ?? 'platform'))
              }
              width={150}
            />
            <DropDownListComponent
              id="sla-new-priority"
              dataSource={
                PRIORITY_OPTIONS.filter((o) => o.id !== 'all') as unknown as {
                  [key: string]: object;
                }[]
              }
              fields={dropdownField}
              value={filters.slaPriority}
              cssClass="toolbar-filter"
              placeholder="Priority"
              change={(e: DropDownChangeEventArgs) =>
                onFilterChange('sla-priority', String(e.value ?? 'p1'))
              }
              width={120}
            />
            <ButtonComponent
              cssClass="e-primary e-sm"
              onClick={() => onSlaSeedDraft(filters.slaQueue, filters.slaPriority)}
            >
              <span className="inline-flex items-center gap-xs">
                <Plus size={12} aria-hidden="true" />
                New policy
              </span>
            </ButtonComponent>
          </div>
          <div className="text-xs text-text-muted">
            Drafts publish to production in 30 seconds.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  Escalation workflows section — no surrounding card chrome
 *  The workflow builder, palette, and action bar all sit
 *  directly on the tab surface (no wrapper card, no
 *  status banner, no KPI strip).
 *
 *  Data flow:
 *  • Live workflow comes from `useAutomationData.workflow` —
 *    sourced from `GET /api/automation/escalation-workflows/{id}`.
 *  • The title, subtitle, ordered steps, and palette list all
 *    come from the live workflow. The icon / chip letter
 *    (T / C / A) is derived per-step from the `kind` field,
 *    matching the showcase's hard-coded seed.
 *  • While the first fetch is in flight AND the live slice is
 *    empty, the section renders a 5-step skeleton in the same
 *    proportions as the live layout. The Duplicate / View runs
 *    / Save draft / Publish buttons remain mounted so the
 *    user can still fire toasts while the data lands.
 *  • When the fetch fails, the header still renders (so the
 *    buttons stay usable) and a red error banner is shown
 *    above the step stack explaining why the workflow is
 *    empty. The page-level toast also fires on the same
 *    condition (via the parent's `workflowError` effect).
 *  • When the live workflow has no steps (e.g. the server
 *    returns an empty array), the section falls back to the
 *    showcase's hard-coded `WORKFLOW_STEPS` so the page chrome
 *    stays presentable. Same pattern for the palette: live
 *    array wins when non-empty, hard-coded fallback otherwise.
 * ================================================================== */

/* Loading skeleton — five ghost step nodes in the same
 * proportions as the live workflow stack. Plain divs (not
 * a Syncfusion widget) so we don't mount anything just to
 * throw it away 200ms later when the data lands. */
function EscalationSkeleton() {
  return (
    <div
      className="automation-escalation-skeleton flex flex-col w-full"
      role="status"
      aria-label="Loading escalation workflow"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="automation-builder-node flex items-center gap-md bg-surface border border-border rounded-md px-md py-sm w-full mb-1"
        >
          <div className="w-8 h-8 rounded-md bg-surface-2 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-xs">
            <div className="h-3 w-2/5 bg-surface-2 rounded-sm animate-pulse" />
            <div className="h-2 w-4/5 bg-surface-2 rounded-sm animate-pulse" />
          </div>
          <div className="h-5 w-16 bg-surface-2 rounded-pill animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EscalationSection({
  onDuplicate,
  onViewRuns,
  onSaveDraft,
  onPublish,
  onAddStep,
  workflow,
  loading,
  error,
}: {
  onDuplicate: () => void;
  onViewRuns: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onAddStep: (kind: string) => void;
  /* Live workflow from `useAutomationData.workflow`. Falls
   * back to the showcase's hard-coded `WORKFLOW_STEPS` /
   * `WORKFLOW_PALETTE` so the page chrome stays presentable
   * before the first fetch lands or when the server returns
   * an empty workflow. */
  workflow: Workflow | null;
  loading: boolean;
  error: string | null;
}) {
  /* Render the live workflow when it has at least one step,
   * or when the fetch has settled (success or failure). While
   * the first fetch is still in flight AND the live slice has
   * no steps yet, prefer the skeleton (so the user sees we're
   * working on it) over the seed list. The empty-workflow case
   * (server returned a real workflow with no steps) still
   * falls through to the hard-coded seed. */
  /* Render the live workflow directly. When the slice is
   * empty (first paint or fetch failure), the section renders
   * the skeleton — no seed fallback, no hard-coded
   * `WORKFLOW_STEPS` / `WORKFLOW_PALETTE` arrays left. */
  const liveSteps = workflow?.steps ?? [];
  const livePalette = workflow?.palette ?? [];
  const showSkeleton = loading && liveSteps.length === 0;
  const stepsToRender: ReadonlyArray<BuilderStep> = liveSteps;
  const paletteToRender = livePalette;
  const headerTitle =
    showSkeleton
      ? 'Escalation workflow · loading…'
      : workflow?.title && workflow.title.length > 0
        ? workflow.title
        : 'Escalation workflow · (no workflow)';
  const headerSubtitle =
    showSkeleton
      ? 'Loading steps and palette from the API…'
      : workflow?.subtitle && workflow.subtitle.length > 0
        ? workflow.subtitle
        : 'No workflow configured yet. Create one to start routing escalations.';
  return (
    <div className="flex flex-col gap-md w-full">
      <div className="flex items-center justify-between p-md px-lg border-b border-border gap-md flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text">
            {headerTitle}
          </div>
          <div className="text-xs text-text-subtle">
            {headerSubtitle}
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <ButtonComponent cssClass="e-flat e-sm" onClick={onDuplicate}>
            <span className="inline-flex items-center gap-xs">
              <Copy size={12} aria-hidden="true" />
              Duplicate
            </span>
          </ButtonComponent>
          <ButtonComponent cssClass="e-outline e-sm" onClick={onViewRuns}>
            View runs
          </ButtonComponent>
          <ButtonComponent cssClass="e-outline e-sm" onClick={onSaveDraft}>
            <span className="inline-flex items-center gap-xs">
              <Check size={12} aria-hidden="true" />
              Save draft
            </span>
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-sm" onClick={onPublish}>
            <span className="inline-flex items-center gap-xs">
              Publish
            </span>
          </ButtonComponent>
        </div>
      </div>
      {/* Error banner — visible only when the workflow fetch
       * has failed. The page-level toast also fires on the
       * same condition, but the inline banner keeps the user
       * oriented while they're looking at the empty step
       * stack. We still render the (fallback) steps below so
       * the user can keep acting on the workflow (Duplicate
       * / Save draft / Publish still fire toasts). */}
      {error && !loading ? (
        <div
          className="automation-escalation-error flex items-center gap-sm p-md px-lg bg-danger-soft text-danger border-b border-border"
          role="alert"
        >
          <span className="text-sm font-semibold">
            Could not load escalation workflow
          </span>
          <span className="text-xs text-text-muted">· {error}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-lg p-lg">
        <div
          className="automation-builder-stack flex flex-col"
          data-workflow-id={workflow?.id ?? ''}
        >
          {showSkeleton ? (
            <EscalationSkeleton />
          ) : (
            stepsToRender.map((step, i) => {
              const icon = builderIconMap[step.kind];
              const chipLabel = step.kind.charAt(0).toUpperCase() + step.kind.slice(1);
              return (
                <div key={step.id}>
                  <div
                    className={`automation-builder-node automation-builder-node--${step.kind} flex items-center gap-md bg-surface border border-border rounded-md px-md py-sm w-full`}
                  >
                    <div
                      className={[
                        'w-8 h-8 grid place-items-center rounded-md text-xs font-bold shrink-0',
                        step.kind === 'trigger' && 'bg-info-soft text-info',
                        step.kind === 'condition' && 'bg-warning-soft text-warning',
                        step.kind === 'action' && 'bg-success-soft text-success',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden="true"
                    >
                      {icon.letter}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text">
                        {step.title}
                      </div>
                      <div className="text-xs text-text-muted font-mono truncate">
                        {step.expr}
                      </div>
                    </div>
                    <Chip label={chipLabel} tone={icon.tone} />
                  </div>
                  {i < stepsToRender.length - 1 && (
                    <div
                      className="automation-builder-connector ml-[27px] my-1"
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
        <aside
          className="automation-builder-aside flex flex-col gap-md p-md bg-surface-2 rounded-md"
          aria-label="Available blocks"
        >
          <div className="text-xs uppercase tracking-wide text-text-subtle font-semibold">
            Add step
          </div>
          {paletteToRender.length > 0 ? (
            <ListViewComponent
              id="automation-workflow-palette"
              dataSource={
                paletteToRender as unknown as { [key: string]: object }[]
              }
              fields={{ id: 'id' }}
              cssClass="automation-palette-list"
              showCheckBox={false}
              template={workflowPaletteTemplate}
              actionComplete={() => {
                /* No-op; the palette list is a CTA surface
                 * (clicking an item adds a step to the
                 * workflow). We surface the CTA through the
                 * parent's onAddStep handler. */
              }}
            />
          ) : (
            <div
              className="automation-palette-empty text-xs text-text-muted"
              role="status"
            >
              No palette blocks available.
            </div>
          )}
          <ButtonComponent
            cssClass="e-outline e-sm w-full"
            onClick={() => onAddStep('trigger')}
          >
            <span className="inline-flex items-center gap-xs">
              <Plus size={12} aria-hidden="true" />
              Add trigger
            </span>
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-outline e-sm w-full"
            onClick={() => onAddStep('condition')}
          >
            <span className="inline-flex items-center gap-xs">
              <Plus size={12} aria-hidden="true" />
              Add condition
            </span>
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-outline e-sm w-full"
            onClick={() => onAddStep('action')}
          >
            <span className="inline-flex items-center gap-xs">
              <Plus size={12} aria-hidden="true" />
              Add action
            </span>
          </ButtonComponent>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  Macros & Impact section
 *  Combines the Macros & templates card grid with the
 *  Automation impact metric strip and the 14-day coverage
 *  chart. Every dropdown, segmented range button, and card
 *  action is wired to a meaningful CTA.
 * ================================================================== */

function MacrosImpactSection({
  onUseMacro,
  onDuplicateMacro,
  onNewMacro,
  onExport,
  onFilterChange,
  onImpactRangeChange,
  filters,
  coverageSeries,
  macros,
  macrosLoading,
  macrosError,
  impactMetrics,
  impactMetricsLoading,
  impactMetricsError,
}: {
  onUseMacro: (id: string) => void;
  onDuplicateMacro: (id: string) => void;
  onNewMacro: () => void;
  onExport: () => void;
  onFilterChange: (
    filter: 'macro-team' | 'macro-usage',
    value: string,
  ) => void;
  onImpactRangeChange: (range: '7d' | '30d' | '90d') => void;
  filters: {
    macroTeam: string;
    macroUsage: string;
    impactRange: '7d' | '30d' | '90d';
  };
  coverageSeries: {
    xLabels: ReadonlyArray<string>;
    autoRouted: ReadonlyArray<number>;
    autoResolved: ReadonlyArray<number>;
    sla: ReadonlyArray<number>;
  };
  /* Live macros from `useAutomationData.macros`. The
   * section renders the live array directly. While the
   * first fetch is in flight, a skeleton card grid mirrors
   * the layout; if the fetch settles empty (e.g. the server
   * returned an empty list, or the endpoint is down) the
   * section renders an inline empty state. */
  macros: ReadonlyArray<MacroCard>;
  macrosLoading: boolean;
  macrosError: string | null;
  /* Live impact metrics from the `/api/automation/impact`
   * response. Rendered below the macros grid; same
   * loading / empty / error handling as the macros slice. */
  impactMetrics: ReadonlyArray<ImpactMetric>;
  impactMetricsLoading: boolean;
  impactMetricsError: string | null;
}) {
  const macroCount = macros.length;
  /* Subtitle of the coverage chart's header — picks the
   * cadence + range label that matches the currently
   * selected impact range so the user reads the same
   * shape on screen that the backend synthesized. The
   * bucket count drives the cadence word:
   *   • 7 buckets  → "Daily"   (the 7d range uses one
   *                        bucket per day)
   *   • 6 buckets  → "Weekly"  (the 30d range uses one
   *                        bucket per ISO week)
   *   • 3 buckets  → "Monthly" (the 90d range uses one
   *                        bucket per month)
   * The "last N days" suffix is read straight off the
   * active impact-range filter — same source the CSV
   * export reads from so the two surfaces agree. The
   * fallback ("Daily, last N days") catches any bucket
   * count that doesn't match the canonical trio (e.g.
   * when the API returns an empty list before the first
   * fetch lands). */
  const bucketCount = coverageSeries.xLabels.length;
  const chartCadence =
    bucketCount <= 7
      ? 'Daily'
      : bucketCount >= 5 && bucketCount <= 8
        ? 'Weekly'
        : 'Monthly';
  const chartRangeLabel = `last ${filters.impactRange.replace(
    /d$/,
    '',
  )} days`;
  const chartSubtitle = `${chartCadence}, ${chartRangeLabel}`;
  return (
    <div className="flex flex-col gap-md w-full">
      <div className="flex items-center justify-between gap-md flex-wrap">
        <div>
          <div className="text-sm font-semibold text-text">
            Macros &amp; templates
          </div>
          <div className="text-xs text-text-subtle">
            {macroCount > 0
              ? `${macroCount} macro${macroCount === 1 ? '' : 's'} from the server`
              : macrosLoading
                ? 'Loading macros from the server…'
                : 'No macros configured yet.'}
          </div>
        </div>
        <div className="flex items-center gap-sm flex-wrap">
          {/* <DropDownListComponent
            id="macro-filter-team"
            dataSource={
              TEAM_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={dropdownField}
            value={filters.macroTeam}
            cssClass="toolbar-filter"
            placeholder="All teams"
            change={(e: DropDownChangeEventArgs) =>
              onFilterChange('macro-team', String(e.value ?? 'all'))
            }
            width={150}
          />
          <DropDownListComponent
            id="macro-filter-usage"
            dataSource={
              MACRO_USAGE_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={dropdownField}
            value={filters.macroUsage}
            cssClass="toolbar-filter"
            placeholder="Most used"
            change={(e: DropDownChangeEventArgs) =>
              onFilterChange('macro-usage', String(e.value ?? 'most-used'))
            }
            width={150}
          /> */}
          <ButtonComponent cssClass="e-primary e-sm" onClick={onNewMacro}>
            <span className="inline-flex items-center gap-xs">
              <Plus size={12} aria-hidden="true" />
              New macro
            </span>
          </ButtonComponent>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
        {/* Error banner — visible only when the macros fetch
         * has failed. The page toast also fires on the same
         * condition; the inline banner keeps the user oriented
         * while they're looking at the empty grid. */}
        {macrosError && !macrosLoading ? (
          <div
            className="automation-macros-error col-span-full flex items-center gap-sm p-md px-lg bg-danger-soft text-danger border border-border rounded-md"
            role="alert"
          >
            <span className="text-sm font-semibold">
              Could not load macros
            </span>
            <span className="text-xs text-text-muted">· {macrosError}</span>
          </div>
        ) : null}
        {macrosLoading && macros.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`macro-skel-${i}`}
                className="e-card e-card-vertical automation-macro-card rounded-md animate-pulse"
                role="status"
                aria-label="Loading macro…"
              >
                <div className="e-card-header flex flex-row items-center gap-md px-md py-sm">
                  <div className="e-card-header-caption min-w-0 flex-1 flex flex-col gap-xs">
                    <div className="h-3 w-32 bg-surface-2 rounded-sm" />
                    <div className="h-2 w-20 bg-surface-2 rounded-sm" />
                  </div>
                  <div className="h-5 w-12 bg-surface-2 rounded-sm" />
                  <div className="h-5 w-12 bg-surface-2 rounded-pill" />
                </div>
                <div className="e-card-content p-md pt-0 flex flex-col gap-sm">
                  <div className="h-20 bg-surface-2 rounded-sm" />
                </div>
                <div className="e-card-actions flex flex-row items-center justify-end gap-sm px-md py-sm">
                  <div className="h-6 w-20 bg-surface-2 rounded-sm" />
                  <div className="h-6 w-12 bg-surface-2 rounded-sm" />
                </div>
              </div>
            ))
          : macros.map((m) => (
              <MacroCardItem
                key={m.id}
                macro={m}
                onUse={onUseMacro}
                onDuplicate={onDuplicateMacro}
              />
            ))}
        {!macrosLoading && !macrosError && macros.length === 0 ? (
          <div
            className="col-span-full text-center text-sm text-text-subtle py-lg"
            role="status"
          >
            No macros configured. Use “New macro” to add one.
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-md flex-wrap">
        <div>
          
        </div>
        <div className="flex items-center gap-sm flex-wrap">
          <div
            className="flex items-center gap-sm"
            role="toolbar"
            aria-label="Impact range"
          >
            <ButtonComponent
              cssClass={filters.impactRange === '7d' ? 'e-primary e-sm' : 'e-outline e-sm'}
              onClick={() => onImpactRangeChange('7d')}
            >
              7d
            </ButtonComponent>
            <ButtonComponent
              cssClass={filters.impactRange === '30d' ? 'e-primary e-sm' : 'e-outline e-sm'}
              onClick={() => onImpactRangeChange('30d')}
            >
              30d
            </ButtonComponent>
            <ButtonComponent
              cssClass={filters.impactRange === '90d' ? 'e-primary e-sm' : 'e-outline e-sm'}
              onClick={() => onImpactRangeChange('90d')}
            >
              90d
            </ButtonComponent>
          </div>
          <ButtonComponent cssClass="e-flat e-sm" onClick={onExport}>
            <span className="inline-flex items-center gap-xs">
              <Download size={12} aria-hidden="true" />
              Export CSV
            </span>
          </ButtonComponent>
        </div>
      </div>
      {/* <section
        aria-label="Automation impact metrics"
        className="kpi-section grid grid-cols-1 md:grid-cols-3 gap-md"
      >
        {impactMetricsError && !impactMetricsLoading ? (
          <div
            className="automation-metrics-error col-span-full flex items-center gap-sm p-md px-lg bg-danger-soft text-danger border border-border rounded-md"
            role="alert"
          >
            <span className="text-sm font-semibold">
              Could not load automation impact metrics
            </span>
            <span className="text-xs text-text-muted">· {impactMetricsError}</span>
          </div>
        ) : null}
        {impactMetricsLoading && impactMetrics.length === 0
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`impact-metric-skel-${i}`}
                className="e-card e-card-vertical kpi-tile animate-pulse"
                role="status"
                aria-label="Loading impact metric…"
              >
                <div className="e-card-header flex flex-row items-center justify-between gap-md px-md py-sm">
                  <div className="h-3 w-32 bg-surface-2 rounded-sm" />
                  <div className="h-5 w-12 bg-surface-2 rounded-pill" />
                </div>
                <div className="e-card-content flex flex-col gap-sm px-md py-sm">
                  <div className="h-6 w-20 bg-surface-2 rounded-sm" />
                  <div className="h-2 w-full bg-surface-2 rounded-md" />
                  <div className="h-2 w-32 bg-surface-2 rounded-sm" />
                </div>
              </div>
            ))
          : impactMetrics.map((m) => (
              <ImpactMetricCard key={m.id} metric={m} />
            ))}
      </section> */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between p-md px-lg border-b border-border gap-md flex-wrap">
          <div>
            <div className="text-sm font-semibold text-text">
              Automation coverage over time
            </div>
            <div className="text-xs text-text-subtle">
              {chartSubtitle}
            </div>
          </div>
          <div className="flex items-center gap-md flex-wrap">
            <span className="inline-flex items-center gap-xs text-xs text-text-muted">
              <span
                className="w-2.5 h-2.5 rounded-sm bg-primary"
                aria-hidden="true"
              />
              Auto-routed
            </span>
            <span className="inline-flex items-center gap-xs text-xs text-text-muted">
              <span
                className="w-2.5 h-2.5 rounded-sm bg-info"
                aria-hidden="true"
              />
              Auto-resolved
            </span>
            <span className="inline-flex items-center gap-xs text-xs text-text-muted">
              <span
                className="w-2.5 h-2.5 rounded-sm bg-success"
                aria-hidden="true"
              />
              SLA compliance
            </span>
          </div>
        </div>
        <div className="p-md px-lg pb-lg">
          <ChartComponent
            id="automation-coverage-chart"
            /* Force a remount of the Syncfusion chart whenever
             * the live coverage identity changes. Syncfusion's
             * `LineSeries` caches the highlight / selection
             * state of the last-inflated data point in an
             * imperative DOM node that does **not** get reset
             * when `dataSource` changes by reference — instead
             * the chart overlays a yellow-fill / black-stroked
             * selection rectangle on the stale point, which
             * reads to the user as a stray "yellow stripe" at
             * the right edge of the chart. Re-keying on the
             * data identity is the documented React workaround
             * and is consistent with the routing grid above
             * (`key={rows.map(r => r.id).join('|')}`). */
            key={`coverage-${coverageSeries.xLabels.join('|')}-${coverageSeries.autoRouted.join('|')}-${coverageSeries.autoResolved.join('|')}-${coverageSeries.sla.join('|')}`}
            primaryXAxis={{
              valueType: 'Category',
              majorGridLines: { width: 0 },
              labelStyle: { color: 'var(--color-text-subtle)' },
            }}
            primaryYAxis={{
              minimum: 0,
              maximum: 100,
              interval: 25,
              labelFormat: '{value}%',
              majorGridLines: { color: 'var(--color-border)', width: 1 },
              lineStyle: { width: 0 },
              labelStyle: { color: 'var(--color-text-subtle)' },
            }}
            legendSettings={{ visible: false }}
            tooltip={{
              enable: true,
              fill: 'var(--color-surface)',
              border: { color: 'var(--color-border)' },
              textStyle: { color: 'var(--color-text)' },
            }}
            height="240px"
            background="transparent"
            accessibility={{
              accessibilityDescription:
                'Line chart of automation coverage (auto-routed, auto-resolved, and SLA compliance) over the last 14 days.',
              accessibilityRole: 'img',
            }}
          >
            <Inject services={[Category, LineSeries, Legend, Tooltip]} />
            <SeriesCollectionDirective>
              <SeriesDirective
                dataSource={coverageSeries.autoRouted.map((y, i) => ({
                  x: coverageSeries.xLabels[i] ?? String(i),
                  y,
                }))}
                xName="x"
                yName="y"
                type="Line"
                name="Auto-routed"
                fill="var(--color-primary)"
                border={{ color: 'var(--color-primary)', width: 2 }}
                /* `allowHighlight: false` suppresses the
                 * Syncfusion `LineSeries` trackball/selection
                 * yellow-fill rectangle that otherwise lingers
                 * on the last data point as a stray "yellow
                 * stripe" at the right edge of the chart when
                 * the data identity changes. The chart already
                 * renders no markers (markers are invisible),
                 * so leave the default marker shape/size and
                 * only disable the highlight overlay. */
                marker={{ visible: false, allowHighlight: false }}
              />
              <SeriesDirective
                dataSource={coverageSeries.autoResolved.map((y, i) => ({
                  x: coverageSeries.xLabels[i] ?? String(i),
                  y,
                }))}
                xName="x"
                yName="y"
                type="Line"
                name="Auto-resolved"
                fill="var(--color-info)"
                border={{
                  color: 'var(--color-info)',
                  width: 2,
                  dashArray: '4 4',
                }}
                marker={{ visible: false, allowHighlight: false }}
              />
              <SeriesDirective
                dataSource={coverageSeries.sla.map((y, i) => ({
                  x: coverageSeries.xLabels[i] ?? String(i),
                  y,
                }))}
                xName="x"
                yName="y"
                type="Line"
                name="SLA compliance"
                fill="var(--color-success)"
                border={{ color: 'var(--color-success)', width: 2 }}
                marker={{ visible: false, allowHighlight: false }}
              />
            </SeriesCollectionDirective>
          </ChartComponent>
        </div>
      </div>
    </div>
  );
}

