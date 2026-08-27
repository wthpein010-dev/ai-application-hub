namespace CodexThreadWorkbench;

internal static class ConfirmationOverlayDiagnostics
{
    private const string DiagnosticsPathVariable =
        "CODEX_CONFIRMATION_DIAGNOSTICS";
    private const string DiagnosticsRootVariable =
        "CODEX_CONFIRMATION_DIAGNOSTICS_ROOT";
    private const string DefaultLogName =
        "confirmation-overlay-lifecycle.log";
    private const int MaximumWriteAttempts = 8;
    private static readonly TimeSpan WriteRetryDelay =
        TimeSpan.FromMilliseconds(25);
    private static readonly object WriteSync = new();

    public static void Write(string message)
    {
        TryWrite(ResolveDefaultPath(), message);
        var explicitPath = Environment.GetEnvironmentVariable(
            DiagnosticsPathVariable);
        if (string.IsNullOrWhiteSpace(explicitPath))
        {
            return;
        }

        try
        {
            var resolvedExplicitPath = Path.GetFullPath(explicitPath);
            if (!string.Equals(
                    resolvedExplicitPath,
                    ResolveDefaultPath(),
                    StringComparison.OrdinalIgnoreCase))
            {
                TryWrite(resolvedExplicitPath, message);
            }
        }
        catch (ArgumentException)
        {
        }
        catch (NotSupportedException)
        {
        }
    }

    private static void TryWrite(string path, string message)
    {
        for (var attempt = 1; attempt <= MaximumWriteAttempts; attempt++)
        {
            try
            {
                lock (WriteSync)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                    File.AppendAllText(
                        path,
                        $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
                }

                return;
            }
            catch (IOException) when (attempt < MaximumWriteAttempts)
            {
                Thread.Sleep(WriteRetryDelay);
            }
            catch (IOException)
            {
                return;
            }
            catch (UnauthorizedAccessException)
            {
                return;
            }
        }
    }

    private static string ResolveDefaultPath()
    {
        var root = Environment.GetEnvironmentVariable(DiagnosticsRootVariable);
        if (string.IsNullOrWhiteSpace(root))
        {
            root = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CodexThreadWorkbench",
                "logs");
        }

        return Path.Combine(Path.GetFullPath(root), DefaultLogName);
    }
}
