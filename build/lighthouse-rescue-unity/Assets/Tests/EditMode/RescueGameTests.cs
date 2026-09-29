using NUnit.Framework;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Tests
{
    public class RescueGameTests
    {
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
