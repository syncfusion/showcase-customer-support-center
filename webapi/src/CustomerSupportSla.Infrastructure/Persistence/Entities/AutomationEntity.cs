using System.ComponentModel.DataAnnotations;

namespace CustomerSupportSla.Infrastructure.Persistence.Entities;

public class RoutingRuleEntity
{
    [Key] public string Id { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Subtitle { get; set; } = string.Empty;
    public string MatchTeam { get; set; } = "all";
    public string MatchPriority { get; set; } = "all";
    public string MatchChannel { get; set; } = "all";
    public string RouteToTeam { get; set; } = "tier1";
    public string RouteToAgent { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
    public string UpdatedBy { get; set; } = "system";
    public DateTime UpdatedAt { get; set; }
    /* Last 7-day match count. Synthesized in the seeder
     * for the showcase; a live system would compute this
     * from a matches table / aggregate query and write the
     * result back here. Default of 0 keeps older rows that
     * pre-date this addition from breaking the SPA's
     * `Math.max(0, n)` rendering. */
    public int Matched { get; set; } = 0;
    /* Timestamp of the most recent match. The seeder
     * initializes this from `UpdatedAt` (so it lines up with
     * the row's "last edited" date) but the live system
     * would overwrite it whenever a rule matches a ticket.
     * Surfaced as a human label via the SPA. */
    public DateTime LastRun { get; set; } = DateTime.MinValue;
}

public class SlaPolicyEntity
{
    [Key] public string Id { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Queue { get; set; } = "all";
    public string Priority { get; set; } = "all";
    public int ResponseMinutes { get; set; } = 15;
    public int ResolutionMinutes { get; set; } = 240;
    public bool BreachAlert { get; set; } = true;
    public bool OnCallEscalation { get; set; } = false;
    public string UpdatedBy { get; set; } = "system";
    public DateTime UpdatedAt { get; set; }
}

public class EscalationWorkflowEntity
{
    [Key] public string Id { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Subtitle { get; set; } = string.Empty;
    public string StepsJson { get; set; } = "[]";      // WorkflowStepDto[]
    public string PaletteJson { get; set; } = "[]";   // WorkflowPaletteItemDto[]
}

public class MacroEntity
{
    [Key] public string Id { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Subtitle { get; set; } = string.Empty;
    public string TagsJson { get; set; } = "[]";
    public int UseCount { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    /* Showcase-friendly macro card fields. Mirrored onto the
     * `MacroDto` so the SPA can render a real macro card without
     * synthesizing body / shortcut / status from `title` /
     * `subtitle`. Optional — older DBs may leave them blank and
     * the repository falls back to synthesized values. */
    public string? Shortcut { get; set; }
    public string? Body { get; set; }
    public string Status { get; set; } = "active";
}