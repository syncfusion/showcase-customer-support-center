/* ------------------------------------------------------------------ *
 *  Case detail generator
 *
 *  Builds a full case-detail record (customer profile, agent,
 *  timeline, internal notes, related cases, SLA policy) for any
 *  ticket from the queue seed data. The output reuses the layout
 *  structure defined in CasesTab but varies top-line fields based
 *  on the linked ticket.
 *
 *  Generation is deterministic per case id, so revisiting the same
 *  case always renders the same facts.
 * ------------------------------------------------------------------ */

import type React from 'react';
import {
  SEED_TICKETS,
  type Ticket,
  type PriorityKey,
  type ChannelKey,
  findTicketByCaseId,
} from './tickets';

export type { PriorityKey, ChannelKey } from './tickets';

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

type TimelineEventKind = 'system' | 'customer' | 'agent' | 'note';

export interface GeneratedTimelineEvent {
  kind: TimelineEventKind;
  author: string;
  time: string;
  body: string;
  chips?: { label: string; tone: ChipTone }[];
  attachment?: { name: string; tone: ChipTone };
}

export interface GeneratedNote {
  initials: string;
  name: string;
  role: string;
  time: string;
  body: string;
  chips?: { label: string; tone: ChipTone }[];
}

export interface GeneratedRelatedCase {
  id: string;
  priority: PriorityKey;
  title: string;
  sub: string;
}

export interface GeneratedCustomer {
  name: string;
  initials: string;
  email: string;
  phone: string;
  accountId: string;
  plan: string;
  csat: string;
  since: string;
  successManager: string;
  lastContact: string;
  openCases: number;
  emailDomain?: string;
}

export interface GeneratedAgent {
  name: string;
  initials: string;
  tier: string;
  role: string;
}

export interface GeneratedSla {
  label: string;
  deadlineMs: number;
  tag: string;
  tagTone: ChipTone;
}

export interface CaseDetail {
  id: string;
  priority: PriorityKey;
  priorityLabel: string;
  category: string;
  opened: string;
  channel: string;
  title: string;
  subtitle: string;
  customer: GeneratedCustomer;
  agent: GeneratedAgent;
  slas: GeneratedSla[];
  slaPolicy: { name: string; badge: string; badgeTone: ChipTone };
  timeline: GeneratedTimelineEvent[];
  internalNotes: GeneratedNote[];
  relatedCases: GeneratedRelatedCase[];
}

/* ================================================================== *
 *  Randomness helpers — deterministic per case id
 * ================================================================== */

function hashString(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h) >>> 0;
}

function makeRng(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}


