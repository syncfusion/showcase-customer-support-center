using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Repositories;

public interface ICasesRepository
{
    Task<CaseDetailDto?> GetCaseAsync(string id, CancellationToken ct = default);
    Task<List<CaseLookupItemDto>> GetCasesAsync(string status, int limit, string? query, CancellationToken ct = default);
    Task<string?> GetDefaultCaseIdAsync(CancellationToken ct = default);

    // ---- Mutations (§9 mirrored) ----
    //
    // The Cases-tab SPA wires these at `/api/cases/{id}/{resolve,
    // reassign, escalate, replies, notes}`. Previously these endpoints
    // returned `404` because `CasesEndpoints.cs` only registered GETs,
    // and the SPA's `casesClient.addNote` was hitting a path that
    // resolved to the SPA's `toast on Error` handler — the user saw
    // "Action failed: POST /api/cases/{id}/notes failed: 404" and the
    // database row never landed. Each forwarder here reuses the
    // Overview repository's Status / Assignee / Note state-machine to
    // keep the DB writes consistent across the two surfaces.
    Task<CaseResolveResponseDto> ResolveAsync(string id, CaseResolveRequestDto req, CancellationToken ct = default);
    Task<CaseMutationResultDto> ReassignAsync(string id, CaseReassignRequestDto req, CancellationToken ct = default);
    Task<CaseMutationResultDto> EscalateAsync(string id, CaseEscalateRequestDto req, CancellationToken ct = default);
    Task<CaseMessageResponseDto> SendReplyAsync(string id, CaseMessageRequestDto req, CancellationToken ct = default);
    Task<CaseMessageResponseDto> AddNoteAsync(string id, CaseMessageRequestDto req, CancellationToken ct = default);
}