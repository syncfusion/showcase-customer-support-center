using System.Text.Json;
using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CustomerSupportSla.Infrastructure.Persistence.Seed;

/// <summary>
/// Deterministic synthetic seeder. Anchors to a fixed UTC time so the
/// SLA deadlines / sparkline values stay stable across restarts.
/// </summary>
public static class SlaDataSeeder
{
    private static readonly DateTime Anchor = new(2026, 7, 28, 14, 30, 0, DateTimeKind.Utc);

    // Bump this whenever seed data changes meaningfully (e.g. new
    // customer-name pool, longer ticket list, priority-driven SLA bands).
    // The runtime compares the stored PRAGMA `user_version` to this
    // constant and re-seeds if they differ — so existing SQLite DBs
    // refresh without manual DB deletion.
    //
    // 2026-09-19.macro-showcase:
    //   Repointed the `macros` table from the 5 stub records to the
    //   showcase's exact 6-record set so the SPA's macro cards have
    //   real `name` / `shortcut` / `body` / `usage` / `status`
    //   content on first paint. The `MacroDto` / `MacroEntity`
    //   surfaces grew to carry these fields; the DTO is the new
    //   contract so the seeder needs to refresh existing DBs
    //   even if the row count stays similar.
    private const string CurrentSeedVersion = "2026.09.17.priority-sla-bands-wide-and-auto-promote";

    // Fixed Random-equivalent for deterministic output.
    private static int _seed = 20260728;

    private static Random Rng() => new(_seed++ * 7919);

