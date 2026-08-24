namespace CodexThreadWorkbench;

internal static class ConfirmationOverlayDiagnostics
{
    private const string DiagnosticsPathVariable =
        "CODEX_CONFIRMATION_DIAGNOSTICS";

    public static void Write(string message)
    {
        var path = Environment.GetEnvironmentVariable(DiagnosticsPathVariable);
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        try
        {
            File.AppendAllText(
                path,
                $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
