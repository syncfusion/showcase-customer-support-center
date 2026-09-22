/* ------------------------------------------------------------------ *
 *  Shared ticket data model + seed list.
 *
 *  Used by:
 *    • QueueTab  — populates the ticket queue grid
 *    • CasesTab  — looks up a single ticket by id (e.g. from
 *                   `#/cases?id=CS-10478`) so a row hyperlink in
 *                   the queue can open the right case detail page.
 *
 *  Types are duplicated from QueueTab so the data lives next to
 *  the only consumer that mutates it. CasesTab imports them and
 *  treats the ticket as read-only.
 * ------------------------------------------------------------------ */

import type React from 'react';

export type Severity = 'ok' | 'risk' | 'breach';
export type PriorityKey = 'p1' | 'p2' | 'p3' | 'p4';
export type ChannelKey = 'email' | 'chat' | 'portal' | 'social' | 'phone';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type QueueKey =
  | 'all'
  | 'Billing'
  | 'Platform'
  | 'Account'
  | 'General';

export type AssigneeRef =
  | { kind: 'agent'; initials: string; name: string }
  | { kind: 'unassigned' };

export interface Ticket {
  id: string;
  subject: string;
  customer: string;
  status: TicketStatus;
  priority: PriorityKey;
  queue: Exclude<QueueKey, 'all'>;
  assignee: AssigneeRef;
  sla: { deadlineMs: number; severity: Severity };
  channel: ChannelKey;
  ageMinutes: number;
}

const SEED_NOW = Date.now();
const inMs = (offsetMin: number) => SEED_NOW + offsetMin * 60_000;

function initialTickets(): Ticket[] {
  return [
    {
      id: '#CS-10482',
      subject: 'Refund not received · Stripe',
      customer: 'Sakura Robotics K.K.',
      status: 'open',
      priority: 'p1',
      queue: 'Billing',
      assignee: { kind: 'unassigned' },
      sla: { deadlineMs: inMs(-4), severity: 'breach' },
      channel: 'email',
      ageMinutes: 22,
    },
    {
      id: '#CS-10478',
      subject: 'Cannot log in via SSO',
      customer: 'Tōkyō Bay Logistics',
      status: 'open',
      priority: 'p1',
      queue: 'Platform',
      assignee: { kind: 'agent', initials: 'DK', name: 'Daniel K.' },
      sla: { deadlineMs: inMs(-1), severity: 'breach' },
      channel: 'chat',
      ageMinutes: 18,
    },
    {
      id: '#CS-10475',
      subject: 'API 500 errors on /orders',
      customer: 'Northwind Pacific',
      status: 'open',
      priority: 'p1',
      queue: 'Platform',
      assignee: { kind: 'agent', initials: 'TT', name: 'Thomas T.' },
      sla: { deadlineMs: inMs(3), severity: 'risk' },
      channel: 'portal',
      ageMinutes: 42,
    },
    {
      id: '#CS-10471',
      subject: 'Invoice missing line items',
      customer: 'BluePeak Capital',
      status: 'pending',
      priority: 'p2',
      queue: 'Billing',
      assignee: { kind: 'agent', initials: 'EN', name: 'Edward N.' },
      sla: { deadlineMs: inMs(12), severity: 'risk' },
      channel: 'email',
      ageMinutes: 63,
    },
    {
      id: '#CS-10468',
      subject: 'Onboarding session reschedule',
      customer: 'Helix Pharma',
      status: 'open',
      priority: 'p3',
      queue: 'Account',
      assignee: { kind: 'agent', initials: 'WR', name: 'William R.' },
      sla: { deadlineMs: inMs(27), severity: 'risk' },
      channel: 'chat',
      ageMinutes: 134,
    },
    {
      id: '#CS-10465',
      subject: 'Feature request: bulk export',
      customer: 'Verde Olive Imports S.A.',
      status: 'pending',
      priority: 'p4',
      queue: 'General',
      assignee: { kind: 'agent', initials: 'MS', name: 'Mary S.' },
      sla: { deadlineMs: inMs(102), severity: 'ok' },
      channel: 'social',
      ageMinutes: 185,
    },
    {
      id: '#CS-10460',
      subject: 'Webhook delivery delays',
      customer: 'Grupo Andino Telecom',
      status: 'open',
      priority: 'p2',
      queue: 'Platform',
      assignee: { kind: 'agent', initials: 'DK', name: 'Daniel K.' },
      sla: { deadlineMs: inMs(130), severity: 'ok' },
      channel: 'portal',
      ageMinutes: 55,
    },
    {
      id: '#CS-10457',
      subject: 'Tax ID update in billing profile',
      customer: 'NileMart Logistics',
      status: 'open',
      priority: 'p3',
      queue: 'Billing',
      assignee: { kind: 'agent', initials: 'EN', name: 'Edward N.' },
      sla: { deadlineMs: inMs(130), severity: 'ok' },
      channel: 'email',
      ageMinutes: 92,
    },
  ];
}

