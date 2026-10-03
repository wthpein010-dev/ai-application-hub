using System;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    public enum LiveTranslationResult { Accepted, Ignored, Rejected }

    // The SDK-specific assembly fills this only after verifying the sender's stable identity field.
    // No SDK types or credentials enter the shared Windows/WebGL runtime assembly.
    public sealed class LivePushEnvelope
    {
        public string MessageId;
        public string MessageType;
        public long UnixMilliseconds;
        public string StableUserId;
        public string DisplayName;
        public string Content;
        public int Count = 1;
    }

    public sealed class LivePushTranslator
    {
        private const long FutureAllowanceMilliseconds = 250;
        private const int MaxCount = 100000;
        private const int MaxIdentityChars = 512;
        private const int MaxRoundIdChars = 128;
        private const int MaxDisplayNameChars = 128;
        private const int MaxCommentChars = 64;

        public LiveTranslationResult Translate(
            LivePushEnvelope message, string roomId, string roundId, double receivedAtGameSeconds,
            long stageStartedUnixMilliseconds, long receivedUnixMilliseconds, out GameEvent gameEvent)
        {
            gameEvent = null;
            if (message == null || string.IsNullOrWhiteSpace(message.MessageType))
                return LiveTranslationResult.Rejected;

            GameCommand command;
            switch (message.MessageType)
            {
                case "live_comment":
                    if (message.Content != null && message.Content.Length > MaxCommentChars)
                        return LiveTranslationResult.Ignored;
                    if (!TryCommentCommand(message.Content, out command)) return LiveTranslationResult.Ignored;
                    break;
                case "live_like": command = GameCommand.Like; break;
                case "live_gift": command = GameCommand.Gift; break;
                default: return LiveTranslationResult.Ignored;
            }

            if (string.IsNullOrWhiteSpace(message.MessageId) || string.IsNullOrWhiteSpace(message.StableUserId) ||
                string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(roundId) ||
                message.MessageId.Length > MaxIdentityChars || message.StableUserId.Length > MaxIdentityChars ||
                roomId.Length > MaxIdentityChars || roundId.Length > MaxRoundIdChars ||
                message.Count <= 0 || message.Count > MaxCount ||
                message.UnixMilliseconds <= 0 || stageStartedUnixMilliseconds <= 0 || receivedUnixMilliseconds <= 0 ||
                message.UnixMilliseconds < stageStartedUnixMilliseconds ||
                message.UnixMilliseconds > receivedUnixMilliseconds + FutureAllowanceMilliseconds ||
                double.IsNaN(receivedAtGameSeconds) || double.IsInfinity(receivedAtGameSeconds) || receivedAtGameSeconds < 0)
                return LiveTranslationResult.Rejected;

            gameEvent = new GameEvent
            {
                Source = "douyin", RoomId = roomId, RoundId = roundId,
                EventId = message.MessageType + ":" + message.MessageId,
                UserId = message.StableUserId,
                DisplayName = message.DisplayName != null && message.DisplayName.Length > MaxDisplayNameChars
                    ? null : message.DisplayName,
                Command = command, Count = command == GameCommand.Like || command == GameCommand.Gift ? message.Count : 1,
                OccurredAtSeconds = receivedAtGameSeconds, OccurredUnixMilliseconds = message.UnixMilliseconds
            };
            return LiveTranslationResult.Accepted;
        }

        private static bool TryCommentCommand(string content, out GameCommand command)
        {
            switch (content == null ? null : content.Trim())
            {
                case "上船": command = GameCommand.Board; return true;
                case "左": command = GameCommand.VoteLeft; return true;
                case "右": command = GameCommand.VoteRight; return true;
                case "修理": command = GameCommand.Repair; return true;
                case "照明": command = GameCommand.Light; return true;
                default: command = default(GameCommand); return false;
            }
        }
    }
}
