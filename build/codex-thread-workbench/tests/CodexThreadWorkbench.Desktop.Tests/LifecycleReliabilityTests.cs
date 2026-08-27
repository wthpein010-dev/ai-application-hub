using System.Reflection;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class LifecycleReliabilityTests
{
    [Fact]
    public void InstanceLock_AllowsOnlyOneHolderUntilReleased()
    {
        var lockType = typeof(App).Assembly.GetType(
            "CodexThreadWorkbench.DesktopInstanceLock");
        Assert.NotNull(lockType);
        var tryAcquire = lockType.GetMethod(
            "TryAcquire",
            BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(tryAcquire);
        var name = $"CodexThreadWorkbench.Tests.{Guid.NewGuid():N}";

        var first = Assert.IsAssignableFrom<IDisposable>(
            tryAcquire.Invoke(null, [name]));
        try
        {
            var second = tryAcquire.Invoke(null, [name]);
            Assert.Null(second);
        }
        finally
        {
            first.Dispose();
        }

        using var afterRelease = Assert.IsAssignableFrom<IDisposable>(
            tryAcquire.Invoke(null, [name]));
    }

    [Fact]
    public void Diagnostics_WithoutExplicitPath_WritesToLocalLifecycleLog()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            $"codex-confirmation-diagnostics-{Guid.NewGuid():N}");
        var previousPath = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS");
        var previousRoot = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT");
        Directory.CreateDirectory(root);
        try
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                null);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                root);
            var diagnostics = typeof(App).Assembly.GetType(
                "CodexThreadWorkbench.ConfirmationOverlayDiagnostics");
            var write = diagnostics?.GetMethod(
                "Write",
                BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            var token = $"test:{Guid.NewGuid():N}";

            Assert.NotNull(write);
            write.Invoke(null, [token]);

            var logPath = Path.Combine(
                root,
                "confirmation-overlay-lifecycle.log");
            Assert.True(File.Exists(logPath));
            Assert.Contains(token, File.ReadAllText(logPath));
        }
        finally
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                previousPath);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                previousRoot);
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Diagnostics_WithExplicitPath_AlsoWritesDefaultLifecycleLog()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            $"codex-confirmation-dual-diagnostics-{Guid.NewGuid():N}");
        var explicitPath = Path.Combine(root, "explicit.log");
        var defaultRoot = Path.Combine(root, "default");
        var previousPath = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS");
        var previousRoot = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT");
        Directory.CreateDirectory(root);
        try
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                explicitPath);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                defaultRoot);
            var diagnostics = typeof(App).Assembly.GetType(
                "CodexThreadWorkbench.ConfirmationOverlayDiagnostics");
            var write = diagnostics?.GetMethod(
                "Write",
                BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            var token = $"test:{Guid.NewGuid():N}";

            Assert.NotNull(write);
            write.Invoke(null, [token]);

            var defaultPath = Path.Combine(
                defaultRoot,
                "confirmation-overlay-lifecycle.log");
            Assert.Contains(token, File.ReadAllText(explicitPath));
            Assert.Contains(token, File.ReadAllText(defaultPath));
        }
        finally
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                previousPath);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                previousRoot);
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Diagnostics_WhenLogIsBrieflyLocked_RetriesTheWrite()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            $"codex-confirmation-locked-diagnostics-{Guid.NewGuid():N}");
        var previousPath = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS");
        var previousRoot = Environment.GetEnvironmentVariable(
            "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT");
        Directory.CreateDirectory(root);
        try
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                null);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                root);
            var logPath = Path.Combine(
                root,
                "confirmation-overlay-lifecycle.log");
            await File.WriteAllTextAsync(logPath, string.Empty);
            var diagnostics = typeof(App).Assembly.GetType(
                "CodexThreadWorkbench.ConfirmationOverlayDiagnostics");
            var write = diagnostics?.GetMethod(
                "Write",
                BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            var token = $"test:{Guid.NewGuid():N}";

            Assert.NotNull(write);
            var lockedStream = new FileStream(
                logPath,
                FileMode.Open,
                FileAccess.ReadWrite,
                FileShare.None);
            var writeTask = Task.Run(() => write.Invoke(null, [token]));
            await Task.Delay(300);
            lockedStream.Dispose();
            await writeTask;

            Assert.Contains(token, await File.ReadAllTextAsync(logPath));
        }
        finally
        {
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS",
                previousPath);
            Environment.SetEnvironmentVariable(
                "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT",
                previousRoot);
            Directory.Delete(root, recursive: true);
        }
    }
}