function generateMoreTickets(count: number): Ticket[] {
  const subjects = [
    'Password reset not working',
    'Duplicate charge on invoice',
    'Export times out for date range',
    'Mobile app crashes on login',
    'Two-factor auth device lost',
    'Wrong tax rate applied',
    'Slack integration offline',
    'Report export shows empty CSV',
    'User unable to join workspace',
    'Service credits not applied',
  ];
  const customers = [
    'Baobab Energy Ltd.',
    'Maple Leaf Foods Co.',
    'Vinterhavn Maritime',
    'Atlantis Renewables',
    'Lyon Lumière Studios',
    'Marrakesh Souk Co-op',
    'Cape Atlas Mining',
    'Saffron Spice Exports',
    'Skyline Berlin GmbH',
    'Tessera Holdings',
  ];
  const queues: Exclude<QueueKey, 'all'>[] = [
    'Billing',
    'Platform',
    'Account',
    'General',
  ];
  const channels: ChannelKey[] = [
    'email',
    'chat',
    'portal',
    'social',
    'phone',
  ];
  const agents = [
    { initials: 'EN', name: 'Edward N.' },
    { initials: 'DK', name: 'Daniel K.' },
    { initials: 'MS', name: 'Mary S.' },
    { initials: 'TT', name: 'Thomas T.' },
    { initials: 'WR', name: 'William R.' },
  ];

  const out: Ticket[] = [];
  for (let i = 0; i < count; i++) {
    const id = `#CS-${(10456 - i).toString()}`;
    const priority: PriorityKey = (['p1', 'p2', 'p3', 'p4'] as PriorityKey[])[
      i % 4
    ];
    const deadline = inMs(-5 + (i % 7) * 15);
    const sev: Severity =
      deadline <= SEED_NOW
        ? 'breach'
        : deadline - SEED_NOW <= 5 * 60_000
          ? 'risk'
          : 'ok';
    const status: TicketStatus =
      i % 3 === 0 ? 'pending' : i % 5 === 0 ? 'resolved' : 'open';
    out.push({
      id,
      subject: subjects[i % subjects.length],
      customer: customers[i % customers.length],
      status,
      priority,
      queue: queues[i % queues.length],
      assignee:
        i % 6 === 0
          ? { kind: 'unassigned' }
          : { kind: 'agent', ...agents[i % agents.length] },
      sla: { deadlineMs: deadline, severity: sev },
      channel: channels[i % channels.length],
      ageMinutes: 10 + i * 7,
    });
  }
  return out;
}

export const SEED_TICKETS: Ticket[] = [
  ...initialTickets(),
  ...generateMoreTickets(39),
];

/** Normalize a case id (accepts "#CS-10478" or "CS-10478") for lookup. */
export function normalizeCaseId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim().replace(/^#/, '').toUpperCase();
  return trimmed ? trimmed : null;
}

/** Look up a ticket by its case id (e.g. "CS-10478" or "#CS-10478"). */
export function findTicketByCaseId(
  id: string | null | undefined,
  tickets: ReadonlyArray<Ticket> = SEED_TICKETS,
): Ticket | undefined {
  const normalized = normalizeCaseId(id);
  if (!normalized) return undefined;
  return tickets.find(
    (t) => t.id.replace(/^#/, '').toUpperCase() === normalized,
  );
}

/** Convert "12:48" style age in minutes to a human label. */
export function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`;
}

/** Ensure a React import is present in consuming modules. */
export type { React };
