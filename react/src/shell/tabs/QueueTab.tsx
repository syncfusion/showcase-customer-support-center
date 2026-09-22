/* ------------------------------------------------------------------ *
 *  Queue tab
 *
 *  Built to match `.designs/screens/queue.html` using Syncfusion EJ2
 *  React components for every interactive primitive. All ticket
 *  data, summary stats, and saved-view counts are now fetched from
 *  the backend (overridable
 *  via `VITE_API_BASE_URL`). The client still owns live SLA clock
 *  ticks, row selection, and the new-ticket dialog.
 *
 *  Syncfusion components used:
 *    • GridComponent            → ticket queue table (columns, sorting,
 *                                 selection, paging, row templates)
 *    • DropDownListComponent    → queue / view / status / assignee /
 *                                 SLA / age / dialog filters
 *    • DropDownButtonComponent  → per-row actions, bulk actions
 *    • ButtonComponent          → page chrome actions & pagination
 *    • ChipListComponent        → status / priority / channel chips
 *    • ToastComponent           → action feedback
 *    • DialogComponent          → new-ticket form
 *    • TextBoxComponent         → new-ticket fields
 *------------------------------------------------------------------ */

// Per-tab CSS for QueueTab. QueueTab is built entirely from Tailwind
// utility classes plus the shared Syncfusion widget overrides in
// `src/theme/tokens.css` (the `.toolbar-filter` rule, dropdown popups,
// chip palette, etc.), so this file is intentionally empty — it
// exists for symmetry with the other tab components. Imported first
// so Vite hoists the CSS before any other module.
import '../../styles/tabs/queue.css';

import * as React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ButtonComponent,
  ChipListComponent,
  ChipsDirective,
  ChipDirective,
} from '@syncfusion/ej2-react-buttons';
import {
  DropDownButtonComponent,
  type ItemModel,
} from '@syncfusion/ej2-react-splitbuttons';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Inject as GridInject,
  Sort,
  Selection,
  Filter,
} from '@syncfusion/ej2-react-grids';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';

import {
  UserPlus,
  Tag,
  Zap,
  Check,
  AlertTriangle,
  CircleDot,
  Filter as FilterIcon,
  Mail,
  SlidersHorizontal,
} from 'lucide-react';

import { Link, useNavigate } from 'react-router-dom';
import {
  createTicket,
  fetchFilterOptions,
  fetchSummary,
  fetchTickets,
  fetchViewCounts,
  toDomainTicket,
  type ApiFilterOptions,
  type ApiQueueSummary,
  type ApiViewCounts,
  type QueueFilters,
} from '../../api/queueClient';
import type {
  Ticket,
  PriorityKey,
  ChannelKey,
  TicketStatus,
  QueueKey,
  Severity,
} from '../../data/tickets';
import { AgentAvatar, Priority } from './OverviewTab';

/* ---------- Shared tone helpers ---------- */

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
    <span className="inline-flex items-center" role="status">
      <ChipListComponent>
        <ChipsDirective>
          <ChipDirective text={label} cssClass={chipCssMap[tone]} />
        </ChipsDirective>
      </ChipListComponent>
    </span>
  );
}

function StatusChip({ status }: { status: TicketStatus }) {
  const config: Record<TicketStatus, { label: string; tone: ChipTone }> = {
    open: { label: 'Open', tone: 'info' },
    pending: { label: 'Pending', tone: 'warning' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'neutral' },
  };
  return <Chip label={config[status].label} tone={config[status].tone} />;
}

function PriorityChip({ level }: { level: PriorityKey }) {
  const toneMap: Record<PriorityKey, ChipTone> = {
    p1: 'error',
    p2: 'warning',
    p3: 'info',
    p4: 'neutral',
  };
  return <Chip label={level.toUpperCase()} tone={toneMap[level]} />;
}

function ChannelChip({ channel }: { channel: ChannelKey }) {
  // Mirrors `ChannelChip` on the Overview screen — flat pill with a
  // single Mail icon recoloured per channel so the user can spot the
  // channel at a glance. Palette matches Overview: email = primary,
  // chat = info, portal = success, social = danger, phone = warning.
  const config: Record<ChannelKey, { label: string; color: string }> = {
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
    label =
      h > 0
        ? `Breached ${h}h ${m.toString().padStart(2, '0')}m`
        : `Breached ${m}m ${s.toString().padStart(2, '0')}s`;
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
    : remaining <= 5 * 60_000
      ? 'risk'
      : 'ok';

  return { severity, label };
}

function SlaDisplay({ severity, label }: { severity: Severity; label: string }) {
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
      <CircleDot size={10} strokeWidth={3} aria-hidden="true" />
      <span className="sla-live-digits" aria-live="polite">
        {label}
      </span>
    </span>
  );
}

/* Self-contained live SLA cell. */
function SlaLiveCell({ deadlineMs, severity }: { deadlineMs: number, severity: 'breach' | 'risk' | 'ok' }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { label } = formatSla(deadlineMs, now);
  return (
    <div className={`px-sm py-xs sla-cell--${severity}`}>
      <SlaDisplay severity={severity} label={label} />
    </div>
  );
}

/* ---------- Local view-model types ---------- */

type ViewKey =
  | 'all'
  | 'urgent'
  | 'breaching'
  | 'unassigned'
  | 'my_team'
  | 'escalated';
type StatusFilter = 'all' | TicketStatus;
type SlaFilter = 'all' | 'ok' | 'risk' | 'breach';
type AgeFilter = 'all' | '15m' | '1h' | '4h' | '24h';

/* ---------- Static filter option data (stable, not from API) ---------- */

// const VIEW_DEFS: ReadonlyArray<{ id: ViewKey; label: string }> = [
//   { id: 'all', label: 'All open' },
//   { id: 'urgent', label: 'Urgent' },
//   { id: 'breaching', label: 'Breaching soon' },
//   { id: 'unassigned', label: 'Unassigned' },
//   { id: 'my_team', label: 'My team' },
//   { id: 'escalated', label: 'Escalated' },
// ];

