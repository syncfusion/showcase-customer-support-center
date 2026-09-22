/* ------------------------------------------------------------------ *
 *  useOverviewData
 *
 *  Single hook that owns every Overview-tab fetch. It runs the
 *  filter-option fetch once on mount, and re-runs the seven
 *  range/filter-dependent fetches whenever the caller passes a new
 *  `filters` object.
 *
 *  The hook returns one entry per endpoint so `OverviewTab` can
 *  render loading skeletons and error toasts per section:
 *
 *    const data = useOverviewData(filters);
 *    data.kpis         // { data, loading, error, reload }
 *    data.trend        // ...
 *    data.channelMix   // ...
 *    data.activity     // ...
 *    data.workload     // ...
 *    data.atRisk       // ...
 *    data.breachAlert  // ...
 *    data.filterOptions// (no reload — fetched once)
 *
 *  `loading` is `true` only on the first fetch of a given filter
 *  set — subsequent re-fetches return the previous data so the
 *  page doesn't flash empty. `error` carries the HTTP message
 *  verbatim. Each slice also exposes a `reload()` callback for
 *  retry buttons.
 *
 *  Implementation note — a single `useReducer` holds the eight
 *  slices so the per-fetch state transitions happen in a pure
 *  reducer (no synchronous setState calls inside effects). The
 *  effects themselves only read the current state and dispatch
 *  the result. Reload is driven by a `reloadTick` integer that
 *  effects key off, not by mutating a ref during render.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useReducer } from 'react';
import {
  fetchActivity,
  fetchAtRiskTickets,
  fetchBreachAlert,
  fetchChannelMix,
  fetchFilterOptions,
  fetchKpis,
  fetchTrend,
  fetchWorkload,
  type ApiActivityResponse,
  type ApiAtRiskTicketsResponse,
  type ApiBreachAlert,
  type ApiChannelMixResponse,
  type ApiFilterOptions,
  type ApiKpisResponse,
  type ApiTrendResponse,
  type ApiWorkloadResponse,
  type OverviewFilters,
  type RangeKey,
} from '../api/overviewClient';

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
  filterOptions: DataSlice<ApiFilterOptions>;
  kpis: DataSlice<ApiKpisResponse>;
  trend: DataSlice<ApiTrendResponse>;
  channelMix: DataSlice<ApiChannelMixResponse>;
  activity: DataSlice<ApiActivityResponse>;
  workload: DataSlice<ApiWorkloadResponse>;
  atRisk: DataSlice<ApiAtRiskTicketsResponse>;
  breachAlert: DataSlice<ApiBreachAlert>;
}

type SliceKey =
  | 'filterOptions'
  | 'kpis'
  | 'trend'
  | 'channelMix'
  | 'activity'
  | 'workload'
  | 'atRisk'
  | 'breachAlert';

type SliceAction =
  | { type: 'BEGIN_FETCH'; key: SliceKey }
  | { type: 'FETCH_SUCCESS'; key: SliceKey; data: unknown }
  | { type: 'FETCH_ERROR'; key: SliceKey; error: string }
  | { type: 'BUMP_RELOAD' };

function buildSlices(): Omit<SlicesState, 'reloadTick'> {
  return {
    filterOptions: emptySlice<ApiFilterOptions>({
      dateRanges: [],
      queues: [],
      channels: [],
      priorities: [],
      agents: [],
      tiers: [],
    }),
    kpis: emptySlice<ApiKpisResponse>(),
    trend: emptySlice<ApiTrendResponse>(),
    channelMix: emptySlice<ApiChannelMixResponse>(),
    activity: emptySlice<ApiActivityResponse>(),
    workload: emptySlice<ApiWorkloadResponse>(),
    atRisk: emptySlice<ApiAtRiskTicketsResponse>(),
    breachAlert: emptySlice<ApiBreachAlert>(),
  };
}

function attachReload(
  slices: Omit<SlicesState, 'reloadTick'>,
  reload: () => void,
): Omit<SlicesState, 'reloadTick'> {
  return {
    filterOptions: { ...slices.filterOptions, reload },
    kpis: { ...slices.kpis, reload },
    trend: { ...slices.trend, reload },
    channelMix: { ...slices.channelMix, reload },
    activity: { ...slices.activity, reload },
    workload: { ...slices.workload, reload },
    atRisk: { ...slices.atRisk, reload },
    breachAlert: { ...slices.breachAlert, reload },
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

/* ---------- Hook ---------- */

export interface OverviewData {
  kpis: DataSlice<ApiKpisResponse>;
  trend: DataSlice<ApiTrendResponse>;
  channelMix: DataSlice<ApiChannelMixResponse>;
  activity: DataSlice<ApiActivityResponse>;
  workload: DataSlice<ApiWorkloadResponse>;
  atRisk: DataSlice<ApiAtRiskTicketsResponse>;
  breachAlert: DataSlice<ApiBreachAlert>;
  filterOptions: DataSlice<ApiFilterOptions>;
}

/**
 * Owns every Overview-tab fetch.
 *
 * The `filters` object identity drives re-fetching — pass a new
 * object (or new primitives) on every state change and the hook
 * will re-issue the dependent GETs. Pass a stable identity and
 * the hook short-circuits.
 */
