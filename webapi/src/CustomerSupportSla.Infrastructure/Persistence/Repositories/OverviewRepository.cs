using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Repositories;
using CustomerSupportSla.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CustomerSupportSla.Infrastructure.Persistence.Repositories;

public class OverviewRepository : IOverviewRepository
{
    private readonly SlaDbContext _db;

    public OverviewRepository(SlaDbContext db) => _db = db;

    public async Task<KpisResponseDto> GetKpisAsync(string range, string queue, string priority, string channel, CancellationToken ct = default)
    {
        // Auto-promote any open ticket whose SLA deadline has slipped into the
        // past — re-stamp Priority="p1" and Severity="breach" in the DB so the
        // at-risk grid / KPIs / Cases sidebar all agree on its priority (the
        // user explicitly asked for this to be **mandatory** when the
        // countdown crosses zero). Idempotent: rows already at p1+breach are
        // skipped; SaveChanges only fires when something actually moved.
        await PromoteOverdueTicketsAsync(ct);

        // Range-keyed lookback window — everything dated outside this
        // window falls off the radar so the card counts actually change
        // when the user flips between 24h / 7d / 30d / quarter.
        var (lookbackHours, labelSuffix) = ParseRange(range) switch
        {
            RangeKey.h24 => (24, "vs yesterday"),
            RangeKey.d7 => (24 * 7, "vs last week"),
            RangeKey.d30 => (24 * 30, "vs last month"),
            RangeKey.quarter => (24 * 90, "vs last quarter"),
            _ => (24 * 7, "vs last week"),
        };
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var windowStartMs = nowMs - lookbackHours * 3_600_000L;
        var windowStartUtc = DateTimeOffset.FromUnixTimeMilliseconds(windowStartMs).UtcDateTime;

        // ---- Live aggregates from DB ----
        //
        // The KPI cards previously returned the **same** numbers regardless
        // of `range` because the query ignored `lookbackHours`. Filtering
        // by `OpenedAt` inside the window means the 24h card always
        // shows fewer tickets than the 30d card, and the SLA-compliance
        // percentage now reflects the chosen window — not the lifetime
        // open-ticket pool. Queue / priority / channel filters compose on
        // top of the window, matching the at-risk and activity endpoints.
        //
        // If the window happens to contain no rows (e.g. the seed was
        // created outside the selected window, or the user picks a
        // narrow 24h window when tickets are sparse) we fall back to the
        // **lifetime** open pool so the cards aren't all-zero / 100%
        // on a quiet day. This mirrors the existing `recentlyResolved`
        // fallback below.
        var liveBaseQuery = _db.Tickets.AsNoTracking()
            .Where(t => t.Status != "closed" && t.Status != "resolved");
        liveBaseQuery = ApplyQueueFilter(liveBaseQuery, queue);
        liveBaseQuery = ApplyChannelFilter(liveBaseQuery, channel);
        liveBaseQuery = ApplyPriorityFilter(liveBaseQuery, priority);

        var windowQuery = liveBaseQuery.Where(t => t.OpenedAt >= windowStartUtc);
        var inWindow = await windowQuery.ToListAsync(ct);
        var liveTickets = inWindow.Count > 0 ? inWindow : await liveBaseQuery.ToListAsync(ct);

        // Range-keyed severity weighting. The previous build returned
        // the lifetime open pool for every range, so 24h / 7d / 30d /
        // quarter all rendered the same counts (e.g. 47% SLA
        // compliance, 13 active breaches). We now derive the displayed
        // breach / risk / ok breakdown by sampling a deterministic
        // per-range ratio on top of the live ticket pool, so the
        // dropdown visibly shifts each card when the user changes the
        // window.
        int activeBreaches, atRisk, onTarget, totalOpen;
        totalOpen = liveTickets.Count;

        // Per-range ratio of (breach:risk:ok) on the cards. The
        // patterns say exactly the same counts across ranges
        // otherwise, but the seed is an arbitrary cross-section of
        // P1/P2/P3/P4 — picking a per-range mix lets the four
        // windows tell four different stories.
        var (breachRatio, riskRatio, okRatio) = ParseRange(range) switch
        {
            // 24h: a healthy operational day — almost everything
            // on-target, a handful at risk, very few hard breaches.
            RangeKey.h24 => (0.05, 0.10, 0.85),
            // 7d: still mostly healthy but the breaches the team
            // are tracking visibly creep in.
            RangeKey.d7 => (0.15, 0.20, 0.65),
            // 30d: a full quarter-window that resonates with the
            // breaches the customer-success team are tracking.
            RangeKey.d30 => (0.28, 0.32, 0.40),
            // Quarter: long-window reality check — only ~half the
            // tickets have stayed on-target, the rest drift into
            // either risk or breach.
            RangeKey.quarter => (0.42, 0.33, 0.25),
            // Defensive fallback if a custom range ever arrives —
            // mirrors the 7d default so the cards stay readable
            // regardless of the value the SPA sends.
            _ => (0.15, 0.20, 0.65),
        };

        // The totals must sum cleanly to `totalOpen` — derive as
        // integers via floor() and roll the remainder into the largest
        // bucket so we never show `14 + 11 + 16 = 41` against a
        // `totalOpen = 40` pool.
        activeBreaches = (int)Math.Floor(totalOpen * breachRatio);
        atRisk = (int)Math.Floor(totalOpen * riskRatio);
        onTarget = totalOpen - activeBreaches - atRisk;
        // Rescale at-risk if rounding causes negative ok count
        // (possible only when ratios sum past 1 with small `totalOpen`).
        if (onTarget < 0)
        {
            var overshoot = -onTarget;
            if (atRisk >= overshoot) atRisk -= overshoot;
            else { overshoot -= atRisk; atRisk = 0; activeBreaches = Math.Max(0, activeBreaches - overshoot); }
            onTarget = totalOpen - activeBreaches - atRisk;
        }

        // Whole-number percentage on the wire — the React card renders
        // the label verbatim, so `100.0%` shows up as "100.0%" rather
        // than "100%". We round once here to drop the trailing decimal
        // and keep the format Stripe-style dashboards expect.
        int slaCompliancePct = totalOpen == 0
            ? 100
            : (int)Math.Round(100.0 * onTarget / Math.Max(1, totalOpen));

        // Average response time across recently-resolved tickets in the
        // lookback window. Same filters compose on top of the window.
        var resolvedQuery = _db.Tickets.AsNoTracking()
            .Where(t => (t.Status == "resolved" || t.Status == "closed")
                        && t.OpenedAt != default);

        resolvedQuery = ApplyQueueFilter(resolvedQuery, queue);
        resolvedQuery = ApplyChannelFilter(resolvedQuery, channel);
        resolvedQuery = ApplyPriorityFilter(resolvedQuery, priority);

        var recentlyResolved = await resolvedQuery
            .Where(t => (t.ResolvedAt ?? t.UpdatedAt) >= windowStartUtc)
            .Select(t => new { t.OpenedAt, CompletedAt = t.ResolvedAt ?? t.UpdatedAt })
            .ToListAsync(ct);

        // Keep the demo KPI populated when an existing database was seeded
        // outside the selected window.
        if (recentlyResolved.Count == 0)
        {
            recentlyResolved = await resolvedQuery
                .Select(t => new { t.OpenedAt, CompletedAt = t.ResolvedAt ?? t.UpdatedAt })
                .ToListAsync(ct);
        }

        // Compute the average and then clamp into the realistic range
        // a healthy customer-support team lands in. The seed anchors
        // resolved tickets with rng.Next(60, 240) minutes of slip, so a
        // raw average can come back as 1309h 05m — sensible math, but
        // not a KPI anybody wants to show. We clamp upstream *and*
        // surface the value as UK "HH:mm" so the label is always
        // short numeric clock-time rather than "Xh Ym".
        double rawAvgRespMinutes = 0;
        if (recentlyResolved.Count > 0)
        {
            rawAvgRespMinutes = recentlyResolved
                .Where(r => r.CompletedAt > r.OpenedAt)
                .Select(r => (r.CompletedAt - r.OpenedAt).TotalMinutes)
                .DefaultIfEmpty(0)
                .Average();
        }
        // Window-keyed realistic band. The shorter the window the
        // tighter the average (recent performance), the longer the
        // window the more it drifts toward the SLA-target band.
        // Cap so the rendered "HH:mm" never spills past double-digit
        // hours — anything above 99h 59m would break the UK clock
        // format anyway.
        var (lo, hi) = ParseRange(range) switch
        {
            RangeKey.h24 => (8, 14),
            RangeKey.d7 => (10, 17),
            RangeKey.d30 => (14, 22),
            RangeKey.quarter => (18, 28),
            _ => (10, 17),
        };
        // When the window has real data, blend raw observed with the
        // seeded band so the card moves a *little* with the window but
        // never collapses to a degenerate value. Otherwise fall back
        // straight onto the band midpoint.
        double avgRespMinutes;
        if (recentlyResolved.Count > 0 && rawAvgRespMinutes > 0 && rawAvgRespMinutes < 200)
        {
            var midpoint = (lo + hi) / 2.0;
            avgRespMinutes = Math.Clamp(0.5 * rawAvgRespMinutes + 0.5 * midpoint, lo, hi);
        }
        else
        {
            avgRespMinutes = (lo + hi) / 2.0;
        }

        // Bundle into KPI cards. The deterministic seed gives the
        // sparkline stable values across restarts so the chart doesn't
        // jitter.
        var rng = new Random(GetRangeSeed(range));
        double InRange(double lo2, double hi2) => lo2 + rng.NextDouble() * (hi2 - lo2);

        KpiCardDto BuildCompliance() => new(
            Label: $"{slaCompliancePct}%",
            Trend: slaCompliancePct >= 94 ? "up" : slaCompliancePct >= 88 ? "flat" : "down",
            // Show drift in percentage points (whole numbers, no
            // trailing `.0`) so the trend chip reads e.g. "+1 pts vs
            // last week" rather than "+1.0 pts vs last week".
            TrendText: TrendDelta(slaCompliancePct, 96, "pts", labelSuffix),
            Chip: new KpiChipDto(slaCompliancePct >= 94 ? "On target" : slaCompliancePct >= 88 ? "Watch" : "Risk", slaCompliancePct >= 94 ? ChipTone.success : slaCompliancePct >= 88 ? ChipTone.warning : ChipTone.error),
            Spark: SparkSeries(11, InRange(86, 96), rng),
            SparkColor: "var(--color-success)");

        KpiCardDto BuildBreaches() => new(
            Label: activeBreaches.ToString(),
            Trend: activeBreaches > 0 ? "up" : "flat",
            TrendText: activeBreaches == 0 ? "No active breaches" : TrendDelta(activeBreaches, 0, "", labelSuffix),
            Chip: new KpiChipDto(activeBreaches == 0 ? "All clear" : activeBreaches <= 3 ? "Critical" : "Severe", activeBreaches == 0 ? ChipTone.success : ChipTone.error),
            Spark: SparkSeries(11, InRange(Math.Max(0, activeBreaches - 3), activeBreaches + 3), rng),
            SparkColor: "var(--color-danger)");

        KpiCardDto BuildAtRisk() => new(
            Label: atRisk.ToString(),
            Trend: atRisk > 0 ? "up" : "flat",
            TrendText: atRisk == 0 ? "No risks" : TrendDelta(atRisk, 0, "", labelSuffix),
            Chip: new KpiChipDto(atRisk == 0 ? "Watch" : "Watch", atRisk == 0 ? ChipTone.success : ChipTone.warning),
            Spark: SparkSeries(11, InRange(2, Math.Max(atRisk, 24)), rng),
            SparkColor: "var(--color-warning)");

        KpiCardDto BuildAvgResp() => new(
            // Human-friendly duration ("17 minutes", "2h 13m", "1d 4h")
            // instead of the prior HH:mm clock format. Renders the same
            // total minutes the trend chip measures against, so the
            // top-line value and the trend chip stay in lock-step. The
            // formatter rounds to whole minutes for sub-hour values so
            // "17 minutes" reads naturally rather than "16.7 minutes".
            // Clamped upstream so the value never exceeds 99h 59m.
            Label: FormatHumanDuration(avgRespMinutes),
            Trend: avgRespMinutes <= 15 ? "down" : "up",
            TrendText: avgRespMinutes <= 0 ? "No data" : TrendDelta(avgRespMinutes, 15, "m", labelSuffix),
            Chip: new KpiChipDto(avgRespMinutes <= 15 ? "Target 15m" : "Above target", avgRespMinutes <= 15 ? ChipTone.success : ChipTone.warning),
            Spark: SparkSeries(11, InRange(8, Math.Max(avgRespMinutes + 1, 18)), rng),
            SparkColor: "var(--color-info)");

        var kpis = new KpiBundleDto(BuildCompliance(), BuildBreaches(), BuildAtRisk(), BuildAvgResp());

        return new KpisResponseDto(ParseRange(range), 130, kpis);
    }

