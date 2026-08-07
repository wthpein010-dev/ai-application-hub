namespace CodexQuotaBar.Core.Platform;

public static class CodexExecutableDiscovery
{
    public static string? FindFirstExisting(
        string? explicitOverride,
        IEnumerable<string> knownCandidates,
        string? pathValue,
        string executableName)
    {
        ArgumentNullException.ThrowIfNull(knownCandidates);
        ArgumentException.ThrowIfNullOrWhiteSpace(executableName);

        foreach (var candidate in Candidates(explicitOverride, knownCandidates, pathValue, executableName))
        {
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }

        return null;
    }

    private static IEnumerable<string> Candidates(
        string? explicitOverride,
        IEnumerable<string> knownCandidates,
        string? pathValue,
        string executableName)
    {
        if (!string.IsNullOrWhiteSpace(explicitOverride))
        {
            yield return explicitOverride.Trim().Trim('"');
        }

        foreach (var candidate in knownCandidates.Where(candidate => !string.IsNullOrWhiteSpace(candidate)))
        {
            yield return candidate.Trim().Trim('"');
        }

        if (string.IsNullOrWhiteSpace(pathValue))
        {
            yield break;
        }

        foreach (var directory in pathValue.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var cleanDirectory = directory.Trim().Trim('"');
            if (!string.IsNullOrWhiteSpace(cleanDirectory))
            {
                yield return Path.Combine(cleanDirectory, executableName);
            }
        }
    }
}
