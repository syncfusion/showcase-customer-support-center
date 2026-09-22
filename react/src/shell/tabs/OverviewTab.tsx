import '../../styles/tabs/overview.css';

import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOverviewData } from '../../hooks/useOverviewData';
import {
  addTicketNote,
  closeTicketAsDuplicate,
  bulkEscalate,
  reassignBreachAlert,
  reassignTicket,
  toDomainTicket,
} from '../../api/overviewClient';
import {
  AlertTriangle,
  CircleCheck,
  Clock,
  Mail,
  Minus,
  Settings,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import {
  DropDownButtonComponent,
  type ItemModel,
} from '@syncfusion/ej2-react-splitbuttons';
import {
  DropDownListComponent,
  MultiSelectComponent,
} from '@syncfusion/ej2-react-dropdowns';
import { Inject as DropdownsInject, CheckBoxSelection } from '@syncfusion/ej2-react-dropdowns';
import {
  ChartComponent,
  SeriesCollectionDirective,
  SeriesDirective,
  Inject,
  Category,
  ColumnSeries,
  LineSeries,
  Legend,
  Tooltip,
} from '@syncfusion/ej2-react-charts';
import {
  AccumulationChartComponent,
  AccumulationSeriesCollectionDirective,
  AccumulationSeriesDirective,
  Inject as AccumulationInject,
  PieSeries,
  AccumulationLegend,
  AccumulationTooltip,
  AccumulationDataLabel,
} from '@syncfusion/ej2-react-charts';
import {
  SparklineComponent,
  Inject as SparklineInject,
  SparklineTooltip,
} from '@syncfusion/ej2-react-charts';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Page,
  Sort,
  Filter,
  Inject as GridInject,
} from '@syncfusion/ej2-react-grids';
import { ProgressBarComponent } from '@syncfusion/ej2-react-progressbar';
import {
  MessageComponent,
  ToastComponent,
} from '@syncfusion/ej2-react-notifications';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { ListViewComponent } from '@syncfusion/ej2-react-lists';

type Severity = 'ok' | 'risk' | 'breach';

/* ---------- Atoms ---------- */

type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const chipCssMap: Record<ChipTone, string> = {
  success: 'e-success',
  warning: 'e-warning',
  error: 'e-danger',
  info: 'e-info',
  neutral: 'e-secondary',
};

const chipStyleMap: Record<ChipTone, React.CSSProperties> = {
  success: {
    backgroundColor: '#dcfce7',  /* green-100 — mild on-track */
    color: 'var(--color-success)',
    borderColor: '#bbf7d0',      /* green-200 */
  },
  warning: {
    backgroundColor: '#fef3c7',  /* amber-100 — mild at-risk */
    color: 'var(--color-warning)',
    borderColor: '#fde68a',      /* amber-200 */
  },
  error: {
    backgroundColor: 'var(--color-danger-soft)',  /* red-100 — mild critical */
    color: 'var(--color-danger)',
    borderColor: 'var(--color-danger-soft-border)',
  },
  info: {
    backgroundColor: '#dbeafe',  /* blue-100 — mild 24×7 */
    color: 'var(--color-info)',
    borderColor: '#bfdbfe',      /* blue-200 */
  },
  neutral: {
    backgroundColor: 'var(--color-surface-2)',
    color: 'var(--color-text-muted)',
    borderColor: 'var(--color-border)',
  },
};

