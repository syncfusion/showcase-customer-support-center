using CustomerSupportSla.Application.Repositories;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class AutomationEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapAutomationEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/automation/routing-rules",
        "/api/automation/sla-policies",
        "/api/automation/escalation-workflows/{id}",
        "/api/automation/macros",
        "/api/automation/impact",
    };

    public static void MapAutomationEndpoints(this IEndpointRouteBuilder api)
    {
        var automation = api.MapGroup("/api/automation");

        automation.MapGet("/routing-rules", async (string? environment, string? team, string? range, IAutomationRepository repo) =>
        {
            var res = await repo.GetRoutingRulesAsync(environment ?? "all", team ?? "all", range ?? "7d");
            return Results.Ok(res);
        });

        automation.MapGet("/sla-policies", async (string? environment, string? team, string? range, IAutomationRepository repo) =>
        {
            var res = await repo.GetSlaPoliciesAsync(environment ?? "all", team ?? "all", range ?? "7d");
            return Results.Ok(res);
        });

        automation.MapGet("/escalation-workflows/{id}", async (string id, string? environment, string? team, string? range, IAutomationRepository repo) =>
        {
            var res = await repo.GetEscalationWorkflowAsync(id, environment ?? "all", team ?? "all", range ?? "7d");
            return Results.Ok(res);
        });

        automation.MapGet("/macros", async (string? environment, string? team, string? range, IAutomationRepository repo) =>
        {
            var res = await repo.GetMacrosAsync(environment ?? "all", team ?? "all", range ?? "7d");
            return Results.Ok(res);
        });

        automation.MapGet("/impact", async (string? range, IAutomationRepository repo) =>
        {
            var kpis = await repo.GetImpactKpisAsync(range ?? "7d");
            var metrics = await repo.GetImpactMetricsAsync(range ?? "30d");
            var coverage = await repo.GetImpactCoverageAsync(range ?? "30d");
            return Results.Ok(new { kpis, metrics, coverage });
        });
    }
}