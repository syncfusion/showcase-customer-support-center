using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

// ---- Queue ticket ----
public record AssigneeRefDto(
    string Kind,         // "agent" | "unassigned" | "team"
    string? Id,
    string? Name,
    string? Tier);

public record TicketSlaDto(
    long DeadlineMs,
    Severity Severity);

public record TicketDto(
    string Id,
    string Subject,
    string Customer,
    TicketStatus Status,
    PriorityKey Priority,
    QueueKey Queue,
    AssigneeRefDto Assignee,
    TicketSlaDto Sla,
    ChannelKey Channel,
    int AgeMinutes);

public record TicketsResponseDto(
    List<TicketDto> Items,
    int Total,
    int Page,
    int PageSize,
    int TotalPages,
    TicketsSummaryDto Summary);

public record TicketsSummaryDto(
    int Open,
    int Breached,
    int AtRisk,
    int Unassigned,
    int Waiting,
    int AvgAgeMinutes);

// ---- View counts (badges) ----
public record ViewCountsResponseDto(
    string Status,
    ViewCountsDto Counts);

public record ViewCountsDto(
    int All,
    int Urgent,
    int Breaching,
    int Unassigned,
    int MyTeam,
    int Escalated);

// ---- Summary KPI tiles ----
public record QueueSummaryResponseDto(
    QueueKey Queue,
    string Status,
    int Open,
    int Breached,
    int AtRisk,
    int Unassigned,
    int Waiting,
    int AvgAgeMinutes);

// ---- Agent directory ----
public record AgentRefDto(
    string Id,
    string Initials,
    string Name,
    string Tier,
    bool Available,
    int OpenCount,
    int Cap);

public record AgentsResponseDto(
    List<AgentRefDto> Items,
    string? Cursor);

// ---- Create ticket ----
public record CreateTicketRequestDto(
    string Subject,
    string Customer,
    QueueKey Queue,
    PriorityKey Priority,
    ChannelKey? Channel,
    string? AssigneeId);

public record CreateTicketResponseDto(
    TicketDto Ticket,
    int NewTicketNumber);