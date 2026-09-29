using NUnit.Framework;
using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;

namespace LighthouseRescue.Tests
{
    public class EventRouterTests
    {
        private static GameEvent E(GameCommand command, string id, double at, int count = 1)
        {
            return new GameEvent
            {
                Source = "simulation", RoomId = "room", RoundId = "round",
                EventId = id, UserId = "viewer", Command = command,
                Count = count, OccurredAtSeconds = at
            };
        }

        private static RescueGame VotingGame()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 4);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(20);
            return game;
        }

        [Test]
        public void WrongRoomOrRoundCannotChangeVotes()
        {
            var game = VotingGame();
            var router = new EventRouter();
            var wrongRoom = E(GameCommand.VoteLeft, "wrong-room", 20);
            wrongRoom.RoomId = "other";
            var wrongRound = E(GameCommand.VoteRight, "wrong-round", 20);
            wrongRound.RoundId = "other";
            Assert.That(router.Route(wrongRoom, game, 20), Is.EqualTo(ApplyResult.WrongRoom));
            Assert.That(router.Route(wrongRound, game, 20), Is.EqualTo(ApplyResult.WrongRound));
            Assert.That(game.Snapshot().LeftVotes + game.Snapshot().RightVotes, Is.EqualTo(0));
        }

        [Test]
        public void DuplicateVoteAfterReplayCountsOnlyOnce()
        {
            var game = VotingGame();
            var router = new EventRouter();
            var vote = E(GameCommand.VoteLeft, "vote-1", 20);
            Assert.That(router.Route(vote, game, 20), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(router.Route(vote, game, 20.1), Is.EqualTo(ApplyResult.Duplicate));
            Assert.That(game.Snapshot().LeftVotes, Is.EqualTo(1));
        }

        [Test]
        public void MissingSourceAndMalformedCountsAreRejected()
        {
            var game = VotingGame();
            var router = new EventRouter();
            var missingSource = E(GameCommand.VoteLeft, "missing", 20);
            missingSource.Source = "";
            var negativeCount = E(GameCommand.Like, "negative", 20, -1);
            var hugeCount = E(GameCommand.Like, "huge", 20, int.MaxValue);
            Assert.That(router.Route(missingSource, game, 20), Is.EqualTo(ApplyResult.Invalid));
            Assert.That(router.Route(negativeCount, game, 20), Is.EqualTo(ApplyResult.Invalid));
            Assert.That(router.Route(hugeCount, game, 20), Is.EqualTo(ApplyResult.Invalid));
        }

        [Test]
        public void OldOrFutureStageEventCannotModifyCurrentCheckpoint()
        {
            var game = VotingGame();
            game.Advance(20);
            game.Advance(40);
            var router = new EventRouter();
            Assert.That(game.Snapshot().Phase, Is.EqualTo(GamePhase.Checkpoint2));
            Assert.That(router.Route(E(GameCommand.Light, "old", 79), game, 80), Is.EqualTo(ApplyResult.Stale));
            Assert.That(router.Route(E(GameCommand.Light, "future", 85), game, 80), Is.EqualTo(ApplyResult.Invalid));
            Assert.That(game.Snapshot().LightProgress, Is.EqualTo(1));
        }
    }
}
