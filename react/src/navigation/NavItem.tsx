import type { KeyboardEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { NavItem as NavItemType } from './navItems';

interface NavItemProps {
  item: NavItemType;
  collapsed?: boolean;
}

/**
 * Renders a single nav item.
 *
 * - Pure React + Tailwind utilities. No Syncfusion primitives.
 * - When `item.inert` is true, the item renders as a disabled-looking link
 *   and does not navigate.
 * - The active item receives `aria-current="page"` and primary styling.
 * - Keyboard support: Tab focuses the element, Enter/Space activates it.
 *   React Router's `<NavLink>` already gives us correct <a> semantics,
 *   href, middle-click / cmd-click ("open in new tab"), and focus rings,
 *   so we only intercept plain left-clicks to keep cursor-state behaviour
 *   identical to the previous implementation.
 */
export function NavItem({ item, collapsed = false }: NavItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive =
    !item.inert && location.pathname === item.hash;

  const handleNavigate = () => {
    if (item.inert) return;
    navigate(item.hash);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (item.inert) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNavigate();
    }
  };

  const labelId = `nav-${item.id}-label`;
  const Icon = item.icon;

  // Inert items render as plain disabled-styled <span>s so they don't
  // pretend to be linkable (no href, no role="link", not in the tab order).
  if (item.inert) {
    return (
      <span
        role="presentation"
        aria-disabled="true"
        aria-label={collapsed ? item.label : undefined}
        aria-labelledby={collapsed ? undefined : labelId}
        className={[
          'group flex items-center gap-md rounded-md',
          collapsed ? 'justify-center px-xs py-sm' : 'px-md py-sm',
          'text-md font-medium text-text-subtle cursor-not-allowed',
        ].join(' ')}
      >
      <span
        className="shrink-0 flex items-center justify-center text-current"
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      {!collapsed && (
        <>
          <span id={labelId} className="flex-1 truncate">
            {item.label}
          </span>
        </>
      )}
    </span>
  );
  }

  return (
    <NavLink
      to={item.hash}
      end={false}
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      aria-labelledby={collapsed ? undefined : labelId}
      onClick={(e) => {
        // Keep native middle-click / cmd-click ("open in new tab")
        // working by only intercepting plain left-clicks without
        // modifier keys — matches the prior <a> + preventDefault
        // behaviour.
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
        handleNavigate();
      }}
      onKeyDown={handleKeyDown}
      className={[
        'group flex items-center gap-md rounded-md',
        collapsed ? 'justify-center px-xs py-sm' : 'px-md py-sm',
        'text-md font-medium',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        isActive
          ? 'bg-primary text-text-on-primary'
          : 'text-text-muted hover:bg-surface-2 hover:text-text',
        'transition-colors',
      ].join(' ')}
    >

      <span
        className="shrink-0 flex items-center justify-center text-current"
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      {!collapsed && (
        <>
          <span id={labelId} className="flex-1 truncate">
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}