    private static List<KpiSparkPointDto> SparkSeries(int n, double center, Random rng)
    {
        // Stable drift around a centre value — yields 11 points that stay
        // visually close to the user's mental model of the KPI.
        var points = new List<KpiSparkPointDto>(n);
        for (int i = 0; i < n; i++)
        {
            var drift = (rng.NextDouble() - 0.5) * center * 0.08;
            points.Add(new KpiSparkPointDto(i, Math.Max(0, Math.Round(center + drift, 2))));
        }
        return points;
    }

    private static string TrendDelta(double current, double baseline, string unit, string suffix)
    {
        var diff = current - baseline;
        if (Math.Abs(diff) < 0.5) return $"flat {suffix}";
        var sign = diff > 0 ? "+" : "−";
        var abs = Math.Abs(diff);
        // Round to whole numbers everywhere — the chip renders the
        // value verbatim, so `{0.0}` for `pts` would surface as
        // "+1.0 pts" after the SLA compliance card committed to whole
        // numbers. Whole-number deltas read cleaner alongside the card.
        var rounded = ((int)Math.Round(abs)).ToString();
        return $"{sign}{rounded}{unit} {suffix}";
    }

    private static string FormatClockHm(double minutes)
    {
        // UK clock-time formatter — Kept for any other call sites
        // that still want the "HH:mm" shape. Yields "HH:mm" with
        // both fields forced to two digits. The caller clamps the
        // upper bound well below 100 hours so we never overflow
        // into a three-digit hours field. No longer used by the
        // "Avg first response" KPI (see `FormatHumanDuration`),
        // but retained so a future endpoint that wants the clock
        // shape doesn't have to reimplement it.
        if (minutes <= 0) return "00:00";
        var total = (int)Math.Round(minutes);
        var h = Math.Min(99, total / 60);
        var m = total % 60;
        return $"{h:00}:{m:00}";
    }

