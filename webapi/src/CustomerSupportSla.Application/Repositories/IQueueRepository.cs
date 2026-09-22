using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Repositories;

public interface IQueueRepository
{
    Task<TicketsResponseDto> GetTicketsAsync(IDictionary<string, string> filters, CancellationToken ct = default);
    Task<ViewCountsResponseDto> GetViewCountsAsync(string status, CancellationToken ct = default);
    Task<QueueSummaryResponseDto> GetSummaryAsync(string queueName, string status, CancellationToken ct = default);
    Task<AgentsResponseDto> GetAgentsAsync(string? tier, bool availableOnly, int limit, string? cursor, CancellationToken ct = default);
    Task<CreateTicketResponseDto> CreateTicketAsync(CreateTicketRequestDto req, CancellationToken ct = default);
}