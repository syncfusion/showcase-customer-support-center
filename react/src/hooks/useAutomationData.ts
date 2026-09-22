/* ------------------------------------------------------------------ *
 *  useAutomationData
 *
 *  Single hook that owns every Automation-tab fetch. The
 *  Automation tab pulls from five endpoints:
 *
 *    GET  /api/automation/routing-rules
 *    GET  /api/automation/sla-policies
 *    GET  /api/automation/escalation-workflows/{id}
 *    GET  /api/automation/macros
 *    GET  /api/automation/impact
 *
 *  The hook returns one entry per endpoint so the
 *  `AutomationTab` component can render loading skeletons and
 *  surface error toasts per section:
 *
 *    const data = useAutomationData(filters);
 *    data.routingRules   // { data, loading, error, reload }
 *    data.slaPolicies    // ...
 *    data.workflow       // ...
 *    data.macros         // ...
 *    data.impact         // { kpis, metrics, coverage } in domain shape
 *
 *  `loading` is `true` only on the first fetch of a given filter
 *  set — subsequent re-fetches return the previous data so the
 *  page doesn't flash empty. `error` carries the HTTP message
 *  verbatim. Each slice also exposes a `reload()` callback for
 *  retry buttons.
 *
 *  The Routing-rules slice applies the per-section `team` filter
 *  the same way the showcase's old `useState` set did: by
 *  matching the rule id against the substring table defined
 *  in `frontend/datamodels/automation.txt` §1. The
 *  `priorityFilter` value is passed through for completeness
 *  but doesn't actually narrow the rows (the server doesn't
 *  support it yet, and the contract says the client only
 *  captures it for a toast).
 *
 *  Implementation note — a single `useReducer` holds the four
 *  slices so the per-fetch state transitions happen in a pure
 *  reducer (no synchronous setState calls inside effects). The
 *  effects themselves only read the current state and dispatch
 *  the result. Reload is driven by a `reloadTick` integer that
 *  effects key off, not by mutating a ref during render.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useReducer } from 'react';
import {
  fetchEscalationWorkflow,
  fetchImpact,
  fetchMacros,
  fetchRoutingRules,
  fetchSlaPolicies,
  type AutomationFilters,
  type CoverageSeries,
  type ImpactData,
  type ImpactMetric,
  type ImpactRange,
  type KpiSummary,
  type MacroCard,
  type RoutingRule,
  type SlaPolicy,
  type TeamKey,
  type Workflow,
} from '../api/automationClient';

/* ---------- Slice shape ---------- */

export interface DataSlice<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function emptySlice<T>(initial: T | null = null): DataSlice<T> {
  return { data: initial, loading: true, error: null, reload: () => undefined };
}

/* ---------- Reducer state ---------- */

interface SlicesState {
  reloadTick: number;
  routingRules: DataSlice<RoutingRule[]>;
  slaPolicies: DataSlice<SlaPolicy[]>;
  workflow: DataSlice<Workflow>;
  macros: DataSlice<MacroCard[]>;
  impact: DataSlice<ImpactData>;
}

type SliceKey =
  | 'routingRules'
  | 'slaPolicies'
  | 'workflow'
  | 'macros'
  | 'impact';

type SliceAction =
  | { type: 'BEGIN_FETCH'; key: SliceKey }
  | { type: 'FETCH_SUCCESS'; key: SliceKey; data: unknown }
  | { type: 'FETCH_ERROR'; key: SliceKey; error: string }
  | { type: 'BUMP_RELOAD' };

