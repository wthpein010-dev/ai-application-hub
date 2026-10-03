using System;
using System.IO;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    public sealed class CheckpointStore
    {
        private readonly string path;

        public CheckpointStore(string path)
        {
            this.path = string.IsNullOrWhiteSpace(path) ? throw new ArgumentException("Checkpoint path is required", nameof(path)) : path;
        }

        public void Save(RescueSnapshot snapshot)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
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
                if (File.Exists(backup)) File.Delete(backup);
            }
            else
            {
                File.Move(temporary, path);
            }
        }

        public bool TryLoad(string roomId, int rulesVersion, out RescueSnapshot snapshot)
        {
            if (TryRead(path, roomId, rulesVersion, out snapshot, out bool finished)) return true;
            if (finished) return false;
            return TryRead(path + ".bak", roomId, rulesVersion, out snapshot, out _);
        }

        private static bool TryRead(string candidate, string roomId, int rulesVersion,
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
                if (read.Phase == GamePhase.Waiting || read.Phase == GamePhase.Result)
                {
                    finished = true;
                    return false;
                }
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