export function useOverviewData(filters: OverviewFilters): OverviewData {
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
      filterOptions: state.filterOptions,
      kpis: state.kpis,
      trend: state.trend,
      channelMix: state.channelMix,
      activity: state.activity,
      workload: state.workload,
      atRisk: state.atRisk,
      breachAlert: state.breachAlert,
    },
    reload,
  );

  /* Filter-option fetch — one-shot on mount. Re-runs only on
   * manual reload. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'filterOptions' });
    fetchFilterOptions(ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'filterOptions', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'filterOptions',
          error: err?.message ?? 'Failed to load filter options',
        });
      });
    return () => ac.abort();
  }, [state.reloadTick]);

  /* Range- + filter-dependent fetches — KPI / trend / channel-mix /
   * breach-alert. Keyed on the full filter set + `reloadTick` so a
   * change in ANY filter (including queue / priority / channel on top
   * of range) re-fetches. We pre-extract the priority array to a
   * primitive (`priorityKey`) below so the dep list stays
   * statically-known — the parent creates a fresh `filters` object
   * every render and we can't list it directly. */
  const range: RangeKey = filters.range ?? '7d';
  // Join the priority array to a primitive so the deps list is a list
  // of statically-known expressions. Used by the KPI / trend /
  // channel-mix / breach-alert effect AND the activity / at-risk
  // effects below.
  const priorityKey = filters.priority?.join(',') ?? '';

  useEffect(() => {
    const ac = new AbortController();

    // KPIs now honour the full filter set (not just `range`) so the
    // four card counts re-fetch when the user changes any toolbar
    // dropdown. The endpoint computes `activeBreaches` /
    // `atRisk` / `slaCompliancePct` from the same SQL filter as the
    // activity feed and at-risk grid — see
    // `OverviewRepository.GetKpisAsync`.
    dispatch({ type: 'BEGIN_FETCH', key: 'kpis' });
    fetchKpis(filters, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'kpis', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'kpis',
          error: err?.message ?? 'Failed to load KPIs',
        });
      });

    dispatch({ type: 'BEGIN_FETCH', key: 'trend' });
    fetchTrend(range, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'trend', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'trend',
          error: err?.message ?? 'Failed to load trend',
        });
      });

    dispatch({ type: 'BEGIN_FETCH', key: 'channelMix' });
    fetchChannelMix(range, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'channelMix', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'channelMix',
          error: err?.message ?? 'Failed to load channel mix',
        });
      });

    dispatch({ type: 'BEGIN_FETCH', key: 'breachAlert' });
    fetchBreachAlert(range, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'breachAlert', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'breachAlert',
          error: err?.message ?? 'Failed to load breach alert',
        });
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range,
    filters.queue,
    priorityKey,
    filters.channel,
    state.reloadTick,
  ]);

  /* Activity feed — keys on queue/priority/channel/expanded.
   * `range` is also passed so the server can apply a soft cap
   * if it wants to. We extract the priority array to a
   * primitive (joined string) so the dependency array stays
   * a list of statically-known expressions. The full
   * `filters` object is captured in the closure but we don't
   * list it as a dependency — the parent creates a new
   * object every render, so listing it would cause an
   * infinite re-fetch loop. The primitive keys below are
   * sufficient to detect real filter changes. The
   * `priorityKey` primitive is declared once at the top of
   * this hook so it can be shared across multiple effects. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'activity' });
    fetchActivity(filters, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'activity', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'activity',
          error: err?.message ?? 'Failed to load activity',
        });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range,
    filters.queue,
    priorityKey,
    filters.channel,
    filters.expanded,
    state.reloadTick,
  ]);

  /* Workload — keyed on the expanded flag. */
  const workloadExpanded = Boolean(filters.expanded);
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'workload' });
    fetchWorkload(workloadExpanded, workloadExpanded ? 18 : 5, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'workload', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'workload',
          error: err?.message ?? 'Failed to load workload',
        });
      });
    return () => ac.abort();
  }, [workloadExpanded, state.reloadTick]);

  /* At-risk tickets — keys on the full filter set. The
   * grid's `dataSource` is fed by this slice, so it's the
   * busiest endpoint on the page. We key on primitives
   * (not the whole `filters` object) so the dependency
   * array stays a list of statically-known expressions.
   * The full `filters` object is captured in the closure
   * but we don't list it as a dependency — the parent
   * creates a new object every render, so listing it
   * would cause an infinite re-fetch loop. The primitive
   * keys below are sufficient to detect real filter
   * changes. */
  useEffect(() => {
    const ac = new AbortController();
    dispatch({ type: 'BEGIN_FETCH', key: 'atRisk' });
    fetchAtRiskTickets(filters, ac.signal)
      .then((data) => dispatch({ type: 'FETCH_SUCCESS', key: 'atRisk', data }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        dispatch({
          type: 'FETCH_ERROR',
          key: 'atRisk',
          error: err?.message ?? 'Failed to load tickets',
        });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range,
    filters.queue,
    priorityKey,
    filters.channel,
    state.reloadTick,
  ]);

  return slices;
}
