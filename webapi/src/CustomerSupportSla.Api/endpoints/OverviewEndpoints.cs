using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class OverviewEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapOverviewEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/overview/kpis",
        "/api/overview/trend",
        "/api/overview/channel-mix",
        "/api/overview/activity",
        "/api/overview/workload",
        "/api/overview/agent-workload",
        "/api/overview/at-risk-tickets",
        "/api/overview/breach-alert",
        "/api/overview/filter-options",
        "/api/overview/employee/{id}/generate-insight",
        "/api/overview/breach-alert/reassign",
        "/api/overview/tickets/{ticketId}/reassign",
        "/api/overview/tickets/bulk-escalate",
        "/api/overview/tickets/{ticketId}/notes",
        "/api/overview/tickets/{ticketId}/close-duplicate",
    };

    public static void MapOverviewEndpoints(this IEndpointRouteBuilder api)
    {
        var overview = api.MapGroup("/api/overview");

        overview.MapGet("/kpis", async (string? range, string? queue, string? priority, string? channel, IOverviewRepository repo) =>
        {
            var res = await repo.GetKpisAsync(
                range ?? "7d",
                queue ?? "all",
                priority ?? string.Empty,
                channel ?? "all");
            return Results.Ok(res);
        });

        overview.MapGet("/trend", async (string? range, IOverviewRepository repo) =>
        {
            var r = range ?? "7d";
            var res = await repo.GetTrendAsync(r);
            return Results.Ok(res);
        });

        overview.MapGet("/channel-mix", async (string? range, IOverviewRepository repo) =>
        {
            var r = range ?? "7d";
            var res = await repo.GetChannelMixAsync(r);
            return Results.Ok(res);
        });

        overview.MapGet("/activity", async (string? queue, string? priority, string? channel, string? expanded, int? limit, string? cursor, IOverviewRepository repo) =>
        {
            var exp = expanded == "true";
            var lim = limit ?? 20;
            var items = await repo.GetActivityAsync(queue ?? "all", priority ?? string.Empty, channel ?? "all", exp, lim, cursor);
            return Results.Ok(items);
        });

        overview.MapGet("/workload", async (string? expanded, int? limit, IOverviewRepository repo) =>
        {
            var exp = expanded == "true";
            var lim = limit ?? 5;
            var items = await repo.GetWorkloadAsync(exp, lim);
            return Results.Ok(items);
        });

        overview.MapGet("/agent-workload", async (string? expanded, int? limit, IOverviewRepository repo) =>
        {
            var exp = expanded == "true";
            var lim = limit ?? 5;
            var items = await repo.GetWorkloadAsync(exp, lim);
            return Results.Ok(items);
        });

        overview.MapGet("/at-risk-tickets", async (string? queue, string? priority, string? channel, string? range, IOverviewRepository repo) =>
        {
            var items = await repo.GetAtRiskTicketsAsync(queue ?? "all", priority ?? string.Empty, channel ?? "all", range ?? "7d");
            return Results.Ok(new { items = items.Items, total = items.Total });
        });

        overview.MapGet("/breach-alert", async (string? range, string? queue, string? priority, string? channel, IOverviewRepository repo) =>
        {
            // Same param shape as `/at-risk-tickets`: the banner recomputes
            // when the user changes `range` OR any filter, and the two
            // endpoints stay in lock-step.
            var res = await repo.GetBreachAlertAsync(
                range ?? "7d",
                queue ?? "all",
                priority ?? string.Empty,
                channel ?? "all");
            return Results.Ok(res);
        });

        overview.MapGet("/filter-options", async (IOverviewRepository repo) =>
        {
            var res = await repo.GetFilterOptionsAsync();
            return Results.Ok(res);
        });

        overview.MapPost("/employee/{id}/generate-insight", async (string id, IOverviewRepository repo) =>
        {
            var insight = await repo.GenerateEmployeeInsightAsync(id);
            return Results.Ok(insight);
        });

        // ---- Mutations (§9) ----
        //
        // Every mutation handler is wrapped in `Safe()` so an unhandled
        // `KeyNotFoundException` (raised when the URL `ticketId` or the
        // body `targetAgentId` references a row the seed/DB doesn't
        // have) returns a clean `404` with a JSON body — not a `500
        // Internal Server Error`. Previously a stale dropdown value
        // (e.g. `agent-priya` from the pre-rename seed) tripped
        // `ResolveAgent()` → `KeyNotFoundException` → ASP.NET's default
        // 500 page, which the SPA surfaced as a generic "Action failed"
        // toast with no actionable message. The 404 body is
        // `{ status, message }` and the SPA's `request()` helper reads
        // it so the UI can show the actual error string.

        overview.MapPost("/breach-alert/reassign", async (BreachAlertReassignRequestDto req, IOverviewRepository repo) =>
        {
            return await Safe(() => repo.BreachAlertReassignAsync(req));
        });

        overview.MapPost("/tickets/{ticketId}/reassign", async (string ticketId, TicketReassignRequestDto req, IOverviewRepository repo) =>
        {
            return await Safe(() => repo.TicketReassignAsync(ticketId, req));
        });

        overview.MapPost("/tickets/bulk-escalate", async (BulkEscalateRequestDto req, IOverviewRepository repo) =>
        {
            return await Safe(() => repo.BulkEscalateAsync(req));
        });

        overview.MapPost("/tickets/{ticketId}/notes", async (string ticketId, NoteAddRequestDto req, IOverviewRepository repo) =>
        {
            return await Safe(() => repo.AddNoteAsync(ticketId, req));
        });

        overview.MapPost("/tickets/{ticketId}/close-duplicate", async (string ticketId, CloseDuplicateRequestDto req, IOverviewRepository repo) =>
        {
            return await Safe(() => repo.CloseAsDuplicateAsync(ticketId, req));
        });
    }

    /// <summary>
    /// Adapter that turns a repository mutation Task into an
    /// <see cref="IResult"/>. The <c>Safe</c> wrapper catches
    /// <see cref="KeyNotFoundException"/> from any repository
    /// implementation and returns a <c>404</c> with a JSON error body
    /// (the SPA's <c>request()</c> helper reads <c>body</c> to build the
    /// toast). Any other exception propagates so ASP.NET's default 500
    /// handler still surfaces truly unexpected errors. Safe runs on the
    /// server's request thread, so the additional `await` is cheap.
    /// </summary>
    private static async Task<IResult> Safe<T>(Func<Task<T>> action)
        where T : class
    {
        try
        {
            return Results.Ok(await action());
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(new
            {
                status = 404,
                message = ex.Message,
            });
        }
    }
}