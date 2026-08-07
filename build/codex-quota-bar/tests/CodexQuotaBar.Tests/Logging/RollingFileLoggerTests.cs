using CodexQuotaBar.Core.Logging;

namespace CodexQuotaBar.Tests.Logging;

public sealed class RollingFileLoggerTests
{
    [Fact]
    public void Write_rotates_at_the_size_limit_and_keeps_bounded_files()
    {
        using var directory = new TemporaryDirectory();
        using var logger = new RollingFileLogger(directory.Path, maxBytes: 180, retainedFiles: 3);

        for (var index = 0; index < 60; index++)
        {
            logger.Write("connection", $"attempt {index:D2} with bounded diagnostic text");
        }

        var files = Directory.GetFiles(directory.Path, "quota-bar.log*");
        Assert.InRange(files.Length, 2, 4);
        Assert.All(files, file => Assert.True(new FileInfo(file).Length > 0));
        Assert.DoesNotContain(files, file => file.EndsWith(".4", StringComparison.Ordinal));
    }

    [Fact]
    public void Write_keeps_each_diagnostic_on_one_line()
    {
        using var directory = new TemporaryDirectory();
        using var logger = new RollingFileLogger(directory.Path);

        logger.Write("protocol", "first line\r\nsecond line");

        var lines = File.ReadAllLines(Path.Combine(directory.Path, "quota-bar.log"));
        var line = Assert.Single(lines);
        Assert.Contains("protocol", line, StringComparison.Ordinal);
        Assert.Contains("first line  second line", line, StringComparison.Ordinal);
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"quota-bar-tests-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
