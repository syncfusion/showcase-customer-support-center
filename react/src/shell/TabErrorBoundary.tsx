import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Error boundary that wraps the active tab's content inside
 * `<AppShell>`'s `<main>`.
 *
 * Why this exists
 * ---------------
 * Syncfusion widgets (Toast, RichTextEditor, DropDownList popup,
 * etc.) occasionally portal a DOM node out of the React-tracked
 * subtree — for example, `Toast.show()` moves the toast container
 * onto `document.body` with `position: fixed`. When React then
 * unmounts the tab, `commitDeletionEffectsOnFiber` walks the
 * fiber tree and calls `parent.removeChild(child)` for every
 * tracked node. If the child has been portaled away, the DOM
 * parent no longer owns it as a child and the call throws
 * `NotFoundError: Failed to execute 'removeChild' on 'Node':
 * The node to be removed is not a child of this node.`
 *
 * React's commit phase is not wrapped in try/catch — a throw
 * there aborts the root and drops the entire `#root` subtree,
 * which paints a fully-blank screen. The boundary below
 * catches the throw as React tears down the previous tab and
 * lets the next tab render normally.
 *
 * What it does
 * ------------
 * - On error, swaps the tab content for a small "Could not
 *   render this tab" panel with a "Reset" button that clears
 *   the boundary's internal state and re-mounts the tab.
 * - Logs the error to `console.error` so it still shows up in
 *   dev tools (the default behaviour of `getDerivedStateFromError`
 *   is to log a warning only).
 * - The remaining shell (Sidebar, Topbar) stays mounted, so
 *   the user can immediately navigate to a different tab
 *   without refreshing the page.
 *
 * Note: this is React's standard class-based error boundary —
 * `useErrorBoundary` does not exist yet as a hook, and the
 * `react-error-boundary` package is not a dependency here.
 */
interface TabErrorBoundaryProps {
  children: ReactNode;
  /** Optional route key used in the recovery panel. */
  route?: string;
}

interface TabErrorBoundaryState {
  error: Error | null;
}

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Dev-mode log of the same shape `console.error` would emit on an
    // unhandled error boundary, with the component stack attached so
    // the offending widget is identifiable.
    // eslint-disable-next-line no-console
    console.error(
      '[TabErrorBoundary] Caught a render/unmount error:',
      error,
      info.componentStack,
    );
  }

  /** Reset button — clears the error and re-mounts the children. */
  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const route = this.props.route ?? 'this tab';
    return (
      <section
        role="alert"
        aria-labelledby="tab-error-heading"
        className="flex flex-col gap-md max-w-2xl mx-auto p-xl"
      >
        <div className="flex items-center gap-md text-danger">
          <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
          <h1
            id="tab-error-heading"
            className="text-xl font-semibold text-text m-0"
          >
            Could not render {route}
          </h1>
        </div>
        <p className="text-sm text-text-muted m-0">
          A Syncfusion widget inside this tab tore down its DOM in a
          way React couldn't reconcile when navigating. The rest of the
          app is still working — pick another tab from the sidebar, or
          try again below.
        </p>
        <div className="rounded-md border border-border bg-surface-2 p-md font-mono text-xs text-text-muted whitespace-pre-wrap break-words max-h-48 overflow-auto">
          {error.message}
        </div>
        <div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-xs px-md py-sm rounded-md bg-primary text-text-on-primary text-sm font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }
}