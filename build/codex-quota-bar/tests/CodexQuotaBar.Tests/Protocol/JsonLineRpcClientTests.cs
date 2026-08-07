using System.Text.Json;
using System.Threading.Channels;
using CodexQuotaBar.Core.Protocol;

namespace CodexQuotaBar.Tests.Protocol;

public sealed class JsonLineRpcClientTests
{
    [Fact]
    public async Task Responses_are_correlated_by_id_when_they_arrive_out_of_order()
    {
        using var input = new ChannelLineReader();
        using var output = new StringWriter();
        await using var client = new JsonLineRpcClient(input, output);
        client.Start();

        var first = client.SendRequestAsync("first", new { value = 1 });
        var second = client.SendRequestAsync("second", new { value = 2 });
        await WaitForLinesAsync(output, 2);
        var requests = ParseLines(output);

        input.Push($@"{{""id"":{requests[1].GetProperty("id").GetInt64()},""result"":{{""name"":""second""}}}}");
        input.Push($@"{{""id"":{requests[0].GetProperty("id").GetInt64()},""result"":{{""name"":""first""}}}}");

        Assert.Equal("first", (await first).GetProperty("name").GetString());
        Assert.Equal("second", (await second).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Malformed_input_reports_a_diagnostic_and_reading_continues()
    {
        using var input = new ChannelLineReader();
        using var output = new StringWriter();
        var diagnostics = new List<string>();
        await using var client = new JsonLineRpcClient(input, output, diagnostics.Add);
        client.Start();

        var response = client.SendRequestAsync("quota", null);
        await WaitForLinesAsync(output, 1);
        var requestId = ParseLines(output)[0].GetProperty("id").GetInt64();
        input.Push("not-json");
        input.Push($@"{{""id"":{requestId},""result"":{{""ok"":true}}}}");

        Assert.True((await response).GetProperty("ok").GetBoolean());
        Assert.Contains(diagnostics, message => message.Contains("Invalid JSON", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Notifications_are_published_without_affecting_requests()
    {
        using var input = new ChannelLineReader();
        using var output = new StringWriter();
        await using var client = new JsonLineRpcClient(input, output);
        var received = new TaskCompletionSource<RpcNotification>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.NotificationReceived += (_, notification) => received.TrySetResult(notification);
        client.Start();

        input.Push("{\"method\":\"account/rateLimits/updated\",\"params\":{\"rateLimits\":{\"limitId\":\"codex\"}}}");

        var notification = await received.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal("account/rateLimits/updated", notification.Method);
        Assert.Equal("codex", notification.Params.GetProperty("rateLimits").GetProperty("limitId").GetString());
    }

    private static JsonElement[] ParseLines(StringWriter output) => output
        .ToString()
        .Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries)
        .Select(line => JsonDocument.Parse(line).RootElement.Clone())
        .ToArray();

    private static async Task WaitForLinesAsync(StringWriter output, int expected)
    {
        var timeout = DateTime.UtcNow.AddSeconds(2);
        while (ParseLines(output).Length < expected && DateTime.UtcNow < timeout)
        {
            await Task.Delay(10);
        }

        Assert.True(ParseLines(output).Length >= expected, $"Expected {expected} output lines.");
    }

    private sealed class ChannelLineReader : TextReader
    {
        private readonly Channel<string> _lines = Channel.CreateUnbounded<string>();

        public void Push(string line) => _lines.Writer.TryWrite(line);

        public override async ValueTask<string?> ReadLineAsync(CancellationToken cancellationToken) =>
            await _lines.Reader.ReadAsync(cancellationToken);

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _lines.Writer.TryComplete();
            }

            base.Dispose(disposing);
        }
    }
}