function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Format a Date as "21 Jul 2026 at 12:05 PM". */
function openedLabel(d: Date): string {
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format a time of day as "12:05 PM". */
function timeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ================================================================== *
 *  Generator inputs
 * ================================================================== */

const PRODUCTS_BY_QUEUE: Record<Ticket['queue'], string[]> = {
  Billing: ['Invoicing', 'Stripe integration', 'Tax engine', 'Credits & refunds', 'Usage metering'],
  Platform: ['SSO', 'API gateway', 'Webhooks', 'Auth service', 'Tenant provisioning'],
  Account: ['Onboarding', 'User management', 'Workspace settings', 'Billing profile', 'Audit log'],
  General: ['Feature requests', 'Documentation', 'Billing questions', 'Product feedback'],
};

const ISSUE_TEMPLATES: Record<Ticket['queue'], string[]> = {
  Billing: [
    'Refund request stuck in pending state',
    'Duplicate charge applied to monthly invoice',
    'Tax ID not reflected on billing profile',
    'Usage report CSV contains stale line items',
    'Service credits missing from account balance',
  ],
  Platform: [
    'Cannot authenticate via SSO provider',
    'API returning 500 errors on critical endpoint',
    'Webhook deliveries delayed or not received',
    'Tenant provisioning fails with unknown error',
    'Rate limiting blocking legitimate traffic',
  ],
  Account: [
    'Onboarding session needs to be rescheduled',
    'New admin users not receiving invites',
    'Workspace roles not syncing from identity provider',
    'Audit log export timing out for date range',
    'Primary contact change not taking effect',
  ],
  General: [
    'Request for bulk export functionality',
    'Documentation example returns outdated payload',
    'Clarification needed on plan limits',
    'Feedback on recent dashboard redesign',
    'Question about upcoming API deprecation',
  ],
};

const SUBTITLE_TEMPLATES: Record<Ticket['queue'], string[]> = {
  Billing: [
    'Customer reports the charge was processed twice for the same billing period and needs reversal.',
    'Invoice generated without expected line-item breakdown; finance team is blocked on month-end close.',
    'Tax exemption was approved last week but is still not applied to newly generated invoices.',
    'Refund issued through dashboard has not appeared on the customer_statement after 5 business days.',
    'Prepaid credits are not being consumed first per the published billing policy.',
  ],
  Platform: [
    'Affected users report an endless redirect loop after entering credentials. Linked to ongoing auth incident.',
    'Spike in 5xx responses started shortly after this morning’s deployment; rollback is being evaluated.',
    'Webhook retries are backing up and customers are seeing delayed downstream events.',
    'New tenants fail during onboarding with an opaque validation error. Engineering is investigating.',
    'Legitimate traffic is throttled after the rate-limit config change rolled out globally.',
  ],
  Account: [
    'Customer asked to move onboarding call due to a scheduling conflict with their rollout team.',
    'Admin invites are not arriving; spam filters and mail provider logs have been checked.',
    'Role changes pushed from the IdP are not reflected in the workspace until a manual re-sync.',
    'Export request for the last quarter spins indefinitely and produces a zero-byte file.',
    'Updated primary contact is not receiving support notifications or billing emails.',
  ],
  General: [
    'Customer submitted a feature request repeatedly raised by their account team.',
    'Docs sample no longer matches the current API schema, causing integration confusion.',
    'Customer wants confirmation on usage limits before renewing their contract next month.',
    'UX feedback on the new navigation was submitted through the in-app survey.',
    'Question about deprecation timeline and migration path for a legacy endpoint.',
  ],
};

type CustomerSeed = Omit<
  GeneratedCustomer,
  'initials' | 'email' | 'lastContact'
> & {
  emailDomain: string;
};

const CUSTOMER_POOL: CustomerSeed[] = [
  { name: 'Hiroshi Tanaka', emailDomain: 'sakurarobotics.jp', phone: '+81 3-5550-0143', accountId: 'ACC-88392', plan: 'Enterprise', csat: 'CSAT 4.9', since: 'Customer since 2021', successManager: 'Noah Grant', openCases: 2 },
  { name: 'Anya Lindqvist', emailDomain: 'vinterhavn.no', phone: '+47 920 11 223', accountId: 'ACC-88041', plan: 'Enterprise', csat: 'CSAT 4.7', since: 'Customer since 2022', successManager: 'Elena Ruiz', openCases: 1 },
  { name: 'Yuki Watanabe', emailDomain: 'tokyobay-logistics.jp', phone: '+81 45 555 0145', accountId: 'ACC-87719', plan: 'Business', csat: 'CSAT 4.5', since: 'Customer since 2023', successManager: 'Noah Grant', openCases: 3 },
  { name: 'Mateo Álvarez', emailDomain: 'verdeoliveimports.cl', phone: '+56 2 2555 0908', accountId: 'ACC-87402', plan: 'Growth', csat: 'CSAT 4.8', since: 'Customer since 2024', successManager: 'Sarah L.', openCases: 1 },
  { name: 'Camila Souza', emailDomain: 'grupoandino.br', phone: '+55 11 5555-0921', accountId: 'ACC-87155', plan: 'Starter', csat: 'CSAT 4.2', since: 'Customer since 2024', successManager: 'Elena Ruiz', openCases: 4 },
  { name: 'Farouk El-Sayed', emailDomain: 'nilemart.eg', phone: '+20 2 5555 7710', accountId: 'ACC-86890', plan: 'Business', csat: 'CSAT 4.6', since: 'Customer since 2022', successManager: 'Sarah L.', openCases: 2 },
  { name: 'Fatima Baobab', emailDomain: 'baobabenergy.ma', phone: '+212 522 555 018', accountId: 'ACC-86533', plan: 'Enterprise', csat: 'CSAT 4.9', since: 'Customer since 2020', successManager: 'Noah Grant', openCases: 1 },
  { name: 'Anaïs Lefèvre', emailDomain: 'lyon-lumiere.fr', phone: '+33 4 72 55 01 29', accountId: 'ACC-86211', plan: 'Enterprise', csat: 'CSAT 4.8', since: 'Customer since 2021', successManager: 'Elena Ruiz', openCases: 3 },
  { name: 'Bettina Schäfer', emailDomain: 'skylineberlin.de', phone: '+49 30 5555 0129', accountId: 'ACC-85907', plan: 'Growth', csat: 'CSAT 4.4', since: 'Customer since 2023', successManager: 'Sarah L.', openCases: 2 },
  { name: 'Sven Eriksen', emailDomain: 'atlantisrenewables.is', phone: '+354 555 0167', accountId: 'ACC-85644', plan: 'Business', csat: 'CSAT 4.3', since: 'Customer since 2023', successManager: 'Noah Grant', openCases: 5 },
];

const AGENT_POOL: GeneratedAgent[] = [
  { name: 'Daniel K.', initials: 'DK', tier: 'Tier 3 · Platform', role: 'Primary' },
  { name: 'Edward N.', initials: 'EN', tier: 'Tier 2 · Billing', role: 'Primary' },
  { name: 'Mary S.', initials: 'MS', tier: 'Tier 1 · General', role: 'Primary' },
  { name: 'Thomas T.', initials: 'TT', tier: 'Tier 3 · Platform', role: 'Primary' },
  { name: 'William R.', initials: 'WR', tier: 'Tier 2 · Account', role: 'Primary' },
  { name: 'Riya Menon', initials: 'RM', tier: 'Support Lead', role: 'Observer' },
  { name: 'Sarah L.', initials: 'SL', tier: 'Support Lead', role: 'Observer' },
];

const INCIDENT_IDS = ['#INC-227', '#INC-228', '#INC-229', '#INC-230', '#INC-231'];

const INTERNAL_TAGS = [
  { label: '@platform-oncall', tone: 'info' as ChipTone },
  { label: '@billing-ops', tone: 'info' as ChipTone },
  { label: '@account-team', tone: 'info' as ChipTone },
  { label: '#INC-227', tone: 'warning' as ChipTone },
  { label: '#INC-228', tone: 'warning' as ChipTone },
  { label: '#INC-229', tone: 'warning' as ChipTone },
  { label: 'escalated', tone: 'error' as ChipTone },
  { label: 'vip', tone: 'success' as ChipTone },
];

const ATTACHMENT_NAMES = [
  'error-screenshot.png',
  'invoice.pdf',
  'auth-callback.log',
  'browser-har.json',
  'usage-report.csv',
  'account-export.xlsx',
];

/* ================================================================== *
 *  Deterministic content builders
 * ================================================================== */

function generateCustomer(rng: () => number, ticketCustomerName: string): GeneratedCustomer {
  // Prefer a customer whose name matches the ticket, fallback to random.
  const match = CUSTOMER_POOL.find((c) => c.name === ticketCustomerName);
  const base = match ?? pick(rng, CUSTOMER_POOL);
  const emailDomain = base.emailDomain;
  const localPart = emailDomain.split('.')[0];
  return {
    ...base,
    email: `${localPart}@${emailDomain}`,
    phone: base.phone,
    initials: initials(base.name),
    lastContact: pick(rng, ['2 days ago', 'Last week', '3 hours ago', 'Yesterday']),
  };
}

function generateAgent(rng: () => number, ticketAssigneeName: string): GeneratedAgent {
  const match = AGENT_POOL.find((a) => ticketAssigneeName.startsWith(a.name.replace('.', '')));
  const base = match ?? pick(rng, AGENT_POOL);
  const roleOptions = ['Primary', 'Secondary', 'On-call', 'Escalation owner'];
  return { ...base, role: pick(rng, roleOptions) };
}

function generateTimeline(
  rng: () => number,
  ticket: Ticket,
  baseTime: Date,
): GeneratedTimelineEvent[] {
  const customer = generateCustomer(rng, ticket.customer);
  const agent = generateAgent(rng, ticket.assignee.kind === 'agent' ? ticket.assignee.name : 'Unassigned');
  const product = pick(rng, PRODUCTS_BY_QUEUE[ticket.queue]);
  const issue = pick(rng, ISSUE_TEMPLATES[ticket.queue]);
  const incident = pick(rng, INCIDENT_IDS);

  const events: GeneratedTimelineEvent[] = [];

  // System auto-prioritization event.
  events.push({
    kind: 'system',
    author: `Automation rule · ${product} spike`,
    time: timeLabel(baseTime),
    body: `Case auto-prioritized to ${ticket.priority.toUpperCase()} and assigned to the ${ticket.queue} queue.`,
  });

  // Customer message.
  events.push({
    kind: 'customer',
    author: `${customer.name} · Customer`,
    time: timeLabel(addMinutes(baseTime, 1 + Math.floor(rng() * 3))),
    body: `We are seeing "${issue.toLowerCase()}" and it is blocking our team. Can you confirm the next steps and ETA?`,
  });

  // Agent reply (only if assigned).
  if (ticket.assignee.kind === 'agent') {
    const agentReplyTone = ticket.priority === 'p1' || ticket.priority === 'p2' ? 'urgent' : 'standard';
    events.push({
      kind: 'agent',
      author: `${agent.name} · Agent`,
      time: timeLabel(addMinutes(baseTime, 5 + Math.floor(rng() * 10))),
      body:
        agentReplyTone === 'urgent'
          ? `Thanks for the details — I am treating this as ${ticket.priority.toUpperCase()}. I can reproduce on our side and am pulling logs now. Update within 15 minutes.`
          : `Thanks for reaching out. I reviewed your account and will walk you through the next steps below.`,
      attachment: rng() > 0.4 ? { name: pick(rng, ATTACHMENT_NAMES), tone: 'info' } : undefined,
    });
  }

  // Internal note.
  if (rng() > 0.25) {
    const noteAuthor = pick(rng, AGENT_POOL.filter((a) => a.tier.toLowerCase().includes('lead')));
    const tagCount = 1 + Math.floor(rng() * 2);
    events.push({
      kind: 'note',
      author: `Internal note · ${noteAuthor.name}`,
      time: timeLabel(addMinutes(baseTime, 12 + Math.floor(rng() * 8))),
      body: `Keeping an eye on ${incident}. If this matches the pattern we saw earlier, we should update status page before the next SLA milestone.`,
      chips: Array.from({ length: tagCount }, () => pick(rng, INTERNAL_TAGS)),
    });
  }

  // Linked incident / system update.
  if (ticket.priority === 'p1' || ticket.priority === 'p2') {
    events.push({
      kind: 'system',
      author: 'Linked incident',
      time: timeLabel(addMinutes(baseTime, 18 + Math.floor(rng() * 10))),
      body: `Attached to ${incident}: ${product} issue flagged for multiple ${ticket.queue.toLowerCase()} tenants. Mitigation in progress.`,
    });
  }

  // Final status / note.
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    events.push({
      kind: 'system',
      author: 'Resolution recorded',
      time: timeLabel(addMinutes(baseTime, 45 + Math.floor(rng() * 20))),
      body: `Marked as ${ticket.status}. Customer notification sent and follow-up scheduled.`,
    });
  }

  return events;
}