    public static async Task SeedAsync(SlaDbContext db, ILogger logger, CancellationToken ct = default)
    {
        // Compare stored version to current. If they differ — or the
        // agents table is empty — wipe and re-seed.
        var stored = await ReadSeedVersionAsync(db, ct);
        if (await db.Agents.AnyAsync(ct) && stored == CurrentSeedVersion)
        {
            logger.LogInformation("[seed] Seed version {Version} up-to-date; skipping re-seed.", stored);
            return;
        }

        if (await db.Agents.AnyAsync(ct))
        {
            logger.LogInformation(
                "[seed] Stored seed version {Stored} differs from current {Current} — wiping and re-seeding.",
                stored ?? "<none>", CurrentSeedVersion);
            await ClearAsync(db, logger, ct);
        }

        logger.LogInformation("[seed] Seeding SLA showcase database (version {Version}, anchor {Anchor:O})...", CurrentSeedVersion, Anchor);

        // Wrap the entire seed body in an explicit EF transaction so
        // any single-table failure rolls every insert back rather
        // than leaving a half-populated database. Without this, a
        // Postgres `permission denied for table agents` (or any
        // other partial insert failure) would land agents into the
        // DB while leaving the rest of the seed skipped, and every
        // restart would hit the `agents.Any()` early-out at the
        // top of this method and never re-seed. The dropped FK
        // rows on the visible pages (queues list, lookup
        // dropdowns, etc.) are then unfillable without a manual
        // `TRUNCATE agents CASCADE` from the DBA.
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // --- Agents ---
        // Avatar initials now render as a single letter (the first
        // letter of the agent's first name) so the small `w-8 h-8`
        // circular pill isn't crowded by two characters. The backend
        // is the source of truth, so updating this seed (and bumping
        // `CurrentSeedVersion`) re-applies the change to any existing
        // demo DB on the next app start.
        var agents = new List<AgentEntity>
        {
            new() { Id = "agent-edward",   Initials = "E", Name = "Edward N.",   Tier = "tier1", Available = true,  OpenCount = 12, Cap = 20 },
            new() { Id = "agent-daniel",   Initials = "D", Name = "Daniel K.",   Tier = "tier1", Available = true,  OpenCount = 9,  Cap = 20 },
            new() { Id = "agent-thomas",   Initials = "T", Name = "Thomas T.",   Tier = "tier2", Available = true,  OpenCount = 7,  Cap = 15 },
            new() { Id = "agent-william",  Initials = "W", Name = "William R.",  Tier = "tier2", Available = false, OpenCount = 14, Cap = 15 },
            new() { Id = "agent-mary",     Initials = "M", Name = "Mary S.",     Tier = "tier3", Available = true,  OpenCount = 5,  Cap = 12 },
            new() { Id = "agent-james",    Initials = "J", Name = "James O.",    Tier = "tier3", Available = true,  OpenCount = 3,  Cap = 12 },
            new() { Id = "agent-lin",      Initials = "L", Name = "Lin H.",      Tier = "tier2", Available = true,  OpenCount = 10, Cap = 15 },
        };
        db.Agents.AddRange(agents);
        await db.SaveChangesAsync(ct);

        // --- Tickets ---
        var rng = Rng();
        var queues = new[] { "Billing", "Platform", "Account", "General" };
        var channels = new[] { "email", "chat", "portal", "social", "phone" };
        var priorities = new[] { "p1", "p2", "p3", "p4" };
        var statuses = new[] { "open", "open", "open", "pending", "resolved", "closed" };
        var customers = new[]
        {
            // International addresses — Asia, Europe, LatAm, Africa & Oceania
            // alongside North American accounts. Realistic, region-appropriate
            // B2B brand names that avoid "Acme/Globex" textbook cliché.
            "Sakura Robotics K.K.", "Tōkyō Bay Logistics", "Northwind Pacific",
            "BluePeak Capital", "Helix Pharma", "Verde Olive Imports S.A.",
            "Grupo Andino Telecom", "NileMart Logistics", "Baobab Energy Ltd.",
            "Maple Leaf Foods Co.", "Vinterhavn Maritime", "Atlantis Renewables",
            "Lyon Lumière Studios", "Marrakesh Souk Co-op", "Cape Atlas Mining",
            "Saffron Spice Exports", "Skyline Berlin GmbH", "Tessera Holdings",
            "Polaris Aero Group", "Southern Cross Wines", "Niagara Tech Hub",
            "Patagonia Wool Co.", "Banff Glaciers Travel",
        };
        var subjects = new[]
        {
            "Refund not received for invoice {n}",
            "Login failure after upgrade",
            "Invoice mismatch on billing cycle",
            "API returns 500 on /orders",
            "Webhook stopped firing this morning",
            "Charge for cancelled subscription",
            "Account locked — password reset not working",
            "SSO redirect loops to login",
            "Bulk export failing on large data set",
            "Two-factor reset requested",
            "Mobile app crashes on opening inbox",
            "Integration sync paused — could not resume",
            "VAT calculation wrong on EU orders",
            "Ticket routing: VIP customer",
            "Dunning email sent to wrong address",
            "Subscription renewal failed",
        };

        var tickets = new List<TicketEntity>();
        int startNumber = 10400;

        for (int i = 0; i < 80; i++)
        {
            var idStr = $"#CS-{startNumber + i}";
            var status = statuses[rng.Next(statuses.Length)];
            var priority = priorities[rng.Next(priorities.Length)];
            var queue = queues[rng.Next(queues.Length)];
            var channel = channels[rng.Next(channels.Length)];
            var customer = customers[rng.Next(customers.Length)];
            var subject = subjects[rng.Next(subjects.Length)].Replace("{n}", (100 + i).ToString());

            var assigneeIdx = rng.Next(0, 6);
            string? assigneeId = i % 5 == 0 ? null : agents[assigneeIdx].Id;

            // SLA deadline relative to priority
            int respMins = priority switch
            {
                "p1" => 15,
                "p2" => 60,
                "p3" => 240,
                _ => 480,
            };

            var openedAt = Anchor.AddMinutes(-rng.Next(15, 60 * 24 * 7));
            DateTime? resolvedAt = (status == "resolved" || status == "closed")
                ? openedAt.AddMinutes(rng.Next(60, 240))
                : null;

            long deadlineMs;
            string severity;
            if (resolvedAt.HasValue)
            {
                deadlineMs = new DateTimeOffset(resolvedAt.Value, TimeSpan.Zero).ToUnixTimeMilliseconds();
                severity = "ok";
            }
            else
            {
                // SLA band is driven by priority, NOT by a random roll —
                // every P1 must look "well past" in the grid, every P2
                // looks at-risk, and P3/P4 sit comfortably inside their
                // own SLA window. Without this, a P1 ticket could roll
                // "ok" (the previous behaviour) which made the at-risk
                // grid look broken: P1 rows rendered with green clocks
                // alongside P2 rows in the breach band.
                //
                // The deadlines are anchored relative to wall-clock "now"
                // (not the deterministic `Anchor`), so the live SLA
                // countdown stays meaningful after the demo runs longer
                // than the seed's static anchor — by the time the user
                // actually opens the app the deadlines still land inside
                // their assigned risk / breach window.
                var nowUtc = DateTime.UtcNow;
                // Per-priority band. `remainingMins` is the wall-clock
                // offset from `nowUtc` to the SLA deadline, used both
                // for the relative timer on the wire (deadline - now)
                // and for the severity-band label the at-risk grid reads.
                (severity, int remainingMins) = priority switch
                {
                    // P1: already breached — 1..60 minutes **past** the
                    // first-response deadline (rolling seed so each row
                    // shows its own timer). Severity = "breach" so the
                    // red pill renders in the at-risk grid.
                    "p1" => ("breach", -rng.Next(1, 60)),
                    // P2: about to be breached — 5..480 minutes remaining
                    // (i.e. 0h..8h pre-deadline). Severity = "risk" so
                    // the yellow pill renders. Once `nowUtc > deadlineMs`
                    // the read-side auto-promote sweep flips the row to
                    // P1 / breach under the same `nowUtc - deadlineMs`
                    // test (see PromoteOverdueTicketsAsync).
                    "p2" => ("risk", rng.Next(5, 480)),
                    // P3: 14..18 hours remaining (target 16h). Severity
                    // = "ok" — clearly outside the 8h pre-deadline risk
                    // band.
                    "p3" => ("ok", rng.Next(14 * 60, 18 * 60)),
                    // P4: 22..26 hours remaining (target 24h). Severity
                    // = "ok" — the widest tolerance band.
                    _ => ("ok", rng.Next(22 * 60, 26 * 60)),
                };
                // Edge case: respect the priority's own respMins floor
                // for ok-bands so we don't accidentally push a P3 ticket
                // "closer to breach" than its SLA window would allow.
                // (E.g. a P3 with respMins=240 should never show less
                // than ~60 min remaining — the values above are all well
                // above the floor, but the clamp defends against future
                // retunes.)
                if (severity == "ok" && remainingMins < respMins / 4)
                {
                    remainingMins = respMins / 4;
                }

                var deadlineDt = nowUtc.AddMinutes(remainingMins);
                deadlineMs = new DateTimeOffset(deadlineDt, TimeSpan.Zero).ToUnixTimeMilliseconds();
            }

            int ageMinutes = (int)(Anchor - openedAt).TotalMinutes;

            tickets.Add(new TicketEntity
            {
                Id = idStr,
                TicketNumber = startNumber + i,
                Subject = subject,
                Customer = customer,
                Status = status,
                Priority = priority,
                Queue = queue,
                Channel = channel,
                AssigneeId = assigneeId,
                AssigneeKind = assigneeId == null ? "unassigned" : "agent",
                SlaDeadlineMs = deadlineMs,
                SlaSeverity = severity,
                OpenedAt = openedAt,
                ResolvedAt = resolvedAt,
                AgeMinutes = ageMinutes,
                TagsJson = i % 4 == 0 ? "[\"vip\"]" : (i % 5 == 0 ? "[\"refund-risk\"]" : "[]"),
                BodyHtml = $"<p>Hi team,</p><p>We're seeing {subject.ToLowerInvariant()}. Could you take a look?</p><p>Thanks,<br/>{customer}</p>",
                UpdatedAt = Anchor,
            });
        }

        db.Tickets.AddRange(tickets);
        await db.SaveChangesAsync(ct);

        // --- Case activities (timeline + activity feed) per ticket ---
        var activities = new List<CaseActivityEntity>();
        var activityKinds = new[] { ("status", "Status changed"), ("assignment", "Assigned"), ("reply", "Reply sent"), ("tag", "Tag added"), ("note", "Note added") };
        foreach (var t in tickets.Take(40))
        {
            for (int k = 0; k < 4; k++)
            {
                var (kind, title) = activityKinds[(t.TicketNumber + k) % activityKinds.Length];
                activities.Add(new CaseActivityEntity
                {
                    Id = $"{t.Id}-act-{k}",
                    TicketId = t.Id,
                    Kind = kind,
                    Title = title,
                    Sub = kind switch
                    {
                        "status" => $"{t.Status}",
                        "assignment" => t.AssigneeId is null ? "Unassigned" : agents.First(a => a.Id == t.AssigneeId).Name,
                        "reply" => "Customer replied with additional details.",
                        "tag" => "Tag: vip",
                        _ => "Internal note added.",
                    },
                    At = t.OpenedAt.AddMinutes(k * 30),
                    Actor = t.AssigneeId is null ? "system" : agents.First(a => a.Id == t.AssigneeId).Name,
                });
            }
        }
        db.CaseActivities.AddRange(activities);
        await db.SaveChangesAsync(ct);

        // --- Routing rules ---
        // `Matched` is a 7-day match count + `LastRun` is the
        // timestamp of the most recent match. Both drive the
        // "Matched (7d)" / "Last run" columns in the SPA's
        // Routing Rules grid. Counts are deterministic per
        // rule id (so the showcase is reproducible across
        // reseeds) but vary widely across rules so the
        // column reads as a real distribution rather than a
        // constant.
        db.RoutingRules.AddRange(
            new RoutingRuleEntity { Id = "rr-1", Title = "VIP routing → tier2", Subtitle = "VIP-tagged tickets skip tier1 queue", MatchTeam = "all", MatchPriority = "p1", MatchChannel = "all", RouteToTeam = "tier2", RouteToAgent = "agent-thomas", Active = true, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-2),  Matched = 248, LastRun = Anchor.AddMinutes(-14) },
            new RoutingRuleEntity { Id = "rr-2", Title = "Billing email → Priya", Subtitle = "Inbound email to Billing lands on Priya N.", MatchTeam = "Billing", MatchPriority = "all", MatchChannel = "email", RouteToTeam = "tier1", RouteToAgent = "agent-priya", Active = true, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-5),  Matched = 612, LastRun = Anchor.AddMinutes(-3) },
            new RoutingRuleEntity { Id = "rr-3", Title = "Phone overflow → tier3", Subtitle = "Phone channel during on-call", MatchTeam = "all", MatchPriority = "all", MatchChannel = "phone", RouteToTeam = "tier3", RouteToAgent = "agent-mary", Active = false, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-9), Matched =  84, LastRun = Anchor.AddDays(-1) },
            new RoutingRuleEntity { Id = "rr-4", Title = "Refund-risk → Daniel", Subtitle = "Refund-risk tagged tickets", MatchTeam = "all", MatchPriority = "all", MatchChannel = "all", RouteToTeam = "tier1", RouteToAgent = "agent-daniel", Active = true, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-14), Matched = 127, LastRun = Anchor.AddHours(-2) }
        );

        // --- SLA policies ---
        db.SlaPolicies.AddRange(
            new SlaPolicyEntity { Id = "sla-1", Title = "P1 — Billing", Queue = "Billing", Priority = "p1", ResponseMinutes = 15, ResolutionMinutes = 60, BreachAlert = true, OnCallEscalation = true, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-3) },
            new SlaPolicyEntity { Id = "sla-2", Title = "P1 — Platform", Queue = "Platform", Priority = "p1", ResponseMinutes = 15, ResolutionMinutes = 90, BreachAlert = true, OnCallEscalation = true, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-3) },
            new SlaPolicyEntity { Id = "sla-3", Title = "P2 — Account", Queue = "Account", Priority = "p2", ResponseMinutes = 60, ResolutionMinutes = 240, BreachAlert = true, OnCallEscalation = false, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-7) },
            new SlaPolicyEntity { Id = "sla-4", Title = "P3 — General", Queue = "General", Priority = "p3", ResponseMinutes = 240, ResolutionMinutes = 1440, BreachAlert = false, OnCallEscalation = false, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-10) },
            new SlaPolicyEntity { Id = "sla-5", Title = "P4 — Backlog", Queue = "all", Priority = "p4", ResponseMinutes = 480, ResolutionMinutes = 4320, BreachAlert = false, OnCallEscalation = false, UpdatedBy = "Avery K.", UpdatedAt = Anchor.AddDays(-10) }
        );

        // --- Escalation workflows ---
        var wf1Steps = new List<WorkflowStepDto>
        {
            new("s1", "T", "Acknowledge", "Send auto-reply"),
            new("s2", "C", "Categorise", "Assign queue"),
            new("s3", "A", "Assign", "Route to tier"),
            new("s4", "S", "Escalate", "On-call rota"),
        };
        var wf1Palette = new List<WorkflowPaletteItemDto>
        {
            new("T", "Trigger", "Start of workflow"),
            new("C", "Condition", "Branch on input"),
            new("A", "Action", "Run action"),
            new("S", "Escalate", "Move up tiers"),
        };
        db.EscalationWorkflows.Add(new EscalationWorkflowEntity
        {
            Id = "wf-default",
            Title = "Default escalation workflow",
            Subtitle = "Applied to all P1 tickets",
            StepsJson = JsonSerializer.Serialize(wf1Steps),
            PaletteJson = JsonSerializer.Serialize(wf1Palette),
        });

        // --- Macros ---
        //
        // Mirrors the showcase's hard-coded `MACROS` list (see
        // the screenshot at .designs/screens/automation.html) so
        // the SPA renders the same six cards on first paint.
        // The `Body` field carries the full template text with
        // `{{...}}` placeholders; the showcase renders it
        // verbatim via `whitespace-pre-wrap` inside a monospaced
        // block. `Shortcut` is the keyboard shortcut surfaced as
        // the small pill on the card header.
        db.Macros.AddRange(
            new MacroEntity {
                Id = "macro-reset-password", Title = "Reset password",
                Subtitle = "Password reset link + quick troubleshooting",
                TagsJson = "[\"account\",\"password\"]", UseCount = 412, OwnerName = "Edward N.",
                Shortcut = "/rp",
                Body = "Hi {{customer.first_name}},\n\nPlease use the link below to reset your password. The link is valid for 30 minutes.\n\n{{reset_link}}\n\nLet me know if you run into any trouble.\n\n\u2014 {{agent.name}}",
                Status = "active",
            },
            new MacroEntity {
                Id = "macro-refund-issued", Title = "Refund issued",
                Subtitle = "Standard refund confirmation",
                TagsJson = "[\"billing\",\"refund\"]", UseCount = 218, OwnerName = "Priya N.",
                Shortcut = "/rf",
                Body = "Hi {{customer.first_name}},\n\nYour refund of {{refund.amount}} has been issued to your card on file. It should appear in 3\u20135 business days.\n\nReference: {{refund.id}}\n\n\u2014 {{agent.name}}",
                Status = "active",
            },
            new MacroEntity {
                Id = "macro-acknowledge-breach", Title = "Acknowledge breach",
                Subtitle = "We're sorry — picking this up now",
                TagsJson = "[\"first-response\"]", UseCount = 64, OwnerName = "Daniel K.",
                Shortcut = "/ab",
                Body = "Hi {{customer.first_name}},\n\nI see we missed our first response target on your ticket and I'm sorry for the delay. I'm picking this up now and will keep you updated every hour until it's resolved.\n\n\u2014 {{agent.name}}",
                Status = "active",
            },
            new MacroEntity {
                Id = "macro-verify-identity", Title = "Verify identity",
                Subtitle = "Two-factor reset instructions",
                TagsJson = "[\"account\",\"verification\"]", UseCount = 142, OwnerName = "Daniel K.",
                Shortcut = "/vi",
                Body = "Hi {{customer.first_name}},\n\nBefore I can make account changes, I'll need to verify your identity. Could you confirm the email on file and the last 4 digits of the card we have on record?\n\n\u2014 {{agent.name}}",
                Status = "active",
            },
            new MacroEntity {
                Id = "macro-escalation-handoff", Title = "Escalation handoff",
                Subtitle = "Tier 3 is taking over",
                TagsJson = "[\"p1\",\"escalation\"]", UseCount = 38, OwnerName = "Mary S.",
                Shortcut = "/eh",
                Body = "Hi {{customer.first_name}},\n\nI've brought in our Tier 3 team to look at this. {{t3.name}} will reach out within the next 30 minutes with an update.\n\n\u2014 {{agent.name}}",
                Status = "active",
            },
            new MacroEntity {
                Id = "macro-csat-followup", Title = "CSAT follow-up",
                Subtitle = "Quick post-resolution survey",
                TagsJson = "[\"csat\",\"survey\"]", UseCount = 96, OwnerName = "Lin H.",
                Shortcut = "/cs",
                Body = "Hi {{customer.first_name}},\n\nGlad we could help today. Would you mind spending 30 seconds on a quick survey? Your feedback shapes how we serve you.\n\n{{survey_link}}\n\n\u2014 {{agent.name}}",
                Status = "draft",
            }
        );

        await db.SaveChangesAsync(ct);

        // Persist the seed version so the next startup can detect drift.
        await WriteSeedVersionAsync(db, CurrentSeedVersion, ct);

        // All inserts committed — release the transaction so FK
        // locks are released and seed_versions stays readable.
        await tx.CommitAsync(ct);

        logger.LogInformation("[seed] Done. Seeded {Agents} agents, {Tickets} tickets, {Acts} activities.",
            agents.Count, tickets.Count, activities.Count);
    }

    // ---- helpers ----

    /// <summary>Reads the seed version stored in the singleton
    /// `seed_versions` row. Returns `null` when the database has never
    /// been versioned (legacy SQLite DBs without the marker table).</summary>
    private static async Task<string?> ReadSeedVersionAsync(SlaDbContext db, CancellationToken ct)
    {
        try
        {
            return await db.SeedVersions
                .Where(s => s.Id == 1)
                .Select(s => s.Version)
                .FirstOrDefaultAsync(ct);
        }
        catch
        {
            // The seed_versions table doesn't exist on a freshly-created
            // Postgres DB (EnsureCreated hadn't run yet) or on legacy
            // SQLite DBs (`-` until first migration). Treat both as
            // "unversioned" so the seeder falls through.
            return null;
        }
    }

    private static async Task WriteSeedVersionAsync(SlaDbContext db, string version, CancellationToken ct)
    {
        try
        {
            var existing = await db.SeedVersions.FirstOrDefaultAsync(s => s.Id == 1, ct);
            if (existing is null)
            {
                db.SeedVersions.Add(new SeedVersionEntity { Id = 1, Version = version });
            }
            else
            {
                existing.Version = version;
            }
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            // Don't abort the seeder if the marker write fails — the
            // next restart will simply re-seed the database.
        }
    }

    // `StableHash` / `SeedVersionReverseLookup` removed — the marker now
    // stores the canonical semantic version string directly in the
    // `seed_versions` row, so neither lookup table is necessary.

    /// <summary>Wipe the existing rows so the new seed can land.
    /// We intentionally wipe the configuration/reference tables too
    /// (routing_rules, sla_policies, escalation_workflows, macros) so the
    /// seed is fully reproducible: leaving them across runs risks unique-id
    /// collisions when the seed ever adds/changes a row primary key
    /// (e.g. an additional workflow).
    ///
    /// Postgres-with-low-privilege tolerance: a mis-configured
    /// production role might retain `SELECT` on the demo tables
    /// only and lack `DELETE`. Without the swallow below the
    /// seeder would crash and the SPA never recovers (every
    /// restart re-hits the same `agents.Any() == true` early-out
    /// on the cached rows). We log the permission errors so the
    /// DBA can fix the grants, but keep the app serving the old
    /// seed instead of 500ing every page.
    /// </summary>
    private static async Task ClearAsync(SlaDbContext db, ILogger logger, CancellationToken ct)
    {
        var statements = new[]
        {
            "DELETE FROM case_activities;",
            "DELETE FROM tickets;",
            "DELETE FROM agents;",
            "DELETE FROM routing_rules;",
            "DELETE FROM sla_policies;",
            "DELETE FROM escalation_workflows;",
            "DELETE FROM macros;",
        };

        foreach (var sql in statements)
        {
            try
            {
                await db.Database.ExecuteSqlRawAsync(sql, ct);
            }
            catch (Exception ex) when (IsPermissionDenied(ex))
            {
                logger.LogWarning(
                    "[seed] Permission denied running `{Sql}` — leaving existing rows in place and falling through. Grant the role DELETE/INSERT/UPDATE on this table to clear the seed cleanly.",
                    sql);
            }
        }
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (IsPermissionDenied(ex))
        {
            // Same tolerance — the SELECT-only role can't commit
            // DML but the rows it can already see are harmless to
            // keep around.
            logger.LogWarning(
                ex,
                "[seed] SaveChanges after DELETE was denied — proceeding without clearing the cached rows. Bumping the seed version will re-trigger this once the role is granted write access.");
        }
    }

    /// <summary>Permission-denied predicate shared between the read
    /// sweep, the seeder, and the host startup. Centralised here so
    /// the `when (...)` clause stays a single expression (and so
    /// future spots — bulk-update touch points, seed-version bump
    /// — get the same hook just by calling the helper).</summary>
    private static bool IsPermissionDenied(Exception ex)
    {
        if (ex is Npgsql.PostgresException pg && pg.SqlState == "42501")
        {
            return true;
        }
        if (ex.InnerException is Npgsql.PostgresException pg2 && pg2.SqlState == "42501")
        {
            return true;
        }
        if (ex is DbUpdateException dbex)
        {
            if (dbex.InnerException is Npgsql.PostgresException pg3 && pg3.SqlState == "42501")
            {
                return true;
            }
            var innerMessage = dbex.InnerException?.Message ?? string.Empty;
            if (innerMessage.Contains("42501", StringComparison.Ordinal)
                || innerMessage.Contains("permission denied", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }
}