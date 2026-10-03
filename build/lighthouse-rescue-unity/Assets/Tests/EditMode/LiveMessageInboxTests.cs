using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;

namespace LighthouseRescue.Tests
{
    public sealed class LiveMessageInboxTests
    {
        private static LivePushEnvelope Board(string id = "m1") => new LivePushEnvelope
        {
            MessageId = id, MessageType = "live_comment", Content = "上船",
            StableUserId = "viewer-1", UnixMilliseconds = 100500
        };

        private static RescueGame StartedGame(string round = "round-1")
        {
            var game = new RescueGame(GameConfig.Default, "room-1", round, 7);
            game.Apply(new GameEvent
            {
                Source = "host", RoomId = "room-1", RoundId = round,
                EventId = "start", UserId = "host", Command = GameCommand.Start
            }, 0);
            return game;
        }

        [Test]
        public void BackgroundSdkCallbackCannotChangeRulesUntilMainThreadDrains()
        {
            var game = StartedGame();
            var inbox = new LiveMessageInbox(4);
            inbox.SetRound("room-1", "round-1");
            Assert.That(Task.Run(() => inbox.Post(Board(), "room-1", 100600)).GetAwaiter().GetResult(), Is.True);
            Assert.That(game.Snapshot().JoinedCount, Is.Zero);

            var receipts = new List<LiveInboxReceipt>();
            Assert.That(inbox.Drain(game, new EventRouter(), 100600, 100000, 4, receipts.Add), Is.EqualTo(1));
            Assert.That(game.Snapshot().JoinedCount, Is.EqualTo(1));
            Assert.That(receipts[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
            Assert.That(receipts[0].RuleResult, Is.EqualTo(ApplyResult.Accepted));
            Assert.That(receipts[0].MessageId, Is.EqualTo("m1"));
            Assert.That(receipts[0].GameEvent, Is.Not.Null);
            Assert.That(receipts[0].GameEvent.Command, Is.EqualTo(GameCommand.Board));
            Assert.That(receipts[0].GameEvent.UserId, Is.EqualTo("viewer-1"));
        }

        [Test]
        public void QueuedPreviousRoundMessageCannotJoinTheNextRound()
        {
            var inbox = new LiveMessageInbox(4);
            inbox.SetRound("room-1", "round-1");
            Assert.That(inbox.Post(Board(), "room-1", 100600), Is.True);
            inbox.SetRound("room-1", "round-2");
            var game = StartedGame("round-2");
            var receipts = new List<LiveInboxReceipt>();

            inbox.Drain(game, new EventRouter(), 100600, 100000, 4, receipts.Add);
            Assert.That(game.Snapshot().JoinedCount, Is.Zero);
            Assert.That(receipts[0].Outcome, Is.EqualTo(LiveInboxOutcome.WrongRound));
        }

        [Test]
        public void MessagesFromEarlierStageDoNotApplyAfterTheStageChanges()
        {
            var inbox = new LiveMessageInbox(4);
            inbox.SetRound("room-1", "round-1");
            Assert.That(inbox.Post(Board(), "room-1", 100600), Is.True);
            var game = StartedGame();
            var receipts = new List<LiveInboxReceipt>();

            inbox.Drain(game, new EventRouter(), 101100, 101000, 4, receipts.Add);
            Assert.That(game.Snapshot().JoinedCount, Is.Zero);
            Assert.That(receipts[0].Outcome, Is.EqualTo(LiveInboxOutcome.Invalid));
        }

        [Test]
        public void FullInboxRejectsNewMessagesInsteadOfGrowingWithoutBound()
        {
            var inbox = new LiveMessageInbox(1);
            inbox.SetRound("room-1", "round-1");
            Assert.That(inbox.Post(Board(), "room-1", 100600), Is.True);
            Assert.That(inbox.Post(Board("m2"), "room-1", 100601), Is.False);
            Assert.That(inbox.PendingCount, Is.EqualTo(1));
        }

        [Test]
        public void PostResultDistinguishesFullQueueFromInvalidAndUnboundInputs()
        {
            var method = typeof(LiveMessageInbox).GetMethod("TryPost");
            Assert.That(method, Is.Not.Null, "the controller needs an explicit overflow result");
            var inbox = new LiveMessageInbox(1);
            Func<LivePushEnvelope, string> result = message =>
                method.Invoke(inbox, new object[] { message, "room-1", 100600 }).ToString();
            Assert.That(result(Board()), Is.EqualTo("Rejected"), "unbound is not overflow");
            inbox.SetRound("room-1", "round-1");
            Assert.That(result(null), Is.EqualTo("Rejected"), "invalid input is not overflow");
            Assert.That(result(Board()), Is.EqualTo("Accepted"));
            Assert.That(result(Board("m2")), Is.EqualTo("Full"));
            Assert.That(inbox.PendingCount, Is.EqualTo(1));
        }

        [Test]
        public void RoundBindingMustHappenOnTheUnityMainThread()
        {
            var inbox = new LiveMessageInbox(2);
            Assert.That(() => Task.Run(() => inbox.SetRound("room-1", "round-1")).GetAwaiter().GetResult(),
                Throws.TypeOf<InvalidOperationException>());
        }

        [Test]
        public void ReplayedSdkMessageReportsRuleRejectionWithoutASecondJoin()
        {
            var inbox = new LiveMessageInbox(4);
            inbox.SetRound("room-1", "round-1");
            Assert.That(inbox.Post(Board(), "room-1", 100600), Is.True);
            Assert.That(inbox.Post(Board(), "room-1", 100601), Is.True);
            var game = StartedGame();
            var receipts = new List<LiveInboxReceipt>();

            inbox.Drain(game, new EventRouter(), 100601, 100000, 4, receipts.Add);
            Assert.That(game.Snapshot().JoinedCount, Is.EqualTo(1));
            Assert.That(receipts[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
            Assert.That(receipts[1].Outcome, Is.EqualTo(LiveInboxOutcome.RuleRejected));
            Assert.That(receipts[1].RuleResult, Is.EqualTo(ApplyResult.Duplicate));
        }

        [Test]
        public void DrainingOneLiveMessageDoesNotCopyThousandsOfHistoricalAudienceIds()
        {
            var game = StartedGame();
            for (int i = 0; i < 2048; i++)
                Assert.That(game.Apply(new GameEvent
                {
                    Source = "douyin", RoomId = "room-1", RoundId = "round-1",
                    EventId = "prior-" + i, UserId = "viewer-" + i, Command = GameCommand.Board
                }, 0), Is.EqualTo(ApplyResult.Accepted));
            var inbox = new LiveMessageInbox(4);
            inbox.SetRound("room-1", "round-1");
            var router = new EventRouter();
            var receipts = new List<LiveInboxReceipt>();
            var warmup = Board("warmup");
            warmup.StableUserId = "warmup-viewer";
            Assert.That(inbox.Post(warmup, "room-1", 100600), Is.True);
            inbox.Drain(game, router, 100600, 100000, 4, receipts.Add);
            receipts.Clear();
            var next = Board("measured");
            next.StableUserId = "new-viewer";
            Assert.That(inbox.Post(next, "room-1", 100600), Is.True);

            var counter = typeof(RescueGame).GetProperty("CompleteSnapshotCount");
            Assert.That(counter, Is.Not.Null, "full snapshot copies must be observable in stress tests");
            long before = (long)counter.GetValue(game);
            inbox.Drain(game, router, 100600, 100000, 4, receipts.Add);
            Assert.That((long)counter.GetValue(game), Is.EqualTo(before),
                "one message must not copy all prior IDs");
            Assert.That(game.Snapshot().JoinedCount, Is.EqualTo(2050));
            Assert.That(receipts[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
        }
    }
}
