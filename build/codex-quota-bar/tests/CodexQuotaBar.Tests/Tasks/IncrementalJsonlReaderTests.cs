using System.Text;
using CodexQuotaBar.App.Tasks;

namespace CodexQuotaBar.Tests.Tasks;

public sealed class IncrementalJsonlReaderTests
{
    [Fact]
    public async Task Reader_retains_an_incomplete_line_until_new_bytes_arrive()
    {
        using var file = new TemporaryFile();
        await File.WriteAllTextAsync(file.Path, "{\"type\":\"event");

        var first = await IncrementalJsonlReader.ReadAsync(file.Path, JsonlReadState.Empty);
        await File.AppendAllTextAsync(file.Path, "_msg\"}\n");
        var second = await IncrementalJsonlReader.ReadAsync(file.Path, first.State);

        Assert.Empty(first.Lines);
        Assert.Equal(["{\"type\":\"event_msg\"}"], second.Lines);
    }

    [Fact]
    public async Task Reader_detects_a_same_length_rewrite_from_file_metadata()
    {
        using var file = new TemporaryFile("old\n");
        var first = await IncrementalJsonlReader.ReadAsync(file.Path, JsonlReadState.Empty);
        await File.WriteAllTextAsync(file.Path, "new\n");
        File.SetLastWriteTimeUtc(file.Path, new DateTime(first.State.LastWriteTimeUtcTicks, DateTimeKind.Utc).AddSeconds(1));

        var second = await IncrementalJsonlReader.ReadAsync(file.Path, first.State);

        Assert.Equal(["new"], second.Lines);
    }

    [Fact]
    public async Task Reader_resets_safely_after_genuine_file_truncation()
    {
        using var file = new TemporaryFile("old contents\n");
        var first = await IncrementalJsonlReader.ReadAsync(file.Path, JsonlReadState.Empty);
        await File.WriteAllTextAsync(file.Path, "new\n");

        var second = await IncrementalJsonlReader.ReadAsync(file.Path, first.State);

        Assert.Equal(["new"], second.Lines);
    }

    [Fact]
    public async Task Reader_preserves_a_multibyte_utf8_character_split_across_reads()
    {
        using var file = new TemporaryFile();
        var bytes = Encoding.UTF8.GetBytes("café\n");
        await File.WriteAllBytesAsync(file.Path, bytes[..^2]);

        var first = await IncrementalJsonlReader.ReadAsync(file.Path, JsonlReadState.Empty);
        await using (var append = new FileStream(file.Path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
        {
            await append.WriteAsync(bytes.AsMemory(bytes.Length - 2, 2));
        }
        var second = await IncrementalJsonlReader.ReadAsync(file.Path, first.State);

        Assert.Empty(first.Lines);
        Assert.Equal(["café"], second.Lines);
        Assert.Equal(new FileInfo(file.Path).LastWriteTimeUtc.Ticks, second.State.LastWriteTimeUtcTicks);
    }

    private sealed class TemporaryFile : IDisposable
    {
        public TemporaryFile(string contents = "")
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"quota-jsonl-{Guid.NewGuid():N}.log");
            File.WriteAllText(Path, contents);
        }

        public string Path { get; }

        public void Dispose()
        {
            if (File.Exists(Path))
            {
                File.Delete(Path);
            }
        }
    }
}
