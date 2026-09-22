using CustomerSupportSla.Application.Repositories;
using Microsoft.AspNetCore.Routing;

namespace CustomerSupportSla.Api.Endpoints;

public static class LookupsEndpoints
{
    /// <summary>
    /// Routes registered by <see cref="MapLookupsEndpoints"/>.
    /// </summary>
    public static readonly string[] Routes =
    {
        "/api/lookups/{set}",
    };

    public static void MapLookupsEndpoints(this IEndpointRouteBuilder api)
    {
        var lookups = api.MapGroup("/api/lookups");

        lookups.MapGet("/{set}", async (string set, ILookupsRepository repo) =>
        {
            var res = await repo.GetLookupsAsync(set);
            return Results.Ok(res);
        });
    }
}