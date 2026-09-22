using System.ComponentModel.DataAnnotations;

namespace CustomerSupportSla.Infrastructure.Persistence.Entities;

/// <summary>
/// Persisted seed-version marker. Replaces the SQLite-only
/// `PRAGMA user_version` plumbing with a portable single-row
/// lookup table that works the same on PostgreSQL. EF Core
/// maps this to `seed_versions`.
/// </summary>
public class SeedVersionEntity
{
    [Key]
    public int Id { get; set; } = 1;

    /// <summary>The canonical seed version string, e.g.
    /// "2026.09.17.priority-sla-bands-wide-and-auto-promote".</summary>
    public string Version { get; set; } = default!;
}