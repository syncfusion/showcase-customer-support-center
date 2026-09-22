import { SidebarComponent } from '@syncfusion/ej2-react-navigations';
import { ChevronLeft, ChevronRight, LifeBuoy, Moon, Sun } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { NavItem } from '../navigation/NavItem';
import { OPERATE_NAV_ITEMS, MANAGE_NAV_ITEMS } from '../navigation/navItems';
import { useTheme } from '../theme';

export interface SidebarProps {
  /** Additional classes for the outer `<SidebarComponent>`. */
  className?: string;
  /**
   * Controlled collapsed (docked) state. When `true` the sidebar shows
   * only icons; when `false` it expands to the full design-token width.
   * If omitted, the component manages its own state.
   */
  collapsed?: boolean;
  /** Fires when the user toggles expand/collapse. */
  onToggle?: (collapsed: boolean) => void;
}

/**
 * Persistent desktop sidebar — Syncfusion `<SidebarComponent>` configured
 * like the official "Docking Sidebar" example.
 *
 * - enableDock keeps content visible in the collapsed state.
 * - dockSize is the icon-only width; width is the expanded width.
 * - The component is controlled via the `collapsed`/`onToggle` props so
 *   the shell can animate the adjacent main content in sync.
 * - type="Auto" + mediaQuery keeps the mobile drawer behavior: below 900px
 *   it renders as Over, so the Topbar drawer can host the same component.
 */
export function Sidebar({ className, collapsed: externalCollapsed, onToggle }: SidebarProps) {
  const sidebarRef = useRef<SidebarComponent | null>(null);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = externalCollapsed ?? internalCollapsed;

  const setCollapsed = useCallback(
    (next: boolean) => {
      setInternalCollapsed(next);
      onToggle?.(next);
    },
    [onToggle]
  );

  const toggleSidebar = useCallback(() => {
    sidebarRef.current?.toggle();
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const handleChange = useCallback(
    (args: { element: HTMLElement; isInteracted?: boolean }) => {
      // The Syncfusion widget adds `.e-open` when it is expanded and removes
      // it when docked or closed. Ignore the programmatic mount event so the
      // initial expanded state stays as requested by the caller.
      if (args.isInteracted === false) return;
      const nowOpen = args.element.classList.contains('e-open');
      setCollapsed(!nowOpen);
    },
    [setCollapsed]
  );

  const { theme, toggleTheme } = useTheme();
  const nextLabel =
    theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  return (
    <SidebarComponent
      id="app-sidebar"
      ref={sidebarRef}
      className={['app-sidebar', className].filter(Boolean).join(' ')}
      type="Auto"
      position="Left"
      mediaQuery="(min-width: 900px)"
      enableDock
      dockSize="60px"
      width="var(--sidebar-width)"
      isOpen={!collapsed}
      change={handleChange}
    >
      <aside
        aria-label="Primary"
        className={[
          'app-sidebar-inner',
          // h-full instead of h-screen so the inner aside always matches
          // the height of the Syncfusion wrapper, which in turn matches
          // the bounded `#app-shell` (`h-screen` + `overflow-hidden`).
          // If the wrapper ever ends up shorter than 100vh (e.g.
          // resize-zoom rounding), h-screen would still pin to the
          // viewport and cause a tiny overflow on the right column.
          'flex flex-col h-full min-h-0 w-full overflow-hidden',
          'bg-surface text-text',
          'shrink-0',
        ].join(' ')}
      >
        {/* Brand */}
        <div
          className={[
            'app-sidebar-brand',
            'flex items-center border-b border-border shrink-0',
            collapsed ? 'justify-center px-xs py-md gap-0' : 'gap-md px-md py-md',
          ].join(' ')}
        >
          <div
            className="w-8 h-8 rounded-md bg-primary text-text-on-primary flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <LifeBuoy size={18} strokeWidth={2} />
          </div>
          {!collapsed && (
            <div className="app-sidebar-brand-text flex flex-col min-w-0">
              <span className="text-md font-semibold text-text leading-tight truncate">
                Acme Support
              </span>
              <span className="text-xs text-text-muted leading-tight truncate">
                Customer Support &amp; SLA
              </span>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav
          aria-label="Primary"
          className={[
            'app-sidebar-nav',
            'flex-1 overflow-y-auto overflow-x-hidden',
            collapsed ? 'px-xs py-sm' : 'px-md py-sm',
          ].join(' ')}
        >
          <ul className="flex flex-col gap-xs list-none p-0 m-0">
            {OPERATE_NAV_ITEMS.map((item) => (
              <li key={item.id} className="relative">
                <NavItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </nav>

        {/* User footer + theme toggle */}
        <div
          className={[
            'app-sidebar-footer',
            'border-t border-border shrink-0',
            'flex flex-col',
            collapsed ? 'px-xs py-xs gap-xs items-center' : 'px-md py-md gap-sm',
          ].join(' ')}
        >
          {!collapsed && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={nextLabel}
              title={nextLabel}
              className={[
                'app-sidebar-theme',
                'flex items-center gap-md rounded-md text-md font-medium',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                'text-text-muted hover:bg-surface-2 hover:text-text',
                'transition-colors',
                'w-full px-md py-sm',
              ].join(' ')}
            >
              <span
                className="shrink-0 flex items-center justify-center"
                aria-hidden="true"
              >
                {theme === 'light' ? (
                  <Moon size={18} strokeWidth={2} />
                ) : (
                  <Sun size={18} strokeWidth={2} />
                )}
              </span>
              <span className="app-sidebar-theme-label flex-1 text-left">
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </span>
            </button>
          )}

          {collapsed && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={nextLabel}
              title={nextLabel}
              className={[
                'app-sidebar-theme',
                'inline-flex items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                'transition-colors',
                'w-10 h-10',
              ].join(' ')}
            >
              {theme === 'light' ? (
                <Moon size={18} strokeWidth={2} />
              ) : (
                <Sun size={18} strokeWidth={2} />
              )}
            </button>
          )}
        {/* Toggle */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={!collapsed ? 'Collapse sidebar' : 'Expand sidebar'}
          title={!collapsed ? 'Collapse sidebar' : 'Expand sidebar'}
          className={[
            'app-sidebar-toggle',
            'flex items-center border-t border-border shrink-0',
            'text-text-muted hover:text-text hover:bg-surface-2',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            'transition-colors',
            collapsed ? 'justify-center px-xs py-sm' : 'gap-md px-md py-sm',
          ].join(' ')}
        >
          <span className="shrink-0 flex items-center justify-center app-sidebar-toggle-icon" aria-hidden="true">
            {!collapsed ? (
              <ChevronLeft size={18} strokeWidth={2} />
            ) : (
              <ChevronRight size={18} strokeWidth={2} />
            )}
          </span>
          {!collapsed && (
            <span className="app-sidebar-toggle-label text-sm font-medium">
              {!collapsed ? 'Collapse' : 'Expand'}
            </span>
          )}
        </button>
        </div>

      </aside>
    </SidebarComponent>
  );
}
