using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

public record TriageRequestDto(
    string Subject,
    string Body,
    string? Channel,
    string? Customer);

public record TriageSuggestionDto(
    string Priority,
    string Queue,
    string SuggestedAssignee,
    double Confidence,
    List<string> Reasons,
    List<string> SimilarTicketIds);

public record TriageResponseDto(TriageSuggestionDto Suggestion);

public record ReplyDraftRequestDto(
    string TicketId,
    string Subject,
    string Body,
    string Tone);

public record ReplyDraftResponseDto(
    string DraftSubject,
    string DraftBody,
    string Tone,
    List<string> Citations);

public record EmployeeInsightRequestDto(
    string EmployeeId,
    string Period);

public record EmployeeInsightDto(
    string EmployeeId,
    string Period,
    string Headline,
    string Summary,
    List<string> Highlights,
    List<string> Recommendations,
    DateTime GeneratedAt);