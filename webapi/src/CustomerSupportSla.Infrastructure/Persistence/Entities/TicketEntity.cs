using System.ComponentModel.DataAnnotations;

namespace CustomerSupportSla.Infrastructure.Persistence.Entities;

public class TicketEntity
{
    [Key]
    public string Id { get; set; } = default!;       // e.g. "#CS-10482"
    public int TicketNumber { get; set; }
    public string Subject { get; set; } = default!;
    public string Customer { get; set; } = default!;
    public string Status { get; set; } = "open";      // open | pending | resolved | closed
    public string Priority { get; set; } = "p3";      // p1 | p2 | p3 | p4
    public string Queue { get; set; } = "General";    // Billing | Platform | Account | General
    public string Channel { get; set; } = "email";    // email | chat | portal | social | phone

    public string? AssigneeId { get; set; }           // FK to AgentEntity.Id (nullable for unassigned)
    public string AssigneeKind { get; set; } = "unassigned"; // agent | unassigned | team

    public long SlaDeadlineMs { get; set; }
    public string SlaSeverity { get; set; } = "ok";  // ok | risk | breach

    public DateTime OpenedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public int AgeMinutes { get; set; }

    public string TagsJson { get; set; } = "[]";      // JSON-encoded string list
    public string BodyHtml { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; }
}