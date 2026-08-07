using System.Text;

namespace CodexQuotaBar.App.Tasks;

public sealed record JsonlReadState(long Offset, byte[] PendingBytes, long LastWriteTimeUtcTicks)
{
    public JsonlReadState(long offset, byte[] pendingBytes) : this(offset, pendingBytes, 0)
    {
    }

    public static JsonlReadState Empty { get; } = new(0, [], 0);
}

public sealed record JsonlReadResult(IReadOnlyList<string> Lines, JsonlReadState State);

public static class IncrementalJsonlReader
{
    public static async Task<JsonlReadResult> ReadAsync(
        string path,
        JsonlReadState state,
        CancellationToken cancellationToken = default)
    {
        var fileInfo = new FileInfo(path);
        var length = fileInfo.Length;
        var lastWriteTimeUtcTicks = fileInfo.LastWriteTimeUtc.Ticks;
        if (length < state.Offset)
        {
            state = JsonlReadState.Empty;
        }
        else if (length == state.Offset && lastWriteTimeUtcTicks != state.LastWriteTimeUtcTicks)
        {
            state = JsonlReadState.Empty;
        }

        var newBytes = new byte[checked((int)(length - state.Offset))];
        await using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            stream.Seek(state.Offset, SeekOrigin.Begin);
            var read = 0;
            while (read < newBytes.Length)
            {
                var count = await stream.ReadAsync(newBytes.AsMemory(read), cancellationToken);
                if (count == 0)
                {
                    break;
                }

                read += count;
            }

            if (read != newBytes.Length)
            {
                Array.Resize(ref newBytes, read);
            }
        }

        var bytes = new byte[state.PendingBytes.Length + newBytes.Length];
        state.PendingBytes.CopyTo(bytes, 0);
        newBytes.CopyTo(bytes, state.PendingBytes.Length);

        var lines = new List<string>();
        var lineStart = 0;
        for (var index = 0; index < bytes.Length; index++)
        {
            if (bytes[index] != (byte)'\n')
            {
                continue;
            }

            var lineLength = index - lineStart;
            if (lineLength > 0 && bytes[index - 1] == (byte)'\r')
            {
                lineLength--;
            }

            lines.Add(Encoding.UTF8.GetString(bytes, lineStart, lineLength));
            lineStart = index + 1;
        }

        var pending = bytes.AsSpan(lineStart).ToArray();
        return new JsonlReadResult(lines, new JsonlReadState(length, pending, lastWriteTimeUtcTicks));
    }
}
