using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Repositories;

public interface IAutomationRepository
{
    Task<RoutingRulesResponseDto> GetRoutingRulesAsync(string environment, string team, string range, CancellationToken ct = default);
    Task<SlaPoliciesResponseDto> GetSlaPoliciesAsync(string environment, string team, string range, CancellationToken ct = default);
    Task<EscalationWorkflowResponseDto> GetEscalationWorkflowAsync(string id, string environment, string team, string range, CancellationToken ct = default);
    Task<MacrosResponseDto> GetMacrosAsync(string environment, string team, string range, CancellationToken ct = default);
    Task<ImpactKpisDto> GetImpactKpisAsync(string range, CancellationToken ct = default);
    Task<ImpactMetricsDto> GetImpactMetricsAsync(string range, CancellationToken ct = default);
    Task<ImpactCoverageDto> GetImpactCoverageAsync(string range, CancellationToken ct = default);
}