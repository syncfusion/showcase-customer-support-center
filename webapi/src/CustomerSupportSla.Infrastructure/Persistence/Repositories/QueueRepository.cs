using System.Linq;
using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CustomerSupportSla.Infrastructure.Persistence.Repositories;

public class QueueRepository : IQueueRepository
{
    private readonly SlaDbContext _db;

    public QueueRepository(SlaDbContext db) => _db = db;

    public async Task<TicketsResponseDto> GetTicketsAsync(IDictionary<string, string> filters, CancellationToken ct = default)
    {
        // Mandatory overdue→P1 promotion — the Queue tab's priority pill
        // reads from `t.Priority`, so we promote first and then project. The
        // helper is exposed on OverviewRepository but takes the shared
        // SlaDbContext so it shares the same ChangeTracker.
        await new OverviewRepository(_db).PromoteOverdueTicketsAsync(ct);

        var q = _db.Tickets.AsNoTracking().AsQueryable();

        string Get(string key, string dflt = "") => filters.TryGetValue(key, out var v) ? v : dflt;

        var status = Get("status", "open");
        if (status != "all") q = q.Where(t => t.Status == status);

        var assignee = Get("assignee");
        if (assignee == "unassigned") q = q.Where(t => t.AssigneeId == null);
        else if (!string.IsNullOrEmpty(assignee) && assignee != "all") q = q.Where(t => t.AssigneeId == assignee);

        var age = Get("age");
        if (!string.Equals(age, "all", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(age?.TrimEnd('m', 'h'), out var ageValue))
        {
            var ageMinutes = age.EndsWith("h", StringComparison.OrdinalIgnoreCase) ? ageValue * 60 : ageValue;
            q = q.Where(t => t.AgeMinutes < ageMinutes);
        }

        var queue = Get("queue");
        if (!string.IsNullOrEmpty(queue) && queue != "all") q = q.Where(t => t.Queue == queue);

        var prioritiesCsv = Get("priority");
        var priorities = (prioritiesCsv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (priorities.Length > 0) q = q.Where(t => priorities.Contains(t.Priority));

        var channelsCsv = Get("channel");
        var channels = (channelsCsv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (channels.Length > 0) q = q.Where(t => channels.Contains(t.Channel));

        var sla = Get("sla");
        if (sla == "risk") q = q.Where(t => t.SlaSeverity == "risk");
        if (sla == "breach") q = q.Where(t => t.SlaSeverity == "breach");
        if (sla == "ok") q = q.Where(t => t.SlaSeverity == "ok");

        var view = Get("view");
        if (view == "urgent") q = q.Where(t => t.Priority == "p1");
        else if (view == "breaching") q = q.Where(t => t.SlaSeverity == "risk");
        else if (view == "unassigned") q = q.Where(t => t.AssigneeId == null);
        else if (view == "my_team") q = q.Where(t => t.AssigneeId != null && (t.AssigneeId == "agent-edward" || t.AssigneeId == "agent-daniel" || t.AssigneeId == "agent-thomas" || t.AssigneeId == "agent-william" || t.AssigneeId == "agent-mary"));
        else if (view == "escalated") q = q.Where(t => t.Priority == "p1" && t.Status != "closed" && t.Status != "resolved");

        var search = Get("search");
        if (!string.IsNullOrEmpty(search))
            q = q.Where(t => t.Subject.Contains(search) || t.Customer.Contains(search) || t.Id.Contains(search));

        int page = int.TryParse(Get("page", "1"), out var p) ? p : 1;
        int pageSize = int.TryParse(Get("pageSize", "10"), out var ps) ? ps : 10;

        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(t => t.OpenedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var agentMap = await _db.Agents.AsNoTracking().ToDictionaryAsync(a => a.Id, ct);

        var items = rows.Select(t => MapTicket(t, agentMap)).ToList();

        var openCount = await _db.Tickets.CountAsync(t => t.Status != "closed" && t.Status != "resolved", ct);
        var breached = await _db.Tickets.CountAsync(t => t.SlaSeverity == "breach", ct);
        var atRisk = await _db.Tickets.CountAsync(t => t.SlaSeverity == "risk", ct);
        var unassigned = await _db.Tickets.CountAsync(t => t.AssigneeId == null, ct);
        var waiting = await _db.Tickets.CountAsync(t => t.Status == "pending", ct);
        var avgAge = await _db.Tickets.Where(t => t.Status != "closed" && t.Status != "resolved").Select(t => (double)t.AgeMinutes).DefaultIfEmpty().AverageAsync(ct);

        var summary = new TicketsSummaryDto(
            openCount, breached, atRisk, unassigned, waiting, (int)avgAge);

        return new TicketsResponseDto(items, total, page, pageSize, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)), summary);
    }

    public async Task<ViewCountsResponseDto> GetViewCountsAsync(string status, CancellationToken ct = default)
    {
        var q = _db.Tickets.AsNoTracking().Where(t => status == "all" || t.Status == status);
        var all = await q.CountAsync(ct);
        var urgent = await q.CountAsync(t => t.Priority == "p1", ct);
        var breaching = await q.CountAsync(t => t.SlaSeverity == "risk", ct);
        var unassigned = await q.CountAsync(t => t.AssigneeId == null, ct);
        var myTeam = await q.CountAsync(t => t.AssigneeId != null && (t.AssigneeId == "agent-edward" || t.AssigneeId == "agent-daniel" || t.AssigneeId == "agent-thomas" || t.AssigneeId == "agent-william" || t.AssigneeId == "agent-mary"), ct);
        var escalated = await q.CountAsync(t => t.Priority == "p1" && t.Status != "closed" && t.Status != "resolved", ct);
        return new ViewCountsResponseDto(status, new ViewCountsDto(all, urgent, breaching, unassigned, myTeam, escalated));
    }

    public async Task<QueueSummaryResponseDto> GetSummaryAsync(string queueName, string status, CancellationToken ct = default)
    {
        var q = _db.Tickets.AsNoTracking().Where(t => (status == "all" || t.Status == status));
        if (!string.IsNullOrEmpty(queueName) && queueName != "all") q = q.Where(t => t.Queue == queueName);

        var open = await q.CountAsync(t => t.Status != "closed" && t.Status != "resolved", ct);
        var breached = await q.CountAsync(t => t.SlaSeverity == "breach", ct);
        var atRisk = await q.CountAsync(t => t.SlaSeverity == "risk", ct);
        var unassigned = await q.CountAsync(t => t.AssigneeId == null, ct);
        var waiting = await q.CountAsync(t => t.Status == "pending", ct);
        var avg = await q.Where(t => t.Status != "closed" && t.Status != "resolved").Select(t => (double)t.AgeMinutes).DefaultIfEmpty().AverageAsync(ct);

        var qk = string.IsNullOrEmpty(queueName) || queueName == "all" ? QueueKey.General : Enum.TryParse<QueueKey>(queueName, out var parsed) ? parsed : QueueKey.General;
        return new QueueSummaryResponseDto(qk, status, open, breached, atRisk, unassigned, waiting, (int)avg);
    }

    public async Task<AgentsResponseDto> GetAgentsAsync(string? tier, bool availableOnly, int limit, string? cursor, CancellationToken ct = default)
    {
        var q = _db.Agents.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(tier) && tier != "all") q = q.Where(a => a.Tier == tier);
        if (availableOnly) q = q.Where(a => a.Available);

        var rows = await q.OrderBy(a => a.Name).Take(Math.Min(limit, 200)).ToListAsync(ct);
        var items = rows.Select(a => new AgentRefDto(a.Id, a.Initials, a.Name, a.Tier, a.Available, a.OpenCount, a.Cap)).ToList();
        return new AgentsResponseDto(items, null);
    }

    public async Task<CreateTicketResponseDto> CreateTicketAsync(CreateTicketRequestDto req, CancellationToken ct = default)
    {
        var nextNumber = (await _db.Tickets.MaxAsync(t => (int?)t.TicketNumber, ct) ?? 10399) + 1;
        var id = $"#CS-{nextNumber}";
        var channel = req.Channel ?? ChannelKey.email;
        int respMins = req.Priority switch { PriorityKey.p1 => 15, PriorityKey.p2 => 60, PriorityKey.p3 => 240, _ => 480 };

        var openedAt = DateTime.UtcNow;
        var deadline = DateTimeOffset.UtcNow.AddMinutes(respMins).ToUnixTimeMilliseconds();

        var assigneeId = req.AssigneeId;
        string assigneeKind = assigneeId is null ? "unassigned" : "agent";

        var t = new TicketEntity
        {
            Id = id,
            TicketNumber = nextNumber,
            Subject = req.Subject,
            Customer = req.Customer,
            Status = "open",
            Priority = req.Priority.ToString(),
            Queue = req.Queue.ToString(),
            Channel = channel.ToString(),
            AssigneeId = assigneeId,
            AssigneeKind = assigneeKind,
            SlaDeadlineMs = deadline,
            SlaSeverity = "ok",
            OpenedAt = openedAt,
            AgeMinutes = 0,
            BodyHtml = $"<p>{req.Subject}</p>",
            TagsJson = "[]",
            UpdatedAt = DateTime.UtcNow,
        };

        _db.Tickets.Add(t);
        await _db.SaveChangesAsync(ct);

        var agentMap = await _db.Agents.AsNoTracking().ToDictionaryAsync(a => a.Id, ct);
        return new CreateTicketResponseDto(MapTicket(t, agentMap), nextNumber);
    }

    private static TicketDto MapTicket(TicketEntity t, Dictionary<string, AgentEntity> agentMap)
    {
        AssigneeRefDto assignee;
        if (t.AssigneeId is null || !agentMap.ContainsKey(t.AssigneeId))
        {
            assignee = new AssigneeRefDto(t.AssigneeKind, null, null, null);
        }
        else
        {
            var a = agentMap[t.AssigneeId];
            assignee = new AssigneeRefDto("agent", a.Id, a.Name, a.Tier);
        }

        return new TicketDto(
            t.Id, t.Subject, t.Customer,
            Enum.TryParse<TicketStatus>(t.Status, out var st) ? st : TicketStatus.open,
            Enum.TryParse<PriorityKey>(t.Priority, out var pk) ? pk : PriorityKey.p3,
            Enum.TryParse<QueueKey>(t.Queue, out var qk) ? qk : QueueKey.General,
            assignee,
            new TicketSlaDto(t.SlaDeadlineMs, Enum.TryParse<Severity>(t.SlaSeverity, out var sv) ? sv : Severity.ok),
            Enum.TryParse<ChannelKey>(t.Channel, out var ck) ? ck : ChannelKey.email,
            t.AgeMinutes);
    }
}