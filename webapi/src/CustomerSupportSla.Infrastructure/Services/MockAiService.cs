using CustomerSupportSla.Application.Dtos;
using CustomerSupportSla.Application.Services;

namespace CustomerSupportSla.Infrastructure.Services;

/// <summary>
/// Stateless mock AI service — returns deterministic placeholder suggestions
/// so the AI endpoints stay functional without an LLM dependency.
/// </summary>
public class MockAiService : IAiService
{
    public Task<TriageResponseDto> SuggestTriageAsync(TriageRequestDto req, CancellationToken ct = default)
    {
        var subject = (req.Subject ?? "").ToLowerInvariant();
        var queue = subject.Contains("refund") || subject.Contains("invoice") || subject.Contains("charge") ? "Billing"
                  : subject.Contains("login") || subject.Contains("sso") || subject.Contains("2fa") || subject.Contains("account") ? "Account"
                  : subject.Contains("api") || subject.Contains("webhook") || subject.Contains("export") || subject.Contains("integration") ? "Platform"
                  : "General";

        var priority = subject.Contains("urgent") || subject.Contains("breach") || subject.Contains("p1") ? "p1"
                      : subject.Contains("cannot") || subject.Contains("down") ? "p2"
                      : "p3";

        return Task.FromResult(new TriageResponseDto(new TriageSuggestionDto(
            Priority: priority,
            Queue: queue,
            SuggestedAssignee: queue == "Billing" ? "Priya N." : queue == "Account" ? "Edward N." : queue == "Platform" ? "Lin H." : "Daniel K.",
            Confidence: 0.78,
            Reasons: new() { "Keyword match on subject line", "Customer tier suggests priority routing", "Similar past ticket pattern" },
            SimilarTicketIds: new() { "#CS-10392", "#CS-10421", "#CS-10355" }
        )));
    }

    public Task<ReplyDraftResponseDto> DraftReplyAsync(ReplyDraftRequestDto req, CancellationToken ct = default)
    {
        var tone = string.IsNullOrEmpty(req.Tone) ? "friendly" : req.Tone;
        return Task.FromResult(new ReplyDraftResponseDto(
            DraftSubject: $"Re: {req.Subject}",
            DraftBody: $"<p>Hi team,</p><p>Thanks for reaching out about <em>{req.Subject}</em>. I've taken a quick look and will follow up shortly with more details.</p><p>(Drafted in a {tone} tone.)</p>",
            Tone: tone,
            Citations: new() { "Knowledge base: refund policy v3", "Internal: SLA policy p1-billing" }
        ));
    }
}