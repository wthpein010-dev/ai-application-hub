using CodexQuotaBar.Core.Platform;

namespace CodexQuotaBar.Tests.Platform;

public sealed class CodexExecutableDiscoveryTests
{
    [Fact]
    public void Explicit_override_wins_over_known_paths_and_path()
    {
        using var directory = new TemporaryDirectory();
        var executable = directory.CreateFile("override/codex.exe");
        var known = directory.CreateFile("known/codex.exe");
        var pathDirectory = Directory.CreateDirectory(Path.Combine(directory.Path, "path")).FullName;
        directory.CreateFile("path/codex.exe");

        var result = CodexExecutableDiscovery.FindFirstExisting(
            executable,
            [known],
            pathDirectory,
            "codex.exe");

        Assert.Equal(executable, result);
    }

    [Fact]
    public void Known_path_is_used_when_override_is_invalid()
    {
        using var directory = new TemporaryDirectory();
        var known = directory.CreateFile("known/codex");

        var result = CodexExecutableDiscovery.FindFirstExisting(
            Path.Combine(directory.Path, "missing"),
            [known],
            null,
            "codex");

        Assert.Equal(known, result);
    }

    [Fact]
    public void Path_directories_are_searched_in_order()
    {
        using var directory = new TemporaryDirectory();
        var first = Directory.CreateDirectory(Path.Combine(directory.Path, "first")).FullName;
        var second = Directory.CreateDirectory(Path.Combine(directory.Path, "second")).FullName;
        var expected = directory.CreateFile("second/codex");

        var result = CodexExecutableDiscovery.FindFirstExisting(
            null,
            [],
            string.Join(Path.PathSeparator, first, second),
            "codex");

        Assert.Equal(expected, result);
    }

    [Fact]
    public void Missing_candidates_return_null()
    {
        var result = CodexExecutableDiscovery.FindFirstExisting(
            "missing-override",
            ["missing-known"],
            "missing-path",
            "codex");

        Assert.Null(result);
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"quota-discovery-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public string CreateFile(string relativePath)
        {
            var path = System.IO.Path.Combine(Path, relativePath.Replace('/', System.IO.Path.DirectorySeparatorChar));
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
            File.WriteAllText(path, string.Empty);
            return path;
        }

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
