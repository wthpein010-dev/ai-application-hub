using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    // Small, durable stage-event records. Complete snapshots remain the phase anchors.
    internal sealed class AcceptedEventJournal
    {
        [Serializable]
        private sealed class Entry
        {
            public int FormatVersion = 1;
            public string RoomId;
            public string RoundId;
            public long Sequence;
            public double AppliedAtSeconds;
            public string Source;
            public string EventId;
            public string UserId;
            public string DisplayName;
            public GameCommand Command;
            public int Count;
            public double OccurredAtSeconds;
            public long OccurredUnixMilliseconds;

            public GameEvent ToGameEvent() => new GameEvent
            {
                Source = Source, RoomId = RoomId, RoundId = RoundId,
                EventId = EventId, UserId = UserId, DisplayName = DisplayName,
                Command = Command, Count = Count,
                OccurredAtSeconds = OccurredAtSeconds,
                OccurredUnixMilliseconds = OccurredUnixMilliseconds
            };
        }

        [Serializable]
        private sealed class Line
        {
            public string Payload;
            public string Sha256;
        }

        private const int MaxLineBytes = 16 * 1024;
        private const long CompactAfterBytes = 2 * 1024 * 1024;
        private readonly string path;
        private string roomId;
        private string roundId;

        public long Sequence { get; private set; }
        public bool Matches(RescueSnapshot snapshot) => roomId == snapshot.RoomId && roundId == snapshot.RoundId;
        public bool ShouldCompact => File.Exists(path) && new FileInfo(path).Length >= CompactAfterBytes;

        public AcceptedEventJournal(string path) { this.path = path; }

        public void Bind(RescueSnapshot snapshot)
        {
            roomId = snapshot.RoomId;
            roundId = snapshot.RoundId;
            Sequence = snapshot.JournalSequence;
        }

        public void AppendAccepted(GameEvent gameEvent, RescueGame game)
        {
            if (gameEvent == null) throw new ArgumentNullException(nameof(gameEvent));
            if (game == null) throw new ArgumentNullException(nameof(game));
            var state = game.ViewSnapshot();
            if (roomId != state.RoomId || roundId != state.RoundId ||
                gameEvent.RoomId != roomId || gameEvent.RoundId != roundId ||
                string.IsNullOrWhiteSpace(gameEvent.EventId) || string.IsNullOrWhiteSpace(gameEvent.UserId) ||
                gameEvent.Count <= 0 || Sequence == long.MaxValue)
                throw new ArgumentException("Accepted event does not match the durable round", nameof(gameEvent));
            if (gameEvent.Command == GameCommand.Start || gameEvent.Command == GameCommand.Pause ||
                gameEvent.Command == GameCommand.Resume || gameEvent.Command == GameCommand.End)
                throw new ArgumentException("Lifecycle events require a complete checkpoint", nameof(gameEvent));

            var entry = new Entry
            {
                RoomId = roomId, RoundId = roundId, Sequence = Sequence + 1,
                AppliedAtSeconds = state.ElapsedSeconds,
                Source = gameEvent.Source, EventId = gameEvent.EventId,
                UserId = gameEvent.UserId, DisplayName = gameEvent.DisplayName,
                Command = gameEvent.Command, Count = gameEvent.Count,
                OccurredAtSeconds = gameEvent.OccurredAtSeconds,
                OccurredUnixMilliseconds = gameEvent.OccurredUnixMilliseconds
            };
            string payload = JsonUtility.ToJson(entry);
            byte[] bytes = Encoding.UTF8.GetBytes(JsonUtility.ToJson(new Line
            {
                Payload = payload, Sha256 = Hash(payload)
            }) + "\n");
            if (bytes.Length > MaxLineBytes) throw new ArgumentException("Journal event is too large", nameof(gameEvent));

            string folder = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
            long originalLength = File.Exists(path) ? new FileInfo(path).Length : 0;
            try
            {
                using (var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.None))
                {
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush(true);
                }
            }
            catch
            {
                try
                {
                    using (var stream = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None))
                        stream.SetLength(originalLength);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
                throw;
            }
            Sequence = entry.Sequence;
        }

        public RescueSnapshot Replay(RescueSnapshot anchor)
        {
            Bind(anchor);
            if (!File.Exists(path)) return anchor;
            byte[] bytes = File.ReadAllBytes(path);
            int validEnd = 0;
            RescueGame game = null;
            long expected = anchor.JournalSequence + 1;
            while (validEnd < bytes.Length)
            {
                int newline = Array.IndexOf(bytes, (byte)'\n', validEnd);
                if (newline < 0 || newline - validEnd + 1 > MaxLineBytes) break;
                string json = Encoding.UTF8.GetString(bytes, validEnd, newline - validEnd);
                if (!TryParse(json, out Entry entry)) break;
                if (entry.RoomId == anchor.RoomId && entry.RoundId == anchor.RoundId &&
                    entry.Sequence > anchor.JournalSequence)
                {
                    if (entry.Sequence != expected || entry.AppliedAtSeconds < 0 ||
                        double.IsNaN(entry.AppliedAtSeconds) || double.IsInfinity(entry.AppliedAtSeconds)) break;
                    if (game == null) game = RescueGame.Restore(GameConfig.Default, anchor);
                    double delta = entry.AppliedAtSeconds - game.ViewSnapshot().ElapsedSeconds;
                    if (delta < -0.000001) break;
                    game.AdvanceForView(Math.Max(0, delta));
                    if (game.Apply(entry.ToGameEvent(), entry.AppliedAtSeconds) != ApplyResult.Accepted) break;
                    expected++;
                }
                validEnd = newline + 1;
            }

            if (validEnd != bytes.Length)
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None))
                {
                    stream.SetLength(validEnd);
                    stream.Flush(true);
                }
            }
            var recovered = game == null ? anchor : game.Snapshot();
            recovered.JournalSequence = expected - 1;
            Bind(recovered);
            return recovered;
        }

        public void ClearAfterCheckpoint()
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        private static bool TryParse(string json, out Entry entry)
        {
            entry = null;
            try
            {
                var line = JsonUtility.FromJson<Line>(json);
                if (line == null || string.IsNullOrEmpty(line.Payload) ||
                    !string.Equals(line.Sha256, Hash(line.Payload), StringComparison.OrdinalIgnoreCase)) return false;
                entry = JsonUtility.FromJson<Entry>(line.Payload);
                return entry != null && entry.FormatVersion == 1 && entry.Sequence > 0 &&
                    !string.IsNullOrWhiteSpace(entry.RoomId) && !string.IsNullOrWhiteSpace(entry.RoundId) &&
                    !string.IsNullOrWhiteSpace(entry.EventId) && !string.IsNullOrWhiteSpace(entry.UserId) &&
                    entry.Count > 0;
            }
            catch (ArgumentException) { return false; }
        }

        private static string Hash(string payload)
        {
            using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(payload))).Replace("-", "");
        }
    }
}
