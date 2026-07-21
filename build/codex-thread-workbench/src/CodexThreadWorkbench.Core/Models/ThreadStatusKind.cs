namespace CodexThreadWorkbench.Models;

public enum ThreadStatusKind
{
    NotLoaded,
    Idle,
    Running,
    Completed,
    Interrupted,
    NeedsApproval,
    Error,
    Offline
}
