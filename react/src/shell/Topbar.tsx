import { useState } from 'react';
import { SidebarComponent } from '@syncfusion/ej2-react-navigations';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { ALL_NAV_ITEMS, findNavItemIdByRoute } from '../navigation/navItems';
import { Sidebar } from './Sidebar';

interface TopbarProps {
  onMenuToggle?: (open: boolean) => void;
}

function currentLabel(route: string): string {
  const id = findNavItemIdByRoute(route);
  if (!id) return 'Overview';
  return ALL_NAV_ITEMS.find((i) => i.id === id)?.label ?? 'Overview';
}

/**
 * Topbar with breadcrumbs and a mobile menu button.
 *
 * The mobile menu button toggles a Syncfusion `<SidebarComponent>` drawer
 * — the one place in the shell where Syncfusion is justified (focus
 * trapping, escape-to-close, overlay behavior).
 */
export function Topbar({ onMenuToggle }: TopbarProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    onMenuToggle?.(true);
  };
  const handleClose = () => {
    setOpen(false);
    onMenuToggle?.(false);
  };

  return (
    <header
      className={[
        // z-30 keeps the topbar above any in-content overlays (e.g.
        // portalled Syncfusion widgets), but `sticky` is no longer
        // needed — the app shell is locked to `h-screen` (see
        // AppShell.tsx), so the topbar is naturally pinned at the top
        // of the content flex column.
        'shrink-0 z-30',
        'h-[var(--topbar-height)]',
        'flex items-center gap-md',
        'px-lg',
        'bg-surface border-b border-border',
      ].join(' ')}
    >
      {/* Mobile menu button (visible < 900px) */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open navigation"
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Menu size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex-1 min-w-0">
        <ol className="flex items-center gap-xs text-sm list-none p-0 m-0">
          <li className="text-text-muted">Operate</li>
          <li className="text-text-subtle" aria-hidden="true">
            /
          </li>
          <li
            className="text-text font-semibold truncate"
            aria-current="page"
          >
            {currentLabel(location.pathname)}
          </li>
        </ol>
      </nav>

      {/* Syncfusion off-canvas drawer for mobile.
          Hidden on viewports >= 900px (where the persistent <Sidebar /> in
          AppShell is shown instead). The wrapper container is `display: none`
          on desktop — the Syncfusion widget itself renders
          `position: fixed; left: 0` regardless of `isOpen`, so the only
          reliable way to keep it off the desktop layout is to take the
          wrapper out of the visual tree entirely.

          The wrapper is given `position: relative; z-index: 1100` so the
          drawer (and its content) lives in its own stacking context above
          the backdrop overlay. The Syncfusion backdrop is appended to
          `document.body` with `z-index: 999` — without the explicit wrapper
          z-index, the backdrop can sit on top of the drawer and intercept
          clicks on the nav items, making them unclickable. */}
      <div
        className="mobile-nav-drawer-wrapper hidden max-[899px]:block max-[899px]:relative max-[899px]:z-[1100]"
        aria-hidden="true"
      >
        <SidebarComponent
          id="mobile-nav-drawer"
          isOpen={open}
          closeOnDocumentClick
          showBackdrop
          position="Left"
          width="248px"
          zIndex={1100}
          close={handleClose}
        >
          <Sidebar />
        </SidebarComponent>
      </div>
    </header>
  );
}
