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
            public float RecordedAt;
        }

        public void Record(GameEvent gameEvent, ApplyResult result, float nowSeconds)
        {
            if (gameEvent == null || result != ApplyResult.Accepted || float.IsNaN(nowSeconds) || float.IsInfinity(nowSeconds)) return;
            string action = ActionLabel(gameEvent.Command, gameEvent.Count);
            if (action == null) return;
            RemoveExpired(nowSeconds);
            if (entries.Count == 3) entries.RemoveAt(0);
            entries.Add(new Entry { Label = SafeName(gameEvent.DisplayName) + "：" + action, RecordedAt = nowSeconds });
            lastRecordedAt = nowSeconds;
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
            var characters = StringInfo.GetTextElementEnumerator(raw);
            int visible = 0;
            while (characters.MoveNext() && visible < 8)
            {
                string element = characters.GetTextElement();
                bool safe = true;
                foreach (char c in element)
                {
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
