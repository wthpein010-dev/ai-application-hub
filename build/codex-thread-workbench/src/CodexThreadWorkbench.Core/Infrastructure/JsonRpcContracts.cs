using System.Text.Json;

namespace CodexThreadWorkbench.Infrastructure;

public sealed record JsonRpcNotification(string Method, JsonElement Params);

public sealed record JsonRpcServerRequest(JsonElement Id, string Method, JsonElement Params);

public sealed class JsonRpcException : Exception
{
    public JsonRpcException(int code, string message, JsonElement? data = null)
        : base(message)
    {
        Code = code;
        DataElement = data;
    }

    public int Code { get; }

    public JsonElement? DataElement { get; }
}
