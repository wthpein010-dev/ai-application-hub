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
    }
}
