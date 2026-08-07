using System.Buffers.Binary;
using System.Globalization;
using System.Text.Json;

namespace CodexQuotaBar.App.Pets;

public static class AsarArchiveReader
{
    private const int SizePickleLength = 8;
    private const int HeaderPrefixLength = 8;

    public static byte[]? ReadFirst(string archivePath, Predicate<string> match)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(archivePath);
        ArgumentNullException.ThrowIfNull(match);

        using var stream = new FileStream(
            archivePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete);
        Span<byte> sizePickle = stackalloc byte[SizePickleLength];
        stream.ReadExactly(sizePickle);
        if (BinaryPrimitives.ReadUInt32LittleEndian(sizePickle) != sizeof(uint))
        {
            throw new InvalidDataException("Invalid ASAR size pickle.");
        }

        var headerSize = BinaryPrimitives.ReadUInt32LittleEndian(sizePickle[4..]);
        if (headerSize < HeaderPrefixLength || headerSize > stream.Length - SizePickleLength)
        {
            throw new InvalidDataException("Invalid ASAR header size.");
        }

        var header = new byte[headerSize];
        stream.ReadExactly(header);
        var payloadLength = BinaryPrimitives.ReadUInt32LittleEndian(header);
        var jsonLength = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(4));
        if (payloadLength > headerSize - sizeof(uint)
            || jsonLength > headerSize - HeaderPrefixLength)
        {
            throw new InvalidDataException("Invalid ASAR header pickle.");
        }

        using var document = JsonDocument.Parse(header.AsMemory(HeaderPrefixLength, checked((int)jsonLength)));
        if (!document.RootElement.TryGetProperty("files", out var files)
            || files.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("ASAR header does not contain a file tree.");
        }

        return FindFirst(stream, files, string.Empty, headerSize, match);
    }

    private static byte[]? FindFirst(
        FileStream stream,
        JsonElement files,
        string parentPath,
        uint headerSize,
        Predicate<string> match)
    {
        foreach (var property in files.EnumerateObject())
        {
            var path = string.IsNullOrEmpty(parentPath)
                ? property.Name
                : $"{parentPath}/{property.Name}";
            var entry = property.Value;
            if (entry.TryGetProperty("files", out var children))
            {
                if (children.ValueKind != JsonValueKind.Object)
                {
                    throw new InvalidDataException("Invalid ASAR directory entry.");
                }

                var nested = FindFirst(stream, children, path, headerSize, match);
                if (nested is not null)
                {
                    return nested;
                }

                continue;
            }

            if (!match(path))
            {
                continue;
            }

            return ReadEntry(stream, entry, headerSize);
        }

        return null;
    }

    private static byte[] ReadEntry(FileStream stream, JsonElement entry, uint headerSize)
    {
        if (entry.TryGetProperty("unpacked", out var unpacked)
            && unpacked.ValueKind == JsonValueKind.True)
        {
            throw new InvalidDataException("Unpacked ASAR entries are not supported.");
        }

        if (entry.TryGetProperty("link", out _))
        {
            throw new InvalidDataException("Linked ASAR entries are not supported.");
        }

        if (!entry.TryGetProperty("size", out var sizeElement)
            || !sizeElement.TryGetInt64(out var size)
            || size < 0
            || size > int.MaxValue)
        {
            throw new InvalidDataException("Invalid ASAR entry size.");
        }

        if (!entry.TryGetProperty("offset", out var offsetElement)
            || offsetElement.ValueKind != JsonValueKind.String
            || !long.TryParse(
                offsetElement.GetString(),
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var offset)
            || offset < 0)
        {
            throw new InvalidDataException("Invalid ASAR entry offset.");
        }

        long dataOffset;
        long dataEnd;
        try
        {
            dataOffset = checked(SizePickleLength + (long)headerSize + offset);
            dataEnd = checked(dataOffset + size);
        }
        catch (OverflowException exception)
        {
            throw new InvalidDataException("ASAR entry offset overflowed.", exception);
        }

        if (dataEnd > stream.Length)
        {
            throw new InvalidDataException("ASAR entry exceeds archive bounds.");
        }

        stream.Position = dataOffset;
        var bytes = new byte[checked((int)size)];
        stream.ReadExactly(bytes);
        return bytes;
    }
}
