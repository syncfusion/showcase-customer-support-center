using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

// ---- Routing rules ----
public record RoutingRuleDto(
    string Id,
    string Title,
    string Subtitle,
    string MatchTeam,
    string MatchPriority,
    string MatchChannel,
    string RouteToTeam,
    string RouteToAgent,
    bool Active,
    string UpdatedBy,
    DateTime UpdatedAt,
    /* Number of ticket matches the rule has produced in the
     * last 7 days. Drives the "Matched (7d)" column in the
     * SPA's Routing Rules grid. Synthesized in the seeder
     * (the live system would derive this from a match-event
     * store / aggregation query); the SPA renders whatever
     * number the field carries, zero included. */
    int Matched,
    /* Mapped from `RoutingRuleEntity.LastRun` so the SPA can
     * render a human "Last run" label (e.g. "12m ago"). The
     * entity seeds it from `UpdatedAt` but the live system
     * would overwrite this whenever a rule actually matches
     * a ticket — the SPA doesn't care where the value comes
     * from as long as it's a DateTime. */
    DateTime LastRun);

public record RoutingRulesResponseDto(List<RoutingRuleDto> Items);

// ---- SLA policies ----
public record SlaPolicyDto(
    string Id,
    string Title,
    string Queue,
    string Priority,
    int ResponseMinutes,
    int ResolutionMinutes,
    bool BreachAlert,
    bool OnCallEscalation,
    string UpdatedBy,
    DateTime UpdatedAt);

public record SlaPoliciesResponseDto(List<SlaPolicyDto> Items);

// ---- Escalation workflows ----
public record WorkflowStepDto(
    string Id,
    string Kind,            // "T" | "C" | "A" | "S"
    string Title,
    string Sub);

public record WorkflowPaletteItemDto(
    string Kind,
    string Title,
    string Sub);

public record WorkflowDto(
    string Id,
    string Title,
    string Subtitle,
    List<WorkflowStepDto> Steps,
    List<WorkflowPaletteItemDto> Palette);

public record EscalationWorkflowResponseDto(WorkflowDto Workflow);

// ---- Macros ----
//
// The showcase surfaces `name` / `shortcut` / `body` / `usage` /
// `status` (the same fields a UI would bind to a "macro card").
// The persistence model keeps `title` / `subtitle` / `useCount`
// for breadth, so the DTO exposes BOTH — the repository passes
// through whichever it has and the client adapter tolerates
// either side (see `automationClient.ts`).
public record MacroDto(
    string Id,
    string Title,
    string Subtitle,
    List<string> Tags,
    int UseCount,
    string OwnerName,
    /* Showcase-friendly mirror of the persistence columns above.
     * The Application layer synthesizes these from `title` /
     * `subtitle` / `useCount` when the repository doesn't carry
     * the rich form yet, so the wire shape stays stable as the
     * schema grows. */
    string Name,
    string Shortcut,
    string Body,
    string Usage,
    string Status);

public record MacrosResponseDto(List<MacroDto> Items);

// ---- Impact ----
public record ImpactSparkPointDto(
    double X,
    double Y);

public record ImpactKpiDto(
    string Label,
    string Value,
    string Trend,
    string TrendText,
    ChipTone Tone,
    /* Mini-line series rendered into the KPI tile's sparkline
     * slot on the Automation tab. 14 points (Daily, last 14
     * days) matches the coverage chart cadence. The front-end
     * drives the fill colour off `SparkColor`; `Spark` itself
     * is just an ordered list of [x, y] points (the front-end
     * adapter also tolerates {x, y} objects). */
    IReadOnlyList<ImpactSparkPointDto> Spark,
    string SparkColor);

public record ImpactKpisDto(List<ImpactKpiDto> Kpis);

public record ImpactMetricDto(
    string Label,
    double Value,
    string Unit,
    string Trend,
    ChipTone Tone);

public record ImpactMetricsDto(List<ImpactMetricDto> Metrics);

/* One row per x-axis bucket for the coverage chart on the
 * Automation tab. Each "row" can be either a single day
 * (7d range → 7 rows, 30d → 30 rows) or a coarser grouping
 * of weekly / monthly buckets when the range is `30d` or
 * `90d`. The label text + the three percentages feed the
 * chart's three series; the SPA reads `Period` as the x-axis
 * label and `Pct` as the y-value. */
public record ImpactCoverageRowDto(
    string Period,
    int AutoRouted,
    int AutoResolved,
    int Sla);

public record ImpactCoverageDto(
    List<ImpactCoverageRowDto> Rows,
    string Range);

public record ImpactResponseDto(
    ImpactKpisDto Kpis,
    ImpactMetricsDto Metrics,
    ImpactCoverageDto Coverage);