function Chip({
  label,
  tone,
  trend,
}: {
  label: string;
  tone: ChipTone;
  trend?: 'up' | 'down' | 'flat';
}) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const toneStyle = chipStyleMap[tone];

  return (
    <span
      role="status"
      className={`${chipCssMap[tone]} inline-flex items-center gap-xs rounded-pill px-sm py-0.5 text-xs font-medium`}
      style={{
        backgroundColor: toneStyle.backgroundColor,
        color: toneStyle.color,
      }}
    >
      {trend && (
        <TrendIcon
          size={12}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
}

export function Priority({ level }: { level: 'p1' | 'p2' | 'p3' | 'p4' }) {

  const priorityTone: Record<'p1' | 'p2' | 'p3' | 'p4', ChipTone> = {
    p1: 'error',
    p2: 'warning',
    p3: 'info',
    p4: 'neutral',
  };

  return <Chip label={level.toUpperCase()} tone={priorityTone[level]} />;
}

function SlaTimer({ severity, label, }: { severity: Severity; label: string }) {
  const colorClass =
    severity === 'ok'
      ? 'text-success'
      : severity === 'risk'
        ? 'text-warning'
        : 'text-danger';
  const isBreach = severity === 'breach';
  return (
    <span
      className={[
        'inline-flex items-center gap-xs font-mono text-sm',
        colorClass,
        isBreach ? 'sla-live sla-live--pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Clock size={12} strokeWidth={2.25} aria-hidden="true" />
      <span className="sla-live-digits" aria-live="polite">
        {label}
      </span>
    </span>
  );
}

function SlaLiveCell({
  deadlineMs,
  severity 
}: {
  deadlineMs: number;
  severity: 'breach' | 'risk' | 'ok'
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { label } = formatSla(deadlineMs, now);
  return (
    <div className={`px-sm py-xs sla-cell--${severity}`}>
      <SlaTimer severity={severity} label={label} />
    </div>
  );
}

type Channel = 'email' | 'chat' | 'portal' | 'social' | 'phone';

function ChannelChip({ channel }: { channel: Channel }) {
  const config: Record<Channel, { label: string; color: string }> = {
    email: { label: 'Email', color: 'text-primary' },
    chat: { label: 'Chat', color: 'text-info' },
    portal: { label: 'Portal', color: 'text-success' },
    social: { label: 'Social', color: 'text-danger' },
    phone: { label: 'Phone', color: 'text-warning' },
  };
  const { label, color } = config[channel];
  return (
    <span className="inline-flex items-center gap-xs px-sm py-0.5 rounded-pill text-xs font-medium bg-surface-2 text-text-muted">
      <Mail size={12} className={color} aria-hidden="true" />
      {label}
    </span>
  );
}

export function AgentAvatar({ initials }: { initials: string }) {
  return (
    <span
      className="w-8 h-8 rounded-pill flex items-center justify-center text-xs font-semibold shrink-0 bg-primary-soft text-primary"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ---------- Composite pieces ---------- */

interface KpiCardProps {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'flat';
  trendText: string;
  chip: { label: string; tone: ChipTone };
  spark: ReadonlyArray<readonly [number, number]>;
  sparkColor: string;
}

function formatTrendText(
  raw: string,
  trend: 'up' | 'down' | 'flat',
): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'No change vs last week';

  if (/[a-zA-Z]/.test(trimmed) && /\s/.test(trimmed)) {
    return trimmed;
  }

  // Bare delta (integer or signed number with optional sign).
  const isBareDelta = /^[+−-]?\d+(\.\d+)?$/.test(trimmed);
  if (!isBareDelta) return trimmed;

  if (trend === 'flat') {
    return trimmed === '0' || trimmed === '+0' || trimmed === '−0'
      ? 'No change vs last week'
      : `${trimmed} vs last week`;
  }
  if (trimmed === '0') return 'No change vs last week';
  return `${trimmed} since last week`;
}

const KPI_SPARK_COLOR_FALLBACK: Record<ChipTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
  info: 'var(--color-info)',
  neutral: 'var(--color-text-muted)',
};

function KpiCard({
  label,
  value,
  trend,
  trendText,
  chip,
  spark,
  sparkColor,
}: KpiCardProps) {
  const trendTone: ChipTone = chip.tone;

  const sparkData = spark.map(([, y], i) => ({ x: i, y }));

  const sparklineId = `sparkline-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const tileTone =
    chip.tone === 'success'
      ? 'success'
      : chip.tone === 'error'
        ? 'danger'
        : chip.tone === 'warning'
          ? 'warning'
          : chip.tone === 'info'
            ? 'info'
            : 'neutral';

  const resolvedSparkColor =
    chip.tone === 'success' ||
    chip.tone === 'warning' ||
    chip.tone === 'error'
      ? KPI_SPARK_COLOR_FALLBACK[chip.tone]
      : sparkColor;

  // const ChipIcon = (() => {
  //   switch (chip.tone) {
  //     case 'success':
  //       return CircleCheck;
  //     case 'error':
  //       return ShieldAlert;
  //     case 'warning':
  //       return AlertTriangle;
  //     case 'info':
  //       return TrendingUp;
  //     default:
  //       return Clock;
  //   }
  // })();

  return (
    <article
      className={`e-card e-card-vertical kpi-tile kpi-tile--${tileTone}`}
      role="group"
      aria-label={`${label}: ${value}, ${trendText}`}
    >
      <div className="e-card-header kpi-tile__head">
        <div className="e-card-header-caption">
          <div className="e-card-header-title kpi-tile__label">
            {label}
          </div>
        </div>
        {/* <div className="kpi-tile__chip">
          <span
            className={`kpi-tile__chip-disc kpi-tile__chip-disc--${chip.tone}`}
            aria-hidden="true"
          >
            <ChipIcon size={14} strokeWidth={2.25} />
          </span>
        </div> */}
      </div>

      <div className="e-card-content kpi-tile__content">
        <div className="kpi-tile__value-wrap">
          <div className="kpi-tile__value text-text">{value}</div>
        </div>
        <div className="kpi-tile__spark">
          <SparklineComponent
            id={sparklineId}
            dataSource={sparkData}
            xName="x"
            yName="y"
            fill={resolvedSparkColor}
            type="Area"
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
      </div>

      <div className="e-card-actions kpi-tile__actions">
        <Chip
          label={formatTrendText(trendText, trend)}
          tone={trendTone}
          trend={trend}
        />
      </div>
    </article>
  );
}

interface AgentRow {
  initials: string;
  name: string;
  sub: string;
  count: string;
  loadPct: number;
  loadTone: Severity;
}

const LOAD_TONE_COLOR: Record<AgentRow['loadTone'], string> = {
  ok: 'var(--color-success)',
  risk: 'var(--color-warning)',
  breach: 'var(--color-danger)',
};

function workloadColor(loadPct: number): string {
  if (loadPct >= 85) return LOAD_TONE_COLOR.breach;
  if (loadPct >= 60) return LOAD_TONE_COLOR.risk;
  return LOAD_TONE_COLOR.ok;
}

const workloadRowTemplate = (agent: AgentRow) => (
  <div className="e-list-wrapper e-list-multi-line workload-row">
    <div className="grid grid-cols-[1fr_auto] items-center gap-md w-full py-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-sm min-w-0">
          <AgentAvatar initials={agent.initials} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-text truncate e-list-item-header">
              {agent.name}
            </div>
            <div className="text-xs text-text-subtle truncate e-list-content">
              {agent.sub}
            </div>
          </div>
        </div>
        <div className="mt-sm">
          <ProgressBarComponent
            id={`workload-${agent.initials}`}
            value={agent.loadPct}
            width="100%"
            height="8px"
            trackThickness={6}
            progressThickness={14}
            trackColor="var(--color-surface-2)"
            progressColor={workloadColor(agent.loadPct)}
            showProgressValue={false}
            cornerRadius="Round"
            animation={{ enable: false }}
            aria-label={`${agent.name} workload ${agent.loadPct} percent`}
          />
        </div>
      </div>
      <div className="text-sm text-text-muted font-mono whitespace-nowrap">
        {agent.count}
      </div>
    </div>
  </div>
);

function WorkloadList({
  items,
  onScroll,
}: {
  items: ReadonlyArray<AgentRow>;
  onScroll?: (args: {
    scrollTop?: number;
    scrollLeft?: number;
    isAtEnd?: boolean;
  }) => void;
}) {
  return (
    <ListViewComponent
      id="workload-list"
      dataSource={items as unknown as { [key: string]: object }[]}
      fields={{ id: 'name' }}
      cssClass="workload-list"
      showCheckBox={false}
      scroll={onScroll}
      template={workloadRowTemplate}
    />
  );
}

interface ActivityItem {
  id: string;
  title: ReactNode;
  sub: string;
  time: string;
  tone: 'error' | 'warning' | 'info' | 'success';
  icon: typeof ShieldAlert;
  /* Filter metadata — drives the filter dispatch when the user clicks an item. */
  queue: string;
  priority: 'p1' | 'p2' | 'p3' | 'p4';
  channel: Channel;
  /* Raw ISO timestamp. Used to sort the feed newest-first; `time` is the
     human-friendly relative label rendered in the row. */
  at: string;
}

const activityToneChip: Record<ActivityItem['tone'], ChipTone> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success',
};

interface ChannelSlice {
  label: string;
  pct: number;
  color: string;
}

interface ChannelSlice {
  label: string;
  pct: number;
  color: string;
}

interface QueueOption {
  id: string;
  label: string;
}
interface ChannelOption {
  id: string;
  label: string;
}
const FALLBACK_QUEUE_OPTIONS: ReadonlyArray<QueueOption> = [];
const FALLBACK_CHANNEL_OPTIONS: ReadonlyArray<ChannelOption> = [];
const FALLBACK_DATE_RANGE_OPTIONS: ReadonlyArray<{ id: RangeKey; label: string }> = [];
const agentOptionsSeed: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto-balance by load' },
];
const tierOptionsSeed: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'tier1', label: 'Tier 1' },
  { id: 'tier2', label: 'Tier 2' },
  { id: 'tier3', label: 'Tier 3' },
];

const rowActionItems: ItemModel[] = [
  { text: 'Open' },
  { text: 'Reassign' },
  { text: 'Escalate to Tier 3' },
  { text: 'Add note' },
  { text: 'Close as duplicate' },
];

interface TicketRow {
  id: string;
  subject: string;
  priority: 'p1' | 'p2' | 'p3' | 'p4';
  queue: string;
  assignee:
    | { kind: 'agent'; initials: string; name: string }
    | { kind: 'unassigned' };
  sla: { deadlineMs: number; severity: Severity };
  channel: Channel;
}

const SLA_RISK_MS = 5 * 60_000;

function formatSla(
  deadlineMs: number,
  nowMs: number,
): { severity: Severity; label: string } {
  const remaining = deadlineMs - nowMs;
  const pastDue = remaining <= 0;
  const abs = Math.abs(remaining);

  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);

  let label: string;
  if (pastDue) {
    if (h > 0) {
      label = `Breached ${h}h ${m.toString().padStart(2, '0')}m`;
    } else {
      label = `Breached ${m}m ${s.toString().padStart(2, '0')}s`;
    }
  } else if (h > 0) {
    label = `${h}h ${m.toString().padStart(2, '0')}m ${s
      .toString()
      .padStart(2, '0')}s left`;
  } else {
    label = `${m.toString().padStart(2, '0')}m ${s
      .toString()
      .padStart(2, '0')}s left`;
  }

  const severity: Severity = pastDue
    ? 'breach'
    : remaining <= SLA_RISK_MS
      ? 'risk'
      : 'ok';

  return { severity, label };
}

function projectChannelMix(
  data: { slices: { label: string; pct: number; color: string }[] } | null | undefined,
): { x: string; y: number; color: string }[] {
  if (!data) return [];
  return data.slices.map((s) => ({ x: s.label, y: s.pct, color: s.color }));
}

const ACTIVITY_ICON_MAP: Record<string, typeof ShieldAlert> = {
  shield: ShieldAlert,
  trending: TrendingUp,
  settings: Settings,
  check: CircleCheck,
  mail: Mail,
};

function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

/* ---------- State model ---------- */

type RangeKey = '24h' | '7d' | '30d' | 'quarter' | 'custom';
type ChannelFilterKey =
  | 'all'
  | 'Email'
  | 'Chat'
  | 'Phone'
  | 'Portal'
  | 'Social';

type ToastSeverity = 'Success' | 'Info' | 'Warning' | 'Error';
type ToastSpec = {
  id: number;
  title?: string;
  content: string;
  severity: ToastSeverity;
};

type DialogKind =
  | { kind: 'breach-reassign' }
  | { kind: 'row-reassign'; ticketId: string; intent: 'reassign' | 'escalate' }
  | { kind: 'bulk-escalate' }
  | null;

type LiveFeedEvent = { id: number; at: number; text: string };

/* ---------- Page ---------- */

const toastCssClass: Record<ToastSeverity, string> = {
  Success: 'e-toast-success',
  Info: 'e-toast-info',
  Warning: 'e-toast-warning',
  Error: 'e-toast-danger',
};

const dialogField = { text: 'label', value: 'id' } as const;

function breachAlertContent(handlers: {
  heading: string;
  subheading: string;
  onViewCases: () => void;
  onReassign: () => void;
}): () => ReactNode {
  return () => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-sm sm:gap-md p-md px-lg w-full">
      <div className="w-8 h-8 rounded-pill bg-danger text-text-on-primary flex items-center justify-center shrink-0 rounded-full">
        <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" color="white" />
      </div>
      <div className="flex-1 min-w-[16rem]">
        <div className="text-sm font-semibold text-text">
          {handlers.heading}
        </div>
        <div className="text-xs text-text-muted">
          {handlers.subheading}
        </div>
      </div>
      <div className="flex items-center gap-sm w-full sm:w-auto sm:shrink-0 sm:justify-end">
        <ButtonComponent
          cssClass="e-outline flex-1 sm:flex-none"
          onClick={handlers.onViewCases}
        >
          View cases
        </ButtonComponent>
        {/* <ButtonComponent
          cssClass="e-primary flex-1 sm:flex-none"
          ref={(el: { element?: HTMLElement } | null) => {
            const node = el?.element;
            if (node) {
              node.style.setProperty('background-color', 'var(--color-primary)', 'important');
              node.style.setProperty('color', 'var(--color-text-on-primary)', 'important');
              node.style.setProperty('border-color', 'var(--color-primary)', 'important');
            }
          }}
          onClick={handlers.onReassign}
        >
          Reassign now
        </ButtonComponent> */}
      </div>
    </div>
  );
}

let nextToastId = 1;
let nextLiveFeedEventId = 1;

export function OverviewTab() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [queueFilter, setQueueFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilterKey>('all');

  const [openDialog, setOpenDialog] = useState<DialogKind>(null);
  const closeDialog = useCallback(() => setOpenDialog(null), []);

  const [toasts, setToasts] = useState<ToastSpec[]>([]);
  const [mutationPending, setMutationPending] = useState<boolean>(false);

  const [liveFeedRunning, setLiveFeedRunning] = useState<boolean>(false);

  void setLiveFeedRunning;
  const [liveFeedEvents, setLiveFeedEvents] = useState<LiveFeedEvent[]>([]);

  const recordLiveFeedEvent = useCallback((note: string) => {
    setLiveFeedEvents((prev) => {
      const last = prev[0];
      if (last && last.text === note) return prev;
      const event: LiveFeedEvent = {
        id: nextLiveFeedEventId++,
        at: Date.now(),
        text: note,
      };
      return [event, ...prev].slice(0, 5);
    });
  }, []);

  const navigate = useNavigate();
  const toastRef = useRef<ToastComponent>(null);

  const [breachReassignAgentId, setBreachReassignAgentId] = useState<
    string | null
  >('auto');
  const [rowReassignAgentId, setRowReassignAgentId] = useState<
    string | null
  >(null);
  const prevDialogKind = useRef<DialogKind>(openDialog);
  useEffect(() => {
    if (
      prevDialogKind.current &&
      (openDialog === null ||
        openDialog.kind !== prevDialogKind.current.kind)
    ) {
      setRowReassignAgentId(null);
      setBreachReassignAgentId('auto');
    }
    prevDialogKind.current = openDialog;
  }, [openDialog]);

  const overviewFilters = useMemo(
    () => ({
      range,
      queue: (queueFilter as 'all' | 'Billing' | 'Platform' | 'Account' | 'General'),
      channel: channelFilter,
      expanded: false,
    }),
    [range, queueFilter, channelFilter],
  );
  const api = useOverviewData(overviewFilters);

  const filterOptions = api.filterOptions.data;
  const queueOptions: ReadonlyArray<QueueOption> =
    filterOptions?.queues?.length ? filterOptions.queues : FALLBACK_QUEUE_OPTIONS;
  const channelOptions: ReadonlyArray<ChannelOption> =
    filterOptions?.channels?.length ? filterOptions.channels : FALLBACK_CHANNEL_OPTIONS;
  const dateRangeOptions: ReadonlyArray<{ id: RangeKey; label: string }> =
    filterOptions?.dateRanges?.length
      ? (filterOptions.dateRanges as { id: RangeKey; label: string }[])
      : FALLBACK_DATE_RANGE_OPTIONS;
  const agentOptions: ReadonlyArray<{ id: string; label: string }> =
    filterOptions?.agents?.length ? filterOptions.agents : agentOptionsSeed;
  const tierOptions: ReadonlyArray<{ id: string; label: string }> =
    filterOptions?.tiers?.length ? filterOptions.tiers : tierOptionsSeed;

  const channelMixSlices: ReadonlyArray<ChannelSlice> = useMemo(
    () => (api.channelMix.data?.slices ?? []).map((s) => ({
      label: s.label,
      pct: s.pct,
      color: s.color,
    })),
    [api.channelMix.data],
  );
  const donutData = useMemo(
    () => projectChannelMix(api.channelMix.data ?? null),
    [api.channelMix.data],
  );

  const gridRef = useRef<GridComponent | null>(null);

  const apiAtRiskTickets = useMemo(
    () =>
      (api.atRisk.data?.items ?? [])
        .filter((t): t is NonNullable<typeof t> => t != null)
        .map((t) => {
          const domain = toDomainTicket(t);
          const assignee = domain.assignee;
          return {
            id: domain.id,
            subject: domain.subject,
            priority: domain.priority,
            queue: domain.queue,
            assignee,
            sla: domain.sla,
            channel: domain.channel,
          } satisfies TicketRow;
        }),
    [api.atRisk.data],
  );

  const liveDataRef = useRef<ReadonlyArray<TicketRow>>(apiAtRiskTickets);
  useEffect(() => {
    liveDataRef.current = apiAtRiskTickets;
  }, [apiAtRiskTickets]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.dataSource = [...apiAtRiskTickets];
  }, [apiAtRiskTickets]);

  const filteredTickets = useMemo(() => {
    return apiAtRiskTickets.filter((t) => {
      if (queueFilter !== 'all' && t.queue !== queueFilter) return false;
      if (
        channelFilter !== 'all' &&
        t.channel.toLowerCase() !== channelFilter.toLowerCase()
      )
        return false;
      return true;
    });
  }, [queueFilter, channelFilter, apiAtRiskTickets]);
  const filterSettings = { type: 'Menu' } as const;

  const activityItems: ReadonlyArray<ActivityItem> = useMemo(() => {
    const items = api.activity.data?.items ?? [];
    return items.map((it) => {
      const Icon = ACTIVITY_ICON_MAP[it.iconKey] ?? Mail;
      const ticketId = it.ticketId?.startsWith('#') ? it.ticketId : `#${it.ticketId}`;
      const ticketHref = it.ticketHref;
      const tone: ActivityItem['tone'] =
        it.tone === 'success'
          ? 'success'
          : it.tone === 'warning'
            ? 'warning'
            : it.tone === 'info'
              ? 'info'
              : 'error';
      return {
        id: it.id,
        title: (
          <>
            {it.title}{' '}
            <Link
              to={ticketHref}
              className="text-text hover:underline"
            >
              {ticketId}
            </Link>{' '}
            {it.subject}
          </>
        ),
        sub: it.sub,
        time: formatRelativeTime(it.at),
        tone,
        icon: Icon,
        queue: it.queue as ActivityItem['queue'],
        priority: it.priority as 'p1' | 'p2' | 'p3' | 'p4',
        channel: it.channel as Channel,
        at: it.at,
      } satisfies ActivityItem;
    });
  }, [api.activity.data, navigate]);

  const filteredActivity = useMemo(() => {
    const filtered = activityItems.filter((a) => {
      if (queueFilter !== 'all' && a.queue !== queueFilter) return false;
      if (
        channelFilter !== 'all' &&
        a.channel.toLowerCase() !== channelFilter.toLowerCase()
      )
        return false;
      return true;
    });
    // Sort newest-first: raw `at` timestamps descending so "8m ago" / "10m ago"
    // float to the top, oldest events sink to the bottom. Falls back to the
    // original order when timestamps tie or fail to parse.
    const timeOf = (iso: string): number => {
      const t = Date.parse(iso);
      return Number.isNaN(t) ? -Infinity : t;
    };
    return filtered
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const diff = timeOf(b.item.at) - timeOf(a.item.at);
        return diff !== 0 ? diff : a.idx - b.idx;
      })
      .map(({ item }) => item);
  }, [activityItems, queueFilter, channelFilter]);

  const workloadItems: ReadonlyArray<AgentRow> = useMemo(() => {
    const items = api.workload.data?.items ?? [];
    return items
      .map((a) => ({
        initials: a.initials,
        name: a.name,
        sub: a.sub,
        count: `${a.openCount} / ${a.cap}`,
        loadPct: a.loadPct,
        loadTone: a.loadTone,
      }))
      .slice()
      .sort((a, b) => {
        if (b.loadPct !== a.loadPct) return b.loadPct - a.loadPct;
        return a.name.localeCompare(b.name);
      });
  }, [api.workload.data]);

  const kpiSlaCompliance = api.kpis.data?.slaCompliance;
  const kpiActiveBreaches = api.kpis.data?.activeBreaches;
  const kpiAtRisk = api.kpis.data?.atRisk;
  const kpiAvgFirstResponse = api.kpis.data?.avgFirstResponse;
  const trendData = api.trend.data;

  /**
   * Friendly x-axis labels for the trend chart.
   *
   * The backend labels are bucketed (`D1`/`D2`/… for daily buckets, `W1`/
   * `W2`/… for weekly) which makes the chart unreadable for managers —
   * `D3` says nothing about which day of the month it is. We re-label
   * the buckets client-side, anchored to `Date.now()`, so each bucket
   * reads as a real point in time:
   *
   *   24h      → "12 AM", "2 AM", "4 AM", …, "10 PM"   (hour of day, oldest → newest)
   *   7d       → "Mon", "Tue", "Wed", …, "Sun"         (last 7 calendar days)
   *   30d      → "Mar 1", "Mar 6", "Mar 11", …         (every 5th day)
   *   quarter  → "W1 Mar 24", "W2 Mar 31", …           (week-of-quarter + start date)
   *
   * Empty strings tell Syncfusion's Category axis to skip the tick,
   * which keeps the 30d view readable without us hardcoding widths.
   */
  const chartXLabels = useMemo<ReadonlyArray<string>>(() => {
    if (!trendData) return [];
    const now = new Date();
    const n = trendData.labels.length;

    switch (range) {
      case '24h': {
        // Oldest bucket = 23h ago, newest bucket = now.
        return Array.from({ length: n }, (_, i) => {
          const d = new Date(now.getTime() - (n - 1 - i) * 60 * 60_000);
          return d.toLocaleString(undefined, {
            hour: 'numeric',
            hour12: true,
          });
        });
      }
      case '7d': {
        // Last 7 calendar days, oldest → newest (bucket 6 = today).
        return Array.from({ length: n }, (_, i) => {
          const d = new Date(now.getTime() - (n - 1 - i) * 24 * 60 * 60_000);
          return d.toLocaleString(undefined, { weekday: 'short' });
        });
      }
      case '30d': {
        // Label EVERY bucket so no bar is left unlabeled. Visual
        // thinning is handled by the axis `labelIntersectAction`
        // (set on `primaryXAxis`) — Syncfusion rotates or hides
        // overlapping ticks at render time. Empty strings would
        // hard-skip bars and leave gaps, which is what the user
        // flagged in the 30d view.
        return Array.from({ length: n }, (_, i) => {
          const d = new Date(now.getTime() - (n - 1 - i) * 24 * 60 * 60_000);
          return d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
          });
        });
      }
      case 'quarter': {
        // 13 weekly buckets (≈ a fiscal quarter). Bucket 0 = oldest week,
        // bucket n-1 = current week. Show "Wk Mon Dd" so the user can
        // quote both the position and the calendar anchor.
        return Array.from({ length: n }, (_, i) => {
          const d = new Date(now.getTime() - (n - 1 - i) * 7 * 24 * 60 * 60_000);
          const wkLabel = d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
          });
          return `W${i + 1} ${wkLabel}`;
        });
      }
      default:
        // 'custom' or anything unrecognised — fall back to backend labels.
        return trendData.labels;
    }
  }, [range, trendData]);

  const breachAlert = api.breachAlert.data;
  const showBreachAlert = breachAlert?.active ?? false;

  const erroredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = erroredRef.current;
    const errors: Array<[string, string | null]> = [
      ['kpis', api.kpis.error],
      ['trend', api.trend.error],
      ['channelMix', api.channelMix.error],
      ['activity', api.activity.error],
      ['workload', api.workload.error],
      ['atRisk', api.atRisk.error],
      ['breachAlert', api.breachAlert.error],
      ['filterOptions', api.filterOptions.error],
    ];
    for (const [key, err] of errors) {
      if (err && !seen.has(key)) {
        seen.add(key);
        pushToast({
          title: 'Failed to load',
          content: `${key}: ${err}`,
          severity: 'Error',
        });
      } else if (!err && seen.has(key)) {
        seen.delete(key);
      }
    }
  }, [
    api.kpis.error,
    api.trend.error,
    api.channelMix.error,
    api.activity.error,
    api.workload.error,
    api.atRisk.error,
    api.breachAlert.error,
    api.filterOptions.error,
  ]);

  const TICKET_ID_PATTERN = /^#CS-\d+$/;
  const onActivityCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Walk up to the nearest <a> — the click may land on a
    // nested <span> (e.g. inside the anchor's text node) or
    // whitespace between fragments.
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    const text = (anchor.textContent ?? '').trim();
    if (!TICKET_ID_PATTERN.test(text)) return;
    event.preventDefault();
    const rawId = text.replace(/^#/, '');
    navigate(`/cases?id=${encodeURIComponent(rawId)}`);
  };

  const pushToastDedupe = useCallback((toast: Omit<ToastSpec, 'id'>) => {
    setToasts((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.severity === toast.severity &&
        last.title === toast.title &&
        last.content === toast.content
      ) {
        return prev;
      }
      return [...prev, { ...toast, id: nextToastId++ }];
    });
  }, []);

  const pushToast = (toast: Omit<ToastSpec, 'id'>) => {
    pushToastDedupe(toast);
  };

  // const reloadSlices = useCallback(() => {
  //   api.atRisk.reload();
  //   api.breachAlert.reload();
  // }, [api.atRisk, api.breachAlert]);

  // const mutationInFlightRef = useRef(false);

  // const runMutation = useCallback(
  //   async <T,>(
  //     doRequest: () => Promise<T>,
  //     successMessage: (res: T) => Omit<ToastSpec, 'id'>,
  //   ): Promise<T | undefined> => {
  //     if (mutationInFlightRef.current) {
  //       return undefined;
  //     }
  //     mutationInFlightRef.current = true;
  //     setMutationPending(true);
  //     try {
  //       const res = await doRequest();
  //       pushToastDedupe(successMessage(res));
  //       return res;
  //     } catch (err) {
  //       const message =
  //         (err as { message?: string })?.message ?? 'Unknown error';
  //       pushToastDedupe({
  //         title: 'Action failed',
  //         content: `${message}`,
  //         severity: 'Error',
  //       });
  //       return undefined;
  //     } finally {
  //       mutationInFlightRef.current = false;
  //       setMutationPending(false);
  //       reloadSlices();
  //     }
  //   },
  //   [reloadSlices, pushToastDedupe],
  // );

  const pushFilterAppliedToast = (extra?: string) => {
    void extra;
  };
  void pushFilterAppliedToast;

  const breachReassignTickets: ReadonlyArray<{
    id: string;
    subtitle: string;
  }> = useMemo(() => {
    const ids = breachAlert?.ticketIds ?? [];
    if (ids.length > 0) {
      return ids.slice(0, 3).map((id) => ({
        id: id.startsWith('#') ? id : `#${id}`,
        subtitle: breachAlert?.subheading?.split(' · ')[0] ?? 'P1 case',
      }));
    }
    return apiAtRiskTickets
      .filter((t) => t.sla.severity === 'breach' && t.priority === 'p1')
      .slice(0, 3)
      .map((t) => ({
        id: t.id,
        subtitle: `${t.queue} · ${
          t.assignee.kind === 'agent' ? t.assignee.name : 'Unassigned'
        }`,
      }));
  }, [breachAlert, apiAtRiskTickets]);
  const breachAlertTicketCount = breachReassignTickets.length;

  const LIVE_FEED_MS = 3500;
  useEffect(() => {
    if (!liveFeedRunning) return undefined;
    const id = window.setInterval(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const roll = Math.random();
      const live = liveDataRef.current;
      if (roll < 0.6) {
        // Add a fresh ticket near breach.
        const newId = `#CS-${(10500 - live.length).toString()}`;
        const now = Date.now();
        const subjects = [
          'Refund escalation · Stripe',
          'SSO login loop',
          'API 5xx burst · /orders',
          'Invoice pdf missing pages',
          'Onboarding session conflict',
          'Webhook delivery failure',
          'VAT mis-calculation · EU',
          'Two-factor reset',
        ];
        const queues = ['Billing', 'Platform', 'Account', 'General'] as const;
        const channels = ['email', 'chat', 'portal', 'social', 'phone'] as const;
        const priorities = ['p1', 'p2', 'p3'] as const;
        const i = live.length;
        const next: TicketRow = {
          id: newId,
          subject: subjects[i % subjects.length],
          priority: priorities[i % priorities.length],
          queue: queues[i % queues.length],
          assignee: { kind: 'unassigned' },
          // 60% of new tickets are close to breach (2-4 minutes).
          sla: {
            deadlineMs: now + (1 + (i % 4)) * 60_000,
            severity: 'risk',
          },
          channel: channels[i % channels.length],
        };
        if (live.length >= 12) {
          const oldest = live[0];
          grid.deleteRecord('id', oldest);
        }
        grid.addRecord(next);
        liveDataRef.current = [...liveDataRef.current, next].slice(-12);
        recordLiveFeedEvent(`Added ${newId}`);
      } else if (roll < 0.85) {
        const candidates = live.filter((t) => t.priority !== 'p1');
        if (candidates.length === 0) return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        const updated: TicketRow = {
          ...target,
          priority: 'p1',
          sla: {
            deadlineMs: target.sla.deadlineMs - 60_000,
            severity: 'breach',
          },
        };
        grid.setRowData('id', updated);
        liveDataRef.current = liveDataRef.current.map((t) =>
          t.id === target.id ? updated : t,
        );
        recordLiveFeedEvent(`Escalated ${target.id}`);
      } else {
        const oldestBreach = live.find((t) => t.sla.severity === 'breach');
        if (oldestBreach) {
          grid.deleteRecord('id', oldestBreach);
          liveDataRef.current = liveDataRef.current.filter(
            (t) => t.id !== oldestBreach.id,
          );
          recordLiveFeedEvent(`Resolved ${oldestBreach.id}`);
        }
      }
    }, LIVE_FEED_MS);
    return () => window.clearInterval(id);
  }, [liveFeedRunning, recordLiveFeedEvent]);

  /* ---------- Render queued toasts into the single ToastComponent ---------- */

  const lastToast = toasts[toasts.length - 1];

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="flex flex-col gap-lg w-full py-xl">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-text m-0 mb-xs">
            Service health
          </h1>
          <p className="text-sm text-text-muted m-0">
            Live SLA, workload, and risk across all channels. Updated 12:42 PM.
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-sm sm:gap-md min-w-0 w-full"
          role="toolbar"
          aria-label="Dashboard filters"
        >
          <div className="flex-1 min-w-[10rem] sm:flex-none sm:w-[170px]">
            <DropDownListComponent
              id="filter-date-range"
              dataSource={
                dateRangeOptions as unknown as { [key: string]: object }[]
              }
              fields={dialogField}
              value={range}
              sortOrder="None"
              cssClass="toolbar-filter"
              placeholder="Select range"
              change={(args) => {
                if (args.value == null) return;
                const next = String(args.value) as RangeKey;
                if (next === range) return;
                setRange(next);
              }}
              width="100%"
            />
          </div>

          <div className="flex-1 min-w-[10rem] sm:flex-none sm:w-[170px]">
            <DropDownListComponent
              id="filter-queue"
              dataSource={queueOptions as unknown as { [key: string]: object }[]}
              fields={dialogField}
              value={queueFilter}
              cssClass="toolbar-filter"
              placeholder="All queues"
              change={(args) => {
                if (args.value == null) return;
                const next = String(args.value);
                if (next === queueFilter) return;
                setQueueFilter(next);
              }}
              width="100%"
            />
          </div>

          <div className="flex-1 min-w-[10rem] sm:flex-none sm:w-[170px]">
            <DropDownListComponent
              id="filter-channel"
              dataSource={channelOptions as unknown as { [key: string]: object }[]}
              fields={dialogField}
              value={channelFilter}
              cssClass="toolbar-filter"
              placeholder="All channels"
              change={(args) => {
                if (args.value == null) return;
                const next = String(args.value) as ChannelFilterKey;
                if (next === channelFilter) return;
                setChannelFilter(next);
              }}
              width="100%"
            />
          </div>
        </div>
      </div>

      {showBreachAlert && breachAlert ? (
        <div role="alert" className="rounded-lg overflow-hidden breach-alert-light">
          <MessageComponent
            id="breach-alert"
            severity="Error"
            cssClass="e-error-light breach-alert-body"
            showIcon={false}
            showCloseIcon={false}
            content={breachAlertContent({
              heading: breachAlert.heading,
              subheading: breachAlert.subheading,
              onViewCases: () => navigate(breachAlert.viewCasesHref || '/cases'),
              onReassign: () => {
                setOpenDialog({ kind: 'breach-reassign' });
                const n = breachAlert.ticketIds?.length ?? 0;
                pushToast({
                  title: 'Reassign now',
                  content:
                    n > 0
                      ? `Choose an agent to reassign the ${n} P1 case${n === 1 ? '' : 's'}.`
                      : 'Choose an agent to reassign the at-risk cases.',
                  severity: 'Info',
                });
              },
            })}
          />
        </div>
      ) : null}

      <section
        aria-label="SLA key performance indicators"
        className="kpi-section"
      >
        <KpiCard
          label={`SLA compliance`}
          value={kpiSlaCompliance?.label ?? '—'}
          trend={kpiSlaCompliance?.trend ?? 'flat'}
          trendText={kpiSlaCompliance?.trendText ?? ''}
          chip={
            kpiSlaCompliance?.chip
              ? { label: kpiSlaCompliance.chip.label, tone: kpiSlaCompliance.chip.tone as ChipTone }
              : { label: 'On target', tone: 'success' as ChipTone }
          }
          spark={(kpiSlaCompliance?.spark ?? []).map(
            (p): readonly [number, number] => [p.x, p.y],
          )}
          sparkColor={kpiSlaCompliance?.sparkColor ?? 'var(--color-success)'}
        />
        <KpiCard
          label="Active breaches"
          value={kpiActiveBreaches?.label ?? '—'}
          trend={kpiActiveBreaches?.trend ?? 'flat'}
          trendText={kpiActiveBreaches?.trendText ?? ''}
          chip={
            kpiActiveBreaches?.chip
              ? { label: kpiActiveBreaches.chip.label, tone: kpiActiveBreaches.chip.tone as ChipTone }
              : { label: 'Critical', tone: 'error' as ChipTone }
          }
          spark={(kpiActiveBreaches?.spark ?? []).map(
            (p): readonly [number, number] => [p.x, p.y],
          )}
          sparkColor={kpiActiveBreaches?.sparkColor ?? 'var(--color-danger)'}
        />
        <KpiCard
          label="At-risk (next 60m)"
          value={kpiAtRisk?.label ?? '—'}
          trend={kpiAtRisk?.trend ?? 'flat'}
          trendText={kpiAtRisk?.trendText ?? ''}
          chip={
            kpiAtRisk?.chip
              ? { label: kpiAtRisk.chip.label, tone: kpiAtRisk.chip.tone as ChipTone }
              : { label: 'Watch', tone: 'warning' as ChipTone }
          }
          spark={(kpiAtRisk?.spark ?? []).map(
            (p): readonly [number, number] => [p.x, p.y],
          )}
          sparkColor={kpiAtRisk?.sparkColor ?? 'var(--color-warning)'}
        />
        <KpiCard
          label="Avg first response"
          value={kpiAvgFirstResponse?.label ?? '—'}
          trend={kpiAvgFirstResponse?.trend ?? 'flat'}
          trendText={kpiAvgFirstResponse?.trendText ?? ''}
          chip={
            kpiAvgFirstResponse?.chip
              ? { label: kpiAvgFirstResponse.chip.label, tone: kpiAvgFirstResponse.chip.tone as ChipTone }
              : { label: 'Target 15m', tone: 'neutral' as ChipTone }
          }
          spark={(kpiAvgFirstResponse?.spark ?? []).map(
            (p): readonly [number, number] => [p.x, p.y],
          )}
          sparkColor={kpiAvgFirstResponse?.sparkColor ?? 'var(--color-success)'}
        />
      </section>

      {/* Trends + Activity */}
      <section className="grid gap-md grid-cols-1 lg:grid-cols-[2fr_1fr]">
        {/* Volume & response trend chart — Syncfusion ChartComponent */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between p-md px-lg border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">
                Ticket volume | Response time
              </div>
              <div className="text-xs text-text-subtle">
                {dateRangeOptions.find((o) => o.id === range)?.label ?? ''}
              </div>
            </div>
          </div>

          <div className="px-lg pt-md">
            <div className="flex flex-wrap items-center gap-md">
              <span className="inline-flex items-center gap-xs text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary" aria-hidden="true" />
                Tickets received
              </span>
              <span className="inline-flex items-center gap-xs text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-sm bg-success" aria-hidden="true" />
                Tickets resolved
              </span>
              <span className="inline-flex items-center gap-xs text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-sm bg-danger" aria-hidden="true" />
                Breaches
              </span>
            </div>
          </div>

          <div className="p-md px-lg pb-lg">
            {trendData ? (
              <ChartComponent
                id="trend-chart"
                primaryXAxis={{
                  valueType: 'Category',
                  majorGridLines: { width: 0 },
                  labelStyle: { color: 'var(--color-text-subtle)' },
                  // 30d emits a label per bucket; let Syncfusion
                  // auto-thin by rotating overlapping labels instead
                  // of us hardcoding empty strings (which left bars
                  // unlabeled).
                  labelIntersectAction: 'Rotate45',
                }}
                primaryYAxis={{
                  title: '',
                  minimum: 0,
                  // maximum: trendData.maxY,
                  interval:
                    trendData.interval ||
                    Math.max(1, Math.round(trendData.maxY / 4)),
                  labelFormat: '{value}',
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
                height="80%"
                background="transparent"
                accessibility={{
                  accessibilityDescription:
                    'Bar chart of ticket volume and a line chart of average first response time over the selected range.',
                  accessibilityRole: 'img',
                }}
              >
                <Inject services={[Category, ColumnSeries, LineSeries, Legend, Tooltip]} />
                <SeriesCollectionDirective>
                  <SeriesDirective
                    dataSource={trendData.ticketsReceived.map((y, i) => ({
                      x: chartXLabels[i] ?? '',
                      y,
                    }))}
                    xName="x"
                    yName="y"
                    type="Column"
                    name="Tickets received"
                    fill="var(--color-primary)"
                  />
                  <SeriesDirective
                    dataSource={trendData.ticketsResolved.map((y, i) => ({
                      x: chartXLabels[i] ?? '',
                      y,
                    }))}
                    xName="x"
                    yName="y"
                    type="Column"
                    name="Tickets resolved"
                    fill="var(--color-success)"
                    opacity={0.7}
                  />
                  <SeriesDirective
                    dataSource={trendData.breaches.map((y, i) => ({
                      x: chartXLabels[i] ?? '',
                      y,
                    }))}
                    xName="x"
                    yName="y"
                    type="Line"
                    name="Breaches"
                    fill="var(--color-danger)"
                    width={2}
                    marker={{ visible: false }}
                  />
                  <SeriesDirective
                    dataSource={trendData.responseTimeTarget.map((y, i) => ({
                      x: chartXLabels[i] ?? '',
                      y,
                    }))}
                    xName="x"
                    yName="y"
                    type="Line"
                    name="Response time target"
                    fill="var(--color-info)"
                    width={2}
                    dashArray="4 4"
                    marker={{ visible: false }}
                  />
                </SeriesCollectionDirective>
              </ChartComponent>
            ) : (
              <div
                className="w-full h-[300px] bg-surface-2 rounded-md animate-pulse"
                aria-busy="true"
                aria-label="Loading trend chart"
              />
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden activity-card">
          <div className="flex items-center justify-between p-md px-lg border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">Recent activity</div>
              <div className="text-xs text-text-subtle">
                Alerts, escalations, automations
              </div>
            </div>
          </div>
          {filteredActivity.length === 0 ? (
            <div className="p-md px-lg text-sm text-text-subtle">
              No activity matches the current filters.
            </div>
          ) : (
            <div
              className="activity-feed-scroller"
              onClick={onActivityCardClick}
            >
              <ListViewComponent
                id="activity-feed"
                dataSource={
                  filteredActivity as unknown as { [key: string]: object }[]
                }
                fields={{ id: 'id' }}
                cssClass="activity-feed-list"
                template={(props: { id: string; icon: typeof ShieldAlert; tone: ActivityItem['tone']; title: ReactNode; sub: string; time: string }) => {
                  const Icon = props.icon;
                  return (
                    <div className="e-list-wrapper e-list-multi-line activity-feed-item">
                      <div className="flex items-start gap-sm w-full">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-pill shrink-0 mt-0.5 ${chipCssMap[activityToneChip[props.tone]]}`}
                          aria-hidden="true"
                        >
                          <Icon size={14} strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1 flex flex-col">
                          <div className="text-sm font-medium text-text e-list-item-header">
                            {props.title}
                          </div>
                          <div className="text-xs text-text-subtle e-list-content">
                            {props.sub}
                          </div>
                        </div>
                        <time className="text-xs text-text-subtle whitespace-nowrap ml-auto mt-0.5">
                          {props.time}
                        </time>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Workload + Channel mix */}
      <section className="grid gap-md grid-cols-1 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface overflow-hidden lg:col-span-2 workload-card">
          <div className="flex items-center justify-between p-md px-lg border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">Agent workload</div>
              <div className="text-xs text-text-subtle">
                Open tickets per agent · {workloadItems.length} agents online
              </div>
            </div>
          </div>
          <div className="workload-scroller p-sm px-lg pb-lg">
            <WorkloadList items={workloadItems} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-lg">
          <div className="mb-md">
            <div className="text-sm font-semibold text-text">Channel mix</div>
            <div className="text-xs text-text-subtle">
              {channelMixSlices.length > 0
                ? 'Tickets opened in selected range'
                : 'Loading channel mix…'}
            </div>
          </div>
          <div className="grid place-items-center relative">
            {donutData.length > 0 ? (
              <AccumulationChartComponent
                id="channel-donut"
                legendSettings={{ visible: false }}
                tooltip={{
                  enable: true,
                  fill: 'var(--color-surface)',
                  border: { color: 'var(--color-border)' },
                  textStyle: { color: 'var(--color-text)' },
                }}
                background="transparent"
                height="180px"
                width="180px"
                accessibility={{
                  accessibilityDescription: `Donut chart: ${channelMixSlices
                    .map((c) => `${c.label} ${c.pct}%`)
                    .join(', ')}.`,
                  accessibilityRole: 'img',
                }}
              >
                <AccumulationInject
                  services={[
                    PieSeries,
                    AccumulationLegend,
                    AccumulationTooltip,
                    AccumulationDataLabel,
                  ]}
                />
                <AccumulationSeriesCollectionDirective>
                  <AccumulationSeriesDirective
                    dataSource={donutData}
                    xName="x"
                    yName="y"
                    type="Pie"
                    innerRadius="60%"
                    pointColorMapping="color"
                    dataLabel={{ visible: false }}
                    {...({
                      tooltip: {
                        enable: true,
                        format: '${point.x}: <b>${point.y}%</b>',
                        fill: 'var(--color-surface)',
                        border: { color: 'var(--color-border)' },
                        textStyle: { color: 'var(--color-text)' },
                      },
                    } as Record<string, unknown>)}
                  />
                </AccumulationSeriesCollectionDirective>
              </AccumulationChartComponent>
            ) : (
              /* Loading skeleton for the channel donut. */
              <div
                className="w-[180px] h-[180px] rounded-pill bg-surface-2 animate-pulse"
                aria-busy="true"
                aria-label="Loading channel mix"
              />
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-text">
                {api.channelMix.data?.total ?? '—'}
              </span>
              <span className="text-xs text-text-subtle">tickets</span>
            </div>
          </div>
          {channelMixSlices.length > 0 && (
            <ul className="list-none p-0 mt-md flex flex-col gap-xs">
              {channelMixSlices.map((c) => (
                <li
                  key={c.label}
                  className="flex items-center justify-between text-sm text-text-muted"
                >
                  <span className="inline-flex items-center gap-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    />
                    {c.label}
                  </span>
                  <span className="text-text font-semibold">{c.pct}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* At-risk & breached tickets — Syncfusion Grid */}
      <section>
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-md p-md px-lg border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">
                At-risk &amp; breached tickets
              </div>
              {/* <div className="text-xs text-text-subtle">
                {filteredTickets.length} of {apiAtRiskTickets.length} cases
              </div> */}
            </div>
            <div className="flex flex-wrap items-center gap-sm">
              <ButtonComponent
                cssClass="e-primary"
                onClick={() => setOpenDialog({ kind: 'bulk-escalate' })}
              >
                Bulk escalate
              </ButtonComponent>
            </div>
          </div>
          {(liveFeedRunning || liveFeedEvents.length > 0) && (
            <div
              className={`live-feed-status flex items-center gap-sm px-lg py-xs border-b text-xs ${
                liveFeedRunning
                  ? 'live-feed-status--running'
                  : 'live-feed-status--paused'
              }`}
              aria-live="polite"
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-pill ${
                  liveFeedRunning
                    ? 'live-feed-status__badge sla-live--pulse'
                    : 'live-feed-status__badge live-feed-status__badge--paused'
                }`}
                aria-hidden="true"
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-pill ${
                    liveFeedRunning
                      ? 'bg-text-on-primary'
                      : 'bg-text-subtle'
                  }`}
                />
              </span>
              <span
                className={`font-mono sla-live-digits font-semibold ${
                  liveFeedRunning
                    ? 'text-primary'
                    : 'text-text-muted'
                }`}
              >
                {liveFeedRunning ? 'Live' : 'Paused'}
              </span>
              <span
                className={`${
                  liveFeedRunning
                    ? 'text-primary opacity-60'
                    : 'text-text-subtle'
                }`}
                aria-hidden="true"
              >
                ·
              </span>
              <span
                className={`truncate ${
                  liveFeedRunning ? 'text-text' : 'text-text-muted'
                }`}
              >
                {liveFeedEvents[0]?.text ?? 'Waiting for first tick…'}
              </span>
            </div>
          )}
          <GridComponent
            ref={gridRef}
            id="at-risk-grid"
            dataSource={apiAtRiskTickets}
            allowSorting={true}
            allowPaging={true}
            allowFiltering={true}
            filterSettings={filterSettings}
            pageSettings={{ pageSize: 6 }}
            gridLines="Both"
            height="auto"
          >
            <GridInject services={[Page, Sort, Filter]} />
            <ColumnsDirective>
              <ColumnDirective
                field="id"
                headerText="Ticket"
                width="180"
                template={(row: TicketRow) => {
                  const rawId = row.id.replace(/^#/, '');
                  const caseHref = `/cases?id=${encodeURIComponent(rawId)}`;
                  return (
                    <div className="px-lg py-sm">
                      <Link
                        to={caseHref}
                        className="font-semibold text-text hover:underline"
                      >
                        {row.id}
                      </Link>
                      <div className="text-xs text-text-subtle whitespace-normal break-words">
                        {row.subject}
                      </div>
                    </div>
                  );
                }}
              />
              <ColumnDirective
                field="priority"
                headerText="Priority"
                width="110"
                template={(row: TicketRow) => (
                  <div className="px-lg py-sm">
                    <Priority level={row.priority} />
                  </div>
                )}
              />
              <ColumnDirective
                field="queue"
                headerText="Queue"
                width="120"
                template={(row: TicketRow) => (
                  <div className="px-lg py-sm text-text">{row.queue}</div>
                )}
              />
              <ColumnDirective
                field="assignee"
                headerText="Assignee"
                width="180"
                template={(row: TicketRow) => (
                  <div className="px-lg py-sm text-text">
                    {row.assignee.kind === 'agent' ? (
                      <span className="inline-flex items-center gap-sm">
                        <AgentAvatar initials={row.assignee.initials} />
                        {row.assignee.name}
                      </span>
                    ) : (
                      <span className="text-text-muted">Unassigned</span>
                    )}
                  </div>
                )}
              />
              <ColumnDirective
                field="sla"
                headerText="SLA"
                width="160"
                /* The SLA cell is delegated to `SlaLiveCell`, a component that owns its own 1-second timer and only re-renders itself. This keeps the parent grid (and the rest of `OverviewTab`) out of the tick path entirely. */
                
                template={(row: TicketRow) => (
                  <SlaLiveCell deadlineMs={row.sla.deadlineMs} severity={row.sla.severity} />
                )}
              />
              <ColumnDirective
                field="channel"
                headerText="Channel"
                width="130"
                template={(row: TicketRow) => (
                  <div className="px-lg py-sm">
                    <ChannelChip channel={row.channel} />
                  </div>
                )}
              />
              <ColumnDirective
                field="action"
                headerText="Action"
                width="150"
                textAlign="Right"
                template={(row: TicketRow) => (
                  <div className="px-lg py-sm text-right">
                    <DropDownButtonComponent
                      id={`row-action-${row.id}`}
                      items={rowActionItems}
                      cssClass="e-outline e-small"
                      content="Action"
                      select={(args) => {
                        const text = args.item?.text;
                        if (!text) return;
                        if (text === 'Reassign') {
                          setOpenDialog({
                            kind: 'row-reassign',
                            ticketId: row.id,
                            intent: 'reassign',
                          });
                        } else if (text === 'Escalate to Tier 3') {
                          setOpenDialog({
                            kind: 'row-reassign',
                            ticketId: row.id,
                            intent: 'escalate',
                          });
                        } else if (text === 'Open') {
                          navigate(
                            `/cases?id=${encodeURIComponent(row.id.replace(/^#/, ''))}`,
                          );
                        } else if (text === 'Add note') {
                          // runMutation(
                          //   () =>
                              addTicketNote(row.id.replace(/^#/, ''), {
                                body: `Action-menu note: ${row.subject}`,
                                visibility: 'internal',
                              }).finally(
                            () => (pushToast({
                              title: 'Note added',
                              content: `Internal note attached to ${row.id}.`,
                              severity: 'Success' as ToastSeverity,
                            })),
                          );
                        } else if (text === 'Close as duplicate') {
                          const mergeTarget = filteredTickets.find(
                            (t) => t.id !== row.id,
                          );
                          if (!mergeTarget) {
                            pushToast({
                              title: 'Cannot close',
                              content:
                                'Need at least one other visible ticket to merge into.',
                              severity: 'Warning',
                            });
                            return;
                          }
                          // runMutation(
                          //   () =>
                              closeTicketAsDuplicate(
                                row.id.replace(/^#/, ''),
                                {
                                  mergedIntoTicketId: mergeTarget.id.replace(
                                    /^#/,
                                    '',
                                  ),
                                },
                              ).finally(
                            () => pushToast({
                              title: 'Closed as duplicate',
                              content: `${row.id} merged into ${mergeTarget.id}.`,
                              severity: 'Info' as ToastSeverity,
                            }),
                          );
                        }
                      }}
                    >
                      Action
                    </DropDownButtonComponent>
                  </div>
                )}
              />
            </ColumnsDirective>
          </GridComponent>
        </div>
      </section>

      <footer className="flex flex-wrap justify-between gap-sm py-lg text-xs text-text-subtle">
        <span>© Acme Support · Support Hub v2.4</span>
      </footer>

      {/* ---------- Dialogs ---------- */}
      <DialogComponent
        id="breach-reassign-dialog"
        isModal={true}
        showCloseIcon={true}
        closeOnEscape={true}
        width="560px"
        visible={openDialog?.kind === 'breach-reassign'}
        header={
          breachAlert?.heading ??
          `${breachAlertTicketCount} P1 cases will breach SLA in 30 minutes`
        }
        close={closeDialog}
        footerTemplate={() => (
          <div className="flex items-center justify-end gap-sm p-md px-lg">
            <ButtonComponent
              cssClass="e-outline"
              onClick={() => {
                closeDialog();
                navigate(breachAlert?.viewCasesHref || '/cases');
              }}
            >
              View all cases
            </ButtonComponent>
            <ButtonComponent
              cssClass="e-primary"
              disabled={mutationPending}
              isPrimary={true}
              onClick={() => {
                const targetAgentId =
                  breachReassignAgentId && breachReassignAgentId.length > 0
                    ? breachReassignAgentId
                    : 'auto';
                    reassignBreachAlert({
                      ticketIds: breachReassignTickets.map((t) =>
                        t.id.replace(/^#/, ''),
                      ),
                      targetAgentId,
                    }).then((res) => ({
                    title: 'Reassigned',
                    content: `${res.reassigned.length} ticket${
                      res.reassigned.length === 1 ? '' : 's'
                    } moved off the breach list${
                      res.skipped.length > 0
                        ? ` (${res.skipped.length} skipped)`
                        : ''
                    }.`,
                    severity: 'Success' as ToastSeverity,
                  }));
                closeDialog();
              }}
            >
              {mutationPending ? 'Reassigning…' : 'Reassign now'}
            </ButtonComponent>
          </div>
        )}
      >
        <div className="p-lg flex flex-col gap-md">
          <p className="text-sm text-text-muted m-0">
            {breachAlert?.subheading ??
              'The following P1 cases will breach SLA in the next 30 minutes.'}
          </p>
          <ul className="list-none p-0 m-0 flex flex-col gap-xs text-sm text-text">
            {breachReassignTickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-xs border-b border-border"
              >
                <span className="font-medium">{t.id}</span>
                <span className="text-text-muted">{t.subtitle}</span>
              </li>
            ))}
            {breachReassignTickets.length === 0 && (
              <li className="py-xs text-text-subtle">
                No cases flagged. The breach list will populate when the
                next API refresh lands.
              </li>
            )}
          </ul>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Target agent
            </label>
            <DropDownListComponent
              id="breach-reassign-agent"
              dataSource={agentOptions as unknown as { [key: string]: object }[]}
              fields={dialogField}
              value={breachReassignAgentId}
              placeholder="Auto-balance by load"
              change={(args) => {
                if (args.value != null) {
                  setBreachReassignAgentId(String(args.value));
                }
              }}
            />
          </div>
        </div>
      </DialogComponent>

      {/* Per-row reassign / escalate dialog */}
      <DialogComponent
        id="row-reassign-dialog"
        isModal={true}
        showCloseIcon={true}
        closeOnEscape={true}
        width="480px"
        visible={openDialog?.kind === 'row-reassign'}
        header={
          openDialog?.kind === 'row-reassign'
            ? openDialog.intent === 'escalate'
              ? `Escalate ${openDialog.ticketId} to Tier 3`
              : `Reassign ${openDialog.ticketId}`
            : 'Reassign ticket'
        }
        close={closeDialog}
        footerTemplate={() => {
          if (openDialog?.kind !== 'row-reassign') return null;
          const isEscalate = openDialog.intent === 'escalate';
          const activeDialog = openDialog;
          return (
            <div className="flex items-center justify-end gap-sm p-md px-lg">
              <ButtonComponent
                cssClass="e-outline"
                disabled={mutationPending}
                onClick={closeDialog}
              >
                Cancel
              </ButtonComponent>
              <ButtonComponent
                cssClass="e-primary"
                disabled={
                  mutationPending ||
                  (!isEscalate && !rowReassignAgentId)
                }
                isPrimary={true}
                onClick={() => {
                  const ticketId = activeDialog.ticketId;
                  const targetAgentId =
                    rowReassignAgentId && rowReassignAgentId.length > 0
                      ? rowReassignAgentId
                      : (agentOptions[0]?.id ?? '');
                  if (!isEscalate && !targetAgentId) {
                    return;
                  }
                  // runMutation(
                  //   () =>
                      reassignTicket(ticketId.replace(/^#/, ''), {
                        intent: isEscalate ? 'escalate' : 'reassign',
                        targetAgentId,
                        note: undefined,
                      }).finally(() => pushToast({
                      title: isEscalate ? 'Escalated' : 'Reassigned',
                      content: isEscalate
                        ? `${ticketId} escalated to ${targetAgentId}.`
                        : `${ticketId} reassigned to ${targetAgentId}.`,
                      severity: 'Success' as ToastSeverity,
                    }),
                  );
                  closeDialog();
                }}
              >
                {mutationPending
                  ? isEscalate
                    ? 'Escalating…'
                    : 'Reassigning…'
                  : isEscalate
                    ? 'Escalate'
                    : 'Reassign'}
              </ButtonComponent>
            </div>
          );
        }}
      >
        <div className="p-lg flex flex-col gap-md">
          <p className="text-sm text-text-muted m-0">
            {openDialog?.kind === 'row-reassign' &&
            openDialog.intent === 'escalate'
              ? 'Pick a Tier 3 agent to escalate this ticket to.'
              : 'Pick a new assignee for this ticket. You can leave a note for context.'}
          </p>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Target agent
            </label>
            <DropDownListComponent
              id={
                openDialog?.kind === 'row-reassign'
                  ? `row-reassign-agent-${openDialog.ticketId}`
                  : 'row-reassign-agent-pending'
              }
              dataSource={agentOptions as unknown as { [key: string]: object }[]}
              fields={dialogField}
              value={rowReassignAgentId}
              placeholder="Select an agent"
              change={(args) => {
                if (args.value == null) return;
                setRowReassignAgentId(String(args.value));
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Note (optional)
            </label>
            <TextBoxComponent
              id={
                openDialog?.kind === 'row-reassign'
                  ? `row-reassign-note-${openDialog.ticketId}`
                  : 'row-reassign-note-pending'
              }
              placeholder="Add context for the assignee…"
              multiline={true}
            />
          </div>
        </div>
      </DialogComponent>

      {/* Bulk-escalate dialog */}
      <DialogComponent
        id="bulk-escalate-dialog"
        isModal={true}
        showCloseIcon={true}
        closeOnEscape={true}
        width="560px"
        visible={openDialog?.kind === 'bulk-escalate'}
        header={`Escalate ${filteredTickets.length} ticket${
          filteredTickets.length === 1 ? '' : 's'
        }?`}
        close={closeDialog}
        footerTemplate={() => (
          <div className="flex items-center justify-end gap-sm p-md px-lg">
            <ButtonComponent
              cssClass="e-outline"
              disabled={mutationPending}
              onClick={closeDialog}
            >
              Cancel
            </ButtonComponent>
            <ButtonComponent
              cssClass="e-primary e-danger"
              disabled={mutationPending}
              isPrimary={true}
              onClick={() => {
                // runMutation(
                //   () =>
                    bulkEscalate({
                      ticketIds: filteredTickets.map((t) =>
                        t.id.replace(/^#/, ''),
                      ),
                      targetTier: 'tier3',
                      reason: undefined,
                    }).finally(() => (pushToast({
                    title: 'Escalated',
                    content: `${filteredTickets.length} ticket(s) escalated to Tier 3.`,
                    severity: 'Success' as ToastSeverity,
                  })),
                );
                closeDialog();
              }}
            >
              {mutationPending ? 'Escalating…' : 'Escalate'}
            </ButtonComponent>
          </div>
        )}
      >
        <div className="p-lg flex flex-col gap-md">
          <p className="text-sm text-text-muted m-0">
            The following {filteredTickets.length} ticket
            {filteredTickets.length === 1 ? '' : 's'} match the current filters
            and will be escalated in bulk.
          </p>
          <ul className="list-none p-0 m-0 flex flex-col gap-xs text-sm text-text max-h-48 overflow-auto">
            {filteredTickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-xs border-b border-border"
              >
                <span className="font-medium">{t.id}</span>
                <span className="text-text-muted">
                  {t.queue} · {t.priority.toUpperCase()}
                </span>
              </li>
            ))}
            {filteredTickets.length === 0 && (
              <li className="py-xs text-text-subtle">No tickets to escalate.</li>
            )}
          </ul>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Target tier
            </label>
            <DropDownListComponent
              id="bulk-escalate-tier"
              dataSource={tierOptions as unknown as { [key: string]: object }[]}
              fields={dialogField}
              value="tier3"
              placeholder="Select target tier"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Reason (optional)
            </label>
            <TextBoxComponent
              id="bulk-escalate-reason"
              placeholder="Why is this bulk escalation needed?"
              multiline={true}
            />
          </div>
        </div>
      </DialogComponent>

      <ToastComponent
        ref={toastRef}
        id="overview-toast"
        position={{ X: 'Right', Y: 'Bottom' }}
        timeOut={3500}
        newestOnTop={true}
        showCloseButton={true}
        showProgressBar={true}
      />
      <ToastDispatcher
        toast={lastToast}
        toastRef={toastRef}
        onDismiss={dismissToast}
      />
    </div>
  );
}

interface ToastDispatcherProps {
  toast: ToastSpec | undefined;
  toastRef: RefObject<ToastComponent | null>;
  onDismiss: (id: number) => void;
}

function ToastDispatcher({ toast, toastRef, onDismiss }: ToastDispatcherProps) {
  const shownIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!toast || !toastRef.current) return;
    if (shownIdsRef.current.has(toast.id)) {
      return;
    }
    shownIdsRef.current.add(toast.id);
    if (shownIdsRef.current.size > 64) {
      const first = shownIdsRef.current.values().next().value;
      if (typeof first === 'number') shownIdsRef.current.delete(first);
    }
    toastRef.current.show({
      title: toast.title,
      content: toast.content,
      cssClass: toastCssClass[toast.severity],
      timeOut: 3500,
    });
  }, [toast, toastRef]);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = window.setTimeout(() => onDismiss(id), 3500);
    return () => window.clearTimeout(t);
  }, [toast?.id]);
  return null;
}
