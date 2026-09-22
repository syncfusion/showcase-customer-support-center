using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Repositories;

public interface IOverviewRepository
{
    Task<KpisResponseDto> GetKpisAsync(string range, string queue, string priority, string channel, CancellationToken ct = default);
    Task<TrendResponseDto> GetTrendAsync(string range, CancellationToken ct = default);
    Task<ChannelMixResponseDto> GetChannelMixAsync(string range, CancellationToken ct = default);
    Task<ActivityResponseDto> GetActivityAsync(string queue, string priority, string channel, bool expanded, int limit, string? cursor, CancellationToken ct = default);
    Task<WorkloadResponseDto> GetWorkloadAsync(bool expanded, int limit, CancellationToken ct = default);
    Task<AtRiskResponseDto> GetAtRiskTicketsAsync(string queue, string priority, string channel, string range, CancellationToken ct = default);
    // Filters mirror `GetAtRiskTicketsAsync` so the banner and the at-risk
    // grid are always told the same story ("queue=Billing" filters both).
    Task<BreachAlertResponseDto> GetBreachAlertAsync(string range, string queue, string priority, string channel, CancellationToken ct = default);
    Task<FilterOptionsResponseDto> GetFilterOptionsAsync(CancellationToken ct = default);
    Task<EmployeeInsightDto> GenerateEmployeeInsightAsync(string employeeId, CancellationToken ct = default);

    // ---- Mutations (§9 in overview.txt) ----
    Task<BreachAlertReassignResponseDto> BreachAlertReassignAsync(BreachAlertReassignRequestDto req, CancellationToken ct = default);
    Task<TicketReassignResponseDto> TicketReassignAsync(string ticketId, TicketReassignRequestDto req, CancellationToken ct = default);
    Task<BulkEscalateResponseDto> BulkEscalateAsync(BulkEscalateRequestDto req, CancellationToken ct = default);
    Task<NoteAddResponseDto> AddNoteAsync(string ticketId, NoteAddRequestDto req, CancellationToken ct = default);
    Task<CloseDuplicateResponseDto> CloseAsDuplicateAsync(string ticketId, CloseDuplicateRequestDto req, CancellationToken ct = default);
}