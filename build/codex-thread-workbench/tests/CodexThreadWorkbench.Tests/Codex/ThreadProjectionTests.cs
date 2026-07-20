using System.Text.Json;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Codex;

public sealed class ThreadProjectionTests
{
    [Fact]
    public void FromThread_UsesExplicitNameAndMapsActiveStatus()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "id":"thread-1",
              "name":"每日记忆复盘",
              "preview":"fallback title",
              "cwd":"C:\\work",
              "updatedAt":1784510000,
              "status":{"type":"active","activeFlags":[]},
              "turns":[]
            }
            """);

        var summary = ThreadProjection.FromThread(document.RootElement);

        Assert.Equal("每日记忆复盘", summary.Title);
        Assert.Equal(ThreadStatusKind.Running, summary.Status);
        Assert.Equal("C:\\work", summary.WorkingDirectory);
    }

    [Fact]
    public void MessagesFromThread_ReturnsOnlyUserAndAgentText()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "turns":[{
                "items":[
                  {
                    "type":"userMessage",
                    "id":"user-1",
                    "clientId":null,
                    "content":[
                      {"type":"text","text":"你好","text_elements":[]},
                      {"type":"localImage","path":"C:\\image.png","detail":null}
                    ]
                  },
                  {
                    "type":"commandExecution",
                    "id":"command-1",
                    "command":"pwd",
                    "cwd":"C:\\",
                    "processId":null,
                    "source":"agent",
                    "status":"completed",
                    "commandActions":[],
                    "aggregatedOutput":"C:\\",
                    "exitCode":0,
                    "durationMs":4
                  },
                  {
                    "type":"agentMessage",
                    "id":"agent-1",
                    "text":"你好，我在。",
                    "phase":"final_answer",
                    "memoryCitation":null
                  }
                ]
              }]
            }
            """);

        var messages = ThreadProjection.MessagesFromThread(document.RootElement);

        Assert.Collection(
            messages,
            item =>
            {
                Assert.Equal(ChatRole.User, item.Role);
                Assert.Equal("你好", item.Text);
            },
            item =>
            {
                Assert.Equal(ChatRole.Assistant, item.Role);
                Assert.Equal("你好，我在。", item.Text);
            });
    }

    [Fact]
    public void MessagesFromThread_UsesNewestMessagesWithinLimit()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "turns":[{
                "items":[
                  {"type":"agentMessage","id":"a1","text":"一","phase":"commentary","memoryCitation":null},
                  {"type":"agentMessage","id":"a2","text":"二","phase":"commentary","memoryCitation":null},
                  {"type":"agentMessage","id":"a3","text":"三","phase":"final_answer","memoryCitation":null}
                ]
              }]
            }
            """);

        var messages = ThreadProjection.MessagesFromThread(document.RootElement, maxMessages: 2);

        Assert.Equal(["二", "三"], messages.Select(message => message.Text));
    }
}