function buildSlices(): Omit<SlicesState, 'reloadTick'> {
  return {
    routingRules: emptySlice<RoutingRule[]>([]),
    slaPolicies: emptySlice<SlaPolicy[]>([]),
    workflow: emptySlice<Workflow>({
      id: '',
      title: '',
      subtitle: '',
      steps: [],
      palette: [],
    }),
    macros: emptySlice<MacroCard[]>([]),
    impact: emptySlice<ImpactData>({
      kpis: [],
      metrics: [],
      coverage: { xLabels: [], series: { autoRouted: [], autoResolved: [], sla: [] } },
      /* Initial echoed range — defaults to '30d' so the
       * first render reads a sensible "Weekly, last 30
       * days"-shaped subtitle before the first fetch
       * lands. The actual value the chart reads is
       * `impact.data.range`, which the reducer carries
       * through every fetch. */
      range: '30d',
    }),
  };
}

function attachReload(
  slices: Omit<SlicesState, 'reloadTick'>,
  reload: () => void,
): Omit<SlicesState, 'reloadTick'> {
  return {
    routingRules: { ...slices.routingRules, reload },
    slaPolicies: { ...slices.slaPolicies, reload },
    workflow: { ...slices.workflow, reload },
    macros: { ...slices.macros, reload },
    impact: { ...slices.impact, reload },
  };
}

function slicesReducer(state: SlicesState, action: SliceAction): SlicesState {
  switch (action.type) {
    case 'BUMP_RELOAD':
      return { ...state, reloadTick: state.reloadTick + 1 };
    case 'BEGIN_FETCH': {
      const slice = state[action.key];
      // `loading` only flips to true on the first fetch of a
      // given filter set — subsequent re-fetches return the
      // previous data so the page doesn't flash empty.
      return {
        ...state,
        [action.key]: { ...slice, loading: slice.data == null, error: null },
      };
    }
    case 'FETCH_SUCCESS': {
      const slice = state[action.key];
      return {
        ...state,
        [action.key]: { ...slice, data: action.data as never, loading: false, error: null },
      };
    }
    case 'FETCH_ERROR': {
      const slice = state[action.key];
      return { ...state, [action.key]: { ...slice, loading: false, error: action.error } };
    }
    default:
      return state;
  }
}

/* ---------- Hook inputs ---------- */

export interface AutomationDataInputs {
  /** Page-level filters. Used for every slice. */
  environment?: AutomationFilters['environment'];
  team?: AutomationFilters['team'];
  range?: AutomationFilters['range'];
  /** Per-section routing team filter. When set, narrows the
   *  routing-rules rows using the id-substring table. */
  routingTeam?: TeamKey;
  /** Currently selected impact range. Drives the §5 endpoints. */
  impactRange?: ImpactRange;
  /** Workflow id for the escalation section. Defaults to
   *  "current" which the server resolves to the first
   *  workflow in its table. */
  workflowId?: string;
}

/* ---------- Hook output ---------- */

export interface AutomationData {
  routingRules: DataSlice<RoutingRule[]>;
  slaPolicies: DataSlice<SlaPolicy[]>;
  workflow: DataSlice<Workflow>;
  macros: DataSlice<MacroCard[]>;
  impact: DataSlice<ImpactData>;
}

/* ---------- Helpers ---------- */

/* Mirrors the substring mapping in `automation.txt` §1. The
 * showcase previously did this on the client; the server also
 * applies a `team` filter at the data-source level, but the
 * repository's `RoutingRuleEntity` doesn't carry a `team` enum
 * (every row is `TeamKey.All`), so the server-side filter is
 * a no-op. We re-apply the substring filter here so the
 * dropdown actually narrows the rows the user sees. */
function applyRoutingTeamFilter(
  rows: ReadonlyArray<RoutingRule>,
  team: TeamKey | undefined,
): RoutingRule[] {
  if (!team || team === 'all') return rows.slice();
  let predicate: (id: string) => boolean;
  switch (team) {
    case 'platform':
      predicate = (id) => id.includes('enterprise-outage') || id.includes('after-hours');
      break;
    case 'billing':
      predicate = (id) => id.includes('billing') || id.includes('chargeback');
      break;
    case 'account':
      predicate = (id) => id.includes('vip');
      break;
    case 'general':
      predicate = (id) => id.includes('latam') || id.includes('overflow');
      break;
    default:
      return rows.slice();
  }
  return rows.filter((r) => predicate(r.id));
}

