using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

// Shared enums
public enum RangeKey { h24, d7, d30, quarter, custom }
public enum Severity { ok, risk, breach }
public enum ChannelKey { email, chat, portal, social, phone }
public enum PriorityKey { p1, p2, p3, p4 }
public enum QueueKey { Billing, Platform, Account, General }
public enum TicketStatus { open, pending, resolved, closed }
public enum ChipTone { success, warning, error, info, neutral }

// ---- KPI ----
public record KpiSparkPointDto(int X, double Y);

public record KpiChipDto(string Label, ChipTone Tone);

public record KpiCardDto(
    string Label,
    string Trend,
    string TrendText,
    KpiChipDto Chip,
    List<KpiSparkPointDto> Spark,
    string SparkColor);

public record KpiBundleDto(
    KpiCardDto SlaCompliance,
    KpiCardDto ActiveBreaches,
    KpiCardDto AtRisk,
    KpiCardDto AvgFirstResponse);

public record KpisResponseDto(
    RangeKey Range,
    int MaxY,
    KpiBundleDto Kpis);

// ---- Trend ----
public record TrendResponseDto(
    RangeKey Range,
    List<string> Labels,
    int MaxY,
    int Interval,
    List<int> TicketsReceived,
    List<int> TicketsResolved,
    List<int> Breaches,
    List<int> ResponseTimeTarget);

// ---- Channel mix ----
public record ChannelSliceDto(string Label, int Pct, string Color);

public record ChannelMixResponseDto(
    RangeKey Range,
    int Total,
    List<ChannelSliceDto> Slices);

// ---- Activity ----
public record ActivityItemDto(
    string Id,
    string Kind,
    string Title,
    string Subject,
    string TicketId,
    string TicketHref,
    string Sub,
    DateTime At,
    ChipTone Tone,
    string IconKey,
    QueueKey Queue,
    PriorityKey Priority,
    ChannelKey Channel);

public record ActivityResponseDto(
    List<ActivityItemDto> Items,
    string? NextCursor,
    int Total);

// ---- Workload ----
public record WorkloadItemDto(
    string Id,
    string Initials,
    string Name,
    string Sub,
    int OpenCount,
    int Cap,
    int LoadPct,
    ChipTone LoadTone,
    string? Tier,
    bool? Available);

public record WorkloadResponseDto(
    List<WorkloadItemDto> Items,
    string? Cursor);

// ---- At-risk / breach ----
//
// `Sla` is a nested TicketSlaDto (matching the Queue / Cases /
// Automation ticket SLA shape) rather than two flat fields. This keeps
// the wire response consistent across tabs and matches what every
// frontend client (React / Angular) already projects — `deadlineMs` +
// `severity` come through as a single nested object on the JSON wire.
//
// P1 rows surface as `severity = "breach"`, P2 as `"risk"`, P3/P4 as
// `"ok"`. The overview endpoint returns all open priorities so the grid
// can display P1-P4 tickets and let users choose the SLA view with sorting.
public record AtRiskTicketDto(
    string Id,
    string Subject,
    string Customer,
    QueueKey Queue,
    PriorityKey Priority,
    ChannelKey Channel,
    TicketSlaDto Sla,
    string? AssigneeName);

public record AtRiskResponseDto(List<AtRiskTicketDto> Items, int Total);

public record BreachAlertResponseDto(
    bool Active,
    string Heading,
    string Subheading,
    List<string> TicketIds,
    string ViewCasesHref);

// ---- Filter options ----
public record FilterOptionsResponseDto(
    List<KeyValueDto<string, string>> DateRanges,
    List<KeyValueDto<string, string>> Queues,
    List<KeyValueDto<string, string>> Channels,
    List<KeyValueDto<string, string>> Priorities,
    List<KeyValueDto<string, string>> Agents,
    List<KeyValueDto<string, string>> Tiers);

public record KeyValueDto<TKey, TValue>(TKey Id, TValue Label);

// ---- Mutations (overview/*) ----

public record BreachAlertReassignRequestDto(
    List<string> TicketIds,
    string TargetAgentId,
    string? Reason);

public record OverviewAssigneeDto(string Initials, string Name);

public record ReassignedRefDto(string TicketId, OverviewAssigneeDto NewAssignee);

public record SkippedRefDto(string TicketId, string Reason);

public record BreachAlertReassignResponseDto(
    List<ReassignedRefDto> Reassigned,
    List<SkippedRefDto> Skipped);

public record TicketReassignRequestDto(
    string Intent,                 // "reassign" | "escalate"
    string TargetAgentId,
    string? Note);

public record TicketReassignResponseDto(
    string TicketId,
    OverviewAssigneeDto NewAssignee,
    string Intent,
    DateTime At);

public record BulkEscalateRequestDto(
    List<string> TicketIds,
    string TargetTier,             // "tier1" | "tier2" | "tier3"
    string? Reason);

public record BulkEscalateResponseDto(
    List<ReassignedRefDto> Escalated,
    List<SkippedRefDto> Skipped);

public record NoteAddRequestDto(
    string Body,
    string? Visibility);           // "internal" | "public" — default internal

public record NoteAddResponseDto(
    string TicketId,
    string NoteId,
    DateTime At);

public record CloseDuplicateRequestDto(
    string MergedIntoTicketId,
    string? Reason);

public record CloseDuplicateResponseDto(
    string TicketId,
    string MergedInto,
    DateTime At);