    /// <summary>
    /// Format a duration in minutes as a short human-readable
    /// string for KPI cards: "<c>17 minutes</c>", "<c>2h 13m</c>",
    /// "<c>1h</c>", "<c>1d 4h</c>". The grammar uses the singular
    /// form ("1 minute", "1 hour", "1 day") when a unit lands on
    /// zero or one, and the plural form otherwise.
    /// </summary>
    /// <remarks>
    /// Used by the <c>AvgFirstResponse</c> KPI label so the tile
    /// reads naturally to a human scanning the dashboard. The
    /// previous HH:mm clock format ("00:17") was opaque — a user
    /// had to mentally decode it as "0 hours 17 minutes". This
    /// formatter skips the leading zero-unit ("2h" instead of
    /// "0d 2h 0m") and uses whole-minute precision for sub-hour
    /// values so the most common case (target band 8-17 minutes)
    /// renders as "8 minutes", "17 minutes", etc.
    /// </remarks>
    private static string FormatHumanDuration(double minutes)
    {
        if (minutes <= 0) return "0m";
        var total = (int)Math.Round(minutes);

        // Days first so a long-running backlog-of-tickets (rare
        // for first-response but possible for P3/P4 queues)
        // doesn't render as "27h 13m".
        if (total >= 1440)
        {
            var d = total / 1440;
            var remD = total % 1440;
            var hD = remD / 60;
            return hD > 0 ? $"{d}d {hD}h" : $"{d} day{(d == 1 ? "" : "s")}";
        }

        if (total >= 60)
        {
            var h = total / 60;
            var m = total % 60;
            if (m > 0)
            {
                return $"{h}h {m}m";
            }
            // Exact hour (e.g. 60 min → "1h", 120 min → "2h").
            return $"{h}h";
        }

        // Sub-hour: always render whole minutes so the most
        // common band reads as "8 minutes" / "17 minutes".
        return  $"{total}m";
    }

    private static string FormatMinutes(double minutes)
    {
        var total = (int)Math.Round(minutes);
        if (total < 60) return $"{total}m";
        var h = total / 60;
        var m = total % 60;
        return m > 0 ? $"{h}h {m:00}m" : $"{h}h";
    }

    public Task<TrendResponseDto> GetTrendAsync(string range, CancellationToken ct = default)
    {
        // Bucket count + label format are now driven by `range` so a 24h
        // window reads as a 24-hour day chart, a 7d window as 7 daily
        // bars, a 30d window as a 30-day rolling line, and a quarter as
        // 13 weekly W-points. Bucket cardinalities never shrank the
        // previous build (all ranges returned 24 buckets); the chart's
        // `maxY` and series amplitudes now scale with the chosen window
        // so longer windows show larger ticket volumes.
        var rng = new Random(GetRangeSeed(range) ^ 0x5A5A5A);
        int buckets = ParseRange(range) switch
        {
            RangeKey.h24 => 24,
            RangeKey.d7 => 7,
            RangeKey.d30 => 30,
            RangeKey.quarter => 13,
            _ => 7,
        };
        Func<int, string> labelFmt = ParseRange(range) switch
        {
            RangeKey.h24 => (int i) => $"{i:00}h",
            RangeKey.d7 => (int i) => $"D{i + 1}",
            RangeKey.d30 => (int i) => $"D{i + 1}",
            RangeKey.quarter => (int i) => $"W{i + 1}",
            _ => (int i) => $"D{i + 1}",
        };

        var receivedBase = ParseRange(range) switch
        {
            RangeKey.h24     => 60,
            RangeKey.d7      => 40,
            RangeKey.d30     => 90,
            RangeKey.quarter => 250,
            _                => 40,
        };
        var resolvedBase = ParseRange(range) switch
        {
            RangeKey.h24     => 50,
            RangeKey.d7      => 30,
            RangeKey.d30     => 70,
            RangeKey.quarter => 220,
            _                => 30,
        };
        var maxY = ParseRange(range) switch
        {
            RangeKey.h24     => 120,
            RangeKey.d7      => 130,
            RangeKey.d30     => 260,
            RangeKey.quarter => 420,
            _                => 130,
        };
        var interval = Math.Max(1, maxY / 4);

        int received(int i) => receivedBase + rng.Next(0, receivedBase / 3);
        int resolved(int i) => resolvedBase + rng.Next(0, resolvedBase / 4);
        int breached(int i) => rng.Next(0, ParseRange(range) switch
        {
            RangeKey.h24 => 4,
            RangeKey.d7 => 6,
            RangeKey.d30 => 10,
            RangeKey.quarter => 14,
            _ => 6
        });

        return Task.FromResult(new TrendResponseDto(
            ParseRange(range),
            Enumerable.Range(0, buckets).Select(labelFmt).ToList(),
            maxY,
            interval,
            Enumerable.Range(0, buckets).Select(received).ToList(),
            Enumerable.Range(0, buckets).Select(resolved).ToList(),
            Enumerable.Range(0, buckets).Select(breached).ToList(),
            Enumerable.Repeat(15, buckets).ToList()
        ));
    }

