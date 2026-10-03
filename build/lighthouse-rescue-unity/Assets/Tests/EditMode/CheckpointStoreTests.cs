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
        public void SavedRoundKeepsItsOwnRulesAfterReloadWithNewDefaults()
        {
            var settings = GameConfig.Default;
            settings.GatheringSeconds = 6;
            settings.VotingSeconds = 11;
            settings.LongCheckpointSeconds = 14;
            var game = new RescueGame(settings, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(6);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var saved), Is.True);
            var resumed = RescueGame.Restore(GameConfig.Default, saved);
            resumed.Advance(11);
            Assert.That(resumed.Snapshot().Phase, Is.EqualTo(GamePhase.Checkpoint1));
            Assert.That(resumed.Snapshot().RemainingSeconds, Is.EqualTo(14));
        }

        [Test]
        public void JournalReplayUsesSavedRulesForInProgressRepairs()
        {
            var settings = GameConfig.Default;
            settings.LongRepairTarget = 5;
            var game = new RescueGame(settings, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.Advance(40);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            for (int i = 0; i < 3; i++)
            {
                var repair = E(GameCommand.Repair, "repair-" + i, 40);
                repair.UserId = "viewer-" + i;
                Assert.That(game.Apply(repair, 40), Is.EqualTo(ApplyResult.Accepted));
                store.AppendAccepted(repair, game);
            }

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var saved), Is.True);
            Assert.That(saved.RepairProgress, Is.EqualTo(4));
            Assert.That(RescueGame.Restore(GameConfig.Default, saved).Snapshot().RepairTarget, Is.EqualTo(5));
        }

        [Test]
        public void CorruptRoundRulesCannotReplaceAValidCheckpoint()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            var corrupt = game.Snapshot();
            corrupt.RoundConfig.LikesPerLightPoint = 0;

            Assert.Throws<ArgumentException>(() => store.Save(corrupt));
            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.RoundConfig.LikesPerLightPoint, Is.EqualTo(20));
        }

        [Test]
        public void CheckpointWithoutRoundRulesUsesLegacyDefaultConfiguration()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var snapshot = game.Snapshot();
            string json = UnityEngine.JsonUtility.ToJson(snapshot);
            string savedConfig = "\"RoundConfig\":" + UnityEngine.JsonUtility.ToJson(snapshot.RoundConfig) + ",";
            Assert.That(json, Does.Contain(savedConfig));
            Assert.That(json, Does.Contain("\"HasRoundConfig\":true,"));
            File.WriteAllText(file, json.Replace(savedConfig, "").Replace("\"HasRoundConfig\":true,", ""));

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.HasRoundConfig, Is.False);
            var resumed = RescueGame.Restore(GameConfig.Default, recovered);
            resumed.Advance(20);
            Assert.That(resumed.Snapshot().Phase, Is.EqualTo(GamePhase.Voting));
        }

        [Test]
        public void NewCheckpointMissingItsEmbeddedRulesCannotSilentlyUseDefaults()
        {
            var settings = GameConfig.Default;
            settings.LongCheckpointSeconds = 14;
            var game = new RescueGame(settings, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            string json = UnityEngine.JsonUtility.ToJson(game.Snapshot());
            string savedConfig = "\"RoundConfig\":" + UnityEngine.JsonUtility.ToJson(game.Snapshot().RoundConfig) + ",";
            Assert.That(json, Does.Contain(savedConfig));
            File.WriteAllText(file, json.Replace(savedConfig, ""));

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out _), Is.False);
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
        public void TransientViewSnapshotCannotReplaceACompleteCheckpoint()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            var transient = new RescueSnapshot { RulesVersion = 0, RoomId = "room", RoundId = "round" };
            Assert.Throws<ArgumentException>(() => store.Save(transient));
            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.RecentEventIds, Does.Contain("start"));
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
        public void FaultRollbackReadsTerminalCheckpointWithoutOfferingNormalRecovery()
        {
            var store = new CheckpointStore(file);
            var game = new RescueGame(GameConfig.Default, "room", "finished", 9);
            game.Apply(new GameEvent
            {
                Source = "host", RoomId = "room", RoundId = "finished",
                EventId = "start", UserId = "host", Command = GameCommand.Start
            }, 0);
            game.Apply(new GameEvent
            {
                Source = "host", RoomId = "room", RoundId = "finished",
                EventId = "end", UserId = "host", Command = GameCommand.End
            }, 0);
            store.Save(game.Snapshot());

            Assert.That(store.TryLoad("room", 1, out _), Is.False,
                "normal startup must not offer recovery for a finished round");
            Assert.That(store.TryLoadForFaultRollback("room", 1, out var durable), Is.True);
            Assert.That(durable.RoundId, Is.EqualTo("finished"));
            Assert.That(durable.Phase, Is.EqualTo(GamePhase.Result));
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

        [Test]
        public void AcceptedAudienceJournalRestoresTwoHundredUniqueViewersWithoutTwoHundredFullCopies()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            Assert.That(game.Apply(E(GameCommand.Start, "start", 0), 0), Is.EqualTo(ApplyResult.Accepted));
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            for (int i = 0; i < 200; i++)
            {
                var join = E(GameCommand.Board, "join-" + i, 0);
                join.UserId = "viewer-" + i;
                Assert.That(game.Apply(join, 0), Is.EqualTo(ApplyResult.Accepted));
                store.AppendAccepted(join, game);
            }

            Assert.That(game.CompleteSnapshotCount, Is.EqualTo(1));
            Assert.That(new FileInfo(file + ".journal").Length, Is.LessThan(200000));
            Assert.That(store.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.JoinedCount, Is.EqualTo(200));
            Assert.That(RescueGame.Restore(GameConfig.Default, recovered)
                .Apply(E(GameCommand.Board, "join-0", 0), 0), Is.EqualTo(ApplyResult.Duplicate));
        }

        [Test]
        public void JournalReplayPreservesRepairCooldownAfterReload()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            game.AdvanceForView(40);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            var repair = E(GameCommand.Repair, "repair-1", 40);
            Assert.That(game.Apply(repair, 40), Is.EqualTo(ApplyResult.Accepted));
            store.AppendAccepted(repair, game);

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            var resumed = RescueGame.Restore(GameConfig.Default, recovered);
            Assert.That(resumed.Apply(repair, 40), Is.EqualTo(ApplyResult.Duplicate));
            Assert.That(resumed.Apply(E(GameCommand.Repair, "repair-2", 41), 41), Is.EqualTo(ApplyResult.Cooldown));
            Assert.That(resumed.Apply(E(GameCommand.Repair, "repair-3", 43), 43), Is.EqualTo(ApplyResult.Accepted));
        }

        [Test]
        public void TornJournalTailIsDiscardedBeforeNewEventsAppend()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            var first = E(GameCommand.Board, "join-1", 0);
            first.UserId = "viewer-1";
            Assert.That(game.Apply(first, 0), Is.EqualTo(ApplyResult.Accepted));
            store.AppendAccepted(first, game);
            File.AppendAllText(file + ".journal", "{broken");

            var restoredStore = new CheckpointStore(file);
            Assert.That(restoredStore.TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.JoinedCount, Is.EqualTo(1));
            var resumed = RescueGame.Restore(GameConfig.Default, recovered);
            var second = E(GameCommand.Board, "join-2", 0);
            second.UserId = "viewer-2";
            Assert.That(resumed.Apply(second, 0), Is.EqualTo(ApplyResult.Accepted));
            restoredStore.AppendAccepted(second, resumed);
            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var again), Is.True);
            Assert.That(again.JoinedCount, Is.EqualTo(2));
        }

        [Test]
        public void OldCheckpointWithoutJournalSequenceStillRestores()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            string legacy = UnityEngine.JsonUtility.ToJson(game.Snapshot()).Replace("\"JournalSequence\":0,", "");
            File.WriteAllText(file, legacy);

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.Phase, Is.EqualTo(GamePhase.Gathering));
            Assert.That(recovered.JournalSequence, Is.Zero);
        }

        [Test]
        public void JournalLeftBehindAfterPhaseCheckpointDoesNotReplayTwice()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            var join = E(GameCommand.Board, "join-1", 0);
            join.UserId = "viewer-1";
            Assert.That(game.Apply(join, 0), Is.EqualTo(ApplyResult.Accepted));
            store.AppendAccepted(join, game);
            byte[] staleJournal = File.ReadAllBytes(file + ".journal");
            game.AdvanceForView(20);
            store.Save(game.Snapshot());
            File.WriteAllBytes(file + ".journal", staleJournal);

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.Phase, Is.EqualTo(GamePhase.Voting));
            Assert.That(recovered.JoinedCount, Is.EqualTo(1));
            Assert.That(recovered.JournalSequence, Is.EqualTo(1));
        }

        [Test]
        public void TamperedJournalRecordStopsAtLastValidEvent()
        {
            var game = new RescueGame(GameConfig.Default, "room", "round", 9);
            game.Apply(E(GameCommand.Start, "start", 0), 0);
            var store = new CheckpointStore(file);
            store.Save(game.Snapshot());
            for (int i = 1; i <= 2; i++)
            {
                var join = E(GameCommand.Board, "join-" + i, 0);
                join.UserId = "viewer-" + i;
                Assert.That(game.Apply(join, 0), Is.EqualTo(ApplyResult.Accepted));
                store.AppendAccepted(join, game);
            }
            string original = File.ReadAllText(file + ".journal");
            File.WriteAllText(file + ".journal", original.Replace("viewer-2", "viewer-X"));

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.JoinedCount, Is.EqualTo(1));
            Assert.That(recovered.JournalSequence, Is.EqualTo(1));
        }

        [Test]
        public void PreviousRoundJournalCannotAddViewersToNewRound()
        {
            var first = new RescueGame(GameConfig.Default, "room", "first", 9);
            first.Apply(new GameEvent { RoomId = "room", RoundId = "first", EventId = "start-first",
                UserId = "host", Command = GameCommand.Start }, 0);
            var store = new CheckpointStore(file);
            store.Save(first.Snapshot());
            var oldJoin = new GameEvent { RoomId = "room", RoundId = "first", EventId = "old-join",
                UserId = "old-viewer", Command = GameCommand.Board };
            Assert.That(first.Apply(oldJoin, 0), Is.EqualTo(ApplyResult.Accepted));
            store.AppendAccepted(oldJoin, first);
            byte[] oldJournal = File.ReadAllBytes(file + ".journal");

            var second = new RescueGame(GameConfig.Default, "room", "second", 10);
            second.Apply(new GameEvent { RoomId = "room", RoundId = "second", EventId = "start-second",
                UserId = "host", Command = GameCommand.Start }, 0);
            store.Save(second.Snapshot());
            var newJoin = new GameEvent { RoomId = "room", RoundId = "second", EventId = "new-join",
                UserId = "new-viewer", Command = GameCommand.Board };
            Assert.That(second.Apply(newJoin, 0), Is.EqualTo(ApplyResult.Accepted));
            store.AppendAccepted(newJoin, second);
            byte[] newJournal = File.ReadAllBytes(file + ".journal");
            using (var output = new FileStream(file + ".journal", FileMode.Create, FileAccess.Write))
            {
                output.Write(oldJournal, 0, oldJournal.Length);
                output.Write(newJournal, 0, newJournal.Length);
            }

            Assert.That(new CheckpointStore(file).TryLoad("room", 1, out var recovered), Is.True);
            Assert.That(recovered.RoundId, Is.EqualTo("second"));
            Assert.That(recovered.JoinedCount, Is.EqualTo(1));
            Assert.That(recovered.JoinedUserIds, Does.Contain("new-viewer"));
            Assert.That(recovered.JoinedUserIds, Does.Not.Contain("old-viewer"));
        }
    }
}
