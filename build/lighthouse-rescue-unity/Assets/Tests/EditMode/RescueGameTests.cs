using NUnit.Framework;
using LighthouseRescue.Rules;
using System.Reflection;

namespace LighthouseRescue.Tests
{
    public class RescueGameTests
    {
        private static int Contribution(RescueSnapshot snapshot, string fieldName)
        {
            FieldInfo field = typeof(RescueSnapshot).GetField(fieldName);
            Assert.That(field, Is.Not.Null, fieldName + " must be persisted in the round snapshot");
            return (int)field.GetValue(snapshot);
        }

        private static bool TotalsComplete(RescueSnapshot snapshot)
        {
            FieldInfo field = typeof(RescueSnapshot).GetField("ContributionTotalsComplete");
            Assert.That(field, Is.Not.Null, "new rounds must mark complete contribution totals");
            return (bool)field.GetValue(snapshot);
        }

        private static GameEvent Event(GameCommand command, string id, string user, double at, int count = 1)
        {
            return new GameEvent
            {
                Source = "simulation", RoomId = "room-a", RoundId = "round-a",
                EventId = id, UserId = user, Command = command, Count = count,
                OccurredAtSeconds = at
            };
        }

        private static RescueGame Started()
        {
            var game = new RescueGame(GameConfig.Default, "room-a", "round-a", 17);
            Assert.That(game.Apply(Event(GameCommand.Start, "start", "host", 0), 0), Is.EqualTo(ApplyResult.Accepted));
            return game;
        }

