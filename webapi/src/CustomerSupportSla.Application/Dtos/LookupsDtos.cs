using System.Collections.Generic;

namespace CustomerSupportSla.Application.Dtos;

public record LookupItemDto(string Id, string Label);

public record LookupSetDto(string Set, List<LookupItemDto> Items);