/**
 * Owns every Automation-tab fetch.
 *
 * Pass a new primitive on every state change and the hook will
 * re-issue the dependent GETs. Pass a stable set and the hook
 * short-circuits.
 */
export function useAutomationData(inputs: AutomationDataInputs = {}): AutomationData {
  const { environment, team, range, routingTeam, impactRange, workflowId } = inputs;
  const initialSlices = buildSlices();
  const [state, dispatch] = useReducer(slicesReducer, {
    ...initialSlices,
    reloadTick: 0,
  });

  // Stable reload callback — bumps the tick that every effect
  // keys on. Attached to each slice in the returned object via
  // `attachReload` below; we don't store it in the reducer
  // because it never changes.
  const reload = useCallback(() => dispatch({ type: 'BUMP_RELOAD' }), []);
  const slices = attachReload(
    {
      routingRules: state.routingRules,
      slaPolicies: state.slaPolicies,
      workflow: state.workflow,
      macros: state.macros,
      impact: state.impact,
    },
    reload,
  );

  const filterArgs: AutomationFilters = { environment, team, range };
  const reloadTick = state.reloadTick;

  /* Routing rules — re-runs on every environment / team / range
   * / routingTeam / reload-tick change. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'routingRules' });
    fetchRoutingRules(filterArgs, ac.signal)
      .then((rows) => {
        if (ac.signal.aborted) return;
        const filtered = applyRoutingTeamFilter(rows, routingTeam);
        dispatch({ type: 'FETCH_SUCCESS', key: 'routingRules', data: filtered });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'FETCH_ERROR', key: 'routingRules', error: message });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, team, range, routingTeam, reloadTick]);

  /* SLA policies — re-runs on environment / team / range /
   * reload-tick change. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'slaPolicies' });
    fetchSlaPolicies(filterArgs, ac.signal)
      .then((rows) => {
        if (ac.signal.aborted) return;
        dispatch({ type: 'FETCH_SUCCESS', key: 'slaPolicies', data: rows });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'FETCH_ERROR', key: 'slaPolicies', error: message });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, team, range, reloadTick]);

  /* Escalation workflow — re-runs on environment / team /
   * range / workflowId / reload-tick change. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'workflow' });
    fetchEscalationWorkflow(workflowId ?? 'current', filterArgs, ac.signal)
      .then((workflow) => {
        if (ac.signal.aborted) return;
        dispatch({ type: 'FETCH_SUCCESS', key: 'workflow', data: workflow });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'FETCH_ERROR', key: 'workflow', error: message });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, team, range, workflowId, reloadTick]);

  /* Macros — re-runs on environment / team / range / reload-tick. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'macros' });
    fetchMacros(filterArgs, ac.signal)
      .then((rows) => {
        if (ac.signal.aborted) return;
        dispatch({ type: 'FETCH_SUCCESS', key: 'macros', data: rows });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'FETCH_ERROR', key: 'macros', error: message });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, team, range, reloadTick]);

  /* Impact — re-runs on range / impactRange / reload-tick. The
   * server bundles KPIs, metrics, and coverage in a single
   * `/api/automation/impact` response, so one fetch populates
   * three views. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'impact' });
    fetchImpact(impactRange ?? '30d', ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return;
        dispatch({ type: 'FETCH_SUCCESS', key: 'impact', data });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'FETCH_ERROR', key: 'impact', error: message });
      });
    return () => ac.abort();
  }, [impactRange, reloadTick]);

  return slices;
}

/* Re-exports for callers that want to talk to the wire types
 * without reaching into `automationClient` directly. */
export type {
  CoverageSeries,
  ImpactData,
  ImpactMetric,
  KpiSummary,
  MacroCard,
  RoutingRule,
  SlaPolicy,
  Workflow,
};
