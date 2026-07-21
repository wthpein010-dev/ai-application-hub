namespace CodexThreadWorkbench.Models;

public sealed record ChatMessage(
    string Id,
    ChatRole Role,
    string Text,
    bool IsStreaming = false);
