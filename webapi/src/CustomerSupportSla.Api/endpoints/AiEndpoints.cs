using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Services;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class AiEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapAiEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/ai/triage-suggest",
        "/api/ai/reply-draft",
    };

    public static void MapAiEndpoints(this IEndpointRouteBuilder api)
    {
        var ai = api.MapGroup("/api/ai");

        ai.MapPost("/triage-suggest", async (TriageRequestDto req, IAiService svc) =>
        {
            var res = await svc.SuggestTriageAsync(req);
            return Results.Ok(res);
        });

        ai.MapPost("/reply-draft", async (ReplyDraftRequestDto req, IAiService svc) =>
        {
            var res = await svc.DraftReplyAsync(req);
            return Results.Ok(res);
        });
    }
}