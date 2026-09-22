using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class QueueEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapQueueEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/queue/tickets",
        "/api/queue/views",
        "/api/queue/summary",
        "/api/queue/filter-options",
        "/api/queue/agents",
    };

    public static void MapQueueEndpoints(this IEndpointRouteBuilder api)
    {
        var queue = api.MapGroup("/api/queue");

        queue.MapGet("/tickets", async (HttpRequest req, IQueueRepository repo) =>
        {
            var dict = req.Query.ToDictionary(k => k.Key, v => v.Value.ToString());
            var res = await repo.GetTicketsAsync(dict);
            return Results.Ok(res);
        });

        queue.MapGet("/views", async (string? status, IQueueRepository repo) =>
        {
            var res = await repo.GetViewCountsAsync(status ?? "open");
            return Results.Ok(res);
        });

        queue.MapGet("/summary", async (string? queueName, string? status, IQueueRepository repo) =>
        {
            var res = await repo.GetSummaryAsync(queueName ?? "all", status ?? "open");
            return Results.Ok(res);
        });

        queue.MapGet("/filter-options", async (IOverviewRepository repo) =>
        {
            var res = await repo.GetFilterOptionsAsync();
            return Results.Ok(res);
        });

        queue.MapGet("/agents", async (string? tier, bool? availableOnly, int? limit, string? cursor, IQueueRepository repo) =>
        {
            var res = await repo.GetAgentsAsync(tier, availableOnly ?? false, limit ?? 50, cursor);
            return Results.Ok(res);
        });

        queue.MapPost("/tickets", async (CreateTicketRequestDto req, IQueueRepository repo) =>
        {
            var res = await repo.CreateTicketAsync(req);
            return Results.Created($"/api/queue/tickets/{res.Ticket.Id}", res);
        });
    }
}