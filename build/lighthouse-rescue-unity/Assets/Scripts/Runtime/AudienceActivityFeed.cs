using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    public sealed class AudienceActivityFeed
    {
        private const float LifetimeSeconds = 5f;
        private const float RotationSeconds = 1.6f;
        private readonly List<Entry> entries = new List<Entry>(3);
        private float lastRecordedAt;

        private struct Entry
        {
            public string Label;
            public Activity Portrait;
            public float RecordedAt;
        }

        public readonly struct Activity
        {
            public readonly string Name;
            public readonly string Action;
            public readonly int AvatarIndex;

            internal Activity(string name, string action, int avatarIndex)
            {
                Name = name;
                Action = action;
                AvatarIndex = avatarIndex;
            }
        }

        public void Record(GameEvent gameEvent, ApplyResult result, float nowSeconds)
        {
            if (gameEvent == null || result != ApplyResult.Accepted || float.IsNaN(nowSeconds) || float.IsInfinity(nowSeconds)) return;
            string action = ActionLabel(gameEvent.Command, gameEvent.Count);
            if (action == null) return;
            RemoveExpired(nowSeconds);
            if (entries.Count == 3) entries.RemoveAt(0);
            string name = SafeName(gameEvent.DisplayName);
            string identity = string.IsNullOrEmpty(gameEvent.UserId) ? name : gameEvent.UserId;
            uint hash = 2166136261;
            // Local portraits remain consistent for an actor without retaining or displaying their identifier.
            for (int i = 0; i < Math.Min(identity.Length, 512); i++) hash = unchecked((hash ^ identity[i]) * 16777619);
            entries.Add(new Entry { Label = name + "：" + action,
                Portrait = new Activity(name, action, (int)(hash % 3)), RecordedAt = nowSeconds });
            lastRecordedAt = nowSeconds;
        }

        public bool TryGetRecent(int index, float nowSeconds, out Activity activity)
        {
            activity = default;
            if (index < 0 || float.IsNaN(nowSeconds) || float.IsInfinity(nowSeconds)) return false;
            RemoveExpired(nowSeconds);
            if (index >= entries.Count) return false;
            activity = entries[entries.Count - 1 - index].Portrait;
            return true;
        }

        public string Current(float nowSeconds)
        {
            if (float.IsNaN(nowSeconds) || float.IsInfinity(nowSeconds)) return null;
            RemoveExpired(nowSeconds);
            if (entries.Count == 0) return null;
            int older = Math.Min((int)Math.Max(0f, (nowSeconds - lastRecordedAt) / RotationSeconds), entries.Count - 1);
            return entries[entries.Count - 1 - older].Label;
        }

        public void Reset()
        {
            entries.Clear();
            lastRecordedAt = 0f;
        }

        private void RemoveExpired(float nowSeconds)
        {
            while (entries.Count > 0 && nowSeconds - entries[0].RecordedAt >= LifetimeSeconds)
                entries.RemoveAt(0);
        }

        private static string ActionLabel(GameCommand command, int count)
        {
            switch (command)
            {
                case GameCommand.Board: return "上船";
                case GameCommand.VoteLeft: return "投左路";
                case GameCommand.VoteRight: return "投右路";
                case GameCommand.Repair: return "修理 +1";
                case GameCommand.Light: return "照明 +1";
                case GameCommand.Like: return "点赞支持";
                case GameCommand.Gift: return "点亮烟花";
                default: return null;
            }
        }

        private static string SafeName(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "观众";
            var result = new StringBuilder(16);
            string bounded = raw.Length > 64 ? raw.Substring(0, 64) : raw;
            var characters = StringInfo.GetTextElementEnumerator(bounded);
            int visible = 0;
            while (characters.MoveNext() && visible < 8)
            {
                string element = characters.GetTextElement();
                if (element.Length > 8 || result.Length + element.Length > 16) continue;
                bool safe = true;
                for (int i = 0; i < element.Length; i++)
                {
                    char c = element[i];
                    if (char.IsHighSurrogate(c) && i + 1 < element.Length && char.IsLowSurrogate(element[i + 1]))
                    {
                        i++;
                        continue;
                    }
                    UnicodeCategory category = CharUnicodeInfo.GetUnicodeCategory(c);
                    if (char.IsControl(c) || category == UnicodeCategory.Format || category == UnicodeCategory.Surrogate || c == '<' || c == '>')
                    {
                        safe = false;
                        break;
                    }
                }
                if (!safe) continue;
                if (string.IsNullOrWhiteSpace(element))
                {
                    if (result.Length > 0 && result[result.Length - 1] != ' ') result.Append(' ');
                    continue;
                }
                result.Append(element);
                visible++;
            }
            string name = result.ToString().Trim();
            return name.Length == 0 ? "观众" : name;
        }
    }
}
