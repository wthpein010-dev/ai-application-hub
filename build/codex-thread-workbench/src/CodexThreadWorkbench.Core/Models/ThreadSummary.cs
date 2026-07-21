namespace CodexThreadWorkbench.Models;

public sealed record ThreadSummary(
    string Id,
    string Title,
    string Preview,
    string WorkingDirectory,
    DateTimeOffset UpdatedAt,
    ThreadStatusKind Status);
