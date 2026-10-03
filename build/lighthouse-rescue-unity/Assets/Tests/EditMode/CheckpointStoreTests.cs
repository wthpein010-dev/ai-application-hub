using System;
using System.IO;
using NUnit.Framework;
using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;

namespace LighthouseRescue.Tests
{
    public class CheckpointStoreTests
    {
        private string directory;
        private string file;

        [SetUp]
        public void SetUp()
        {
            directory = Path.Combine(Path.GetTempPath(), "lighthouse-checkpoint-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            file = Path.Combine(directory, "round.json");
        }

        [TearDown]
        public void TearDown()
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }

        private static GameEvent E(GameCommand command, string id, double at)
        {
            return new GameEvent
            {
                Source = "simulation", RoomId = "room", RoundId = "round",
                EventId = id, UserId = "solo", Command = command,
                Count = 1, OccurredAtSeconds = at
            };
        }

        [Test]
        public void InterruptedTemporaryWriteLeavesLastCompleteCheckpointReadable()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(5);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            File.WriteAllText(file + ".tmp", "{incomplete");
            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.Phase, Is.EqualTo(GamePhase.Gathering));
            Assert.That(recovered.RemainingSeconds, Is.EqualTo(15));
        }

        [Test]
        public void WrongRoomOrRulesVersionWillNotRestore()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            Assert.That(store.TryLoad("other", 1, out _), Is.False);
            Assert.That(store.TryLoad("room", 2, out _), Is.False);
        }

        [Test]
        public void StartingFreshAfterAbandoningRoundDoesNotOfferStaleRecovery()
        {
            var store = new CheckpointStore(file);
            var active = new RescueGame(GameConfig.Default, "room", "active", 9);
            active.Apply(new GameEvent
            {
                Source = "simulation", RoomId = "room", RoundId = "active",
                EventId = "start", UserId = "host", Command = GameCommand.Start,
                Count = 1, OccurredAtSeconds = 0
            }, 0);
            store.Save(active.Snapshot());
            Assert.That(store.TryLoad("room", 1, out _), Is.True);

            var fresh = new RescueGame(GameConfig.Default, "room", "fresh", 10);
            store.Save(fresh.Snapshot());
            File.WriteAllText(file + ".bak", UnityEngine.JsonUtility.ToJson(active.Snapshot()));
            Assert.That(store.TryLoad("room", 1, out _), Is.False,
                "An intentionally reset waiting round must not restore an abandoned active round");
        }

        [Test]
        public void RestoredRoundRetainsEventIdsAndCooldowns()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(40);
            var repair = E(GameCommand.Repair, "repair-1", 40);
            Assert.That(game.Apply(repair, 40), Is.EqualTo(ApplyResult.Accepted));
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            Assert.That(store.TryLoad("room", 1, out var snapshot), Is.True);
            Assert.That(snapshot.ContributionTotalsComplete, Is.True);
            Assert.That(snapshot.RepairActions, Is.EqualTo(1));
            var resumed = RescueGame.Restore(GameConfig.Default, snapshot);
            Assert.That(resumed.Apply(repair, 40), Is.EqualTo(ApplyResult.Duplicate));
            Assert.That(resumed.Apply(E(GameCommand.Repair, "repair-2", 41), 41), Is.EqualTo(ApplyResult.Cooldown));
            Assert.That(resumed.Apply(E(GameCommand.Repair, "repair-3", 43), 43), Is.EqualTo(ApplyResult.Accepted));
            Assert.That(resumed.Snapshot().RepairProgress, Is.EqualTo(3));
            Assert.That(resumed.Snapshot().RepairActions, Is.EqualTo(2));
        }

        [Test]
        public void CorruptPrimaryStateFallsBackToCompleteBackup()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(5);
            var valid = game.Snapshot();
            File.WriteAllText(file + ".bak", UnityEngine.JsonUtility.ToJson(valid));
            valid.RemainingSeconds = -1;
            valid.Hull = 999;
            File.WriteAllText(file, UnityEngine.JsonUtility.ToJson(valid));

            var store = new CheckpointStore(file);
            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.RemainingSeconds, Is.EqualTo(15));
            Assert.That(recovered.Hull, Is.EqualTo(100));
        }

        [Test]
        public void RestoreRejectsImpossibleActiveState()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var snapshot = game.Snapshot();
            snapshot.RemainingSeconds = double.NaN;
            Assert.Throws<ArgumentException>(() => RescueGame.Restore(GameConfig.Default, snapshot));
            snapshot.RemainingSeconds = 20;
            snapshot.Phase = GamePhase.Checkpoint1;
            snapshot.Route = RescueRoute.Undecided;
            Assert.Throws<ArgumentException>(() => RescueGame.Restore(GameConfig.Default, snapshot));
        }

        [Test]
        public void LegacyActiveCheckpointStillRestoresWithUnavailableContributionTotals()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(40);
            var legacy = game.Snapshot();
            legacy.ContributionTotalsComplete = false;
            var store = new CheckpointStore(file);
            store.Save(legacy);

            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            var resumed = RescueGame.Restore(GameConfig.Default, recovered).Snapshot();
            Assert.That(resumed.Phase, Is.EqualTo(GamePhase.Checkpoint1));
            Assert.That(resumed.ContributionTotalsComplete, Is.False);
            Assert.That(resumed.RemainingSeconds, Is.EqualTo(40));
        }
    }
}