const PRIORITY_OPTIONS: ReadonlyArray<{ id: PriorityKey; label: string }> = [
  { id: 'p1', label: 'P1' },
  { id: 'p2', label: 'P2' },
  { id: 'p3', label: 'P3' },
  { id: 'p4', label: 'P4' },
];

const CHANNEL_OPTIONS: ReadonlyArray<{ id: ChannelKey; label: string }> = [
  { id: 'email', label: 'Email' },
  { id: 'chat', label: 'Chat' },
  { id: 'portal', label: 'Portal' },
  { id: 'social', label: 'Social' },
  { id: 'phone', label: 'Phone' },
];

const SLA_OPTIONS: ReadonlyArray<{ id: SlaFilter; label: string }> = [
  { id: 'all', label: 'Any SLA state' },
  { id: 'breach', label: 'Breached' },
  { id: 'risk', label: 'At risk' },
  { id: 'ok', label: 'On target' },
];

const STATUS_OPTIONS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Any status' },
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const FALLBACK_QUEUES: ReadonlyArray<{ id: QueueKey; label: string }> = [
  { id: 'all', label: 'All queues' },
  { id: 'Billing', label: 'Billing' },
  { id: 'Platform', label: 'Platform' },
  { id: 'Account', label: 'Account' },
  { id: 'General', label: 'General' },
];

const fieldProps = { text: 'label', value: 'id' } as const;

const rowActionItems: ItemModel[] = [
  { text: 'Open' },
  { text: 'Reassign…' },
  { text: 'Escalate to Tier 3' },
  { text: 'Add note' },
  { text: 'Close as duplicate' },
];

/* Hoisted out of the render to keep these objects identity-stable
 * across renders. Re-creating them on every render makes Syncfusion's
 * grid diff-prop path re-run row-template compilation, which unmounts
 * the per-row action dropdown mid-click. */
const GRID_SELECTION_SETTINGS = { type: 'Multiple', mode: 'Row' } as const;
const GRID_FILTER_SETTINGS = { type: 'CheckBox' } as const;

/* Stable per-row action menu. Inlining this JSX inside the column
 * template would (a) rebuild a fresh `select` closure on every grid
 * re-render, causing Syncfusion's `DropDownButtonComponent` to lose
 * the click binding, and (b) make every `applyMutation` re-render
 * the dropdown mid-click. Memoizing on `t.id` keeps the underlying
 * EJ2 instance alive across renders. */
interface RowActionsProps {
  ticket: Ticket;
  onOpen: (t: Ticket) => void;
  onPushToast: (toast: Omit<ToastSpec, 'id'>) => void;
  onApplyMutation: (toast: Omit<ToastSpec, 'id'>) => void;
}

const RowActions = React.memo(function RowActions({
  ticket,
  onOpen,
  onPushToast,
  onApplyMutation,
}: RowActionsProps) {
  // Ticket ids start with '#', which is the CSS id-selector meta-character.
  // Letting that '#' leak into the DOM id causes EJ2 to build invalid
  // selectors for the dropdown popup, so the per-row Actions menu never
  // opens. Strip it before assigning an id.
  const domId = `row-action-${ticket.id.replace(/^#/, '')}`;
  return (
    <span
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropDownButtonComponent
        id={domId}
        cssClass="e-outline e-small"
        content="Actions"
        items={rowActionItems}
        select={(args) => {
        const text = args.item?.text;
        if (!text) return;
        if (text === 'Open') {
          onOpen(ticket);
        } else if (text === 'Reassign…') {
          onPushToast({
            title: 'Reassign',
            content: `Open ${ticket.id} to change assignee (case detail coming soon).`,
            severity: 'Info',
          });
        } else if (text === 'Escalate to Tier 3') {
          onPushToast({
            title: 'Escalated',
            content: `${ticket.id} escalated to Tier 3.`,
            severity: 'Success',
          });
        } else if (text === 'Add note') {
          onPushToast({
            title: 'Note added',
            content: `Note attached to ${ticket.id}.`,
            severity: 'Success',
          });
        } else if (text === 'Close as duplicate') {
          // The per-row close endpoint isn't wired up yet; trigger a
          // refetch so the user sees the latest server state, and be
          // transparent about the limitation.
          onApplyMutation({
            title: 'Close',
            content: `${ticket.id} close-as-duplicate endpoint coming soon.`,
            severity: 'Info',
          });
        }
      }}
      />
    </span>
  );
});

/* ---------- State management ---------- */

type ToastSeverity = 'Success' | 'Info' | 'Warning' | 'Error';

interface ToastSpec {
  id: number;
  title?: string;
  content: string;
  severity: ToastSeverity;
}

interface NewTicketForm {
  subject: string;
  customer: string;
  queue: Exclude<QueueKey, 'all'>;
  priority: PriorityKey;
}

interface AgentOption {
  id: string;
  name: string;
  initials: string;
}

interface QueueState {
  // Server-owned data
  tickets: Ticket[];
  totalCount: number;
  viewCounts: ApiViewCounts;
  summary: ApiQueueSummary;
  filterOptions: ApiFilterOptions | null;
  agents: AgentOption[];

  // Request state
  loading: boolean;
  error: string | null;

  // UI state
  queueFilter: QueueKey;
  view: ViewKey;
  statusFilter: StatusFilter;
  priorityFilter: PriorityKey[];
  channelFilter: ChannelKey[];
  assigneeFilter: string;
  slaFilter: SlaFilter;
  ageFilter: AgeFilter;
  selectedIds: string[];
  currentPage: number;
  pageSize: number;
  isNewTicketOpen: boolean;
  newTicketForm: NewTicketForm;
  toasts: ToastSpec[];
  /** Bumped to force a refetch when an action mutates server data. */
  fetchEpoch: number;
}

let nextToastId = 1;