function generateInternalNotes(
  rng: () => number,
  ticket: Ticket,
): GeneratedNote[] {
  const agent = generateAgent(rng, ticket.assignee.kind === 'agent' ? ticket.assignee.name : 'Unassigned');
  const lead = pick(rng, AGENT_POOL.filter((a) => a.tier.toLowerCase().includes('lead')));
  const incident = pick(rng, INCIDENT_IDS);

  return [
    {
      initials: agent.initials,
      name: agent.name,
      role: `${agent.tier} · ${ticket.queue} · now`,
      time: 'now',
      body: `Escalation context: ${ticket.subject}. Customer is on ${ticket.priority.toUpperCase()} plan and watching the incident page.`,
      chips: [pick(rng, INTERNAL_TAGS), { label: incident, tone: 'warning' }],
    },
    {
      initials: lead.initials,
      name: lead.name,
      role: `${lead.tier} · ${timeLabel(new Date())}`,
      time: timeLabel(new Date()),
      body: `Good catch. Let's prioritize customer communication over root-cause until the incident page is green. Keep the loop tight — SLA is nearby.`,
    },
  ];
}

function generateRelatedCases(rng: () => number, currentId: string): GeneratedRelatedCase[] {
  const shuffled = [...SEED_TICKETS]
    .filter((t) => t.id !== currentId)
    .sort(() => rng() - 0.5)
    .slice(0, 4);

  return shuffled.map((t) => ({
    id: t.id,
    priority: t.priority,
    title: t.subject,
    sub: `${t.queue} · ${t.status} · opened ${t.ageMinutes}m ago`,
  }));
}

