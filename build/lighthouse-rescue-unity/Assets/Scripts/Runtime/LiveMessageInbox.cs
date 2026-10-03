using System;
using System.Collections.Generic;
using System.Threading;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    public enum LiveInboxOutcome { Applied, RuleRejected, Ignored, Invalid, WrongRoom, WrongRound }
    public enum LiveInboxPostResult { Accepted, Rejected, Full }

    public sealed class LiveInboxReceipt
    {
        public string MessageId;
        public string MessageType;
        public LiveInboxOutcome Outcome;
        public ApplyResult RuleResult;
        public GameEvent GameEvent;
    }

    // SDK callbacks may call Post from any thread. SetRound and Drain run on Unity's main thread.
    public sealed class LiveMessageInbox
    {
        private const int MaxQueuedCommentChars = 1024;
        private const int MaxMessageTypeChars = 64;
        private sealed class PendingMessage
        {
            public LivePushEnvelope Message;
            public string SourceRoomId;
            public string RoundId;
            public long ReceivedUnixMilliseconds;
        }

        private readonly object gate = new object();
        private readonly Queue<PendingMessage> pending = new Queue<PendingMessage>();
        private readonly LivePushTranslator translator = new LivePushTranslator();
        private readonly int capacity;
        private readonly int mainThreadId;
        private string roomId;
        private string roundId;

        public LiveMessageInbox(int capacity)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            this.capacity = capacity;
            mainThreadId = Thread.CurrentThread.ManagedThreadId;
        }

        public int PendingCount { get { lock (gate) return pending.Count; } }

        public void SetRound(string room, string round)
        {
            if (Thread.CurrentThread.ManagedThreadId != mainThreadId)
                throw new InvalidOperationException("Live rounds must be bound on the Unity main thread.");
            if (string.IsNullOrWhiteSpace(room) || string.IsNullOrWhiteSpace(round))
                throw new ArgumentException("A verified room and round are required.");
            lock (gate)
            {
                roomId = room;
                roundId = round;
            }
        }

        public bool Post(LivePushEnvelope message, string sourceRoomId, long receivedUnixMilliseconds) =>
            TryPost(message, sourceRoomId, receivedUnixMilliseconds) == LiveInboxPostResult.Accepted;

        public LiveInboxPostResult TryPost(LivePushEnvelope message, string sourceRoomId, long receivedUnixMilliseconds)
        {
            if (message == null || receivedUnixMilliseconds <= 0 ||
                (message.MessageId != null && message.MessageId.Length > LivePushTranslator.MaxIdentityChars) ||
                (message.StableUserId != null && message.StableUserId.Length > LivePushTranslator.MaxIdentityChars) ||
                (sourceRoomId != null && sourceRoomId.Length > LivePushTranslator.MaxIdentityChars) ||
                (message.MessageType != null && message.MessageType.Length > MaxMessageTypeChars) ||
                (message.Content != null && message.Content.Length > MaxQueuedCommentChars))
                return LiveInboxPostResult.Rejected;
            lock (gate)
            {
                if (string.IsNullOrWhiteSpace(roundId)) return LiveInboxPostResult.Rejected;
                if (pending.Count >= capacity) return LiveInboxPostResult.Full;
                pending.Enqueue(new PendingMessage
                {
                    Message = new LivePushEnvelope
                    {
                        MessageId = message.MessageId, MessageType = message.MessageType,
                        UnixMilliseconds = message.UnixMilliseconds, StableUserId = message.StableUserId,
                        DisplayName = message.DisplayName != null &&
                            message.DisplayName.Length > LivePushTranslator.MaxDisplayNameChars
                                ? null : message.DisplayName,
                        Content = message.Content, Count = message.Count
                    },
                    SourceRoomId = sourceRoomId,
                    RoundId = roundId,
                    ReceivedUnixMilliseconds = receivedUnixMilliseconds
                });
                return LiveInboxPostResult.Accepted;
            }
        }

        public int Drain(RescueGame game, EventRouter router, long nowUnixMilliseconds,
            long stageStartedUnixMilliseconds, int maxItems, Action<LiveInboxReceipt> onHandled)
        {
            if (Thread.CurrentThread.ManagedThreadId != mainThreadId)
                throw new InvalidOperationException("Live events must be applied on the Unity main thread.");
            if (game == null) throw new ArgumentNullException(nameof(game));
            if (router == null) throw new ArgumentNullException(nameof(router));
            if (maxItems <= 0) throw new ArgumentOutOfRangeException(nameof(maxItems));

            int drained = 0;
            while (drained < maxItems)
            {
                PendingMessage item;
                lock (gate)
                {
                    if (pending.Count == 0) break;
                    item = pending.Dequeue();
                }
                var snapshot = game.ViewSnapshot();
                var receipt = new LiveInboxReceipt
                {
                    MessageId = item.Message.MessageId,
                    MessageType = item.Message.MessageType,
                    RuleResult = ApplyResult.Invalid
                };
                if (item.SourceRoomId != snapshot.RoomId || roomId != snapshot.RoomId)
                    receipt.Outcome = LiveInboxOutcome.WrongRoom;
                else if (item.RoundId != snapshot.RoundId)
                    receipt.Outcome = LiveInboxOutcome.WrongRound;
                else if (nowUnixMilliseconds < item.ReceivedUnixMilliseconds)
                    receipt.Outcome = LiveInboxOutcome.Invalid;
                else
                {
                    var translation = translator.Translate(item.Message, snapshot.RoomId, snapshot.RoundId,
                        snapshot.ElapsedSeconds, stageStartedUnixMilliseconds, item.ReceivedUnixMilliseconds,
                        out GameEvent gameEvent);
                    if (translation == LiveTranslationResult.Ignored) receipt.Outcome = LiveInboxOutcome.Ignored;
                    else if (translation == LiveTranslationResult.Rejected) receipt.Outcome = LiveInboxOutcome.Invalid;
                    else
                    {
                        receipt.GameEvent = gameEvent;
                        receipt.RuleResult = router.Route(gameEvent, game, snapshot.ElapsedSeconds);
                        receipt.Outcome = receipt.RuleResult == ApplyResult.Accepted
                            ? LiveInboxOutcome.Applied : LiveInboxOutcome.RuleRejected;
                    }
                }
                onHandled?.Invoke(receipt);
                drained++;
            }
            return drained;
        }
    }
}
