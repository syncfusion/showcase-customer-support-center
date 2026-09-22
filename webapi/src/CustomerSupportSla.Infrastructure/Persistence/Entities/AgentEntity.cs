using System.ComponentModel.DataAnnotations;

namespace CustomerSupportSla.Infrastructure.Persistence.Entities;

public class AgentEntity
{
    [Key]
    public string Id { get; set; } = default!;
    public string Initials { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string Tier { get; set; } = "tier1";
    public bool Available { get; set; } = true;
    public int OpenCount { get; set; }
    public int Cap { get; set; } = 20;
}