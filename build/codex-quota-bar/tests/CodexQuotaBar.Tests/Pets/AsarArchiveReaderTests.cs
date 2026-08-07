using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using CodexQuotaBar.App.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class AsarArchiveReaderTests
{
    [Fact]
    public void Reader_extracts_the_first_matching_asset()
    {
        using var archive = SyntheticAsar.Create(new Dictionary<string, byte[]>
        {
            ["webview/assets/fireball-spritesheet-v5.webp"] = [10, 20, 30],
        });

        var bytes = AsarArchiveReader.ReadFirst(
            archive.Path,
            path => Path.GetFileName(path).StartsWith(
                "fireball-spritesheet-",
                StringComparison.OrdinalIgnoreCase));

        Assert.Equal([10, 20, 30], bytes);
    }

    [Fact]
    public void Reader_rejects_an_entry_that_points_beyond_the_archive()
    {
        using var archive = SyntheticAsar.Create(
            new Dictionary<string, byte[]>
            {
                ["fireball.webp"] = [1],
            },
            offsetOverride: long.MaxValue.ToString());

        Assert.Throws<InvalidDataException>(() =>
            AsarArchiveReader.ReadFirst(archive.Path, _ => true));
    }

    private sealed class SyntheticAsar : IDisposable
    {
        private SyntheticAsar(string path)
        {
            Path = path;
        }

        public string Path { get; }

        public static SyntheticAsar Create(
            IReadOnlyDictionary<string, byte[]> entries,
            string? offsetOverride = null)
        {
            var root = new Dictionary<string, object?>();
            var data = new MemoryStream();
            foreach (var (path, bytes) in entries)
            {
                AddEntry(
                    root,
                    path.Split('/'),
                    new Dictionary<string, object?>
                    {
                        ["size"] = bytes.LongLength,
                        ["offset"] = offsetOverride ?? data.Length.ToString(),
                    });
                data.Write(bytes);
            }

            var json = JsonSerializer.SerializeToUtf8Bytes(
                new Dictionary<string, object?> { ["files"] = root });
            var headerLength = Align4(8 + json.Length + 1);
            var header = new byte[headerLength];
            BinaryPrimitives.WriteUInt32LittleEndian(header, checked((uint)(headerLength - 4)));
            BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(4), checked((uint)json.Length));
            json.CopyTo(header.AsSpan(8));

            var sizePickle = new byte[8];
            BinaryPrimitives.WriteUInt32LittleEndian(sizePickle, 4);
            BinaryPrimitives.WriteUInt32LittleEndian(sizePickle.AsSpan(4), checked((uint)headerLength));

            var pathName = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"codex-quota-bar-{Guid.NewGuid():N}.asar");
            using (var stream = File.Create(pathName))
            {
                stream.Write(sizePickle);
                stream.Write(header);
                data.Position = 0;
                data.CopyTo(stream);
            }

            return new SyntheticAsar(pathName);
        }

        public void Dispose() => File.Delete(Path);

        private static void AddEntry(
            IDictionary<string, object?> files,
            IReadOnlyList<string> segments,
            Dictionary<string, object?> entry)
        {
            var current = files;
            for (var index = 0; index < segments.Count - 1; index++)
            {
                if (!current.TryGetValue(segments[index], out var directory))
                {
                    directory = new Dictionary<string, object?>
                    {
                        ["files"] = new Dictionary<string, object?>(),
                    };
                    current[segments[index]] = directory;
                }

                current = (Dictionary<string, object?>)
                    ((Dictionary<string, object?>)directory!)["files"]!;
            }

            current[segments[^1]] = entry;
        }

        private static int Align4(int value) => (value + 3) & ~3;
    }
}
