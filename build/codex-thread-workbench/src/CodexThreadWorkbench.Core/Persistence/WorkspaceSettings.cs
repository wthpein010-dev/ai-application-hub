namespace CodexThreadWorkbench.Persistence;

public sealed class WorkspaceSettings
{
    public List<string> OpenThreadIds { get; set; } = [];

    public List<string> MinimizedThreadIds { get; set; } = [];

    public double WindowLeft { get; set; } = 120;

    public double WindowTop { get; set; } = 80;

    public double WindowWidth { get; set; } = 1280;

    public double WindowHeight { get; set; } = 800;

    public double? LauncherLeft { get; set; }

    public double? LauncherTop { get; set; }

    public bool IsFullScreen { get; set; }
}