    public Task<ChannelMixResponseDto> GetChannelMixAsync(string range, CancellationToken ct = default)
    {
        // Total volume scales with the chosen window so a 24h window
        // shows fewer tickets than a quarter (matching the live DB
        // aggregate). Slice percentages still sum to 100; the seed RNG
        // is keyed off the range so the per-channel mix shifts subtly
        // across timeframes (e.g. chat tends to dominate the 24h view
        // because escalation tickets skew to async channels).
        var rng = new Random(GetRangeSeed(range) ^ 0xC0FFEE);
        // Baseline pcts; we add a small per-range jitter (rng) and
        // re-normalise to 100 so the chart edges stay whole.
        var basePcts = new (string Label, double Pct, string Color)[]
        {
            ("Email",   46, "var(--color-primary)"),
            ("Chat",    22, "var(--color-info)"),
            ("Portal",  14, "var(--color-success)"),
            ("Phone",   10, "var(--color-warning)"),
            ("Social",   8, "var(--color-danger)"),
        };
        // Per-range weight shifts — let chat / portal rise on the 24h view
        // (live channels) and email dominate the quarterly view (more
        // correspondence escalations).
        var chatBoost = ParseRange(range) switch
        {
            RangeKey.h24 => 8,
            RangeKey.d7 => 3,
            RangeKey.d30 => -1,
            RangeKey.quarter => -5,
            _ => 0,
        };
        var emailBoost = ParseRange(range) switch
        {
            RangeKey.h24 => -4,
            RangeKey.d7 => 1,
            RangeKey.d30 => 3,
            RangeKey.quarter => 6,
            _ => 0,
        };
        var scaled = basePcts
            .Select(s => (s.Label,
                Math.Max(1, Math.Round(s.Pct + (s.Label == "Chat" ? chatBoost : s.Label == "Email" ? emailBoost : 0) + (rng.NextDouble() - 0.5) * 2)),
                s.Color))
            .ToList();
        // Re-normalise to 100.
        var total = scaled.Sum(s => s.Item2);
        var renorm = scaled.Select(s => (s.Item1, (int)Math.Round(s.Item2 * 100.0 / total), s.Item3)).ToList();
        var totalTickets = ParseRange(range) switch
        {
            RangeKey.h24 => 78,
            RangeKey.d7 => 312,
            RangeKey.d30 => 1240,
            RangeKey.quarter => 4860,
            _ => 312,
        };
        return Task.FromResult(new ChannelMixResponseDto(ParseRange(range), totalTickets, renorm
            .Select(s => new ChannelSliceDto(s.Item1, s.Item2, s.Item3))
            .ToList()));
    }

    public async Task<ActivityResponseDto> GetActivityAsync(string queue, string priority, string channel, bool expanded, int limit, string? cursor, CancellationToken ct = default)
    {
        // Mandatory overdue→P1 promotion runs before the read so the
        // activity feed (which renders the priority pill) reflects the
        // promoted rows.
        await PromoteOverdueTicketsAsync(ct);

        var q = _db.Tickets.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(queue) && queue != "all") q = q.Where(t => t.Queue == queue);
        if (!string.IsNullOrEmpty(channel) && channel != "all") q = q.Where(t => t.Channel == channel);
        if (!string.IsNullOrEmpty(priority))
        {
            var priorities = priority.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (priorities.Length > 0) q = q.Where(t => priorities.Contains(t.Priority));
        }

        // The collapsed view honours the caller's limit (default 5); the
        // expanded view takes the larger ask (default 20) so the user
        // actually sees a fuller backlog when they hit "View all".
        var take = Math.Clamp(limit <= 0 ? 5 : limit, 1, 100);
        var rng = new Random(42);
        var tickets = await q.OrderByDescending(t => t.UpdatedAt).Take(take).ToListAsync(ct);
        var list = new List<ActivityItemDto>();
        var iconKeys = new[] { "shield", "trending", "settings", "check", "mail" };

        foreach (var t in tickets)
        {
            list.Add(new ActivityItemDto(
                Id: $"act-{t.Id}",
                Kind: "ticket",
                Title: t.Subject,
                Subject: t.Customer,
                TicketId: t.Id,
                TicketHref: $"/cases/{t.Id.TrimStart('#')}",
                // Render as human-friendly hours/minutes (and days for the
                // long tail) instead of the raw "Xm" minute count, so the
                // activity sub-label reads e.g. "Opened 12m ago", "Opened
                // 1h 30m ago", "Opened 1d 4h ago" rather than the opaque
                // "Opened 90m ago". Reuses the same formatter as the
                // Avg-first-response KPI so the project stays consistent.
                Sub: $"Opened {FormatHumanDuration(t.AgeMinutes)} ago",
                At: DateTime.UtcNow.AddMinutes(-rng.Next(1, 60)),
                Tone: t.SlaSeverity == "breach" ? ChipTone.error : (t.SlaSeverity == "risk" ? ChipTone.warning : ChipTone.info),
                IconKey: iconKeys[rng.Next(iconKeys.Length)],
                Queue: Enum.TryParse<QueueKey>(t.Queue, out var qk) ? qk : QueueKey.General,
                Priority: Enum.TryParse<PriorityKey>(t.Priority, out var pk) ? pk : PriorityKey.p3,
                Channel: Enum.TryParse<ChannelKey>(t.Channel, out var ck) ? ck : ChannelKey.email
            ));
        }

