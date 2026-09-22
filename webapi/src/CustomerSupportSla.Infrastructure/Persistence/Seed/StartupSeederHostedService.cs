using CustomerSupportSla.Application.Repositories;
using CustomerSupportSla.Application.Services;
using CustomerSupportSla.Infrastructure.Persistence.Repositories;
using CustomerSupportSla.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CustomerSupportSla.Infrastructure.Persistence.Seed;

/// <summary>
/// Runs on app startup: ensures the SQLite schema is up-to-date and seeds
/// the showcase dataset if the database is empty.
/// </summary>
public class StartupSeederHostedService : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<StartupSeederHostedService> _logger;

    public StartupSeederHostedService(IServiceProvider services, ILogger<StartupSeederHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SlaDbContext>();
        try
        {
            // Postgres + low-privilege roles: `EnsureCreatedAsync` issues
            // `CREATE SCHEMA public` and a stack of `CREATE TABLE` DDL.
            // Most production setups pre-create the schema and only
            // grant the app role DML (`SELECT / INSERT / UPDATE`) — in
            // which case `CREATE SCHEMA` returns `42501 permission
            // denied for schema public` and crashes startup. We treat
            // that one specific class of error as "schema is already
            // there, you don't need to create it" and continue. Any
            // other failure is a real schema / seed problem and we
            // surface it.
            try
            {
                await db.Database.EnsureCreatedAsync(cancellationToken);
            }
            catch (Exception ex) when (
                IsPermissionError(ex)
            )
            {
                _logger.LogInformation(
                    "[seed] Schema permission denied — assuming pre-existing schema and continuing.");
            }

            await SlaDataSeeder.SeedAsync(db, _logger, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[seed] Failed to apply schema or seed data.");
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Single-call check for the schema-creation step —
    /// we only need to recognise Postgres `42501` (and the
    /// `permission denied` substrings that bubble out of EF's
    /// wrapped `DbUpdateException`). Mirrors the helper inside
    /// <see cref="SlaDataSeeder"/> so both code paths converge on
    /// the same predicate.</summary>
    private static bool IsPermissionError(Exception ex)
    {
        if (ex is Npgsql.PostgresException pg && pg.SqlState == "42501")
        {
            return true;
        }
        var inner = ex.InnerException;
        if (inner is Npgsql.PostgresException pg2 && pg2.SqlState == "42501")
        {
            return true;
        }
        var msg = inner?.Message ?? ex.Message;
        return msg.Contains("42501", StringComparison.Ordinal)
            || msg.Contains("permission denied", StringComparison.OrdinalIgnoreCase);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddSlaInfrastructure(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<SlaDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<IOverviewRepository, OverviewRepository>();
        services.AddScoped<IQueueRepository, QueueRepository>();
        services.AddScoped<ICasesRepository, CasesRepository>();
        services.AddScoped<ILookupsRepository, LookupsRepository>();
        services.AddScoped<IAutomationRepository, AutomationRepository>();
        services.AddHostedService<StartupSeederHostedService>();
        return services;
    }
}