using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

// ---- Cases ----
public record CaseActivityDto(
    string Id,
    string Kind,        // "status", "assignment", "reply", "tag", "note", "system"
    string Title,
    string Sub,
    DateTime At,
    string? Actor);

public record CaseTimelineEventDto(
    string Id,
    string Kind,
    string Title,
    string Sub,
    DateTime At,
    string? Actor);

public record CaseRelatedDto(
    string Id,
    string Subject,
    string Customer,
    PriorityKey Priority,
    TicketStatus Status);

public record CaseDetailDto(
    string Id,
    string Subject,
    string Customer,
    QueueKey Queue,
    PriorityKey Priority,
    TicketStatus Status,
    ChannelKey Channel,
    AssigneeRefDto Assignee,
    TicketSlaDto Sla,
    int AgeMinutes,
    DateTime OpenedAt,
    DateTime? ResolvedAt,
    List<string> Tags,
    string BodyHtml,
    List<CaseActivityDto> Activity,
    List<CaseTimelineEventDto> Timeline,
    List<CaseRelatedDto> RelatedCases);

public record CaseLookupItemDto(
    string Id,
    string Subject,
    string Customer,
    PriorityKey Priority,
    TicketStatus Status);

// ---- Cases mutations (round-tripped via /api/cases/...) ----
//
// The Cases-tab POSTs go here (the SPA wires `casesClient.resolveCase`
// / `reassignCase` / `escalateCase` / `addReply` / `addNote` at
// `/api/cases/{id}/{resolve,reassign,escalate,replies,notes}`).
// The Overview-tab mutations register their own set of endpoints at
// `/api/overview/tickets/...`; the wire shapes are identical, so a
// future refactor could collapse both surfaces onto a single shared
// controller — for now we keep the Cases scope explicit and forward
// the request handlers to the Overview repository.
public record CaseMutationResultDto(string CaseId, DateTime At);

public record CaseResolveRequestDto(
    bool SendNotification,
    string? Note);

public record CaseResolveResponseDto(
    string CaseId,
    DateTime At,
    DateTime? ResolvedAt);

public record CaseReassignRequestDto(
    string TargetAgentId,
    bool EscalateToTier3,
    string? Note);

public record CaseEscalateRequestDto(
    string TargetTier,
    string? Reason);

public record CaseMessageRequestDto(
    string BodyHtml,
    string? Visibility,           // "internal" | "public" — default internal
    bool IsInternal);

public record CaseMessageResponseDto(
    string CaseId,
    string MessageId,
    DateTime At);