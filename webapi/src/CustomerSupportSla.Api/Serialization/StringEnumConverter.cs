using System.Text.Json;
using System.Text.Json.Serialization;

namespace CustomerSupportSla.Api.Serialization;

/// <summary>
/// Serialises enums as their string name. The SPA expects string values
/// (e.g. "p1", "Billing", "breach") for status / priority / queue / severity.
/// </summary>
public class StringEnumJsonConverter<TEnum> : JsonConverter<TEnum> where TEnum : struct, Enum
{
    public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var s = reader.GetString();
        if (Enum.TryParse<TEnum>(s, ignoreCase: true, out var v)) return v;
        return default;
    }

    public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString());
    }
}

public static class JsonOptionsExtensions
{
    public static JsonSerializerOptions WithStringEnums(this JsonSerializerOptions options)
    {
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.RangeKey>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.Severity>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.ChannelKey>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.PriorityKey>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.QueueKey>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.TicketStatus>());
        options.Converters.Add(new StringEnumJsonConverter<Application.Dtos.ChipTone>());
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        return options;
    }
}