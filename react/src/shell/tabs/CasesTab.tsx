/* ------------------------------------------------------------------ *
 *  Cases tab — Case #CS-10478 detail page
 *
 *  Matches `.designs/screens/cases.html`: P1 Critical SSO issue,
 *  customer Mira Patel, agent Daniel K., linked incident #INC-227.
 *
 *  Syncfusion components used:
 *    • ChipListComponent + ChipDirective  → priority, status, profile
 *                                           tags, SLA tags, Private
 *                                           badges, mentions
 *    • ButtonComponent                    → Merge, Escalate, Resolve,
 *                                           Attach, Save as note,
 *                                           Send reply, Reassign, Watch
 *    • TabComponent + TabItemsDirective
 *        / TabItemDirective               → Internal notes / Related
 *                                           cases / Handoff sub-tabs
 *    • RichTextEditorComponent            → reply composer (HTML
 *                                           WYSIWYG; toolbar / link /
 *                                           image / quick toolbar /
 *                                           char-count injected)
 *    • DialogComponent                    → Reassign / Escalate /
 *                                           Resolve confirmations
 *    • ToastComponent                     → action feedback
 *
 *  The RTE ships its own toolbar (Bold, Italic, Underline, lists,
 *  link, image, source view, undo/redo, etc.) so the native icon
 *  buttons that used to live above the composer are no longer
 *  needed and have been removed.
 *
 *  Layout: ≥1100px two-column grid-cols-[2fr_1fr], <1100px single col.
 * ------------------------------------------------------------------ */

// Per-tab CSS for CasesTab — Timeline chrome, RTE composer overrides,
// and the related-cases ListView. Moved out of `src/index.css` /
// `src/theme/tokens.css` so the per-tab rules live next to their
// component. Imported first so Vite hoists the CSS before any other
// module.
import '../../styles/tabs/cases.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonComponent,
  ChipListComponent,
  ChipsDirective,
  ChipDirective,
} from '@syncfusion/ej2-react-buttons';
import {
  TabComponent,
  TabItemsDirective,
  TabItemDirective,
} from '@syncfusion/ej2-react-navigations';
import {
  RichTextEditorComponent,
  Toolbar,
  HtmlEditor,
  Link as RichTextLink,
  Image,
  QuickToolbar,
  Count,
  Inject,
  ToolbarType,
  type ChangeEventArgs,
  type ToolbarSettingsModel,
} from '@syncfusion/ej2-react-richtexteditor';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { ListViewComponent } from '@syncfusion/ej2-react-lists';
import {
  DialogComponent,
  type ButtonPropsModel,
} from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import {
  TimelineComponent,
  ItemsDirective,
  ItemDirective,
} from '@syncfusion/ej2-react-layouts';
import { UploaderComponent } from '@syncfusion/ej2-react-inputs';
import type {
  GeneratedTimelineEvent,
  CaseDetail,
} from '../../data/caseDetails';
import {
  fetchCaseDetail,
  fetchDefaultCaseId,
  fetchCaseList,
  resolveCase,
  escalateCase,
  reassignCase,
  addReply,
  addNote,
  type CaseListItem,
} from '../../api/casesClient';
import {
  AlertTriangle,
  Check,
  CircleDot,
  Link2,
  Send,
  UserPlus,
  Users,
  FileText,
  Eye,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

/* ================================================================== *
 *  Shared helpers (same patterns as QueueTab / OverviewTab)
 * ================================================================== */

type Severity = 'ok' | 'risk' | 'breach';
type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const chipCssMap: Record<ChipTone, string> = {
  success: 'e-success',
  warning: 'e-warning',
  error: 'e-danger',
  info: 'e-info',
  neutral: 'e-secondary',
};

/** Mild tonal palette for chips — soft pastel background + brand-color
 *  text, matching the Cases-tab SLA screenshot (light red "Critical",
 *  light amber "At risk", light green "On track", light blue "24×7",
 *  neutral grey "Private" / "Customer since …"). The CDN's
 *  `tailwind3.css` ships with high-saturation solid fills + white
 *  text and the cascade is unlayered, so per-repo-memory the only
 *  reliable way to override it is **inline style on the chip
 *  element** — specificity 1,0,0,0 beats every CSS rule, layered
 *  or unlayered, with or without !important. We apply these styles
 *  via a ref-callback in the `Chip` component below. */
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
  },
};

/** Single chip via Syncfusion ChipListComponent. The ref-callback
 *  on the wrapper `<span>` finds the rendered `.e-chip` div and
 *  applies the tone's `chipStyleMap` entry as inline `style` on
 *  the chip element itself. Inline styles win the cascade against
 *  the unlayered CDN rules. */
function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  const style = chipStyleMap[tone];
  return (
    <span
      className="inline-flex items-center"
      role="status"
      ref={(el) => {
        if (!el) return;
        // The chip is the only .e-chip descendant.
        const chip = el.querySelector('.e-chip') as HTMLElement | null;
        if (!chip) return;
        for (const [k, v] of Object.entries(style)) {
          chip.style.setProperty(
            k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
            String(v),
            'important',
          );
        }
      }}
    >
      <ChipListComponent>
        <ChipsDirective>
          <ChipDirective text={label} cssClass={chipCssMap[tone]} />
        </ChipsDirective>
      </ChipListComponent>
    </span>
  );
}