        [Test]
        public void RunningRoundKeepsItsOriginalTimingAfterCallerChangesConfig()
        {
            var settings = GameConfig.Default;
            settings.GatheringSeconds = 7;
            var game = new RescueGame(settings, "room-a", "round-a", 17);
            settings.GatheringSeconds = 100;
            game.Snapshot().RoundConfig.GatheringSeconds = 200;

            Assert.That(game.Apply(Event(GameCommand.Start, "start", "host", 0), 0), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Snapshot().RemainingSeconds, Is.EqualTo(7));
            game.Advance(7);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Voting));
        }

        [Test]
        public void InvalidRoundRulesCannotBeStarted()
        {
            var settings = GameConfig.Default;
            settings.LikesPerLightPoint = 0;
            Assert.Throws<System.ArgumentException>(() => new RescueGame(settings, "room-a", "round-a", 17));
        }

        private static RescueGame FirstCheckpoint(bool left)
        {
            var game = Started();
            game.Advance(20);
            if (left)
                Assert.That(game.Apply(Event(GameCommand.VoteLeft, "vote", "viewer", 20), 20), Is.EqualTo(ApplyResult.Accepted));
            game.Advance(20);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Checkpoint1));
            return game;
        }

        [Test]
        public void ViewSnapshotKeepsVisibleCountsWithoutCopyingAudienceOrDedupeHistory()
        {
            var game = Started();
            for (int i = 0; i < 256; i++)
                Assert.That(game.Apply(Event(GameCommand.Board, "board-" + i, "viewer-" + i, 0), 0),
                    Is.EqualTo(ApplyResult.Accepted));
            var method = typeof(RescueGame).GetMethod("ViewSnapshot");
            Assert.That(method, Is.Not.Null, "the render path needs a history-free snapshot");
            var visual = (RescueSnapshot)method.Invoke(game, null);
            Assert.That(visual.RulesVersion, Is.EqualTo(0));
            Assert.That(visual.JoinedCount, Is.EqualTo(256));
            Assert.That(visual.RecentEventIds, Is.Empty);
            Assert.That(visual.JoinedUserIds, Is.Empty);
            Assert.That(visual.VotedUserIds, Is.Empty);
            Assert.That(visual.CooldownKeys, Is.Empty);
            Assert.That(visual.CommandCapKeys, Is.Empty);

            var complete = game.Snapshot();
            Assert.That(complete.RulesVersion, Is.EqualTo(1));
            Assert.That(complete.RecentEventIds.Count, Is.EqualTo(257));
            Assert.That(complete.JoinedUserIds.Count, Is.EqualTo(256));
            var restored = RescueGame.Restore(GameConfig.Default, complete);
            Assert.That(restored.Apply(Event(GameCommand.Board, "board-0", "viewer-0", 0), 0),
                Is.EqualTo(ApplyResult.Duplicate));
        }

        [Test]
        public void AdvancingForViewKeepsPhaseAndClockWhileSkippingHistory()
        {
            var game = Started();
            var method = typeof(RescueGame).GetMethod("AdvanceForView");
            Assert.That(method, Is.Not.Null, "frame advance needs a history-free result");
            var visual = (RescueSnapshot)method.Invoke(game, new object[] { 20d });
            var complete = game.Snapshot();
            Assert.That(visual.Phase, Is.EqualTo(GamePhase.Voting));
            Assert.That(visual.RemainingSeconds, Is.EqualTo(complete.RemainingSeconds));
            Assert.That(visual.ElapsedSeconds, Is.EqualTo(complete.ElapsedSeconds));
            Assert.That(visual.RecentEventIds, Is.Empty);
            Assert.That(complete.RecentEventIds, Does.Contain("start"));
        }

        private static void FillShortCheckpoint(RescueGame game, int stage, double at)
        {
            for (int i = 0; i < 3; i++)
                Assert.That(game.Apply(Event(GameCommand.Repair, $"repair-{stage}-{i}", $"r-{stage}-{i}", at), at), Is.EqualTo(ApplyResult.Accepted));
            for (int i = 0; i < 2; i++)
                Assert.That(game.Apply(Event(GameCommand.Light, $"light-{stage}-{i}", $"l-{stage}-{i}", at), at), Is.EqualTo(ApplyResult.Accepted));
        }

        [Test]
        public void GatheringEndsAtTwentySecondsAndVoteAtBoundaryCounts()
        {
            var game = Started();
            game.Advance(19.99);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Gathering));
            game.Advance(0.01);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Voting));
            Assert.That(game.Apply(Event(GameCommand.VoteLeft, "boundary-vote", "a", 20), 20), Is.EqualTo(ApplyResult.Accepted));
            game.Advance(20);
            Assert.That(game.Snapshot().Route, Is.EqualTo(RescueRoute.ShortLeft));
        }

        [Test]
        public void NoVotesChooseLongRouteAndNoAudienceSettlesFailure()
        {
            var game = FirstCheckpoint(false);
            Assert.That(game.Snapshot().Route, Is.EqualTo(RescueRoute.LongRight));
            game.Advance(120);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Finale));
            Assert.That(game.Snapshot().Hull, Is.EqualTo(10));
            Assert.That(game.Snapshot().SavedCount, Is.EqualTo(0));
            game.Advance(40);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Result));
            Assert.That(game.Snapshot().Outcome, Is.EqualTo(GameOutcome.Failure));
        }

        [Test]
        public void FreeCommentsCanRescueAllThreeWithoutGifts()
        {
            var game = FirstCheckpoint(true);
            for (int stage = 1; stage <= 3; stage++)
            {
                FillShortCheckpoint(game, stage, 40 + (stage - 1) * 35);
                game.Advance(35);
            }
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Finale));
            Assert.That(game.Snapshot().SavedCount, Is.EqualTo(3));
            Assert.That(game.Snapshot().Hull, Is.EqualTo(76));
            game.Advance(40);
            Assert.That(game.Snapshot().Outcome, Is.EqualTo(GameOutcome.FullSuccess));
        }

        [Test]
        public void OneRescueAndTwoMissesProducePartialSuccess()
        {
            var game = FirstCheckpoint(true);
            FillShortCheckpoint(game, 1, 40);
            game.Advance(105);
            Assert.That(game.Snapshot().SavedCount, Is.EqualTo(1));
            Assert.That(game.Snapshot().Hull, Is.EqualTo(4));
            game.Advance(40);
            Assert.That(game.Snapshot().Outcome, Is.EqualTo(GameOutcome.PartialSuccess));
        }

        [Test]
        public void RepeatedCommentIsDeduplicatedAndCooldownRejectsRapidUse()
        {
            var game = FirstCheckpoint(true);
            var first = Event(GameCommand.Repair, "repair-a", "solo", 40);
            Assert.That(game.Apply(first, 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Apply(first, 40), Is.EqualTo(ApplyResult.Duplicate));
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-b", "solo", 41), 41), Is.EqualTo(ApplyResult.Cooldown));
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-c", "solo", 43), 43), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Snapshot().RepairProgress, Is.EqualTo(3));
        }

        [Test]
        public void BatchedLikesAndLargeCrowdStopAtVisibleCaps()
        {
            var game = FirstCheckpoint(false);
            Assert.That(game.Apply(Event(GameCommand.Like, "like-1", "crowd", 40, 100), 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Snapshot().LightProgress, Is.EqualTo(3));
            game.Apply(Event(GameCommand.Like, "like-2", "crowd", 40, 100), 40);
            for (int i = 0; i < 100; i++)
                game.Apply(Event(GameCommand.Repair, $"crowd-{i}", $"viewer-{i}", 40), 40);
            Assert.That(game.Snapshot().LightProgress, Is.EqualTo(3));
            Assert.That(game.Snapshot().RepairProgress, Is.EqualTo(3));
        }

        [Test]
        public void RoundContributionTotalsCountEffectiveActionsAndSurviveRecovery()
        {
            var game = FirstCheckpoint(true);
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-1", "viewer-a", 40), 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-1", "viewer-a", 40), 40), Is.EqualTo(ApplyResult.Duplicate));
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-fast", "viewer-a", 41), 41), Is.EqualTo(ApplyResult.Cooldown));
            Assert.That(game.Apply(Event(GameCommand.Light, "light-1", "viewer-b", 40), 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Apply(Event(GameCommand.Like, "likes-1", "viewer-c", 40, 20), 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Apply(Event(GameCommand.Gift, "gift-1", "viewer-d", 40), 40), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(game.Apply(Event(GameCommand.Like, "likes-capped", "viewer-c", 40, 20), 40), Is.EqualTo(ApplyResult.Capped));
            game.Advance(35);
            Assert.That(game.Apply(Event(GameCommand.Repair, "repair-2", "viewer-a", 75), 75), Is.EqualTo(ApplyResult.Accepted));

            var snapshot = game.Snapshot();
            Assert.That(Contribution(snapshot, "RepairActions"), Is.EqualTo(2));
            Assert.That(Contribution(snapshot, "LightActions"), Is.EqualTo(1));
            Assert.That(Contribution(snapshot, "LikeLightPoints"), Is.EqualTo(1));
            Assert.That(TotalsComplete(snapshot), Is.True);
            var restored = RescueGame.Restore(GameConfig.Default, snapshot).Snapshot();
            Assert.That(Contribution(restored, "RepairActions"), Is.EqualTo(2));
            Assert.That(Contribution(restored, "LightActions"), Is.EqualTo(1));
            Assert.That(Contribution(restored, "LikeLightPoints"), Is.EqualTo(1));
            Assert.That(TotalsComplete(restored), Is.True);
        }

        [Test]
        public void OldStageCommentCannotCountInNextStage()
        {
            var game = FirstCheckpoint(true);
            game.Advance(35);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Checkpoint2));
            Assert.That(game.Apply(Event(GameCommand.Light, "late", "viewer", 74), 75), Is.EqualTo(ApplyResult.Stale));
            Assert.That(game.Snapshot().LightProgress, Is.EqualTo(1));
        }

        [Test]
        public void GiftNeverChangesRescueNumbers()
        {
            var game = FirstCheckpoint(true);
            var before = game.Snapshot();
            Assert.That(game.Apply(Event(GameCommand.Gift, "gift", "viewer", 40), 40), Is.EqualTo(ApplyResult.Accepted));
            var after = game.Snapshot();
            Assert.That(after.Hull, Is.EqualTo(before.Hull));
            Assert.That(after.LightProgress, Is.EqualTo(before.LightProgress));
            Assert.That(after.RepairProgress, Is.EqualTo(before.RepairProgress));
            Assert.That(after.SavedCount, Is.EqualTo(before.SavedCount));
        }

        [Test]
        public void PauseFreezesAndResumeContinuesCountdown()
        {
            var game = Started();
            game.Advance(5);
            Assert.That(game.Apply(Event(GameCommand.Pause, "pause", "host", 5), 5), Is.EqualTo(ApplyResult.Accepted));
            game.Advance(100);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Paused));
            Assert.That(game.Snapshot().RemainingSeconds, Is.EqualTo(15).Within(0.001));
            Assert.That(game.Apply(Event(GameCommand.Resume, "resume", "host", 5), 5), Is.EqualTo(ApplyResult.Accepted));
            game.Advance(15);
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Voting));
        }
    }
}
