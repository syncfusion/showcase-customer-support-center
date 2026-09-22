import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TabErrorBoundary } from './TabErrorBoundary';
import { OverviewTab } from './tabs/OverviewTab';
import { QueueTab } from './tabs/QueueTab';
import { CasesTab } from './tabs/CasesTab';
import { AutomationTab } from './tabs/AutomationTab';
import { InsightsTab } from './tabs/InsightsTab';

/**
 * Application shell.
 *
 * Layout is a fixed-height row (matches the HR Workforce Planning app).
 * `#app-shell` is locked to the full viewport (`h-screen`), so the whole
 * page is bounded and only the `<main>` content area scrolls — the
 * sidebar (top→bottom) and the topbar (left→right) stay pinned in place.
 * The persistent desktop sidebar is a Syncfusion
 * `<SidebarComponent type="Auto">` which switches to `Push` on ≥ 900px
 * viewports (reserving its own column) and to `Over` on smaller
 * viewports (floating on top, no column reserved). The mobile drawer in
 * `Topbar` is a separate `<SidebarComponent type="Over">` instance that
 * re-uses the same `<Sidebar />` JSX as its children, so we never nest
 * Syncfusion Sidebar inside Syncfusion Sidebar.
 */
export function AppShell() {
  const location = useLocation();
  const path = location.pathname || '/overview';
  const mainRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(path);

  /**
   * Mirrors the desktop sidebar docked/expanded state. The shell uses
   * this value to drive a CSS custom property that resizes the adjacent
   * main content area so the screen adjusts smoothly on expand/collapse.
   */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (previousPathRef.current !== path) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      previousPathRef.current = path;
    }
  }, [path]);

  return (
    <div
      id="app-shell"
      className={[
        // h-screen keeps the entire shell bounded to the viewport so the
        // sidebar stays fixed (in-flow via the flex row below) and only
        // <main> scrolls. min-h-0 lets the right column actually shrink
        // to its flex-basis so overflow-y on the inner <main> kicks in
        // instead of pushing the shell taller than the viewport.
        'h-screen min-h-0 overflow-hidden flex bg-bg text-text',
        sidebarCollapsed ? 'app-shell--sidebar-collapsed' : '',
      ].join(' ')}
      style={{
        ['--sidebar-current-width' as string]: sidebarCollapsed
          ? 'var(--sidebar-dock-width)'
          : 'var(--sidebar-width)',
      }}
    >
      {/* Skip link — visible on focus, jumps to <main id="main"> */}
      <a
        href="#main"
        className="sr-only sr-only-focusable fixed top-md left-md z-50 bg-surface text-text px-md py-sm rounded-md border border-border shadow-md"
      >
        Skip to main content
      </a>

      {/* Persistent desktop / tablet sidebar. On < 900px the
          Syncfusion widget switches to `Over` and renders fixed
          with a backdrop; on ≥ 900px it switches to `Push` and
          reserves its own column so the <main> below sits beside
          it. */}
      <Sidebar
        className="app-sidebar--persistent"
        collapsed={sidebarCollapsed}
        onToggle={setSidebarCollapsed}
      />

      <div id="app-shell-content" className="flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden bg-bg">
        <Topbar />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-md"
        >
          <TabErrorBoundary
            key={path}
            route={path}
          >
            <Routes>
              <Route path="/overview" element={<OverviewTab />} />
              <Route path="/queue" element={<QueueTab />} />
              <Route path="/cases" element={<CasesTab />} />
              <Route path="/automation" element={<AutomationTab />} />
              <Route path="/insights" element={<InsightsTab />} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </TabErrorBoundary>
        </main>
      </div>
    </div>
  );
}
