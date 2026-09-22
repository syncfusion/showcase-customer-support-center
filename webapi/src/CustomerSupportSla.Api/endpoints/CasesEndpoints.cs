using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class CasesEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapCasesEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/cases",
        "/api/cases/default",
        "/api/cases/lookup",
        "/api/cases/{id}",
        "/api/cases/{id}/resolve",
        "/api/cases/{id}/reassign",
        "/api/cases/{id}/escalate",
        "/api/cases/{id}/replies",
        "/api/cases/{id}/notes",
    };

    public static void MapCasesEndpoints(this IEndpointRouteBuilder api)
    {
        var cases = api.MapGroup("/api/cases");

        cases.MapGet("", async (string? status, int? limit, ICasesRepository repo) =>
        {
            var items = await repo.GetCasesAsync(status ?? "all", limit ?? 500, null);
            return Results.Ok(items);
        });

        cases.MapGet("/default", async (ICasesRepository repo) =>
        {
            var defaultId = await repo.GetDefaultCaseIdAsync();
            return defaultId is null ? Results.NotFound() : Results.Ok(new { id = defaultId });
        });

        cases.MapGet("/lookup", async (ICasesRepository repo) =>
        {
            var items = await repo.GetCasesAsync("open", 25, null);
            return Results.Ok(items);
        });

        cases.MapGet("/{id}", async (string id, ICasesRepository repo) =>
        {
            var res = await repo.GetCaseAsync(id);
            return res is null ? Results.NotFound() : Results.Ok(res);
        });

        // ---- Mutations (§9 mirrored) ----
        //
        // Previously only GET endpoints were registered under
        // `/api/cases/*`, so the SPA's `casesClient.addNote` /
        // `addReply` / `reassignCase` / `escalateCase` / `resolveCase`
        // all crashed with `404 Not Found` and the user saw an
        // "Action failed: POST ... failed: 404" toast while the
        // database row was never written. Each forwarder is wrapped
        // so a repository `KeyNotFoundException` (raised on stale
        // agent/ticket ids) surfaces as a clean `404` with a JSON
        // `{status, message}` body — mirroring the
        // OverviewEndpoints convention so the SPA's `request()`
        // helper can read the actual error string.

        cases.MapPost("/{id}/resolve", async (
            string id,
            CaseResolveRequestDto req,
            ICasesRepository repo,
            CancellationToken ct) =>
        {
            try
            {
                var result = await repo.ResolveAsync(id, req, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { status = 404, message = ex.Message });
            }
        });

        cases.MapPost("/{id}/reassign", async (
            string id,
            CaseReassignRequestDto req,
            ICasesRepository repo,
            CancellationToken ct) =>
        {
            try
            {
                var result = await repo.ReassignAsync(id, req, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { status = 404, message = ex.Message });
            }
        });

        cases.MapPost("/{id}/escalate", async (
            string id,
            CaseEscalateRequestDto req,
            ICasesRepository repo,
            CancellationToken ct) =>
        {
            try
            {
                var result = await repo.EscalateAsync(id, req, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { status = 404, message = ex.Message });
            }
        });

        cases.MapPost("/{id}/replies", async (
            string id,
            CaseMessageRequestDto req,
            ICasesRepository repo,
            CancellationToken ct) =>
        {
            try
            {
                var result = await repo.SendReplyAsync(id, req, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { status = 404, message = ex.Message });
            }
        });

        cases.MapPost("/{id}/notes", async (
            string id,
            CaseMessageRequestDto req,
            ICasesRepository repo,
            CancellationToken ct) =>
        {
            try
            {
                var result = await repo.AddNoteAsync(id, req, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { status = 404, message = ex.Message });
            }
        });
    }
}