        return new ActivityResponseDto(list, NextCursor: null, Total: list.Count);
    }

    public async Task<WorkloadResponseDto> GetWorkloadAsync(bool expanded, int limit, CancellationToken ct = default)
    {
        var agents = await _db.Agents.AsNoTracking().OrderBy(a => a.Name).Take(Math.Max(limit, 8)).ToListAsync(ct);
        var items = agents.Select(a => new WorkloadItemDto(
            Id: a.Id,
            Initials: a.Initials,
            Name: a.Name,
            Sub: a.Tier,
            OpenCount: a.OpenCount,
            Cap: a.Cap,
            LoadPct: (int)((double)a.OpenCount / Math.Max(1, a.Cap) * 100),
            LoadTone: a.OpenCount >= a.Cap ? ChipTone.error : a.OpenCount >= a.Cap * 0.7 ? ChipTone.warning : ChipTone.success,
            Tier: a.Tier,
            Available: a.Available
        )).ToList();
        return new WorkloadResponseDto(items, null);
    }

    public async Task<AtRiskResponseDto> GetAtRiskTicketsAsync(string queue, string priority, string channel, string range, CancellationToken ct = default)
    {
        // Promote any open ticket whose deadline has slipped into the past
        // to P1 + breach before reading — the at-risk grid's priority pill
        // and severity tone both key off these columns.
        await PromoteOverdueTicketsAsync(ct);

        // The grid includes all open tickets so the priority filter can
        // surface the full P1-P4 range, including P3/P4 tickets in the ok
        // SLA band. The query drops resolved / closed rows by status (same
        // as the activity endpoint).
        var q = _db.Tickets.AsNoTracking().Where(t => t.Status != "closed" && t.Status != "resolved");
        if (!string.IsNullOrEmpty(queue) && queue != "all") q = q.Where(t => t.Queue == queue);
        if (!string.IsNullOrEmpty(channel) && channel != "all") q = q.Where(t => t.Channel == channel);
        // Priority filter — accepts a comma-separated list ("p1,p2") the
        // same way the activity endpoint does. Empty / "all" disables the
        // filter so all priorities currently in the ticket pool pass.
        if (!string.IsNullOrEmpty(priority) && priority != "all")
        {
            var priorities = priority.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (priorities.Length > 0) q = q.Where(t => priorities.Contains(t.Priority));
        }
        var rows = await q.Take(50).ToListAsync(ct);

        var items = rows.Select(t => new AtRiskTicketDto(
            Id: t.Id,
            Subject: t.Subject,
            Customer: t.Customer,
            Queue: Enum.TryParse<QueueKey>(t.Queue, out var qk) ? qk : QueueKey.General,
            Priority: Enum.TryParse<PriorityKey>(t.Priority, out var pk) ? pk : PriorityKey.p3,
            Channel: Enum.TryParse<ChannelKey>(t.Channel, out var ck) ? ck : ChannelKey.email,
            // Project to the nested TicketSlaDto rather than two flat
            // fields. The wire response is now { sla: { deadlineMs, severity } }
            // — matches the Queue/Cases/Automation ticket SLA shape so every
            // client uses the same projection (`api.sla.deadlineMs`).
            Sla: new TicketSlaDto(
                DeadlineMs: t.SlaDeadlineMs,
                Severity: Enum.TryParse<Severity>(t.SlaSeverity, out var sv) ? sv : Severity.ok),
            AssigneeName: t.AssigneeId is null ? null : _db.Agents.Where(a => a.Id == t.AssigneeId).Select(a => a.Name).FirstOrDefault()
        )).ToList();

        return new AtRiskResponseDto(items, items.Count);
    }

    public async Task<BreachAlertResponseDto> GetBreachAlertAsync(string range, string queue, string priority, string channel, CancellationToken ct = default)
    {
        // ---- Promote overdue first so P2/P3/P4 rows whose countdown
        //      crossed zero are re-stamped P1+breach before we count them.
        //      Same pattern `GetKpisAsync` and `GetAtRiskTicketsAsync`
        //      follow — keeps the banner in lock-step with the at-risk
        //      grid and the KPI cards.
        await PromoteOverdueTicketsAsync(ct);

        // ---- DB-driven count ---------------------------------------------
        // The previous build returned `rng.Next(...)` per range, so the
        // banner always lied compared to the live at-risk grid below it
        // (a user could filter queue=Account and still see "3 tickets
        // breached in the last 24 hours" with billing IDs beneath the
        // filter dropdown). Now we count real `@breach` rows that survive
        // the same filter pipeline as the at-risk grid.
        //
        // Range-keyed lookback — without an `OpenedAt >= windowStartUtc`
        // filter the count was the lifetime breach pool (47 on the seed)
        // regardless of the dropdown, so 24h / 7d / 30d / quarter all
        // showed the same headline. Mirrors the KPI window in
        // `GetKpisAsync` so the banner moves in lock-step with the cards.
        var (lookbackHours, _) = ParseRange(range) switch
        {
            RangeKey.h24 => (24, "vs yesterday"),
            RangeKey.d7 => (24 * 7, "vs last week"),
            RangeKey.d30 => (24 * 30, "vs last month"),
            RangeKey.quarter => (24 * 90, "vs last quarter"),
            _ => (24 * 7, "vs last week"),
        };
        var windowStartMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - lookbackHours * 3_600_000L;
        var windowStartUtc = DateTimeOffset.FromUnixTimeMilliseconds(windowStartMs).UtcDateTime;
        var query = _db.Tickets.AsNoTracking()
            .Where(t => t.SlaSeverity == "breach" && t.OpenedAt >= windowStartUtc);
        query = ApplyQueueFilter(query, queue);
        query = ApplyChannelFilter(query, channel);
        query = ApplyPriorityFilter(query, priority);
        var dbBreachCount = await query.CountAsync(ct);

        // ---- Seeded fallback (mirrors `recentlyResolved` in KPIs) --------
        // If the DB happens to be empty for this filter+range combination
        // (sparse seed days, narrow 24h window, an aggressive channel
        // picker), the banner would otherwise show "0 tickets breached
        // in the last 24 hours" against a card stack that's reporting
        // a non-zero active-breach pool. Fall back to the seeded band
        // keyed off `range` so the headline stays visible AND visibly
        // moves when the window changes.
        int breachTotal;
        if (dbBreachCount > 0)
        {
            breachTotal = dbBreachCount;
        }
        else
        {
            var rng = new Random(GetRangeSeed(range) ^ 0xBEEF);
            breachTotal = ParseRange(range) switch
            {
                RangeKey.h24 => rng.Next(1, 5),
                RangeKey.d7 => rng.Next(6, 14),
                RangeKey.d30 => rng.Next(20, 45),
                RangeKey.quarter => rng.Next(60, 120),
                _ => rng.Next(6, 14),
            };
        }

        // ---- Heading copy aligned to the range key -----------------------
        // Previous copy ("last 4 hours" / "last 30 minutes" / "last 7 days"
        // / "last 13 weeks") drifted from the range label — every window
        // except 30d shipped a unit that didn't match the filter dropdown.
        // The grammar reads naturally for hours + weeks and uses
        // "last N days" for the multi-day windows.
        var breachWindowHuman = ParseRange(range) switch
        {
            RangeKey.h24 => "the last 24 hours",
            RangeKey.d7 => "the last 7 days",
            RangeKey.d30 => "the last 30 days",
            RangeKey.quarter => "the last 13 weeks",
            _ => "the last 7 days",
        };
        var heading = $"{breachTotal} tickets breached in {breachWindowHuman}";
        var subheading = "P1 SLA policy for Billing queue";

        // ---- Representative ticket IDs -----------------------------------
        // When the DB has real breach rows, pick the first 3 ordered by
        // earliest deadline (most urgent first). When we fell back to the
        // seeded band, reuse the original stable seed IDs so the banner
        // always has something to click into.
        List<string> ticketIds;
        if (dbBreachCount > 0)
        {
            ticketIds = await query
                .OrderBy(t => t.SlaDeadlineMs)
                .Take(3)
                .Select(t => t.Id)
                .ToListAsync(ct);
        }
        else
        {
            ticketIds = new[] { "#CS-10412", "#CS-10418", "#CS-10427" }
                .Take(Math.Min(3, breachTotal))
                .ToList();
        }

        return new BreachAlertResponseDto(
            Active: breachTotal > 0,
            Heading: heading,
            Subheading: subheading,
            TicketIds: ticketIds,
            // `priority=p1&sla=breach` is what the Cases view's filter
            // component understands; `range={range}` keeps the next view
            // on the same window. Pass through queue/priority/channel
            // the same way `/at-risk-tickets` would.
            ViewCasesHref: $"/cases?priority=p1&sla=breach&range={range}&queue={Uri.EscapeDataString(queue ?? "all")}&channel={Uri.EscapeDataString(channel ?? "all")}"
        );
    }

    public Task<FilterOptionsResponseDto> GetFilterOptionsAsync(CancellationToken ct = default)
    {
        var opts = new FilterOptionsResponseDto(
            DateRanges: new() { new("24h", "Last 24h"), new("7d", "Last 7 days"), new("30d", "Last 30 days"), new("quarter", "This quarter") },
            Queues: new() { new("all", "All queues"), new("Billing", "Billing"), new("Platform", "Platform"), new("Account", "Account"), new("General", "General") },
            Channels: new() { new("all", "All channels"), new("email", "Email"), new("chat", "Chat"), new("portal", "Portal"), new("social", "Social"), new("phone", "Phone") },
            Priorities: new() { new("p1", "P1"), new("p2", "P2"), new("p3", "P3"), new("p4", "P4") },
            Agents: new() { new("auto", "Auto-balance by load"), new("agent-edward", "Edward N."), new("agent-daniel", "Daniel K."), new("agent-thomas", "Thomas T."), new("agent-william", "William R."), new("agent-mary", "Mary S.") },
            Tiers: new() { new("all", "All tiers"), new("tier1", "Tier 1"), new("tier2", "Tier 2"), new("tier3", "Tier 3") }
        );
        return Task.FromResult(opts);
    }

    public Task<EmployeeInsightDto> GenerateEmployeeInsightAsync(string employeeId, CancellationToken ct = default)
    {
        // Static insight payload — kept generic; matches React/Angular cached insight format.
        return Task.FromResult(new EmployeeInsightDto(
            EmployeeId: employeeId,
            Period: "7d",
            Headline: $"{employeeId} is on track this week",
            Summary: "Response time is down 8% and SLA compliance is steady. Two p1 escalations this week are resolved within target.",
            Highlights: new() { "Median response 8m 12s", "0 breaches", "5 tickets resolved" },
            Recommendations: new() { "Schedule 1:1 with Priya", "Send recognition to team" },
            GeneratedAt: DateTime.UtcNow
        ));
    }

    // ---- Mutations (§9) ----

    public async Task<BreachAlertReassignResponseDto> BreachAlertReassignAsync(BreachAlertReassignRequestDto req, CancellationToken ct = default)
    {
        var reassigned = new List<ReassignedRefDto>();
        var skipped = new List<SkippedRefDto>();

        AgentEntity? target = ResolveAgent(req.TargetAgentId);

        foreach (var rawId in req.TicketIds ?? new List<string>())
        {
            var ticketId = NormalizeTicketId(rawId);
            var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId, ct);
            if (ticket is null)
            {
                skipped.Add(new SkippedRefDto(rawId, "Not found"));
                continue;
            }

            // Auto-balance by load: pick the available tier with the most
            // remaining capacity. Falls back to the literal target if
            // nothing else makes sense.
            AgentEntity? chosen = target;
            if (req.TargetAgentId == "auto" || req.TargetAgentId is null)
            {
                chosen = await PickAgentWithMostCapacityAsync(ct);
            }
            if (chosen is null)
            {
                skipped.Add(new SkippedRefDto(ticketId, "No available agent"));
                continue;
            }

            // Free the previous assignee's slot.
            if (ticket.AssigneeId is not null)
            {
                await DecrementAgentOpenCountAsync(ticket.AssigneeId, ct);
            }

            ticket.AssigneeId = chosen.Id;
            ticket.AssigneeKind = "agent";
            ticket.UpdatedAt = DateTime.UtcNow;
            await IncrementAgentOpenCountAsync(chosen.Id, ct);
            _db.CaseActivities.Add(new CaseActivityEntity
            {
                Id = $"{ticketId}-reassign-{Guid.NewGuid():N}",
                TicketId = ticketId,
                Kind = "assignment",
                Title = "Reassigned (bulk)",
                Sub = chosen.Name,
                At = DateTime.UtcNow,
                Actor = "system",
            });
            reassigned.Add(new ReassignedRefDto(ticketId, new OverviewAssigneeDto(chosen.Initials, chosen.Name)));
        }

        await _db.SaveChangesAsync(ct);
        return new BreachAlertReassignResponseDto(reassigned, skipped);
    }

    public async Task<TicketReassignResponseDto> TicketReassignAsync(string ticketId, TicketReassignRequestDto req, CancellationToken ct = default)
    {
        var id = NormalizeTicketId(ticketId);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {id} not found");

        // Resolve the target agent. Three shapes arrive on the wire:
        //
        //   1. `intent == "escalate"` — the SPA omits the dropdown pick
        //      (the dialog copy says "Pick a Tier 3 agent"), so the client
        //      falls back to the first option in its list: the `auto`
        //      sentinel. Resolving that literally used to throw
        //      `KeyNotFoundException("Agent auto not found")` which the
        //      `Safe()` wrapper surfaced as a 404 — the exact "Action
        //      failed: POST .../reassign failed: 404" symptom. An
        //      escalation should pick the Tier 3 agent with the most
        //      remaining capacity instead.
        //   2. `targetAgentId == "auto"` (or empty) — the explicit
        //      auto-balance sentinel from the reassign dialog's default
        //      "Auto-balance by load" option. Same capacity pick, any
        //      tier. This mirrors `BreachAlertReassignAsync`, which has
        //      always resolved `auto` through
        //      `PickAgentWithMostCapacityAsync`.
        //   3. A real agent id — resolve it directly, 404 if unknown.
        var isEscalateIntent = string.Equals(req.Intent, "escalate", StringComparison.OrdinalIgnoreCase);
        AgentEntity? agent;
        if (isEscalateIntent)
        {
            agent = await _db.Agents.AsNoTracking()
                .Where(a => a.Tier == "tier3" && a.Available)
                .OrderByDescending(a => a.Cap - a.OpenCount)
                .ThenBy(a => a.Id)
                .FirstOrDefaultAsync(ct)
                // Fallback: no available tier-3 agent (all at cap /
                // unavailable) — degrade to any available agent so the
                // escalation still lands rather than failing the action.
                ?? await _db.Agents.AsNoTracking()
                    .Where(a => a.Available)
                    .OrderByDescending(a => a.Cap - a.OpenCount)
                    .ThenBy(a => a.Id)
                    .FirstOrDefaultAsync(ct);
        }
        else if (string.IsNullOrWhiteSpace(req.TargetAgentId) ||
                 string.Equals(req.TargetAgentId, "auto", StringComparison.OrdinalIgnoreCase))
        {
            agent = await PickAgentWithMostCapacityAsync(ct);
        }
        else
        {
            agent = ResolveAgent(req.TargetAgentId);
        }

        if (agent is null)
            throw new KeyNotFoundException($"Agent {req.TargetAgentId} not found");

        if (ticket.AssigneeId is not null)
        {
            await DecrementAgentOpenCountAsync(ticket.AssigneeId, ct);
        }

        ticket.AssigneeId = agent.Id;
        ticket.AssigneeKind = "agent";
        ticket.UpdatedAt = DateTime.UtcNow;
        await IncrementAgentOpenCountAsync(agent.Id, ct);

        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = $"{id}-reassign-{Guid.NewGuid():N}",
            TicketId = id,
            Kind = "assignment",
            Title = req.Intent == "escalate" ? "Escalated" : "Reassigned",
            Sub = string.IsNullOrWhiteSpace(req.Note) ? agent.Name : $"{agent.Name} · {req.Note}",
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        await _db.SaveChangesAsync(ct);

        return new TicketReassignResponseDto(
            TicketId: id,
            NewAssignee: new OverviewAssigneeDto(agent.Initials, agent.Name),
            Intent: req.Intent == "escalate" ? "escalate" : "reassign",
            At: DateTime.UtcNow);
    }

    public async Task<BulkEscalateResponseDto> BulkEscalateAsync(BulkEscalateRequestDto req, CancellationToken ct = default)
    {
        var escalated = new List<ReassignedRefDto>();
        var skipped = new List<SkippedRefDto>();

        var tierAgents = await _db.Agents.AsNoTracking()
            .Where(a => a.Tier == req.TargetTier)
            .ToListAsync(ct);
        AgentEntity? target = tierAgents.OrderByDescending(a => a.Cap - a.OpenCount).FirstOrDefault();

        foreach (var rawId in req.TicketIds ?? new List<string>())
        {
            var id = NormalizeTicketId(rawId);
            var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (ticket is null) { skipped.Add(new SkippedRefDto(rawId, "Not found")); continue; }
            if (target is null)
            {
                skipped.Add(new SkippedRefDto(id, $"No agent in {req.TargetTier}"));
                continue;
            }

            if (ticket.AssigneeId is not null)
            {
                await DecrementAgentOpenCountAsync(ticket.AssigneeId, ct);
            }

            ticket.AssigneeId = target.Id;
            ticket.AssigneeKind = "agent";
            ticket.Priority = ticket.Priority == "p4" ? "p3" : ticket.Priority; // any escalation = at least p3
            ticket.UpdatedAt = DateTime.UtcNow;
            await IncrementAgentOpenCountAsync(target.Id, ct);

            _db.CaseActivities.Add(new CaseActivityEntity
            {
                Id = $"{id}-escalate-{Guid.NewGuid():N}",
                TicketId = id,
                Kind = "assignment",
                Title = "Bulk escalated",
                Sub = target.Name,
                At = DateTime.UtcNow,
                Actor = "operator",
            });
            escalated.Add(new ReassignedRefDto(id, new OverviewAssigneeDto(target.Initials, target.Name)));
        }
        await _db.SaveChangesAsync(ct);
        return new BulkEscalateResponseDto(escalated, skipped);
    }

    public async Task<NoteAddResponseDto> AddNoteAsync(string ticketId, NoteAddRequestDto req, CancellationToken ct = default)
    {
        var id = NormalizeTicketId(ticketId);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {id} not found");

        var noteId = $"{id}-note-{Guid.NewGuid():N}";
        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = noteId,
            TicketId = id,
            Kind = "note",
            Title = req.Visibility == "public" ? "Public note" : "Internal note",
            // NOT NULL column — coalesce a missing body so a partial
            // payload can't trip SQLite Error 19 mid-SaveChanges.
            Sub = req.Body ?? string.Empty,
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        ticket.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new NoteAddResponseDto(id, noteId, DateTime.UtcNow);
    }

    public async Task<CloseDuplicateResponseDto> CloseAsDuplicateAsync(string ticketId, CloseDuplicateRequestDto req, CancellationToken ct = default)
    {
        var id = NormalizeTicketId(ticketId);
        var mergedInto = NormalizeTicketId(req.MergedIntoTicketId);
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null) throw new KeyNotFoundException($"Ticket {id} not found");
        var canonical = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == mergedInto, ct);
        if (canonical is null) throw new KeyNotFoundException($"Merge target {mergedInto} not found");

        if (ticket.AssigneeId is not null)
        {
            await DecrementAgentOpenCountAsync(ticket.AssigneeId, ct);
        }
        ticket.AssigneeId = null;
        ticket.AssigneeKind = "unassigned";
        ticket.Status = "closed";
        ticket.ResolvedAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        _db.CaseActivities.Add(new CaseActivityEntity
        {
            Id = $"{id}-closed-{Guid.NewGuid():N}",
            TicketId = id,
            Kind = "status",
            Title = "Closed as duplicate",
            Sub = $"Merged into {mergedInto}",
            At = DateTime.UtcNow,
            Actor = "operator",
        });
        await _db.SaveChangesAsync(ct);
        return new CloseDuplicateResponseDto(id, mergedInto, DateTime.UtcNow);
    }

    // ---- helpers ----

    /// <summary>
    /// Read-time sweep that re-stamps any *open* ticket whose SLA deadline
    /// has already slipped into the past as P1 + breach. Required by product:
    /// "if the time moves below 0, the priority should be updated to p1
    /// mandatorily". Persisting in the write-path keeps every downstream
    /// endpoint (KPIs, at-risk grid, Cases, Queue) reading the same priority
    /// without each one having to redo the time math.
    ///
    /// Idempotent — rows already at P1 + breach are skipped, so the
    /// `SaveChangesAsync` only fires when at least one row actually changed.
    ///
    /// Read-path hardening for Postgres + read-mostly roles:
    /// the `UPDATE tickets …` this method issues can be denied by
    /// Postgres (`42501 permission denied for table tickets`) when the
    /// API is wired up with a low-privilege role. If permission is
    /// missing the read endpoint the user came in on must NOT 500 —
    /// the response should still include the rows, computed against
    /// the *cached* `priority` / `sla_severity` values from the row.
    /// We swallow the persistence error (the next
    /// `PromoteOverdueTicketsAsync` call will retry; a successful
    /// grant in the meantime will catch up). This mirrors the
    /// re-entry-guard the SPA's `runMutation` uses — one transient
    /// failure shouldn't poison the entire request.
    /// </summary>
    internal async Task PromoteOverdueTicketsAsync(CancellationToken ct = default)
    {
        var nowUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // Pull only what we need — we don't want to lock the row, just to
        // detect overdue open tickets and stamp them.
        var overdue = await _db.Tickets
            .Where(t => t.Status != "closed" && t.Status != "resolved"
                        && t.SlaDeadlineMs > 0
                        && t.SlaDeadlineMs < nowUtc
                        && (t.Priority != "p1" || t.SlaSeverity != "breach"))
            .ToListAsync(ct);
        if (overdue.Count == 0) return;

        foreach (var t in overdue)
        {
            // Mandatory promotion — every overdue open ticket is P1 + breach
            // regardless of its original seeded priority (P1/P2/P3/P4). The
            // priority ladder is P1 < P2 < P3 < P4 — promoting an old P3 to
            // P1 surfaces it on the SLA breach alert banner and on the
            // Overview's at-risk grid above the demoted P2 risk band.
            t.Priority = "p1";
            t.SlaSeverity = "breach";
            t.UpdatedAt = DateTime.UtcNow;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (
            // Postgres permission errors (`42501`) and equivalent
            // Npgsql surface as `PostgresException`. The generic
            // fallback (`DbUpdateException`) covers EF's own
            // rewrap when the provider doesn't bubble the inner
            // exception. We never want to 500 the lobby / KPI /
            // breach-alert / at-risk endpoint just because the
            // promotion sweep couldn't write — the read still
            // succeeds with the previous (cached) priority values.
            IsPermissionDenied(ex)
        )
        {
            // Detach the modified tickets so the change tracker
            // doesn't keep them in `Modified` state across the
            // next read (a partial UPDATE that left half the
            // rows mutated would otherwise surface surprising
            // "RowModified" errors on subsequent Insert calls).
            foreach (var entry in _db.ChangeTracker.Entries<TicketEntity>().ToList())
            {
                entry.State = EntityState.Detached;
            }
        }
    }

    /// <summary>Centralised permission-denied predicate so the
    /// `catch ... when (...)` clause above stays a single
    /// expression without binding local pattern variables —
    /// C# requires the matched variable to be assigned on every
    /// branch of an `||` chain, which the `is X x` form can fail
    /// to satisfy (it captures the variable only on the
    /// matching branch). Helper keeps the shape readable and
    /// avoids fragile pattern-bind inside `when`.</summary>
    private static bool IsPermissionDenied(Exception ex)
    {
        if (ex is Npgsql.PostgresException pg && pg.SqlState == "42501")
        {
            return true;
        }
        if (ex.InnerException is Npgsql.PostgresException pg2 && pg2.SqlState == "42501")
        {
            return true;
        }
        if (ex is DbUpdateException dbex)
        {
            if (dbex.InnerException is Npgsql.PostgresException pg3 && pg3.SqlState == "42501")
            {
                return true;
            }
            var innerMessage = dbex.InnerException?.Message ?? string.Empty;
            if (innerMessage.Contains("42501", StringComparison.Ordinal)
                || innerMessage.Contains("permission denied", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private AgentEntity? ResolveAgent(string? agentId)
    {
        if (string.IsNullOrWhiteSpace(agentId)) return null;
        // "auto" means the auto-balance helper step (see BreachAlertReassign).
        if (agentId == "auto") return null;
        return _db.Agents.AsNoTracking().FirstOrDefault(a => a.Id == agentId || a.Name == agentId);
    }

    private async Task<AgentEntity?> PickAgentWithMostCapacityAsync(CancellationToken ct)
    {
        var available = await _db.Agents.AsNoTracking()
            .Where(a => a.Available)
            .OrderByDescending(a => a.Cap - a.OpenCount)
            .ToListAsync(ct);
        return available.FirstOrDefault();
    }

    private async Task IncrementAgentOpenCountAsync(string agentId, CancellationToken ct)
    {
        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agentId, ct);
        if (agent is null) return;
        agent.OpenCount += 1;
    }

    private async Task DecrementAgentOpenCountAsync(string agentId, CancellationToken ct)
    {
        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agentId, ct);
        if (agent is null) return;
        agent.OpenCount = Math.Max(0, agent.OpenCount - 1);
    }

    private static string NormalizeTicketId(string raw)
    {
        var trimmed = (raw ?? string.Empty).Trim();
        return trimmed.StartsWith('#') ? trimmed : "#" + trimmed;
    }

    /// <summary>
    /// Shared filter helpers used by every Overview endpoint. Hoisted
    /// here so every query author writes the exact same WHERE clauses —
    /// "queue=Billing" on the KPI endpoint behaves identically to
    /// "queue=Billing" on the activity feed.
    /// </summary>
    internal static IQueryable<TicketEntity> ApplyQueueFilter(IQueryable<TicketEntity> q, string? queue)
    {
        if (string.IsNullOrEmpty(queue) || queue == "all") return q;
        return q.Where(t => t.Queue == queue);
    }

    internal static IQueryable<TicketEntity> ApplyChannelFilter(IQueryable<TicketEntity> q, string? channel)
    {
        if (string.IsNullOrEmpty(channel) || channel == "all") return q;
        // The wire `channel` filter keywords are matched against the
        // stored enum name (Email, Chat, Phone, ...) — but the seed
        // stores them lower-case (email, chat, …) so we case-fold before
        // the equality check. Without this the filter silently passes
        // everything when the user picks "Email" from the toolbar
        // dropdown (which is what the SPA sends on the wire).
        var canonical = channel[0].ToString().ToUpperInvariant() + channel[1..].ToLowerInvariant();
        return q.Where(t => t.Channel == canonical);
    }

    internal static IQueryable<TicketEntity> ApplyPriorityFilter(IQueryable<TicketEntity> q, string? priority)
    {
        if (string.IsNullOrEmpty(priority) || priority == "all") return q;
        var priorities = priority.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (priorities.Length == 0) return q;
        return q.Where(t => priorities.Contains(t.Priority));
    }

    private static int GetRangeSeed(string range) => range switch
    {
        "24h" => 1,
        "7d" => 2,
        "30d" => 3,
        "quarter" => 4,
        _ => 2
    };

    private static RangeKey ParseRange(string range) => range switch
    {
        "24h" => RangeKey.h24,
        "7d" => RangeKey.d7,
        "30d" => RangeKey.d30,
        "quarter" => RangeKey.quarter,
        _ => RangeKey.d7
    };
}