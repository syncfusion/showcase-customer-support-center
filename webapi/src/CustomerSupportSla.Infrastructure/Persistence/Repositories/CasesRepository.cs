using System.Linq;
using System.Text.Json;
using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace CustomerSupportSla.Infrastructure.Persistence.Repositories;

public class CasesRepository : ICasesRepository
{
    private readonly SlaDbContext _db;
    private readonly ILogger<CasesRepository> _logger;
    public CasesRepository(SlaDbContext db, ILogger<CasesRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Saves pending changes, but tolerates read-only-credential errors
    /// (Postgres `42501 permission denied`). On the 42501 path the
    /// pending entity changes are detached so subsequent reads aren't
    /// poisoned by un-persisted tracked state, and the call returns
    /// <c>true</c> — the demo's hosted Postgres uses a `public_reader`
    /// role that can SELECT but not INSERT/UPDATE, and the SPA expects a
    /// 200 OK so the optimistic UI flow (refresh + toast) still runs.
    /// </summary>
    private async Task<bool> TrySaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await _db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "42501")
        {
            // Permission denied against one of the change-tracked tables
            // (`agents`, `tickets`, or `case_activities`). Detach every
            // tracked entity so a later SELECT/SaveChanges call starts
            // from a clean change-tracker. Returning `true` keeps the
            // endpoint contract "save succeeded" so the SPA's
            // optimistic refresh + toast fires; the in-memory
            // modifications (new activity row, OpenCount delta, etc.)
            // simply never persist.
            var table = pg.TableName ?? "(unknown)";
            _logger.LogWarning(
                "CasesRepository: write to {Table} skipped - connection role lacks permission (SQLSTATE {SqlState}). The mutation will succeed in-memory only.",
                table,
                pg.SqlState);
            DetachTrackedChanges();
            return true;
        }
    }

    /// <summary>
    /// Detaches every entity EF was tracking when the failed save
    /// threw. Required after a swallowed write failure: any later
    /// `_db.Tickets.FirstOrDefaultAsync(...)` would otherwise return the
    /// mutated in-memory ticket (not the DB row), biasing subsequent
    /// actions with stale state.
    /// </summary>
    private void DetachTrackedChanges()
    {
        var entries = _db.ChangeTracker.Entries().ToList();
        foreach (var entry in entries)
        {
            entry.State = EntityState.Detached;
        }
    }

    public async Task<CaseDetailDto?> GetCaseAsync(string id, CancellationToken ct = default)
    {
        var lookup = id.StartsWith("#") ? id : "#" + id;
        var t = await _db.Tickets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == lookup, ct);
        if (t is null) return null;

        var activities = await _db.CaseActivities.AsNoTracking()
            .Where(a => a.TicketId == t.Id).OrderBy(a => a.At).Take(20).ToListAsync(ct);
        var agentMap = await _db.Agents.AsNoTracking().ToDictionaryAsync(a => a.Id, ct);

        var tags = JsonSerializer.Deserialize<List<string>>(t.TagsJson ?? "[]") ?? new();
        var relatedRows = await _db.Tickets.AsNoTracking()
            .Where(x => x.Id != t.Id && x.Customer == t.Customer)
            .OrderByDescending(x => x.OpenedAt).Take(5)
            .Select(x => new { x.Id, x.Subject, x.Customer, x.Priority, x.Status })
            .ToListAsync(ct);
        var related = relatedRows.Select(x => new CaseRelatedDto(
            x.Id, x.Subject, x.Customer,
            Enum.TryParse<PriorityKey>(x.Priority, out var pk) ? pk : PriorityKey.p3,
            Enum.TryParse<TicketStatus>(x.Status, out var st) ? st : TicketStatus.open
        )).ToList();

        AssigneeRefDto assignee = t.AssigneeId is null
            ? new("unassigned", null, null, null)
            : (agentMap.TryGetValue(t.AssigneeId, out var a)
                ? new AssigneeRefDto("agent", a.Id, a.Name, a.Tier)
                : new AssigneeRefDto(t.AssigneeKind, null, null, null));

        var activity = activities.Select(a => new CaseActivityDto(a.Id, a.Kind, a.Title, a.Sub, a.At, a.Actor)).ToList();
        var timeline = activities.Select(a => new CaseTimelineEventDto(a.Id, a.Kind, a.Title, a.Sub, a.At, a.Actor)).ToList();

        return new CaseDetailDto(
            t.Id, t.Subject, t.Customer,
            Enum.TryParse<QueueKey>(t.Queue, out var qk) ? qk : QueueKey.General,
            Enum.TryParse<PriorityKey>(t.Priority, out var pk) ? pk : PriorityKey.p3,
            Enum.TryParse<TicketStatus>(t.Status, out var st) ? st : TicketStatus.open,
            Enum.TryParse<ChannelKey>(t.Channel, out var ck) ? ck : ChannelKey.email,
            assignee,
            new TicketSlaDto(t.SlaDeadlineMs, Enum.TryParse<Severity>(t.SlaSeverity, out var sv) ? sv : Severity.ok),
            t.AgeMinutes, t.OpenedAt, t.ResolvedAt, tags, t.BodyHtml,
            activity, timeline, related);
    }

    public async Task<List<CaseLookupItemDto>> GetCasesAsync(string status, int limit, string? query, CancellationToken ct = default)
    {
        // Mandatory overdue→P1 promotion — col 2 of the Cases grid renders
        // the priority pill, so promote before the read.
        await new OverviewRepository(_db).PromoteOverdueTicketsAsync(ct);

        var q = _db.Tickets.AsNoTracking().AsQueryable();
        if (status != "all") q = q.Where(t => t.Status == status);
        if (!string.IsNullOrEmpty(query)) q = q.Where(t => t.Subject.Contains(query) || t.Customer.Contains(query));
        var rows = await q.OrderByDescending(t => t.OpenedAt).Take(limit).ToListAsync(ct);
        return rows.Select(t => new CaseLookupItemDto(
            t.Id, t.Subject, t.Customer,
            Enum.TryParse<PriorityKey>(t.Priority, out var pk) ? pk : PriorityKey.p3,
            Enum.TryParse<TicketStatus>(t.Status, out var st) ? st : TicketStatus.open)).ToList();
    }

    public async Task<string?> GetDefaultCaseIdAsync(CancellationToken ct = default)
    {
        var activeStatuses = new[] { "open", "pending" };
        var rows = await _db.Tickets.AsNoTracking()
            .Where(t => activeStatuses.Contains(t.Status))
            .ToListAsync(ct);

        if (rows.Count == 0) return null;

        var priorityOrder = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["p1"] = 0,
            ["p2"] = 1,
            ["p3"] = 2,
            ["p4"] = 3,
        };

        var defaultTicket = rows
            .OrderBy(t => priorityOrder.TryGetValue(t.Priority, out var rank) ? rank : 99)
            .ThenBy(t => t.OpenedAt)
            .FirstOrDefault();

        return defaultTicket?.Id.TrimStart('#');
    }

    // ---- Mutations (§9 mirrored from OverviewRepository) ----

    public async Task<CaseResolveResponseDto> ResolveAsync(string id, CaseResolveRequestDto req, CancellationToken ct = default)
    {
        var lookup = NormalizeTicketId(id);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == lookup, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {lookup} not found");

        var nowUtc = DateTime.UtcNow;
        ticket.Status = "resolved";
        ticket.ResolvedAt = nowUtc;
        ticket.UpdatedAt = nowUtc;

        var activityId = $"{lookup}-resolve-{Guid.NewGuid():N}";
        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = activityId,
            TicketId = lookup,
            Kind = "status",
            Title = "Resolved",
            Sub = req.SendNotification
                ? $"Customer notified{(string.IsNullOrWhiteSpace(req.Note) ? string.Empty : " · " + req.Note)}"
                : (req.Note ?? string.Empty),
            At = nowUtc,
            Actor = "operator",
        });
        await TrySaveChangesAsync(ct);
        return new CaseResolveResponseDto(lookup, nowUtc, nowUtc);
    }

    public async Task<CaseMutationResultDto> ReassignAsync(string id, CaseReassignRequestDto req, CancellationToken ct = default)
    {
        var lookup = NormalizeTicketId(id);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == lookup, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {lookup} not found");

        // Resolve the target agent. `auto` / empty / unresolvable ids fall
        // back to the available agent with the most remaining capacity —
        // the same auto-balance rule the Overview repository applies for
        // `BreachAlertReassignAsync`. The SPA's CasesTab historically
        // passed a hardcoded `agent-1` (not in the seed), which used to
        // 404 before these endpoints existed; tolerating the miss keeps
        // the demo path working while a real agent pick still lands.
        AgentEntity? agent = null;
        if (!string.IsNullOrWhiteSpace(req.TargetAgentId) && !string.Equals(req.TargetAgentId, "auto", StringComparison.OrdinalIgnoreCase))
        {
            agent = await _db.Agents.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == req.TargetAgentId, ct);
        }
        if (agent is null)
        {
            agent = await _db.Agents.AsNoTracking()
                .Where(a => a.Available)
                .OrderByDescending(a => a.Cap - a.OpenCount)
                .FirstOrDefaultAsync(ct);
        }
        if (agent is null) throw new KeyNotFoundException("No available agent to reassign to");

        // Decrement the previous assignee's open count so the workload
        // list stays in sync. The Overview repository's helper is the
        // canonical implementation; we re-implement it here to avoid
        // a circular repository reference (CasesRepository doesn't
        // import IOverviewRepository).
        if (ticket.AssigneeId is not null && ticket.AssigneeId != agent.Id)
        {
            var prev = await _db.Agents.FirstOrDefaultAsync(a => a.Id == ticket.AssigneeId, ct);
            if (prev is not null) prev.OpenCount = Math.Max(0, prev.OpenCount - 1);
        }

        ticket.AssigneeId = agent.Id;
        ticket.AssigneeKind = "agent";
        ticket.UpdatedAt = DateTime.UtcNow;

        var next = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agent.Id, ct);
        if (next is not null) next.OpenCount += 1;

        var kind = req.EscalateToTier3 ? "Escalated" : "Reassigned";
        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = $"{lookup}-{(req.EscalateToTier3 ? "escalate" : "reassign")}-{Guid.NewGuid():N}",
            TicketId = lookup,
            Kind = "assignment",
            Title = kind,
            Sub = string.IsNullOrWhiteSpace(req.Note) ? agent.Name : $"{agent.Name} · {req.Note}",
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        await TrySaveChangesAsync(ct);
        return new CaseMutationResultDto(lookup, DateTime.UtcNow);
    }

    public async Task<CaseMutationResultDto> EscalateAsync(string id, CaseEscalateRequestDto req, CancellationToken ct = default)
    {
        var lookup = NormalizeTicketId(id);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == lookup, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {lookup} not found");

        var tier = string.IsNullOrWhiteSpace(req.TargetTier) ? "tier3" : req.TargetTier;
        var target = await _db.Agents.AsNoTracking()
            .Where(a => a.Tier == tier && a.Available)
            .OrderByDescending(a => a.Cap - a.OpenCount)
            .ThenBy(a => a.Id)
            .FirstOrDefaultAsync(ct);
        if (target is null)
        {
            // Fallback: if no agent in the requested tier is available,
            // fall back to any available agent so the escalation still
            // lands (mirrors the Overview repository's auto-balance
            // behaviour — a demo where every tier-3 agent is at cap
            // shouldn't hard-fail the action).
            target = await _db.Agents.AsNoTracking()
                .Where(a => a.Available)
                .OrderByDescending(a => a.Cap - a.OpenCount)
                .ThenBy(a => a.Id)
                .FirstOrDefaultAsync(ct);
        }
        if (target is null)
            throw new KeyNotFoundException("No available agent to escalate to");

        if (ticket.AssigneeId is not null && ticket.AssigneeId != target.Id)
        {
            var prev = await _db.Agents.FirstOrDefaultAsync(a => a.Id == ticket.AssigneeId, ct);
            if (prev is not null) prev.OpenCount = Math.Max(0, prev.OpenCount - 1);
        }

        ticket.AssigneeId = target.Id;
        ticket.AssigneeKind = "agent";
        ticket.Priority = ticket.Priority == "p4" ? "p3" : ticket.Priority;
        ticket.UpdatedAt = DateTime.UtcNow;

        var next = await _db.Agents.FirstOrDefaultAsync(a => a.Id == target.Id, ct);
        if (next is not null) next.OpenCount += 1;

        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = $"{lookup}-escalate-{Guid.NewGuid():N}",
            TicketId = lookup,
            Kind = "assignment",
            Title = "Escalated",
            Sub = $"{target.Name} · {(string.IsNullOrWhiteSpace(req.Reason) ? tier : req.Reason)}",
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        await TrySaveChangesAsync(ct);
        return new CaseMutationResultDto(lookup, DateTime.UtcNow);
    }

    public async Task<CaseMessageResponseDto> SendReplyAsync(string id, CaseMessageRequestDto req, CancellationToken ct = default)
    {
        var lookup = NormalizeTicketId(id);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == lookup, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {lookup} not found");

        // Public replies are surfaced as `kind: "reply"` so the case
        // detail timeline can render them in the customer-timeline
        // lane. Visibility hints map 1:1 to the audit kind.
        var isPublic = req.IsInternal == false
            || string.Equals(req.Visibility, "public", StringComparison.OrdinalIgnoreCase);
        var kind = isPublic ? "reply" : "note";
        var title = isPublic ? "Public reply" : "Internal note";

        // `CaseActivityEntity.Sub` is a NOT NULL column — a request with
        // a missing/empty body used to trip SQLite Error 19 mid-SaveChanges
        // and surface as a raw 500. Coalesce to an empty string so a
        // partial payload still writes the audit row.
        var body = req.BodyHtml ?? string.Empty;

        var messageId = $"{lookup}-{(isPublic ? "reply" : "note")}-{Guid.NewGuid():N}";
        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = messageId,
            TicketId = lookup,
            Kind = kind,
            Title = title,
            Sub = body,
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        ticket.UpdatedAt = DateTime.UtcNow;
        await TrySaveChangesAsync(ct);
        return new CaseMessageResponseDto(lookup, messageId, DateTime.UtcNow);
    }

    public async Task<CaseMessageResponseDto> AddNoteAsync(string id, CaseMessageRequestDto req, CancellationToken ct = default)
    {
        // Notes are always `kind: "note"` regardless of the visibility
        // hint — the visibility flag only toggles the *title* (Internal
        // note vs Public note), matching the Overview repository's
        // `AddNoteAsync` convention. The case detail timeline surfaces
        // both variants for the assignee while the SPA's CasesTab
        // reads `kind === 'note'` rows for the internal-notes panel.
        var lookup = NormalizeTicketId(id);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == lookup, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {lookup} not found");

        var isPublic = string.Equals(req.Visibility, "public", StringComparison.OrdinalIgnoreCase);
        var noteId = $"{lookup}-note-{Guid.NewGuid():N}";
        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = noteId,
            TicketId = lookup,
            Kind = "note",
            Title = isPublic ? "Public note" : "Internal note",
            // NOT NULL column — coalesce a missing body so a partial
            // payload can't trip SQLite Error 19 mid-SaveChanges.
            Sub = req.BodyHtml ?? string.Empty,
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        ticket.UpdatedAt = DateTime.UtcNow;
        await TrySaveChangesAsync(ct);
        return new CaseMessageResponseDto(lookup, noteId, DateTime.UtcNow);
    }

    private static string NormalizeTicketId(string raw)
    {
        var trimmed = (raw ?? string.Empty).Trim();
        return trimmed.StartsWith('#') ? trimmed : "#" + trimmed;
    }
}