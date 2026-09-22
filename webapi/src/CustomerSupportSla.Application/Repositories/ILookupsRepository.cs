using System.Collections.Generic;
using CustomerSupportSla.Application.Dtos;

namespace CustomerSupportSla.Application.Repositories;

public interface ILookupsRepository
{
    Task<LookupSetDto> GetLookupsAsync(string set, CancellationToken ct = default);
}