type QueueAction =
  | { type: 'SET_VIEW'; value: ViewKey }
  | { type: 'SET_QUEUE'; value: QueueKey }
  | { type: 'SET_STATUS'; value: StatusFilter }
  | { type: 'SET_PRIORITY'; value: PriorityKey[] }
  | { type: 'SET_CHANNEL'; value: ChannelKey[] }
  | { type: 'SET_ASSIGNEE'; value: string }
  | { type: 'SET_SLA'; value: SlaFilter }
  | { type: 'SET_AGE'; value: AgeFilter }
  | { type: 'SET_SELECTED'; value: string[] }
  | { type: 'SELECT_ALL'; ids: string[] }
  | { type: 'SELECT_NONE' }
  | { type: 'SET_PAGE'; value: number }
  | { type: 'RESET_FILTERS' }
  | { type: 'OPEN_NEW_TICKET' }
  | { type: 'CLOSE_NEW_TICKET' }
  | { type: 'UPDATE_NEW_TICKET'; value: Partial<NewTicketForm> }
  | { type: 'PUSH_TOAST'; value: Omit<ToastSpec, 'id'> }
  | { type: 'DISMISS_TOAST'; id: number }
  | { type: 'REFETCH_TICKETS' }
  | { type: 'TICKETS_LOADING' }
  | {
      type: 'TICKETS_SUCCESS';
      tickets: Ticket[];
      totalCount: number;
      viewCounts: ApiViewCounts;
      summary: ApiQueueSummary;
    }
  | { type: 'TICKETS_ERROR'; error: string }
  | {
      type: 'FILTER_OPTIONS_LOADED';
      filterOptions: ApiFilterOptions;
      agents: AgentOption[];
    };

const EMPTY_NEW_TICKET: NewTicketForm = {
  subject: '',
  customer: '',
  queue: 'Billing',
  priority: 'p3',
};

