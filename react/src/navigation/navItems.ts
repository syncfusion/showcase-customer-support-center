import {
  BookOpen,
  Clock,
  Folder,
  LayoutDashboard,
  List,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavGroupId = 'operate' | 'manage';

export interface NavItem {
  /** Stable id used as React `key` and route fragment. */
  id: string;
  /** Human-readable label shown in the sidebar. */
  label: string;
  /** Route hash without the leading `#` (e.g. `/queue`). */
  hash: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Group the item belongs to. */
  group: NavGroupId;
  /** Optional badge text. When omitted, no badge is rendered. */
  badge?: string;
  /** When true, the item is rendered but does not navigate. */
  inert?: boolean;
}

export const OPERATE_NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    id: 'overview',
    label: 'Overview',
    hash: '/overview',
    icon: LayoutDashboard,
    group: 'operate',
  },
  {
    id: 'queue',
    label: 'Queue',
    hash: '/queue',
    icon: List,
    group: 'operate',
    badge: '32',
  },
  {
    id: 'cases',
    label: 'Cases',
    hash: '/cases',
    icon: Folder,
    group: 'operate',
  },
  {
    id: 'automation',
    label: 'Automation',
    hash: '/automation',
    icon: Settings,
    group: 'operate',
  },
];

export const MANAGE_NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    id: 'teams',
    label: 'Teams',
    hash: '#',
    icon: Users,
    group: 'manage',
    inert: true,
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    hash: '#',
    icon: BookOpen,
    group: 'manage',
    inert: true,
  },
  {
    id: 'schedules',
    label: 'Schedules',
    hash: '#',
    icon: Clock,
    group: 'manage',
    inert: true,
  },
];

export const ALL_NAV_ITEMS: ReadonlyArray<NavItem> = [
  ...OPERATE_NAV_ITEMS,
  ...MANAGE_NAV_ITEMS,
];

/** Return the pathname without query parameters (e.g. `/cases?id=1` → `/cases`). */
function stripQuery(path: string): string {
  return path.split('?')[0];
}

/**
 * Convert a route pathname to the matching `NavItem.id`, or `null`.
 *
 * Accepts both browser-router pathnames (e.g. `/queue`) and legacy
 * hash-style routes (e.g. `#/queue`) so the Topbar breadcrumb keeps
 * working during the migration window. New callers should pass
 * `location.pathname` directly.
 */
export function findNavItemIdByRoute(route: string): string | null {
  const normalized = stripQuery(route.replace(/^#/, ''));
  const match = ALL_NAV_ITEMS.find((item) => item.hash === normalized);
  return match ? match.id : null;
}
