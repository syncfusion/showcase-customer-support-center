using System.ComponentModel.DataAnnotations;

namespace CustomerSupportSla.Infrastructure.Persistence.Entities;

public class CaseActivityEntity
{
    [Key]
    public string Id { get; set; } = default!;
    public string TicketId { get; set; } = default!;
    public string Kind { get; set; } = "system";
    public string Title { get; set; } = default!;
    public string Sub { get; set; } = string.Empty;
    public DateTime At { get; set; }
    public string? Actor { get; set; }
}