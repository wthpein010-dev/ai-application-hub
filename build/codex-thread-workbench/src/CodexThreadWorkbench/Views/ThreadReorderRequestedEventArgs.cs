namespace CodexThreadWorkbench.Views;

public sealed class ThreadReorderRequestedEventArgs(
    string sourceThreadId,
    string targetThreadId) : EventArgs
{
    public string SourceThreadId { get; } = sourceThreadId;

    public string TargetThreadId { get; } = targetThreadId;
}