function generateSlaPolicy(rng: () => number, priority: PriorityKey): CaseDetail['slaPolicy'] {
  const policies: Record<PriorityKey, { name: string; badge: string }[]> = {
    p1: [{ name: 'Enterprise P1', badge: '24×7' }, { name: 'Platinum', badge: '15m' }],
    p2: [{ name: 'Business P2', badge: 'Business hrs' }, { name: 'Gold', badge: '2h' }],
    p3: [{ name: 'Growth P3', badge: 'Business hrs' }, { name: 'Silver', badge: '24h' }],
    p4: [{ name: 'Starter P4', badge: 'Best effort' }, { name: 'Community', badge: '72h' }],
  };
  return { ...pick(rng, policies[priority]), badgeTone: 'info' };
}

function generateSlas(_rng: () => number, priority: PriorityKey, _baseTime: Date): GeneratedSla[] {
  /* Realistic per-priority SLA windows anchored to `Date.now()`
   * (NOT to `baseTime`, which is the case open time and is hours
   * old by the time the agent visits the case detail page).
   *
   * The original implementation anchored the three deadlines to
   * `baseTime`, so for any case opened more than a few minutes
   * ago every row was already in "Critical / breached" state. The
   * agent's SLA panel should always show a live mix of
   * At-risk / On-track states, matching the design screenshot
   * (First response ≈ "Breach in 1m", Next response ≈ "12m left",
   * Resolution target ≈ "3h 45m").
   *
   * Windows chosen so a typical P1 case looks like the design
   * reference, and lower priorities look proportionally more
   * relaxed. Each row is offset from `now` (in minutes) plus a
   * small deterministic jitter so a deterministic seed still
   * varies case-to-case. `_rng` is kept in the signature so the
   * call sites don't change; `_baseTime` likewise (kept for
   * symmetry with other generators). */
  const windows: Record<PriorityKey, { fr: number; nr: number; res: number }> = {
    /* P1 (Critical): FR 1m away — at risk; NR ~12m out; Res ~3h 45m */
    p1: { fr: 1, nr: 12, res: 225 },
    /* P2 (High): FR ~25m out; NR ~1h 30m; Res ~8h */
    p2: { fr: 25, nr: 90, res: 480 },
    /* P3 (Medium): FR ~2h; NR ~6h; Res ~1d 4h */
    p3: { fr: 120, nr: 360, res: 1680 },
    /* P4 (Low): FR ~6h; NR ~1d; Res ~3d */
    p4: { fr: 360, nr: 1440, res: 4320 },
  };
  const w = windows[priority];
  const now = Date.now();

  const firstResponse = new Date(now + w.fr * 60_000);
  const nextResponse = new Date(now + w.nr * 60_000);
  const resolution = new Date(now + w.res * 60_000);

  const severity = (d: Date): ChipTone => {
    const remaining = d.getTime() - Date.now();
    if (remaining <= 0) return 'error';
    if (remaining <= 5 * 60_000) return 'warning';
    return 'success';
  };

  const tag = (d: Date): string => {
    const remaining = d.getTime() - Date.now();
    if (remaining <= 0) return 'Critical';
    if (remaining <= 5 * 60_000) return 'At risk';
    return 'On track';
  };

  return [
    { label: 'First response', deadlineMs: firstResponse.getTime(), tag: tag(firstResponse), tagTone: severity(firstResponse) },
    { label: 'Next response', deadlineMs: nextResponse.getTime(), tag: tag(nextResponse), tagTone: severity(nextResponse) },
    { label: 'Resolution target', deadlineMs: resolution.getTime(), tag: tag(resolution), tagTone: severity(resolution) },
  ];
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function channelLabel(channel: ChannelKey): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function priorityLabel(priority: PriorityKey): string {
  switch (priority) {
    case 'p1':
      return 'P1 — Critical';
    case 'p2':
      return 'P2 — High';
    case 'p3':
      return 'P3 — Normal';
    case 'p4':
      return 'P4 — Low';
  }
}

/* ================================================================== *
 *  Public API
 * ================================================================== */

/** Generate (or re-generate) a full CaseDetail record for a ticket. */
export function generateCaseDetail(caseId: string | null | undefined): CaseDetail {
  const ticket = findTicketByCaseId(caseId) ?? defaultP1Case();
  const rng = makeRng(ticket.id);

  // Align base time with the ticket age so "opened" labels stay realistic.
  const baseTime = new Date(Date.now() - ticket.ageMinutes * 60_000);

  const customer = generateCustomer(rng, ticket.customer);
  const agent = generateAgent(rng, ticket.assignee.kind === 'agent' ? ticket.assignee.name : 'Unassigned');

  return {
    id: ticket.id,
    priority: ticket.priority,
    priorityLabel: priorityLabel(ticket.priority),
    category: `${ticket.queue} · ${pick(rng, PRODUCTS_BY_QUEUE[ticket.queue])}`,
    opened: openedLabel(baseTime),
    channel: channelLabel(ticket.channel),
    title: ticket.subject,
    subtitle: pick(rng, SUBTITLE_TEMPLATES[ticket.queue]),
    customer,
    agent,
    slas: generateSlas(rng, ticket.priority, baseTime),
    slaPolicy: generateSlaPolicy(rng, ticket.priority),
    timeline: generateTimeline(rng, ticket, baseTime),
    internalNotes: generateInternalNotes(rng, ticket),
    relatedCases: generateRelatedCases(rng, ticket.id),
  };
}

/** Most recent open P1 ticket, used as the default case. */
export function defaultP1Case(): Ticket {
  const p1s = SEED_TICKETS.filter((t) => t.priority === 'p1' && t.status === 'open');
  if (p1s.length === 0) return SEED_TICKETS.find((t) => t.priority === 'p1') ?? SEED_TICKETS[0];
  return p1s.sort((a, b) => b.ageMinutes - a.ageMinutes)[0];
}

/** List every case id that can be selected in the case picker. */
export function allCaseIds(): string[] {
  return SEED_TICKETS.map((t) => t.id);
}

/** Ensure a React import is present in consuming modules. */
export type { React };
