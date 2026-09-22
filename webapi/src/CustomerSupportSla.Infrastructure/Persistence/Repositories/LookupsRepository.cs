using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;

namespace CustomerSupportSla.Infrastructure.Persistence.Repositories;

public class LookupsRepository : ILookupsRepository
{
    public Task<LookupSetDto> GetLookupsAsync(string set, CancellationToken ct = default)
    {
        var lookup = set.ToLowerInvariant() switch
        {
            "queues" => new LookupSetDto(set, new()
            {
                new("all", "All queues"),
                new("Billing", "Billing"),
                new("Platform", "Platform"),
                new("Account", "Account"),
                new("General", "General")
            }),
            "priorities" => new LookupSetDto(set, new()
            {
                new("p1", "P1"), new("p2", "P2"), new("p3", "P3"), new("p4", "P4")
            }),
            "channels" => new LookupSetDto(set, new()
            {
                new("email", "Email"), new("chat", "Chat"), new("portal", "Portal"), new("social", "Social"), new("phone", "Phone")
            }),
            "tiers" => new LookupSetDto(set, new()
            {
                new("tier1", "Tier 1"), new("tier2", "Tier 2"), new("tier3", "Tier 3")
            }),
            _ => new LookupSetDto(set, new())
        };
        return Task.FromResult(lookup);
    }
}