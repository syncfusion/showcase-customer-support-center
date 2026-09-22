using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CustomerSupportSla.Infrastructure.Persistence;

public class SlaDbContext : DbContext
{
    public SlaDbContext(DbContextOptions<SlaDbContext> options) : base(options) { }

    public DbSet<AgentEntity> Agents => Set<AgentEntity>();
    public DbSet<TicketEntity> Tickets => Set<TicketEntity>();
    public DbSet<SeedVersionEntity> SeedVersions => Set<SeedVersionEntity>();
    public DbSet<CaseActivityEntity> CaseActivities => Set<CaseActivityEntity>();

    public DbSet<RoutingRuleEntity> RoutingRules => Set<RoutingRuleEntity>();
    public DbSet<SlaPolicyEntity> SlaPolicies => Set<SlaPolicyEntity>();
    public DbSet<EscalationWorkflowEntity> EscalationWorkflows => Set<EscalationWorkflowEntity>();
    public DbSet<MacroEntity> Macros => Set<MacroEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AgentEntity>(b =>
        {
            b.ToTable("agents");
            b.HasIndex(a => a.Tier);
        });

        modelBuilder.Entity<TicketEntity>(b =>
        {
            b.ToTable("tickets");
            b.HasIndex(t => t.Status);
            b.HasIndex(t => t.Priority);
            b.HasIndex(t => t.Queue);
            b.HasIndex(t => t.AssigneeId);
            b.HasIndex(t => t.SlaSeverity);
            b.HasIndex(t => t.TicketNumber).IsUnique();
        });

        modelBuilder.Entity<CaseActivityEntity>(b =>
        {
            b.ToTable("case_activities");
            b.HasIndex(a => a.TicketId);
        });

        modelBuilder.Entity<RoutingRuleEntity>(b => b.ToTable("routing_rules"));
        modelBuilder.Entity<SlaPolicyEntity>(b => b.ToTable("sla_policies"));
        modelBuilder.Entity<EscalationWorkflowEntity>(b => b.ToTable("escalation_workflows"));
        modelBuilder.Entity<MacroEntity>(b => b.ToTable("macros"));

        // Single-row marker table replacing the SQLite `PRAGMA user_version`
        // plumbing. `Id` is fixed at 1 so the row acts as a singleton —
        // there's exactly one seeded `seed_versions` row at any time.
        modelBuilder.Entity<SeedVersionEntity>(b =>
        {
            b.ToTable("seed_versions");
            b.HasKey(s => s.Id);
            b.Property(s => s.Id).ValueGeneratedNever();
        });
    }
}