using System;
using System.IO;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    public sealed class CheckpointStore
    {
        private readonly string path;
        private readonly AcceptedEventJournal journal;

        public CheckpointStore(string path)
        {
            this.path = string.IsNullOrWhiteSpace(path) ? throw new ArgumentException("Checkpoint path is required", nameof(path)) : path;
            journal = new AcceptedEventJournal(path + ".journal");
        }

        public void Save(RescueSnapshot snapshot)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            if (snapshot.RulesVersion != 1)
                throw new ArgumentException("Only a complete rules snapshot can be saved", nameof(snapshot));
            if (snapshot.JournalSequence < 0)
                throw new ArgumentException("Journal sequence cannot be negative", nameof(snapshot));
            snapshot.JournalSequence = journal.Matches(snapshot) ? journal.Sequence : snapshot.JournalSequence;
            string folder = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
            string temporary = path + ".tmp";
            string backup = path + ".bak";
            string json = JsonUtility.ToJson(snapshot);
            using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var writer = new StreamWriter(stream))
            {
                writer.Write(json);
                writer.Flush();
                stream.Flush(true);
            }
            if (File.Exists(path))
            {
                File.Replace(temporary, path, backup, true);
            }
            else
            {
                File.Move(temporary, path);
            }
            journal.Bind(snapshot);
            journal.ClearAfterCheckpoint();
            try { if (File.Exists(backup)) File.Delete(backup); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        public void AppendAccepted(GameEvent gameEvent, RescueGame game)
        {
            journal.AppendAccepted(gameEvent, game);
            if (!journal.ShouldCompact) return;
            try { Save(game.Snapshot()); }
            catch (IOException error) { Debug.LogWarning("Journal compaction failed: " + error.GetType().Name); }
            catch (UnauthorizedAccessException error) { Debug.LogWarning("Journal compaction failed: " + error.GetType().Name); }
        }

        public bool TryLoad(string roomId, int rulesVersion, out RescueSnapshot snapshot)
            => TryLoadCore(roomId, rulesVersion, false, out snapshot);

        // Fault handling needs the exact last durable state, including a finished or reset round.
        public bool TryLoadForFaultRollback(string roomId, int rulesVersion, out RescueSnapshot snapshot)
            => TryLoadCore(roomId, rulesVersion, true, out snapshot);

        private bool TryLoadCore(string roomId, int rulesVersion, bool allowFinished, out RescueSnapshot snapshot)
        {
            if (TryRead(path, roomId, rulesVersion, allowFinished, out snapshot, out bool finished))
            {
                snapshot = journal.Replay(snapshot);
                return true;
            }
            if (finished) return false;
            if (!TryRead(path + ".bak", roomId, rulesVersion, allowFinished, out snapshot, out _)) return false;
            snapshot = journal.Replay(snapshot);
            return true;
        }

        private static bool TryRead(string candidate, string roomId, int rulesVersion, bool allowFinished,
            out RescueSnapshot snapshot, out bool finished)
        {
            snapshot = null;
            finished = false;
            if (!File.Exists(candidate)) return false;
            try
            {
                var read = JsonUtility.FromJson<RescueSnapshot>(File.ReadAllText(candidate));
                if (read == null || read.RulesVersion != rulesVersion || read.RoomId != roomId ||
                    string.IsNullOrWhiteSpace(read.RoundId))
                    return false;
                if (!allowFinished && (read.Phase == GamePhase.Waiting || read.Phase == GamePhase.Result))
                {
                    finished = true;
                    return false;
                }
                if (!RescueGame.CanRestore(GameConfig.Default, read)) return false;
                snapshot = read;
                return true;
            }
            catch (Exception error) when (error is IOException || error is UnauthorizedAccessException || error is ArgumentException)
            {
                return false;
            }
        }
    }
}
