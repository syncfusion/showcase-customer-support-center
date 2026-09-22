using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Services;

public interface IAiService
{
    Task<TriageResponseDto> SuggestTriageAsync(TriageRequestDto req, CancellationToken ct = default);
    Task<ReplyDraftResponseDto> DraftReplyAsync(ReplyDraftRequestDto req, CancellationToken ct = default);
}