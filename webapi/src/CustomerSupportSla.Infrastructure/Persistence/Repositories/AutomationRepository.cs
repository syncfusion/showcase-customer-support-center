using System.Text.Json;
using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CustomerSupportSla.Infrastructure.Persistence.Repositories;

public class AutomationRepository : IAutomationRepository
{
    private readonly SlaDbContext _db;
    public AutomationRepository(SlaDbContext db) => _db = db;

    public async Task<RoutingRulesResponseDto> GetRoutingRulesAsync(string environment, string team, string range, CancellationToken ct = default)
    {
        var rows = await _db.RoutingRules.AsNoTracking().ToListAsync(ct);
        var items = rows.Select(r => new RoutingRuleDto(
            r.Id, r.Title, r.Subtitle, r.MatchTeam, r.MatchPriority, r.MatchChannel,
            r.RouteToTeam, r.RouteToAgent, r.Active, r.UpdatedBy, r.UpdatedAt,
            r.Matched,
            /* Default to `UpdatedAt` for rows seeded before
             * `LastRun` was added (DateTime.MinValue would
             * render as "—" in the SPA). */
            r.LastRun == DateTime.MinValue ? r.UpdatedAt : r.LastRun
        )).ToList();
        return new RoutingRulesResponseDto(items);
    }

    public async Task<SlaPoliciesResponseDto> GetSlaPoliciesAsync(string environment, string team, string range, CancellationToken ct = default)
    {
        var rows = await _db.SlaPolicies.AsNoTracking().ToListAsync(ct);
        var items = rows.Select(p => new SlaPolicyDto(
            p.Id, p.Title, p.Queue, p.Priority, p.ResponseMinutes, p.ResolutionMinutes,
            p.BreachAlert, p.OnCallEscalation, p.UpdatedBy, p.UpdatedAt
        )).ToList();
        return new SlaPoliciesResponseDto(items);
    }