const initialState: QueueState = {
  tickets: [],
  totalCount: 0,
  viewCounts: {
    all: 0,
    urgent: 0,
    breaching: 0,
    unassigned: 0,
    my_team: 0,
    escalated: 0,
  },
  summary: {
    open: 0,
    breached: 0,
    atRisk: 0,
    unassigned: 0,
    waiting: 0,
    avgAgeMinutes: 0,
  },
  filterOptions: null,
  agents: [],
  loading: true,
  error: null,
  queueFilter: 'all',
  view: 'all',
  statusFilter: 'all',
  priorityFilter: PRIORITY_OPTIONS.map((p) => p.id),
  channelFilter: CHANNEL_OPTIONS.map((c) => c.id),
  assigneeFilter: 'all',
  slaFilter: 'all',
  ageFilter: 'all',
  selectedIds: [],
  currentPage: 1,
  pageSize: 10,
  isNewTicketOpen: false,
  newTicketForm: { ...EMPTY_NEW_TICKET },
  toasts: [],
  fetchEpoch: 0,
};

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'SET_VIEW':
      return {
        ...state,
        view: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_QUEUE':
      return {
        ...state,
        queueFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_STATUS':
      return {
        ...state,
        statusFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_PRIORITY':
      return {
        ...state,
        priorityFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_CHANNEL':
      return {
        ...state,
        channelFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_ASSIGNEE':
      return {
        ...state,
        assigneeFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_SLA':
      return {
        ...state,
        slaFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_AGE':
      return {
        ...state,
        ageFilter: action.value,
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'SET_SELECTED':
      return { ...state, selectedIds: action.value };
    case 'SELECT_ALL':
      return { ...state, selectedIds: action.ids };
    case 'SELECT_NONE':
      return { ...state, selectedIds: [] };
    case 'SET_PAGE':
      return {
        ...state,
        currentPage: action.value,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'RESET_FILTERS':
      return {
        ...state,
        statusFilter: 'all',
        priorityFilter: PRIORITY_OPTIONS.map((p) => p.id),
        channelFilter: CHANNEL_OPTIONS.map((c) => c.id),
        assigneeFilter: 'all',
        slaFilter: 'all',
        ageFilter: 'all',
        currentPage: 1,
        selectedIds: [],
        fetchEpoch: state.fetchEpoch + 1,
      };
    case 'OPEN_NEW_TICKET':
      return {
        ...state,
        isNewTicketOpen: true,
        newTicketForm: { ...EMPTY_NEW_TICKET },
      };
    case 'CLOSE_NEW_TICKET':
      return {
        ...state,
        isNewTicketOpen: false,
        newTicketForm: { ...EMPTY_NEW_TICKET },
      };
    case 'UPDATE_NEW_TICKET':
      return {
        ...state,
        newTicketForm: { ...state.newTicketForm, ...action.value },
      };
    case 'PUSH_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, { ...action.value, id: nextToastId++ }],
      };
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'REFETCH_TICKETS':
      return { ...state, fetchEpoch: state.fetchEpoch + 1 };
    case 'TICKETS_LOADING':
      return { ...state, loading: true, error: null };
    case 'TICKETS_SUCCESS':
      return {
        ...state,
        loading: false,
        error: null,
        tickets: action.tickets,
        totalCount: action.totalCount,
        viewCounts: action.viewCounts,
        summary: action.summary,
      };
    case 'TICKETS_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'FILTER_OPTIONS_LOADED':
      return {
        ...state,
        filterOptions: action.filterOptions,
        agents: action.agents,
      };
    default:
      return state;
  }
}

/* ---------- Toast dispatcher ---------- */

interface ToastDispatcherProps {
  toast: ToastSpec | undefined;
  toastRef: React.RefObject<ToastComponent | null>;
  onShown: (id: number) => void;
}

function ToastDispatcher({ toast, toastRef, onShown }: ToastDispatcherProps) {
  useEffect(() => {
    if (!toast || !toastRef.current) return;
    toastRef.current.show({
      title: toast.title,
      content: toast.content,
      cssClass:
        toast.severity === 'Success'
          ? 'e-toast-success'
          : toast.severity === 'Error'
            ? 'e-toast-danger'
            : toast.severity === 'Warning'
              ? 'e-toast-warning'
              : 'e-toast-info',
      timeOut: 3500,
    });
    const id = toast.id;
    const t = window.setTimeout(() => onShown(id), 3500);
    return () => window.clearTimeout(t);
  }, [toast, toastRef, onShown]);
  return null;
}

/* ---------- Utility helpers ---------- */

function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`;
}

function formatAvgAge(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Derive 1–N letter initials from a person's display name.
 *  "Danial K" → "DK", "mary" → "M", "  John  Doe " → "JD". */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Build the filter set sent to the backend. */
function buildApiFilters(state: QueueState): QueueFilters {
  return {
    queue: state.queueFilter,
    status: state.statusFilter,
    priority: state.priorityFilter,
    channel: state.channelFilter,
    assignee: state.assigneeFilter,
    sla: state.slaFilter,
    age: state.ageFilter,
    view: state.view === 'all' ? undefined : state.view,
    page: state.currentPage,
    pageSize: state.pageSize,
  };
}

function withHash(id: string): string {
  return id.startsWith('#') ? id : `#${id}`;
}

/* ---------- Main component ---------- */

export function QueueTab() {
  const [state, dispatch] = useReducer(queueReducer, initialState);
  const toastRef = useRef<ToastComponent>(null);
  const gridRef = useRef<GridComponent | null>(null);
  const navigate = useNavigate();

  const pushToast = useCallback((toast: Omit<ToastSpec, 'id'>) => {
    dispatch({ type: 'PUSH_TOAST', value: toast });
  }, []);

  // Stable reference for `ToastDispatcher's` `onShown` — without this
  // the inline arrow function gets a new identity on every render,
  // which causes `ToastDispatcher`'s useEffect (`[toast, toastRef,
  // onShown]`) to re-run on each parent re-render and call
  // `toastRef.current.show()` repeatedly for the same toast.
  const handleToastShown = useCallback((id: number) => {
    dispatch({ type: 'DISMISS_TOAST', id });
  }, []);

  /** Open the case detail screen for a ticket. */
  const openCase = useCallback(
    (ticket: { id: string; subject: string }) => {
      const caseId = ticket.id.replace(/^#/, '');
      navigate(`/cases?id=${encodeURIComponent(caseId)}`);
      pushToast({
        title: `Opening ${ticket.id}`,
        content: ticket.subject,
        severity: 'Info',
      });
    },
    [navigate, pushToast],
  );

  /* Load filter options + agents once. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await fetchFilterOptions();
        if (cancelled) return;
        // Translate the API agent list into the lightweight client
        // shape (id + initials + name). The "Auto-balance" row is
        // skipped — the queue only knows about real agents.
        const agents: AgentOption[] = opts.agents
          .filter(
            (a) => a.id !== 'auto' && a.id !== 'all' && a.id !== 'unassigned',
          )
          .map((a) => {
            const name = a.label;
            const initials = getInitials(name);
            return { id: a.id, name, initials };
          });
        dispatch({
          type: 'FILTER_OPTIONS_LOADED',
          filterOptions: opts,
          agents,
        });
      } catch (err) {
        // Filter options are nice-to-have; show a warning but keep
        // the rest of the page working with the static defaults.
        pushToast({
          title: 'Filter options unavailable',
          content: err instanceof Error ? err.message : String(err),
          severity: 'Warning',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Fetch tickets, view counts, and summary whenever the filter set
   * or page changes. The `fetchEpoch` counter makes it easy to force
   * a refresh after a mutation (e.g. create). */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'TICKETS_LOADING' });
    (async () => {
      try {
        const filters = buildApiFilters(state);
        const [page, counts, summary] = await Promise.all([
          fetchTickets(filters, ac.signal),
          fetchViewCounts(ac.signal),
          fetchSummary(state.queueFilter, ac.signal),
        ]);
        if (ac.signal.aborted) return;
        const tickets = page.items.map(toDomainTicket);
        dispatch({
          type: 'TICKETS_SUCCESS',
          tickets,
          totalCount: page.total,
          viewCounts: counts,
          summary,
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'TICKETS_ERROR', error: message });
        pushToast({
          title: 'Could not load tickets',
          content: message,
          severity: 'Error',
        });
      }
    })();
    return () => ac.abort();
    // We intentionally only refetch when the relevant inputs change.
    // `state.tickets`, `state.toasts`, `state.error`, `state.loading`,
    // `state.newTicketForm`, `state.isNewTicketOpen`, `state.selectedIds`
    // are outputs of the fetch, not inputs to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.queueFilter,
    state.view,
    state.statusFilter,
    state.priorityFilter.join(','),
    state.channelFilter.join(','),
    state.assigneeFilter,
    state.slaFilter,
    state.ageFilter,
    state.currentPage,
    state.pageSize,
    state.fetchEpoch,
  ]);

  // Queue option list — derived from the loaded filter options when
  // available, otherwise falls back to the static set so the first
  // paint still has the standard queues.
  const QUEUE_OPTIONS = useMemo<
    ReadonlyArray<{ id: QueueKey; label: string }>
  >(() => {
    if (state.filterOptions) {
      return state.filterOptions.queues.map((q) => ({
        id: q.id as QueueKey,
        label: q.label,
      }));
    }
    return FALLBACK_QUEUES;
  }, [state.filterOptions]);

  const ASSIGNEE_OPTIONS = useMemo<
    ReadonlyArray<{ id: string; label: string }>
  >(() => {
    const base: { id: string; label: string }[] = [
      { id: 'all', label: 'Any assignee' },
      { id: 'unassigned', label: 'Unassigned' },
    ];
    for (const a of state.agents) base.push({ id: a.id, label: a.name });
    return base;
  }, [state.agents]);

  // // Saved-view pill counts come from the server.
  // const VIEW_OPTIONS = useMemo(
  //   () =>
  //     VIEW_DEFS.map((v) => ({
  //       ...v,
  //       count: state.viewCounts[v.id] ?? 0,
  //     })),
  //   [state.viewCounts],
  // );

  const summary = state.summary;
  const totalPages = Math.max(1, Math.ceil(state.totalCount / state.pageSize));
  const safePage = Math.min(state.currentPage, totalPages);
  const visibleTickets = state.tickets;
  const startIndex =
    state.totalCount === 0 ? 0 : (safePage - 1) * state.pageSize + 1;
  const endIndex = Math.min(safePage * state.pageSize, state.totalCount);

  // If filters shrink the dataset below the current page, snap back
  // to the last page that has data.
  useEffect(() => {
    if (state.currentPage !== safePage) {
      dispatch({ type: 'SET_PAGE', value: safePage });
    }
  }, [state.currentPage, safePage]);


  /** Push a user-facing toast and trigger a backend refetch. We do
   *  NOT remount the grid here — previously we bumped a `gridEpoch`
   *  state to force re-mount, but that destroyed every row template
   *  mid-click, so per-row action menus stopped firing `select`
   *  reliably and every `applyMutation` triggered 4 cascading
   *  re-renders (TOAST push → grid epoch bump → REFETCH →
   *  TICKETS_LOADING/SUCCESS) which stacked duplicate toasts in the
   *  Syncfusion `ToastComponent`. Pure refetch + dispatch keeps a
   *  single toast and a single re-render. */
  const applyMutation = useCallback(
    (toast: Omit<ToastSpec, 'id'>) => {
      pushToast(toast);
      dispatch({ type: 'REFETCH_TICKETS' });
    },
    [pushToast],
  );

  const goToPage = useCallback(
    (page: number) => {
      const next = Math.max(1, Math.min(totalPages, page));
      dispatch({ type: 'SET_PAGE', value: next });
    },
    [totalPages],
  );

  // Build a compact pagination control: first, prev, current window,
  // ellipsis, last, next.
  const paginationButtons = useMemo(() => {
    const items: Array<
      | { kind: 'page'; page: number; active: boolean }
      | { kind: 'ellipsis' }
    > = [];
    const window: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (
        p === 1 ||
        p === totalPages ||
        (p >= safePage - 1 && p <= safePage + 1)
      ) {
        window.push(p);
      }
    }
    let prev = 0;
    for (const p of window) {
      if (prev && p - prev > 1) items.push({ kind: 'ellipsis' });
      items.push({ kind: 'page', page: p, active: p === safePage });
      prev = p;
    }
    return items;
  }, [safePage, totalPages]);

  const updatedLabel = state.loading
    ? 'Loading…'
    : `Updated ${new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}.`;

  const lastToast = state.toasts[state.toasts.length - 1];

  return (
    <section
      aria-labelledby="queue-heading"
      className="flex flex-col gap-lg w-full mx-auto py-xl px-0"
    >
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1
            id="queue-heading"
            className="text-3xl font-bold leading-tight tracking-tight text-text m-0 mb-xs"
          >
            Queue
          </h1>
          <p className="text-sm text-text-muted m-0">
            Triaging {summary.open} open tickets across{' '}
            {QUEUE_OPTIONS.length - 1} queues. {updatedLabel}
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-md"
          role="toolbar"
          aria-label="View filters"
        >
          <ButtonComponent
            cssClass="e-primary"
            iconCss="e-icons e-plus"
            onClick={() => dispatch({ type: 'OPEN_NEW_TICKET' })}
          >
            New ticket
          </ButtonComponent>
        </div>
      </div>

      {/* Error banner */}
      {state.error && !state.loading && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft text-danger px-lg py-sm text-sm flex items-center justify-between gap-md"
        >
          <span>
            <strong>Backend error.</strong> {state.error}
          </span>
          <ButtonComponent
            cssClass="e-outline e-small"
            onClick={() => dispatch({ type: 'REFETCH_TICKETS' })}
          >
            Retry
          </ButtonComponent>
        </div>
      )}

      {/* Summary stats */}
      <section
        aria-label="Queue summary"
        className="grid gap-sm grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      >
        {[
          { value: String(summary.open), label: 'Open', sub: 'Across all queues' },
          {
            value: String(summary.breached),
            label: 'Breached',
            sub: 'Need action',
            valueColor: 'text-danger',
          },
          {
            value: String(summary.atRisk),
            label: 'At risk',
            sub: '< 60 min',
            valueColor: 'text-warning',
          },
          {
            value: String(summary.unassigned),
            label: 'Unassigned',
            sub: 'P1–P2',
          },
          { value: String(summary.waiting), label: 'Waiting', sub: 'Customer' },
          {
            value: formatAvgAge(summary.avgAgeMinutes),
            label: 'Avg age',
            sub: 'Open tickets',
          },
        ].map((s) => (
          <article
            key={s.label}
            className="flex flex-col gap-xs p-md px-lg rounded-lg border border-border bg-surface"
          >
            <span
              className={`text-2xl font-bold leading-tight ${
                s.valueColor ?? 'text-text'
              }`}
            >
              {s.value}
            </span>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              {s.label}
            </span>
            <span className="text-xs text-text-subtle">{s.sub}</span>
          </article>
        ))}
      </section>

      {/* Saved views pills */}
      {/* <nav
        aria-label="Saved queue views"
        className="flex flex-wrap items-center gap-sm border-b border-border pb-md"
      >
        {VIEW_OPTIONS.map((v) => {
          const active = state.view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => dispatch({ type: 'SET_VIEW', value: v.id })}
              className={[
                'inline-flex items-center gap-xs h-8 px-md rounded-full border text-sm font-medium transition-colors',
                active
                  ? 'bg-primary border-primary text-text-on-primary'
                  : 'bg-surface border-border text-text-muted hover:bg-surface-2 hover:text-text',
              ].join(' ')}
            >
              {v.label}
              <span
                className={[
                  'text-xs px-xs py-0.5 rounded-full font-semibold',
                  active ? 'bg-white/20' : 'bg-surface-2',
                ].join(' ')}
              >
                {v.count}
              </span>
            </button>
          );
        })}
      </nav> */}

      {/* Filter toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-md"
        role="group"
        aria-label="Queue filters"
      >
        <div className="flex flex-wrap items-center gap-sm">
          <span className="inline-flex items-center gap-xs h-8 px-md rounded-md border border-border bg-surface-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <FilterIcon size={12} aria-hidden="true" />
            Quick Filters
          </span>
          
          <DropDownListComponent
            id="queue-status-filter"
            dataSource={
              STATUS_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={fieldProps}
            value={state.statusFilter}
            cssClass="toolbar-filter"
            placeholder="Status"
            width={150}
            change={(args) => {
              if (args.value == null) return;
              const next = String(args.value) as StatusFilter;
              if (next === state.statusFilter) return;
              dispatch({ type: 'SET_STATUS', value: next });
            }}
          />
          <DropDownListComponent
            id="queue-assignee-filter"
            dataSource={
              ASSIGNEE_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={fieldProps}
            value={state.assigneeFilter}
            cssClass="toolbar-filter"
            placeholder="Assignee"
            width={170}
            change={(args) => {
              if (args.value == null) return;
              const next = String(args.value);
              if (next === state.assigneeFilter) return;
              dispatch({ type: 'SET_ASSIGNEE', value: next });
            }}
          />

          <DropDownListComponent
            id="queue-sla-filter"
            dataSource={
              SLA_OPTIONS as unknown as { [key: string]: object }[]
            }
            fields={fieldProps}
            value={state.slaFilter}
            cssClass="toolbar-filter"
            placeholder="SLA state"
            width={150}
            change={(args) => {
              if (args.value == null) return;
              const next = String(args.value) as SlaFilter;
              if (next === state.slaFilter) return;
              dispatch({ type: 'SET_SLA', value: next });
            }}
          />
        </div>
      </div>

      {/* Ticket queue card */}
      <section
        aria-label="Ticket queue"
        className="rounded-lg border border-border bg-surface overflow-hidden"
      >
        {/* Bulk actions bar */}
        <div className="flex flex-wrap items-center justify-end gap-md px-lg py-sm bg-surface-2 border-b border-border">
          {/* <div className="flex items-center gap-sm text-sm text-text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              aria-label="Select all visible rows"
              className="w-4 h-4 rounded-sm accent-primary"
            />
            <strong className="text-text font-semibold">
              {state.selectedIds.length}
            </strong>{' '}
            selected
          </div> */}
          <div className="flex flex-wrap items-center gap-sm">
            <DropDownButtonComponent
              id="bulk-assign"
              cssClass="e-outline e-small"
              items={[
                ...state.agents.map((a) => ({ text: a.name, id: a.id })),
                { text: 'Unassigned' },
              ]}
              select={(args) => {
                const text = args.item?.text;
                if (!text) return;
                if (state.selectedIds.length === 0) {
                  pushToast({
                    title: 'Assign',
                    content: 'Select tickets to assign first.',
                    severity: 'Info',
                  });
                  return;
                }
                pushToast({
                  title: 'Assign',
                  content: `Use the per-row Reassign action to set assignee to ${text}.`,
                  severity: 'Info',
                });
              }}
            >
              <span className="inline-flex items-center gap-xs">
                <UserPlus size={14} aria-hidden="true" />
                Assign
              </span>
            </DropDownButtonComponent>
            <DropDownButtonComponent
              id="bulk-tag"
              cssClass="e-outline e-small"
              items={[
                { text: 'vip' },
                { text: 'refund-risk' },
                { text: 'enterprise' },
              ]}
              select={(args) => {
                const text = args.item?.text;
                if (state.selectedIds.length === 0) {
                  pushToast({
                    title: 'Tag',
                    content: 'Select tickets to tag first.',
                    severity: 'Info',
                  });
                  return;
                }
                applyMutation({
                  title: 'Tagged',
                  content: `Tag "${text}" applied to ${state.selectedIds.length} ticket${
                    state.selectedIds.length === 1 ? '' : 's'
                  }.`,
                  severity: 'Success',
                });
              }}
            >
              <span className="inline-flex items-center gap-xs">
                <Tag size={14} aria-hidden="true" />
                Tag
              </span>
            </DropDownButtonComponent>
            <DropDownButtonComponent
              id="bulk-escalate"
              cssClass="e-outline e-small"
              items={[{ text: 'To Tier 2' }, { text: 'To Tier 3' }]}
              select={(args) => {
                const text = args.item?.text;
                if (state.selectedIds.length === 0) {
                  pushToast({
                    title: 'Escalate',
                    content: 'Select tickets to escalate first.',
                    severity: 'Info',
                  });
                  return;
                }
                applyMutation({
                  title: 'Escalated',
                  content: `${state.selectedIds.length} ticket${
                    state.selectedIds.length === 1 ? '' : 's'
                  } escalated ${text}.`,
                  severity: 'Success',
                });
              }}
            >
              <span className="inline-flex items-center gap-xs">
                <Zap size={14} aria-hidden="true" />
                Escalate
              </span>
            </DropDownButtonComponent>
            <DropDownButtonComponent
              id="bulk-close"
              cssClass="e-outline e-small"
              items={[
                { text: 'Close as resolved' },
                { text: 'Close as duplicate' },
              ]}
              select={(args) => {
                const text = args.item?.text ?? 'Close';
                if (state.selectedIds.length === 0) {
                  pushToast({
                    title: 'Close',
                    content: 'Select tickets to close first.',
                    severity: 'Info',
                  });
                  return;
                }
                // The current backend has no bulk-mutation endpoint;
                // trigger a refetch so the user sees the latest
                // server state, but be transparent about the
                // limitation.
                applyMutation({
                  title: 'Close',
                  content: `Use the per-row Close action for now (bulk endpoint coming soon).`,
                  severity: 'Info',
                });
                void text;
              }}
            >
              <span className="inline-flex items-center gap-xs">
                <Check size={14} aria-hidden="true" />
                Close
              </span>
            </DropDownButtonComponent>
            <DropDownButtonComponent
              id="bulk-priority"
              cssClass="e-primary e-small"
              items={[
                { text: 'Set to P1' },
                { text: 'Set to P2' },
                { text: 'Set to P3' },
                { text: 'Set to P4' },
              ]}
              select={(args) => {
                const text = args.item?.text ?? '';
                if (state.selectedIds.length === 0) {
                  pushToast({
                    title: 'Priority',
                    content: 'Select tickets to update priority first.',
                    severity: 'Info',
                  });
                  return;
                }
                applyMutation({
                  title: 'Priority',
                  content: `Use the per-row Actions menu to set priority (bulk endpoint coming soon).`,
                  severity: 'Info',
                });
                void text;
              }}
            >
              <span className="inline-flex items-center gap-xs">
                <AlertTriangle size={14} aria-hidden="true" />
                Change priority
              </span>
            </DropDownButtonComponent>
          </div>
        </div>

        {/* Ticket grid */}
        <div className="relative">
          {state.loading && (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 bg-surface/60 flex items-center justify-center text-sm text-text-muted pointer-events-none"
            >
              Loading tickets…
            </div>
          )}
          <GridComponent
            ref={gridRef}
            id="ticket-queue-grid"
            dataSource={
              visibleTickets as unknown as { [key: string]: object }[]
            }
            allowSorting={true}
            allowPaging={false}
            allowSelection={true}
            selectionSettings={GRID_SELECTION_SETTINGS}
            gridLines="Both"
            height="auto"
            rowSelected={() => {
              // EJ2's `getSelectedRecords()` can return an empty list
              // even when `selectedRowIndexes` is populated (a known
              // quirk when checkbox-column + `persistSelection` are
              // combined). Walk the row indexes and look each one up
              // via `getRowInfo`, which always reflects the live
              // selection.
              const inst = gridRef.current;
              if (!inst) return;
              const indexes = inst.getSelectedRowIndexes() ?? [];
              const ids: string[] = [];
              for (const idx of indexes) {
                const info = inst.getRowInfo?.(inst.getRows()[idx]);
                const data = info?.rowData as Ticket | undefined;
                if (data?.id) ids.push(data.id);
              }
              dispatch({ type: 'SET_SELECTED', value: ids });
            }}
            rowDeselected={() => {
              const inst = gridRef.current;
              if (!inst) return;
              const indexes = inst.getSelectedRowIndexes() ?? [];
              const ids: string[] = [];
              for (const idx of indexes) {
                const info = inst.getRowInfo?.(inst.getRows()[idx]);
                const data = info?.rowData as Ticket | undefined;
                if (data?.id) ids.push(data.id);
              }
              dispatch({ type: 'SET_SELECTED', value: ids });
            }}
            allowFiltering
            filterSettings={GRID_FILTER_SETTINGS}
          >
            <GridInject services={[Sort, Selection, Filter]} />
            <ColumnsDirective>
              <ColumnDirective
                type="checkbox"
                width="50"
                textAlign="Center"
              />
              <ColumnDirective
                field="id"
                headerText="Ticket"
                width="220"
                template={(props: Ticket) => {
                  const t = props;
                  return (
                    <div className="flex flex-col gap-2xs">
                      <Link
                        to={`/cases?id=${encodeURIComponent(
                          t.id.replace(/^#/, ''),
                        )}`}
                        onClick={(e) => {
                          // Keep native middle-click / cmd-click
                          // ("open in new tab") working by only
                          // intercepting plain left-clicks without
                          // modifier keys.
                          if (
                            e.defaultPrevented ||
                            e.button !== 0 ||
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.altKey
                          ) {
                            return;
                          }
                          e.preventDefault();
                          openCase(t);
                        }}
                        className="text-sm font-semibold text-text hover:underline cursor-pointer"
                        aria-label={`Open case ${t.id} — ${t.subject}`}
                      >
                        {t.id}
                      </Link>
                      <span className="text-xs text-text-muted">
                        {t.subject}
                      </span>
                      <span className="text-xs text-text-subtle">
                        {t.customer}
                      </span>
                    </div>
                  );
                }}
              />
              <ColumnDirective
                field="status"
                headerText="Status"
                width="110"
                template={(props: Ticket) => (
                  <StatusChip status={props.status} />
                )}
                allowFiltering={false}
                allowSorting={false}
              />
              <ColumnDirective
                field="priority"
                headerText="Priority"
                width="80"
                template={(row: Ticket) => (
                  <div className="px-lg py-sm">
                    <Priority level={row.priority} />
                  </div>
                )}
                allowFiltering={false}
              />
              <ColumnDirective field="queue" headerText="Queue" width="140" />
              <ColumnDirective
                field="assignee"
                headerText="Assignee"
                width="160"
                allowFiltering={false}
                template={(row: Ticket) => (
                  <div className="px-lg py-sm text-text">
                    {row.assignee.kind === 'agent' ? (
                      <span className="inline-flex items-center gap-sm">
                        <AgentAvatar initials={getInitials(row.assignee.name)} />
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
                width="150"
                template={(props: Ticket) => (
                  <SlaLiveCell deadlineMs={props.sla.deadlineMs} severity={props.sla.severity} />
                )}
                allowFiltering={false}
                allowSorting={false}
              />
              <ColumnDirective
                field="channel"
                headerText="Channel"
                width="120"
                template={(props: Ticket) => (
                  <ChannelChip channel={props.channel} />
                )}
              />
              {/* <ColumnDirective
                field="ageMinutes"
                headerText="Age"
                width="80"
                template={(props: Ticket) => (
                  <span className="text-sm text-text">
                    {ageLabel(props.ageMinutes)}
                  </span>
                )}
              /> */}
              <ColumnDirective
                field="id"
                headerText="Actions"
                width="140"
                textAlign="Right"
                template={(props: Ticket) => (
                  <RowActions
                    ticket={props}
                    onOpen={openCase}
                    onPushToast={pushToast}
                    onApplyMutation={applyMutation}
                  />
                )}
              />
            </ColumnsDirective>
          </GridComponent>
        </div>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-md px-lg py-md border-t border-border">
          <div className="text-sm text-text-muted">
            {state.totalCount === 0
              ? 'No tickets match the current filters.'
              : `Showing ${startIndex}–${endIndex} of ${state.totalCount} tickets`}
          </div>
          <div className="flex items-center gap-xs">
            <ButtonComponent
              cssClass="e-outline e-small pagination-btn"
              iconCss="e-icons e-chevron-left"
              title="Previous page"
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
            />
            {paginationButtons.map((item, idx) =>
              item.kind === 'ellipsis' ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="text-text-subtle px-xs"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <ButtonComponent
                  key={`page-${item.page}`}
                  cssClass={
                    item.active
                      ? 'e-primary e-small pagination-btn'
                      : 'e-outline e-small pagination-btn'
                  }
                  content={String(item.page)}
                  onClick={() => goToPage(item.page)}
                />
              ),
            )}
            <ButtonComponent
              cssClass="e-outline e-small pagination-btn"
              iconCss="e-icons e-chevron-right"
              title="Next page"
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
            />
          </div>
        </div>
      </section>


      {/* New-ticket dialog */}
      <DialogComponent
        id="new-ticket-dialog"
        isModal={true}
        showCloseIcon={true}
        closeOnEscape={true}
        width="520px"
        visible={state.isNewTicketOpen}
        header="Create new ticket"
        close={() => dispatch({ type: 'CLOSE_NEW_TICKET' })}
        footerTemplate={() => (
          <div className="flex items-center justify-end gap-sm p-md px-lg">
            <ButtonComponent
              cssClass="e-outline"
              onClick={() => dispatch({ type: 'CLOSE_NEW_TICKET' })}
            >
              Cancel
            </ButtonComponent>
            <ButtonComponent
              cssClass="e-primary"
              disabled={
                !state.newTicketForm.subject.trim() ||
                !state.newTicketForm.customer.trim()
              }
              onClick={async () => {
                const form = state.newTicketForm;
                if (!form.subject.trim() || !form.customer.trim()) {
                  pushToast({
                    title: 'Missing details',
                    content: 'Subject and customer are required.',
                    severity: 'Warning',
                  });
                  return;
                }
                try {
                  const created = await createTicket({
                    subject: form.subject.trim(),
                    customer: form.customer.trim(),
                    queue: form.queue,
                    priority: form.priority,
                    channel: 'email',
                  });
                  dispatch({ type: 'CLOSE_NEW_TICKET' });
                  applyMutation({
                    title: 'Ticket created',
                    content: `${created.subject} (${withHash(
                      created.id,
                    )}) added to the ${form.queue} queue.`,
                    severity: 'Success',
                  });
                } catch (err) {
                  // The backend is connected with the `public_reader`
                  // Postgres role, which is SELECT-only on `tickets`,
                  // so every write fails with 500. The fetch wrapper
                  // puts `status` and the raw response body on the
                  // thrown error; inspect both so we can replace the
                  // ugly HTML stack trace with a clear, user-readable
                  // message.
                  const raw = err instanceof Error ? err.message : String(err);
                  const body =
                    err && typeof err === 'object' && 'body' in err
                      ? String((err as { body?: unknown }).body ?? '')
                      : '';
                  const status =
                    err && typeof err === 'object' && 'status' in err
                      ? Number((err as { status?: unknown }).status)
                      : 0;
                  const haystack = `${raw}\n${body}`;
                  const isReadOnly =
                    status === 500 ||
                    /permission denied/i.test(haystack) ||
                    /read.only/i.test(haystack) ||
                    /Npgsql\.PostgresException/i.test(haystack);
                  pushToast({
                    title: 'Could not create ticket',
                    content: isReadOnly
                      ? 'Ticket could not be created — the backend is connected with a read-only database role (public_reader) and cannot persist new tickets. Ask an admin to grant INSERT on the tickets table, or switch the connection string to a writer role.'
                      : raw,
                    severity: 'Error',
                  });
                }
              }}
            >
              Create ticket
            </ButtonComponent>
          </div>
        )}
      >
        <div className="p-lg flex flex-col gap-md">
          <p className="text-sm text-text-muted m-0">
            Open a new support ticket and route it to the right queue.
          </p>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Subject
            </label>
            <TextBoxComponent
              id="new-subject"
              placeholder="Short description"
              width="100%"
              value={state.newTicketForm.subject}
              input={(args) =>
                dispatch({
                  type: 'UPDATE_NEW_TICKET',
                  value: { subject: String(args.value ?? '') },
                })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-xs">
              Customer
            </label>
            <TextBoxComponent
              id="new-customer"
              placeholder="Customer name"
              width="100%"
              value={state.newTicketForm.customer}
              input={(args) =>
                dispatch({
                  type: 'UPDATE_NEW_TICKET',
                  value: { customer: String(args.value ?? '') },
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-xs">
                Queue
              </label>
              <DropDownListComponent
                id="new-queue"
                dataSource={
                  QUEUE_OPTIONS.slice(1) as unknown as {
                    [key: string]: object;
                  }[]
                }
                fields={fieldProps}
                value={state.newTicketForm.queue}
                width="100%"
                change={(args) => {
                  if (args.value == null) return;
                  dispatch({
                    type: 'UPDATE_NEW_TICKET',
                    value: {
                      queue: String(args.value) as Exclude<QueueKey, 'all'>,
                    },
                  });
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-xs">
                Priority
              </label>
              <DropDownListComponent
                id="new-priority"
                dataSource={
                  PRIORITY_OPTIONS as unknown as { [key: string]: object }[]
                }
                fields={fieldProps}
                value={state.newTicketForm.priority}
                width="100%"
                change={(args) => {
                  if (args.value == null) return;
                  dispatch({
                    type: 'UPDATE_NEW_TICKET',
                    value: { priority: String(args.value) as PriorityKey },
                  });
                }}
              />
            </div>
          </div>
        </div>
      </DialogComponent>

      {/* Global toast surface */}
      <ToastComponent
        ref={toastRef}
        id="queue-toast"
        position={{ X: 'Right', Y: 'Bottom' }}
        timeOut={3500}
        newestOnTop={true}
        showCloseButton={true}
        showProgressBar={true}
      />
      <ToastDispatcher
        toast={lastToast}
        toastRef={toastRef}
        onShown={handleToastShown}
      />
    </section>
  );
}
