using System.IO;

namespace CodexThreadWorkbench.Infrastructure;

public interface ICodexProcessLocator
{
    string Find();
}

public sealed class CodexProcessLocator : ICodexProcessLocator
{
    private readonly bool _isWindows;
    private readonly string _pathValue;
    private readonly string _userProfile;
    private readonly Func<string, bool> _exists;

    public CodexProcessLocator(
        bool isWindows,
        string? pathValue,
        string userProfile,
        Func<string, bool>? exists = null)
    {
        _isWindows = isWindows;
        _pathValue = pathValue ?? string.Empty;
        _userProfile = userProfile;
        _exists = exists ?? File.Exists;
    }

    public static CodexProcessLocator CreateDefault(Func<string, bool>? exists = null) =>
        new(
            OperatingSystem.IsWindows(),
            Environment.GetEnvironmentVariable("PATH"),
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            exists);

    public string Find()
    {
        foreach (var candidate in EnumerateCandidates().Distinct(PathComparer()))
        {
            if (_exists(candidate))
            {
                return candidate;
            }
        }

        var executable = _isWindows ? "codex.exe" : "codex";
        var hint = _isWindows
            ? $"PATH 或 {Path.Combine(_userProfile, ".codex", ".sandbox-bin", executable)}"
            : "PATH、~/.local/bin、/opt/homebrew/bin 或 /usr/local/bin";
        throw new FileNotFoundException(
            $"未找到 Codex CLI（{executable}）。请安装 Codex CLI 并检查 {hint}。");
    }

    private IEnumerable<string> EnumerateCandidates()
    {
        var executable = _isWindows ? "codex.exe" : "codex";
        if (_isWindows)
        {
            yield return Path.Combine(
                _userProfile,
                ".codex",
                ".sandbox-bin",
                executable);
        }

        foreach (var directory in _pathValue.Split(
                     Path.PathSeparator,
                     StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            yield return Path.Combine(directory, executable);
        }

        if (!_isWindows)
        {
            yield return Path.Combine(_userProfile, ".local", "bin", executable);
            yield return Path.Combine("/opt/homebrew/bin", executable);
            yield return Path.Combine("/usr/local/bin", executable);
        }
    }

    private StringComparer PathComparer() =>
        _isWindows ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;
}