    public async Task<EscalationWorkflowResponseDto> GetEscalationWorkflowAsync(string id, string environment, string team, string range, CancellationToken ct = default)
    {
        var row = await _db.EscalationWorkflows.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id, ct)
                  ?? await _db.EscalationWorkflows.AsNoTracking().FirstAsync(ct);
        var steps = JsonSerializer.Deserialize<List<WorkflowStepDto>>(row.StepsJson) ?? new();
        var palette = JsonSerializer.Deserialize<List<WorkflowPaletteItemDto>>(row.PaletteJson) ?? new();
        return new EscalationWorkflowResponseDto(new WorkflowDto(row.Id, row.Title, row.Subtitle, steps, palette));
    }

    public async Task<MacrosResponseDto> GetMacrosAsync(string environment, string team, string range, CancellationToken ct = default)
    {
        var rows = await _db.Macros.AsNoTracking().ToListAsync(ct);
        var items = rows.Select(m =>
        {
            /* Mirror the persistence shorthand onto the
             * showcase-friendly DTO fields. When the entity
             * hasn't been migrated / wasn't seeded with the rich
             * shape, we synthesize a sensible default from the
             * `title` / `subtitle` / `useCount` columns so the
             * SPA always sees a complete shape on the wire. */
            var name = string.IsNullOrWhiteSpace(m.Title) ? m.Id : m.Title;
            var shortcut = string.IsNullOrWhiteSpace(m.Shortcut) ? "/" + m.Id : m.Shortcut;
            var body = string.IsNullOrWhiteSpace(m.Body) ? m.Subtitle : m.Body;
            var usage = $"Used {m.UseCount}× · 7d";
            var status = string.IsNullOrWhiteSpace(m.Status) ? "active" : m.Status;
            return new MacroDto(
                m.Id, m.Title, m.Subtitle,
                JsonSerializer.Deserialize<List<string>>(m.TagsJson) ?? new(),
                m.UseCount, m.OwnerName,
                name, shortcut, body, usage, status
            );
        }).ToList();
        return new MacrosResponseDto(items);
    }

    public Task<ImpactKpisDto> GetImpactKpisAsync(string range, CancellationToken ct = default)
    {
        /* Synthesize a deterministic 14-day sparkline per KPI.
         * Endpoints and trends are pegged to the headline value
         * so the chart "lands" on the number printed above it:
         *   • Auto-resolution rate ramps 41 → 47
         *   • Macros used grows 1172 → 1284
         *   • Median first response falls 10:16 → 8:12 (line drops)
         *   • Routing accuracy hovers around 92
         * The renderer uses `SparkColor` for the line fill on
         * the Syncfusion sparkline and the chip tone on the
         * tile header so the two stay consistent. */
        static List<ImpactSparkPointDto> Series(int x, double[] ys)
        {
            var list = new List<ImpactSparkPointDto>(ys.Length);
            for (var i = 0; i < ys.Length; i++)
            {
                list.Add(new ImpactSparkPointDto(x + i, ys[i]));
            }
            return list;
        }

        var kpis = new List<ImpactKpiDto>
        {
            new(
                "Auto-resolution rate", "47%", "up", "+6 pts vs last week", ChipTone.success,
                Series(0, new[] { 41.0, 41.5, 42.0, 41.8, 42.6, 43.2, 43.0, 43.8, 44.2, 44.9, 45.4, 45.8, 46.4, 47.0 }),
                "var(--color-success)"),
            new(
                "Macros used", "1,284", "up", "+112 this week", ChipTone.info,
                Series(0, new[] { 1172.0, 1184.0, 1196.0, 1208.0, 1216.0, 1226.0, 1232.0, 1244.0, 1250.0, 1258.0, 1264.0, 1272.0, 1278.0, 1284.0 }),
                "var(--color-info)"),
            new(
                "Median first response", "8m 12s", "down", "−2m 04s vs last week", ChipTone.success,
                /* Stored in seconds so the line drops to mirror
                 * the "6 mins faster" headline. 10:16 = 616s,
                 * 8:12 = 492s. */
                Series(0, new[] { 616.0, 608.0, 600.0, 592.0, 584.0, 576.0, 568.0, 560.0, 552.0, 540.0, 528.0, 516.0, 504.0, 492.0 }),
                "var(--color-success)"),
            new(
                "Routing accuracy", "92.4%", "flat", "±0 pts", ChipTone.neutral,
                Series(0, new[] { 92.1, 92.3, 92.0, 92.4, 92.2, 92.5, 92.3, 92.4, 92.6, 92.4, 92.5, 92.3, 92.4, 92.4 }),
                "var(--color-text-muted)"),
        };
        return Task.FromResult(new ImpactKpisDto(kpis));
    }

    public Task<ImpactMetricsDto> GetImpactMetricsAsync(string range, CancellationToken ct = default)
    {
        var m = new List<ImpactMetricDto>
        {
            new("Auto-triage coverage", 73, "%", "up", ChipTone.success),
            new("Avg handle time saved", 4.2, "min/ticket", "up", ChipTone.success),
            new("SLA breach reduction", 18, "%", "down", ChipTone.success),
            new("Agent hours saved / week", 38, "hrs", "up", ChipTone.info),
        };
        return Task.FromResult(new ImpactMetricsDto(m));
    }

    public Task<ImpactCoverageDto> GetImpactCoverageAsync(string range, CancellationToken ct = default)
    {
        /* Vary the chart x-axis density + per-period
         * percentages by the requested range so the user
         * sees a distinct chart for 7d / 30d / 90d:
         *   • 7d  → 7 daily buckets   ("Day …" labels)
         *   • 30d → 6 weekly buckets  (per-week aggregation
         *                     since 30 daily points compress
         *                     into a single line at the
         *                     chart's pixel width)
         *   • 90d → 3 monthly buckets (one per month — keeps
         *                     each label readable; longer
         *                     range, less granular chart)
         *
         * The per-period numbers are synthesized from a
         * deterministic seeded pattern (sin-shaped ramp +
         * mild noise) so each period in the series lands on
         * a distinct value instead of a flat horizontal line.
         * Auto-routed lanes higher (the routing engine kicks
         * in fastest), auto-resolved at the band, SLA
         * compliance at the ceiling. */
        var (buckets, labelFn) = BucketShape(range);
        var rows = new List<ImpactCoverageRowDto>(buckets);
        for (var i = 0; i < buckets; i++)
        {
            /* Deterministic shape — sin / cos so adjacent
             * points always differ. The base value drifts
             * up across the period to feel like an "improving"
             * coverage trend. */
            var t = i / (double)Math.Max(1, buckets - 1);
            var wave = Math.Sin(i * 0.9) * 3.0;
            var drift = t * 4.0;
            var autoRouted = ClampPct(82 + wave + drift);
            var autoResolved = ClampPct(64 + Math.Sin(i * 1.2 + 1.0) * 3.0 + drift * 0.8);
            var sla = ClampPct(94 + Math.Cos(i * 0.7 + 0.5) * 2.0 + drift * 0.5);
            rows.Add(new ImpactCoverageRowDto(
                labelFn(i, buckets),
                autoRouted,
                autoResolved,
                sla));
        }
        return Task.FromResult(new ImpactCoverageDto(rows, range));

        static int ClampPct(double v) => (int)Math.Round(Math.Max(0, Math.Min(100, v)));

        static (int Buckets, Func<int, int, string> Label) BucketShape(string r) => r switch
        {
            /* Daily cadence — 7 distinct label shapes
             * ("Day 1"…"Day 7") so the X-axis stays readable.
             * For the 7d range the user gets a tight daily
             * resolution that matches the original
             * "Daily, last 7 days" subtitle. */
            "7d"  => (7,  (i, _) => $"Day {i + 1}"),
            /* Weekly cadence — 6 buckets for the 30d range.
             * The label is the calendar week anchor (e.g.
             * "W36") so a user can correlate the chart
             * back to a real time window. Monday-of-week
             * is what's encoded in the label; the irrelevant
             * absolute day isn't reconstructed here (it
             * would just bloat the chart label). */
            "30d" => (6,  (i, _) => $"W{36 + i}"),
            /* Monthly cadence — 3 buckets for the 90d
             * range. The label is the month abbreviation
             * so a glance reveals the quarter breakdown. */
            "90d" => (3,  (i, _) => (i switch
            {
                0 => "Jul",
                1 => "Aug",
                _ => "Sep",
            })),
            /* Sensible default — falls back to the
             * "Daily, last 7 days" cadence. The SPA renders
             * the same shape but labels it with the actual
             * range value the user picked if the range sat
             * outside the canonical trio. */
            _     => (7,  (i, _) => $"Day {i + 1}"),
        };
    }
}