/** Priority dot + label (P1/P2/P3/P4). */
function PriorityDot({ level }: { level: 'p1' | 'p2' | 'p3' | 'p4' }) {
  const dotMap: Record<string, string> = {
    p1: 'bg-danger',
    p2: 'bg-warning',
    p3: 'bg-info',
    p4: 'bg-text-subtle',
  };
  return (
    <span className="inline-flex items-center gap-xs">
      <span
        className={`w-2 h-2 rounded-pill ${dotMap[level]}`}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-text">
        {level.toUpperCase()}
      </span>
    </span>
  );
}

/** formatSla — same logic as QueueTab / OverviewTab. */
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

/** Live SLA timer — self-contained 1s tick. */
function SlaTimerDisplay({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { severity, label } = formatSla(deadlineMs, now);
  const colorClass =
    severity === 'ok'
      ? 'text-success'
      : severity === 'risk'
        ? 'text-warning'
        : 'text-danger';

  return (
    <span
      className={[
        'inline-flex items-center gap-xs font-mono text-sm',
        colorClass,
        severity === 'breach' ? 'font-bold' : '',
        severity === 'breach' ? 'sla-live sla-live--pulse' : '',
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

/** Avatar circle with initials. */
function Avatar({
  initials,
  large,
}: {
  initials: string;
  large?: boolean;
}) {
  return (
    <span
      className={[
        'rounded-pill flex items-center justify-center font-semibold shrink-0',
        'bg-primary-soft text-primary',
        large ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-xs',
      ].join(' ')}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ================================================================== *
 *  Case-detail data is generated on demand from queue tickets.
 *  See ../../data/caseDetails.ts for the deterministic generator.
 * ================================================================== */

type DialogKind = 'resolve' | 'escalate' | 'reassign' | null;

/* Related-cases row template (hoisted to module scope).
 *
 * Syncfusion ListView wraps every template in
 *   <li class="e-list-item">
 *     <span class="e-list-text">…our template…</span>
 *   </li>
 * so the template's outermost element must NOT be a <li> and must be
 * a real block — the matching `.related-cases-list .e-list-text`
 * rule in tokens.css (mirroring .activity-feed-list) forces
 * `display: block; width: 100%; white-space: normal` to defeat the
 * default inline-block + nowrap.
 *
 * The Link2 button click calls back into the CasesTab component
 * via a module-scoped `onCopyLink` set by `RelatedCasesList`, with
 * `e.stopPropagation()` so the row-level ListView `select` event
 * doesn't also fire. The `onCopyLink` is assigned in a ref-style
 * pattern below (see `relatedCasesCopyRef`) so the template
 * function identity stays stable across renders — re-creating the
 * template every render makes Syncfusion tear down and rebuild the
 * row tree, which is what bit the workload list (the per-row
 * ProgressBarComponent re-fired its value-update animation). */
function RelatedCasesRowTemplate(props: {
  id: string;
  priority: 'p1' | 'p2' | 'p3' | 'p4';
  title: string;
  sub: string;
}) {
  const onCopy = relatedCasesCopyRef.current;
  return (
    <div className="related-cases-row e-list-wrapper e-list-multi-line">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-sm">
        <PriorityDot level={props.priority} />
        <div className="min-w-0">
          <Link
            to={`/cases?id=${encodeURIComponent(props.id)}`}
            className="text-sm font-semibold text-text hover:text-primary"
          >
            {props.id}
          </Link>{' '}
          <span className="text-sm text-text-muted">— {props.title}</span>
          <div className="text-xs text-text-subtle">{props.sub}</div>
        </div>
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-2 text-text-muted cursor-pointer"
          aria-label={`Copy link to ${props.id}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCopy?.(props.id);
          }}
        >
          <Link2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* Ref-style indirection so the row template above has a stable
 * function identity and can still reach the per-tab
 * `handleCopyCaseLink` (which depends on `showToast` and is
 * recreated when the toast identity changes). The component
 * assigns `relatedCasesCopyRef.current` on every render; the
 * template reads from the ref at click time. Without this, either
 * the template would have to be re-created every render (causing
 * Syncfusion to rebuild the row tree) or the click handler would
 * capture a stale closure. */
const relatedCasesCopyRef: { current: ((id: string) => void) | null } = {
  current: null,
};

/* ================================================================== *
 *  CasesTab — main component
 * ================================================================== */

export function CasesTab() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // The case id arrives on the `?id=` query string (e.g.
  // `/cases?id=CS-10478`). When omitted, the latest open P1
  // case is shown by default.
  const caseId = searchParams.get('id');
  /* ---- state ---- */
  const [replyText, setReplyText] = useState('');
  // Mirror replyText to a ref so any button handlers never read stale
  // closures (EJ2 React gotcha — DialogComponent buttons memo).
  const replyRef = useRef(replyText);
  useEffect(() => {
    replyRef.current = replyText;
  }, [replyText]);

  const [activeDialog, setActiveDialog] = useState<DialogKind>(null);

  /* If no caseId is provided, fetch the backend default case id. */
  const [resolvedCaseId, setResolvedCaseId] = useState<string | null>(
    caseId ?? null,
  );
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [casesLoading, setCasesLoading] = useState<boolean>(true);
  const [casesError, setCasesError] = useState<string | null>(null);

  useEffect(() => {
    if (caseId) {
      setResolvedCaseId(caseId);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    fetchDefaultCaseId(ac.signal)
      .then((res) => {
        if (cancelled) return;
        setResolvedCaseId(res.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setCasesError(err instanceof Error ? err.message : String(err));
        setCasesLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [caseId]);

  /* Fetch the full case-detail record from the backend. */
  useEffect(() => {
    if (!resolvedCaseId) return;
    let cancelled = false;
    const ac = new AbortController();
    setCasesLoading(true);
    setCasesError(null);
    fetchCaseDetail(resolvedCaseId, ac.signal)
      .then((detail) => {
        if (cancelled) return;
        setCaseData(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setCasesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setCasesLoading(false);
      });

    // lightweight background refresh so any new timeline events
    // (reassignments, replies, escalations) appear without a page reload
    const refreshInterval = window.setInterval(() => {
      if (cancelled) return;
      fetchCaseDetail(resolvedCaseId)
        .then((detail) => {
          if (cancelled) return;
          setCaseData(detail);
        })
        .catch(() => {
          // silently ignore background refresh failures
        });
    }, 20_000);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(refreshInterval);
    };
  }, [resolvedCaseId]);

  /* Fetch the case list once for the selector. */
  const [caseList, setCaseList] = useState<CaseListItem[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(true);
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetchCaseList(ac.signal)
      .then((items) => {
        if (cancelled) return;
        setCaseList(items);
      })
      .catch(() => {
        // Non-blocking; selector can fall back to the current case id.
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  // Toast state
  const toastRef = useRef<ToastComponent>(null);

  /* Syncfusion's <ToastComponent> portals its container onto
   * <body> the first time `show()` is called (see
   * ej2-notifications/toast.js → Toast.show →
   * getContainer → target = document.body → style.position =
   * 'fixed'). When the user then navigates to a different tab,
   * the React tree unmounts <CasesTab />. React walks the
   * fiber tree and calls `parent.removeChild(child)` on every
   * tracked node. If `child` has been portaled onto <body>, the
   * DOM parent no longer owns it and the call throws
   * `NotFoundError: Failed to execute 'removeChild'` — which
   * leaks uncaught out of React's commit phase and tears down
   * the entire root, blanking the next tab.
   *
   * Destroy the toast before unmount so Syncfusion restores the
   * container back to its React-tracked parent (or at minimum
   * detaches its event listeners and de-portals the node)
   * BEFORE React's reconciliation tries to clean it up. The
   * matching `AppShell` is now also wrapped in an error
   * boundary that swallows any straggler, but doing the cleanup
   * here is the proper fix and prevents the boundary from ever
   * firing on this transition. */
  useEffect(() => {
    return () => {
      const instance = toastRef.current;
      if (!instance) return;
      // The Syncfusion Toast exposes `destroy()`. We call it
      // through the React-side `ref` (which exposes the same
      // surface as the underlying EJ2 widget) so any DOM that
      // was moved to <body> is returned to / detached from the
      // React-tracked subtree before React's commit phase runs.
      type Destroyable = { destroy: () => void };
      const destroyable = instance as unknown as Destroyable | null;
      destroyable?.destroy?.();
    };
  }, []);

  /* ---- handlers ---- */
  const showToast = useCallback(
    (message: string, severity: 'success' | 'warning' | 'error' | 'info') => {
      setTimeout(() => {
        toastRef.current?.show({
          title: '',
          content: message,
          cssClass: `e-toast-${severity}`,
        });
      }, 50);
    },
    [],
  );

  const refreshCase = useCallback(async () => {
    if (!resolvedCaseId) return;
    try {
      const detail = await fetchCaseDetail(resolvedCaseId);
      setCaseData(detail);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not refresh case details.',
        'error',
      );
    }
  }, [resolvedCaseId, showToast]);

  const withMutation = useCallback(
    async (promise: Promise<unknown>, successMessage: string) => {
      try {
        await promise;
        await refreshCase();
        showToast(successMessage, 'success');
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'The action failed. Please try again.',
          'error',
        );
      }
    },
    [refreshCase, showToast],
  );

  const handleResolve = useCallback(() => {
    if (!caseData) return;
    setActiveDialog(null);
    withMutation(
      resolveCase(caseData.id),
      `Case ${caseData.id} has been resolved.`,
    );
  }, [caseData, withMutation]);

  const handleEscalate = useCallback(() => {
    if (!caseData) return;
    setActiveDialog(null);
    // Single, brief toast — the user only needs confirmation that the
    // escalation landed; the per-case id and tier are already visible
    // on the timeline card and the agent row of the metadata grid.
    withMutation(escalateCase(caseData.id), `Escalated`);
  }, [caseData, withMutation]);

  const handleReassign = useCallback(() => {
    if (!caseData) return;
    setActiveDialog(null);
    // `auto` lets the backend auto-balance to the available agent with
    // the most remaining capacity. The previous hardcoded `agent-1`
    // isn't in the seeded agent roster, so the reassign POST used to
    // fail with a 404 ("Agent agent-1 not found") — and before the
    // `/api/cases/{id}/reassign` endpoint existed at all, a 404 route
    // miss. Passing `auto` matches the Overview tab's reassign dialog
    // semantics (its dropdown also defaults to "Auto-balance by load").
    withMutation(
      reassignCase(caseData.id, 'auto'),
      `Case ${caseData.id} reassigned.`,
    );
  }, [caseData, withMutation]);

  /* ---- attachment uploader ----
   * A single UploaderComponent rendered inline (no enclosing
   * dialog, no wrapper button) in async mode — `autoUpload` is
   * on so the file list reflects the server response
   * automatically. The widget posts each picked file to
   * `asyncSettings.saveUrl` and only renders its per-file green
   * "Uploaded successfully" status row when the response is 2xx,
   * so we point at a same-origin stub (see vite.config.ts →
   * `uploaderStubPlugin`) that always returns `200 OK`. That
   * keeps the demo fully offline and avoids the third-party
   * Syncfusion demo URL that was failing in earlier iterations.
   * The success / failure events still fire on the corresponding
   * server response so we can show a toast as belt-and-braces
   * feedback for screen-reader / offscreen-list users. */
  const uploaderRef = useRef<UploaderComponent>(null);

  const attachmentAsyncSettings = useMemo(
    () => ({
      saveUrl: '/api/uploads/save',
      removeUrl: '/api/uploads/remove',
    }),
    [],
  );

  const handleAttachmentSuccess = useCallback(
    (args: { file?: { name?: string } }) => {
      const name = args?.file?.name ?? 'file';
      showToast(`${name} uploaded successfully.`, 'success');
    },
    [showToast],
  );

  const handleAttachmentFailure = useCallback(
    (args: { file?: { name?: string } }) => {
      const name = args?.file?.name ?? 'file';
      showToast(`Could not upload ${name}.`, 'error');
    },
    [showToast],
  );

  const handleSendReply = useCallback(() => {
    if (!caseData) return;
    /* RTE values are HTML; strip tags + collapse whitespace before
     * the empty-check so a payload of just "<p><br></p>" doesn't
     * sneak through as a "sent" reply. */
    const html = replyRef.current;
    const text = html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    if (!text) {
      showToast('Please write a reply before sending.', 'warning');
      return;
    }
    setReplyText('');
    withMutation(
      addReply(caseData.id, html),
      `Reply sent to ${caseData.customer.name}.`,
    );
  }, [caseData, showToast, withMutation]);

  const handleSaveAsNote = useCallback(() => {
    if (!caseData) return;
    const html = replyRef.current;
    const text = html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    if (!text) {
      showToast('Please write a note before saving.', 'warning');
      return;
    }
    setReplyText('');
    withMutation(addNote(caseData.id, html), 'Internal note saved.');
  }, [caseData, showToast, withMutation]);

  /* ---- clipboard helper (used by Related cases "Link" button) ----
   * Falls back to a hidden <textarea> + execCommand when the async
   * Clipboard API is unavailable (older browsers, insecure contexts).
   * Always resolves — the caller shows a toast on either branch. */
  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the textarea fallback below */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyCaseLink = useCallback(
    async (relatedCaseId: string) => {
      const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(relatedCaseId)}`;
      const ok = await copyText(url);
      showToast(
        ok
          ? `Link to ${relatedCaseId} copied to clipboard.`
          : `Could not copy link. URL: ${url}`,
        ok ? 'success' : 'error',
      );
    },
    [copyText, showToast],
  );

  /* Keep the module-scoped ref in sync with the latest handler so
   * the hoisted RelatedCasesRowTemplate (stable function identity)
   * can still reach the current handleCopyCaseLink via the ref. */
  useEffect(() => {
    relatedCasesCopyRef.current = handleCopyCaseLink;
  }, [handleCopyCaseLink]);

  /* Memoized RTE toolbar config.
   * Scoped to the operations a support agent actually needs when
   * typing a customer reply — inline formatting, lists, link,
   * inline image, source view, undo/redo, clear format. We use the
   * default 'Expand' type so the row collapses gracefully on
   * narrow viewports. */
  const composerToolbar = useMemo<ToolbarSettingsModel>(
    () => ({
      type: ToolbarType.Expand,
      items: [
        'Bold',
        'Italic',
        'Underline',
        'StrikeThrough',
        '|',
        'Formats',
        'Alignments',
        'OrderedList',
        'UnorderedList',
        'Outdent',
        'Indent',
        '|',
        'CreateLink',
        'Image',
        '|',
        'ClearFormat',
        'SourceCode',
        '|',
        'Undo',
        'Redo',
      ],
    }),
    [],
  );

  /* Memoized dataSource for the right-sidebar related-cases list.
   * ListView checks array identity to decide whether to re-render
   * rows, so we hand it a stable reference tied to caseData.relatedCases. */
  const relatedCasesData = useMemo(
    () =>
      caseData?.relatedCases.map(
        (rc: { id: string; priority: 'p1' | 'p2' | 'p3' | 'p4'; title: string; sub: string }) => ({
          id: rc.id,
          priority: rc.priority,
          title: rc.title,
          sub: rc.sub,
        }),
      ) ?? [],
    [caseData?.relatedCases],
  );

  const isUnknownCase =
    caseId !== undefined &&
    caseId !== null &&
    (!listLoading || caseList.length > 0) &&
    !caseList.some((c: CaseListItem) => c.id === caseId);

  /* ---- dialog button configs (stable via useMemo, no stale closures) ---- */
  const resolveDialogButtons = useMemo<ButtonPropsModel[]>(
    () => [
      {
        buttonModel: { content: 'Cancel', cssClass: 'e-flat' },
        click: () => setActiveDialog(null),
      },
      {
        buttonModel: {
          content: 'Confirm Resolve',
          cssClass: 'e-primary',
          isPrimary: true,
        },
        click: handleResolve,
      },
    ],
    [handleResolve],
  );

  const escalateDialogButtons = useMemo<ButtonPropsModel[]>(
    () => [
      {
        buttonModel: { content: 'Cancel', cssClass: 'e-flat' },
        click: () => setActiveDialog(null),
      },
      {
        buttonModel: {
          content: 'Escalate to Tier 3',
          cssClass: 'e-primary e-danger',
          isPrimary: true,
        },
        click: handleEscalate,
      },
    ],
    [handleEscalate],
  );

  const reassignDialogButtons = useMemo<ButtonPropsModel[]>(
    () => [
      {
        buttonModel: { content: 'Cancel', cssClass: 'e-flat' },
        click: () => setActiveDialog(null),
      },
      {
        buttonModel: {
          content: 'Reassign',
          cssClass: 'e-primary',
          isPrimary: true,
        },
        click: handleReassign,
      },
    ],
    [handleReassign],
  );

  /* ---- timeline item template (Syncfusion TimelineComponent) ----
   * Mirrors the official Timeline "template" demo at
   *   https://ej2.syncfusion.com/react/demos/#/tailwind3/timeline/template
   *
   * The template is passed to <TimelineComponent template={...}>.
   * When set, Syncfusion does NOT create its own .e-dot-item or
   * .e-opposite-content wrappers — the template must render the
   * whole item (dot + connector + content). The per-item
   * <ItemDirective content="…" dotCss="…"> values are exposed
   * via `props.item.content` / `props.item.dotCss`, but for this
   * app the generated CaseDetail owns the timeline array, so we use
   * `props.itemIndex` to look up the matching event in caseData.
   *
   * Structure:
   *   .template-container (flex row)
   *     .progress-line  (dot column; ::after draws the connector)
   *       .indicator    (the colored dot circle with the lucide icon)
   *     .timeline-content
   *       <article class="cases-timeline-card">…</article>
   */
  const timelineItemTemplate = useCallback(
    (props: { itemIndex: number }) => {
      const ev = caseData?.timeline[props.itemIndex];
      if (!ev) return null;
      return (
        <div className="template-container">
          <div className="progress-line">
            <span
              className={`indicator kind-${ev.kind}`}
              aria-hidden="true"
            >
              {timelineDotIcon(ev.kind)}
            </span>
          </div>
          <div className="timeline-content">
            <article className="cases-timeline-card rounded-md border border-border bg-surface-2 p-md">
              <div className="flex items-center justify-between gap-sm mb-xs">
                <span className="inline-flex items-center gap-xs text-sm font-semibold text-text">
                  {ev.author}
                </span>
                <time className="text-xs text-text-subtle">{ev.time}</time>
              </div>
              <p className="text-sm text-text">{ev.body}</p>

              {ev.attachment && (
                <div className="flex gap-xs flex-wrap mt-sm">
                  <Chip label={ev.attachment.name} tone={ev.attachment.tone} />
                </div>
              )}

              {ev.chips && ev.chips.length > 0 && (
                <div className="flex gap-xs flex-wrap mt-sm">
                  {ev.chips.map(
                    (
                      c: { label: string; tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' },
                      ci: number,
                    ) => (
                      <Chip key={ci} label={c.label} tone={c.tone} />
                    ),
                  )}
                </div>
              )}
            </article>
          </div>
        </div>
      );
    },
    [caseData?.timeline],
  );

  /* Lucide icon for the per-event dot, picked by event kind. */
  const timelineDotIcon = (kind: GeneratedTimelineEvent['kind']) => {
    switch (kind) {
      case 'system':
        return <CircleDot size={14} strokeWidth={2.5} />;
      case 'customer':
        return <UserPlus size={14} strokeWidth={2} />;
      case 'agent':
        return <UserPlus size={14} strokeWidth={2} />;
      case 'note':
        return <FileText size={14} strokeWidth={2} />;
    }
  };

  /* Per-item `cssClass` used to colour the dot. The matching CSS
   * rules (in index.css under `.cases-timeline`) set `--dot-color`
   * on `.indicator.kind-*` so the dot is filled with the right
   * colour. */
  const timelineKindCssClass = (kind: GeneratedTimelineEvent['kind']) => {
    return `kind-${kind}`;
  };

  /* ================================================================ *
   *  JSX
   * ================================================================ */

  /** Case selector options — populated from live case list. */
  const caseSelectorOptions = useMemo(
    () => caseList.map((c) => ({ value: c.id, text: c.id })),
    [caseList],
  );

  const handleCaseSelect = (args: { value: string }) => {
    const selected = args?.value?.trim();
    if (selected && selected !== caseData?.id) {
      navigate(`/cases?id=${encodeURIComponent(selected.replace(/^#/, ''))}`);
    }
  };

  return (
    <>
      <ToastComponent
        ref={toastRef}
        position={{ X: 'Right', Y: 'Bottom' }}
        showCloseButton
        timeOut={3500}
      />

      {casesLoading && caseData && (
        <div
          className="fixed top-md right-md z-40 px-md py-sm rounded-md bg-surface border border-border shadow-md text-sm text-text-muted pointer-events-none"
          role="status"
          aria-live="polite"
        >
          Loading case details…
        </div>
      )}

      {/* Pure loading — no prior case data to show yet. */}
      {casesLoading && !caseData && (
        <section className="flex flex-col gap-lg w-full mx-auto py-xl px-0">
          <div className="flex flex-col gap-sm text-text-subtle">
            <p className="text-sm">Loading case details…</p>
          </div>
        </section>
      )}

      {/* Error path — no usable data. */}
      {!casesLoading && (casesError || !caseData) && (
        <section className="flex flex-col gap-lg w-full mx-auto py-xl px-0">
          <p className="text-sm text-error">
            {casesError ?? 'Unable to load case details.'}
          </p>
        </section>
      )}

      {/* Full case-detail UI — gated on having data. */}
      {caseData && !casesError && (
        <section
          aria-labelledby="cases-heading"
          className="flex flex-col gap-lg w-full mx-auto py-xl px-0"
        >

      {/* ========================================================== *
       *  Case header
       * ========================================================== */}
      <header className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          {/* Metadata row */}
          <div className="flex items-center gap-sm text-sm text-text-subtle mb-xs flex-wrap">
            <PriorityDot level={caseData.priority} />
            <span className="text-text-muted font-medium">
              {caseData.priorityLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>{caseData.category}</span>
            <span aria-hidden="true">·</span>
            <span>Opened {caseData.opened}</span>
            <span aria-hidden="true">·</span>
            <span>via {caseData.channel}</span>
          </div>

          <h1
            id="cases-heading"
            className="text-3xl font-bold leading-tight tracking-tight text-text mb-xs"
          >
            {caseData.title}
          </h1>
          <p className="text-sm text-text-muted">{caseData.subtitle}</p>
        </div>

        {/* Active case switcher — top-right, elevated card */}
        <div
          className="cases-active-case-card"
          aria-label="Active case switcher"
        >
          <span className="cases-active-case-card__label">Active case</span>
          <DropDownListComponent
            dataSource={caseSelectorOptions}
            value={caseData.id}
            change={handleCaseSelect}
            placeholder="Select case"
            width="220px"
            cssClass="e-outline"
          />
        </div>
      </header>

      {/* Case action toolbar */}
      <div className="flex items-center gap-sm flex-wrap">
        <ButtonComponent cssClass="e-flat">
          <span className="inline-flex items-center gap-xs">
            <Link2 size={14} aria-hidden="true" />
            Merge case
          </span>
        </ButtonComponent>
        <ButtonComponent onClick={() => setActiveDialog('escalate')}>
          <span className="inline-flex items-center gap-xs">
            <AlertTriangle size={14} aria-hidden="true" />
            Escalate
          </span>
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-primary"
          onClick={() => setActiveDialog('resolve')}
        >
          <span className="inline-flex items-center gap-xs">
            <Check size={14} aria-hidden="true" />
            Resolve
          </span>
        </ButtonComponent>
      </div>

      {/* ========================================================== *
       *  Two-column grid
       * ========================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-md items-start">
        {/* ==========================================================
         *  LEFT COLUMN
         * ========================================================== */}
        <div className="flex flex-col gap-md min-w-0">
          {/* ---------- Interaction timeline ---------- */}
          <section
            className="rounded-lg border border-border bg-surface p-lg"
            aria-labelledby="timeline-heading"
          >
            <div className="mb-md">
              <h2
                id="timeline-heading"
                className="text-sm font-semibold text-text"
              >
                Interaction timeline
              </h2>
              <p className="text-xs text-text-subtle">
                Messages, status changes, notes, and handoffs
              </p>
            </div>

            <TimelineComponent
              orientation="Vertical"
              align="After"
              cssClass="cases-timeline"
              template={timelineItemTemplate}
            >
              <ItemsDirective>
                {caseData.timeline.map(
                  (
                    ev: GeneratedTimelineEvent,
                    i: number,
                  ) => (
                    <ItemDirective
                      key={i}
                      dotCss={timelineKindCssClass(ev.kind)}
                      content={ev.body}
                    />
                  ),
                )}
              </ItemsDirective>
            </TimelineComponent>
          </section>

          {/* ---------- Reply composer ---------- */}
          <section
            className="rounded-lg border border-border bg-surface p-lg"
            aria-labelledby="composer-heading"
          >
            <div className="mb-md">
              <h2
                id="composer-heading"
                className="text-sm font-semibold text-text"
              >
                Reply to customer
              </h2>
              <p className="text-xs text-text-subtle">
                Canned responses, formatting, attachments, and send controls
              </p>
            </div>

            <div className="flex flex-col gap-md">
              {/* Reply composer — Syncfusion RichTextEditorComponent.
                  Toolbar, inline formatting, link, image, undo/redo,
                  source view, and character count are all provided by
                  the editor's own toolbar; the native icon-button row
                  that used to sit above the textarea has been removed.
                  The `change` event fires on focus-out (see the
                  editor-value reference); we also listen to `input`
                  for per-keystroke parity with the old textarea so
                  the reply text stays in sync with the editor. */}
              <RichTextEditorComponent
                id="cases-reply-rte"
                value={replyText}
                /* RTE `change` is content-driven (fires per user
                 * modification) and `args.value` is the full HTML
                 * string, so the existing replyRef mirror stays
                 * current without any per-keystroke fallback. */
                change={(e: ChangeEventArgs) => {
                  setReplyText(e.value ?? '');
                }}
                placeholder="Write a reply…"
                cssClass="e-rte-cases"
                height={220}
                toolbarSettings={composerToolbar}
                showCharCount
                maxLength={5000}
                enableHtmlSanitizer
              >
                <Inject
                  services={[
                    Toolbar,
                    HtmlEditor,
                    RichTextLink,
                    Image,
                    QuickToolbar,
                    Count,
                  ]}
                />
              </RichTextEditorComponent>

              {/* Footer actions — inline Syncfusion UploaderComponent
                  in place of the previous "Attach" button. The
                  Uploader manages its own Browse / file-list / Clear
                  chrome, so the wrapper button that used to open the
                  Attach dialog is gone. Files are uploaded via
                  `asyncSettings.saveUrl`; on success the file list
                  reflects the server response automatically. */}
              <UploaderComponent
                ref={uploaderRef}
                id="cases-attach-uploader"
                /* The React wrapper renders the Uploader as a plain
                  * `<input>`, and the underlying Uploader class
                  * never sets a default `type` on the element.
                  * Without an explicit `type="file"` here, the
                  * input defaults to `type="text"`, and clicking
                  * the Browse button calls `this.element.click()`
                  * on a text input — which never opens a system
                  * file picker. `type` is in the wrapper's
                  * `defaulthtmlkeys`, so it gets forwarded to the
                  * rendered `<input>` as an HTML attribute. */
                type="file"
                asyncSettings={attachmentAsyncSettings}
                autoUpload
                multiple
                sequentialUpload={false}
                allowedExtensions=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.json,.zip"
                maxFileSize={25 * 1024 * 1024}
                success={handleAttachmentSuccess}
                failure={handleAttachmentFailure}
              />
              <div className="flex items-center justify-end w-full gap-sm">
                <ButtonComponent cssClass="e-flat" onClick={handleSaveAsNote}>
                  <span className="inline-flex items-center gap-xs">
                    Save as note
                  </span>
                </ButtonComponent>
                <ButtonComponent
                  cssClass="e-primary"
                  onClick={handleSendReply}
                >
                  <span className="inline-flex items-center gap-xs">
                    <Send size={14} aria-hidden="true" />
                    Send reply
                  </span>
                </ButtonComponent>
              </div>
            </div>
          </section>

          {/* ---------- Sub-tabs: Internal Notes / Related Cases / Handoff ---------- */}
          <section
            className="rounded-lg border border-border bg-surface"
            aria-labelledby="subtab-section-heading"
          >
            <TabComponent>
              <TabItemsDirective>
                <TabItemDirective
                  key="internal-notes"
                  header={{ text: 'Internal notes' }}
                  content={() => (
                    <div className="p-lg flex flex-col gap-sm">
                      <h3
                        id="subtab-section-heading"
                        className="text-sm font-semibold text-text mb-sm"
                      >
                        Internal notes
                      </h3>
                      {caseData.internalNotes.map(
                        (
                          note: {
                            initials: string;
                            name: string;
                            role: string;
                            body: string;
                            chips?: { label: string; tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }[];
                          },
                          i: number,
                        ) => (
                          <article
                            key={i}
                            className="p-md border border-border rounded-md bg-surface-2"
                          >
                            <div className="flex items-center justify-between gap-sm mb-xs">
                              <div className="flex items-center gap-sm">
                                <Avatar initials={note.initials} />
                                <div>
                                  <div className="text-sm font-semibold text-text">
                                    {note.name}
                                  </div>
                                  <div className="text-xs text-text-subtle">
                                    {note.role}
                                  </div>
                                </div>
                              </div>
                              <Chip label="Private" tone="success" />
                            </div>
                            <p className="text-sm text-text">{note.body}</p>
                            {note.chips && note.chips.length > 0 && (
                              <div className="flex gap-xs flex-wrap mt-sm">
                                {note.chips.map(
                                  (
                                    c: {
                                      label: string;
                                      tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
                                    },
                                    ci: number,
                                  ) => (
                                    <Chip
                                      key={ci}
                                      label={c.label}
                                      tone={c.tone}
                                    />
                                  ),
                                )}
                              </div>
                            )}
                          </article>
                        ),
                      )}
                    </div>
                  )}
                />
               
                <TabItemDirective
                  key="handoff"
                  header={{ text: 'Handoff' }}
                  content={() => (
                    <div className="p-lg text-center text-text-muted">
                      <p className="text-sm">
                        No handoff history for this case yet. Use{' '}
                        <strong>Reassign</strong> or{' '}
                        <strong>Escalate</strong> to transfer ownership.
                      </p>
                    </div>
                  )}
                />
              </TabItemsDirective>
            </TabComponent>
          </section>
        </div>

        {/* ==========================================================
         *  RIGHT COLUMN
         * ========================================================== */}
        <aside
          className="flex flex-col gap-md min-w-0"
          aria-label="Case context"
        >
          {/* ---------- Customer profile ----------
           * Built on the Syncfusion Card component (pure-CSS, no JS
           * instance) so the chrome — rounded corners, divider, header
           * title — comes from the Tailwind3 theme tokens, while the
           * spacing / typography utilities stay Tailwind so the card
           * sits flush with the other case-context panels. The
           * `.e-card-separator` element draws the line between the
           * profile block and the metadata grid. */}
          <div
            className="e-card e-card-vertical rounded-lg"
            role="region"
            aria-labelledby="profile-heading"
          >
            <div className="e-card-header">
              <div className="e-card-header-caption">
                <div
                  id="profile-heading"
                  className="e-card-header-title text-sm font-semibold text-text"
                >
                  Customer profile
                </div>
              </div>
            </div>

            <div className="e-card-content p-lg pt-0">
              <div className="flex gap-md mb-md">
                <Avatar initials={caseData.customer.initials} large />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-text mb-xs">
                    {caseData.customer.name}
                  </p>
                  <div className="flex flex-wrap gap-xs gap-y-0 text-sm text-text-muted">
                    <span>{caseData.customer.email}</span>
                    <span>{caseData.customer.phone}</span>
                  </div>
                  <div className="flex gap-xs mt-xs flex-wrap">
                    <Chip label={caseData.customer.plan} tone="info" />
                    <Chip label={caseData.customer.csat} tone="success" />
                    <Chip label={caseData.customer.since} tone="neutral" />
                  </div>
                </div>
              </div>

              <div className="e-card-separator" />

              <div className="grid grid-cols-2 gap-sm pt-md">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-subtle uppercase tracking-wide">
                    Account ID
                  </span>
                  <span className="text-sm font-medium text-text">
                    {caseData.customer.accountId}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-subtle uppercase tracking-wide">
                    Success manager
                  </span>
                  <span className="text-sm font-medium text-text">
                    {caseData.customer.successManager}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-subtle uppercase tracking-wide">
                    Last contact
                  </span>
                  <span className="text-sm font-medium text-text">
                    {caseData.customer.lastContact}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-subtle uppercase tracking-wide">
                    Open cases
                  </span>
                  <span className="text-sm font-medium text-text">
                    {caseData.customer.openCases}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- SLA timers ---------- */}
          <section
            className="rounded-lg border border-border bg-surface p-lg"
            aria-labelledby="sla-heading"
          >
            <h2
              id="sla-heading"
              className="text-sm font-semibold text-text mb-md"
            >
              SLA timers
            </h2>

            <div className="flex flex-col gap-md">
              {caseData.slas.map(
                (
                  sla: {
                    label: string;
                    deadlineMs: number;
                    tag: string;
                    tagTone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
                  },
                  i: number,
                ) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-sm border-b border-border last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-text-subtle uppercase tracking-wide">
                        {sla.label}
                      </p>
                      <SlaTimerDisplay deadlineMs={sla.deadlineMs} />
                    </div>
                    <Chip label={sla.tag} tone={sla.tagTone} />
                  </div>
                ),
              )}

              {/* SLA policy row */}
              <div className="flex items-center justify-between py-sm">
                <div className="min-w-0">
                  <p className="text-xs text-text-subtle uppercase tracking-wide">
                    Policy
                  </p>
                  <p className="text-sm font-medium text-text">
                    {caseData.slaPolicy.name}
                  </p>
                </div>
                <Chip
                  label={caseData.slaPolicy.badge}
                  tone={caseData.slaPolicy.badgeTone}
                />
              </div>
            </div>
          </section>

          {/* ---------- Assignment ---------- */}
          <section
            className="rounded-lg border border-border bg-surface p-lg"
            aria-labelledby="team-heading"
          >
            <h2
              id="team-heading"
              className="text-sm font-semibold text-text mb-md"
            >
              Assignment
            </h2>

            <div className="flex flex-col gap-md">
              <div className="flex items-center gap-md">
                <Avatar initials={caseData.agent.initials} />
                <div className="min-w-0">
                  <p className="text-md font-semibold text-text">
                    {caseData.agent.name}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {caseData.agent.tier} · {caseData.agent.role}
                  </p>
                </div>
              </div>

              <div className="flex gap-sm">
                <ButtonComponent
                  cssClass="flex-1"
                  onClick={() => setActiveDialog('reassign')}
                >
                  <span className="inline-flex items-center gap-xs">
                    <Users size={14} aria-hidden="true" />
                    Reassign
                  </span>
                </ButtonComponent>
                <ButtonComponent cssClass="flex-1">
                  <span className="inline-flex items-center gap-xs">
                    <Eye size={14} aria-hidden="true" />
                    Watch
                  </span>
                </ButtonComponent>
              </div>
            </div>
          </section>

          {/* ---------- Related cases (right sidebar) ----------
           *
           * Syncfusion ListViewComponent so the row template
           * (PriorityDot + id + title + sub + Link2 action button)
           * inherits the same hover/focus/dividers as the activity
           * feed. The Link2 button stops propagation and calls
           * `handleCopyCaseLink` (wired through the
           * `relatedCasesCopyRef` indirection above) — that copies
           * a deep link to the related case to the clipboard and
           * surfaces a success/error toast. */}
          <section
            className="rounded-lg border border-border bg-surface"
            aria-labelledby="related-heading"
          >
            <div className="flex items-center justify-between p-md px-lg border-b border-border">
              <h2
                id="related-heading"
                className="text-sm font-semibold text-text"
              >
                Related cases
              </h2>
            </div>

            <ListViewComponent
              id="related-cases-list"
              dataSource={relatedCasesData}
              fields={{ id: 'id' }}
              cssClass="related-cases-list"
              showCheckBox={false}
              template={RelatedCasesRowTemplate}
            />
          </section>
        </aside>
      </div>

      {/* ========================================================== *
       *  Dialogs
       *
       *  CRITICAL (per repo memory):
       *  Never conditionally render children of DialogComponent.
       *  Always keep a stable wrapper div so React reuses the same
       *  DOM node; the conditional is inside the wrapper.
       * ========================================================== */}

      {/* Resolve confirmation */}
      <DialogComponent
        header="Resolve Case"
        visible={activeDialog === 'resolve'}
        showCloseIcon
        close={() => setActiveDialog(null)}
        buttons={resolveDialogButtons}
        width="440px"
      >
        <div>
          <p className="text-sm text-text-muted">
            Are you sure you want to resolve case{' '}
            <strong>{caseData.id}</strong>? This will close the case and
            notify the customer.
          </p>
        </div>
      </DialogComponent>

      {/* Escalate confirmation */}
      <DialogComponent
        header="Escalate Case"
        visible={activeDialog === 'escalate'}
        showCloseIcon
        close={() => setActiveDialog(null)}
        buttons={escalateDialogButtons}
        width="440px"
      >
        <div>
          <p className="text-sm text-text-muted">
            Escalate <strong>{caseData.id}</strong> to Tier 3 Engineering?
            The current assignee will be notified and the SLA will be
            recalculated.
          </p>
        </div>
      </DialogComponent>

      {/* Reassign confirmation */}
      <DialogComponent
        header="Reassign Case"
        visible={activeDialog === 'reassign'}
        showCloseIcon
        close={() => setActiveDialog(null)}
        buttons={reassignDialogButtons}
        width="440px"
      >
        <div>
          <p className="text-sm text-text-muted">
            Reassign <strong>{caseData.id}</strong> to a new agent? The
            current assignee will be notified.
          </p>
        </div>
      </DialogComponent>

        </section>
      )}
    </>
  );
}
