using CodexQuotaBar.App.Tasks;

namespace CodexQuotaBar.Tests.Tasks;

public sealed class CodexSessionEventParserTests
{
    [Fact]
    public void Parser_reads_a_task_complete_event_and_normalizes_the_summary()
    {
        const string json = """
            {"timestamp":"2026-07-18T07:05:12.102Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1","last_agent_message":"Built\r\n  both packages","duration_ms":8420}}
            """;

        var completion = CodexSessionEventParser.Parse(json, "quota-bar");

        Assert.Equal("turn-1", completion?.TurnId);
        Assert.Equal("quota-bar", completion?.WorkspaceName);
        Assert.Equal("Built both packages", completion?.Summary);
        Assert.Equal(TimeSpan.FromMilliseconds(8420), completion?.Duration);
    }

    [Fact]
    public void Parser_truncates_long_summaries_to_120_characters()
    {
        var message = new string('x', 160);
        var json = $"{{\"timestamp\":\"2026-07-18T07:05:12.102Z\",\"type\":\"event_msg\",\"payload\":{{\"type\":\"task_complete\",\"turn_id\":\"turn-2\",\"last_agent_message\":\"{message}\"}}}}";

        Assert.Equal(120, CodexSessionEventParser.Parse(json, "quota")?.Summary.Length);
    }

    [Fact]
    public void Parser_returns_null_for_malformed_json()
    {
        Assert.Null(CodexSessionEventParser.Parse("{not-json", "quota"));
    }

    [Fact]
    public void Parser_returns_null_for_a_non_event_message()
    {
        const string json = "{\"type\":\"response\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"turn-3\"}}";

        Assert.Null(CodexSessionEventParser.Parse(json, "quota"));
    }

    [Fact]
    public void Parser_treats_an_out_of_range_duration_as_unknown()
    {
        const string json = "{\"timestamp\":\"2026-07-18T07:05:12.102Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"turn-4\",\"last_agent_message\":\"Done\",\"duration_ms\":1e300}}";

        var completion = CodexSessionEventParser.Parse(json, "quota");

        Assert.Equal("turn-4", completion?.TurnId);
        Assert.Null(completion?.Duration);
    }
}
