using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;

namespace LighthouseRescue.Tests
{
    public sealed class RescueControllerLiveTests
    {
        private static readonly Dictionary<GameObject, string> TestFolders = new Dictionary<GameObject, string>();
        private sealed class FakeSource : ILiveMessageSource
        {
            private Func<LivePushEnvelope, string, long, bool> post;
            public string RoomId { get; set; } = "verified-room";
            public LiveConnectionStatus Status { get; } = new LiveConnectionStatus();
            public readonly List<LiveInboxReceipt> Handled = new List<LiveInboxReceipt>();
            public Func<int> JoinedAtReceipt;
            public int ObservedJoined;
            public bool FailStart;
            public bool FailReceipt;
            public int ReceiptAttempts;
            public bool Stopped;

            public FakeSource()
            {
                Status.Evaluate(true, true, true);
                Status.MarkConnected();
            }

            public void Start(Func<LivePushEnvelope, string, long, bool> onMessage)
            {
                if (FailStart) throw new InvalidOperationException("fake startup failure");
                post = onMessage;
            }

            public bool Send(LivePushEnvelope message, long received) => post(message, RoomId, received);
            public void Stop() { Stopped = true; post = null; }
            public void HandleReceipt(LiveInboxReceipt receipt)
            {
                ReceiptAttempts++;
                if (FailReceipt) throw new InvalidOperationException("fake receipt failure");
                ObservedJoined = JoinedAtReceipt == null ? -1 : JoinedAtReceipt();
                Handled.Add(receipt);
            }
        }

        private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        private static LivePushEnvelope Board(long time, string id = "message-1") => new LivePushEnvelope
        {
            MessageId = id, MessageType = "live_comment", Content = "上船",
            StableUserId = "viewer-1", DisplayName = "观众甲", UnixMilliseconds = time
        };
        private static void Tick(RescueController controller) => typeof(RescueController)
            .GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(controller, null);
        private static RescueController NewController(GameObject owner)
        {
            var controller = owner.AddComponent<RescueController>();
            typeof(RescueController).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(controller, null);
            string folder = Path.Combine(Path.GetTempPath(), "lighthouse-live-controller-" + Guid.NewGuid().ToString("N"));
            TestFolders.Add(owner, folder);
            typeof(RescueController).GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(controller, new CheckpointStore(Path.Combine(folder, "checkpoint.json")));
            return controller;
        }

        [Test]
        public void BackgroundLiveMessageAppliesOnlyAfterControllerFrameAndReceiptFollowsState()
        {
            var owner = new GameObject("live-controller-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource { JoinedAtReceipt = () => controller.Current.JoinedCount };
                Assert.That(controller.AttachLiveSource(source), Is.True);
                Assert.That(controller.Current.RoomId, Is.EqualTo(source.RoomId));
                controller.StartOrRestart();
                long time = Now();
                Assert.That(Task.Run(() => source.Send(Board(time), time)).GetAwaiter().GetResult(), Is.True);
                Assert.That(controller.Current.JoinedCount, Is.Zero);

                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
                Assert.That(source.Handled.Count, Is.EqualTo(1));
                Assert.That(source.Handled[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
                Assert.That(source.ObservedJoined, Is.EqualTo(1));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void ReceiptHandlerFailureStopsLiveInputWithoutLosingDurableAcceptedEvent()
        {
            var owner = new GameObject("live-receipt-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource { FailReceipt = true };
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                Assert.That(source.Send(Board(time, "first"), time), Is.True);
                var second = Board(time, "second");
                second.StableUserId = "viewer-2";
                Assert.That(source.Send(second, time), Is.True);

                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Status.FaultTitle, Is.EqualTo("回执故障"));
                Assert.That(source.Stopped, Is.True);
                Assert.That(source.ReceiptAttempts, Is.EqualTo(1));
                Assert.That(source.Handled, Is.Empty);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1),
                    "the already persisted event survives rollback; queued later events do not run");
                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
                Assert.That(source.ReceiptAttempts, Is.EqualTo(1));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void UnexpectedLiveDrainFailureStopsSourceWithoutAcknowledgingQueuedMessages()
        {
            var owner = new GameObject("live-processing-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                Assert.That(source.Send(Board(time), time), Is.True);

                // Simulate an unexpected failure inside the live processing path.
                typeof(RescueController).GetField("router", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(controller, null);

                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Status.FaultTitle, Is.EqualTo("处理故障"));
                Assert.That(source.Stopped, Is.True);
                Assert.That(source.Handled, Is.Empty);
                Assert.That(controller.Current.JoinedCount, Is.Zero);
                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Handled, Is.Empty);
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void PreviousRoundMessageIsReportedButCannotJoinResetRound()
        {
            var owner = new GameObject("live-round-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                Assert.That(source.Send(Board(time), time), Is.True);
                controller.ResetRound();
                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.Zero);
                Assert.That(source.Handled[0].Outcome, Is.EqualTo(LiveInboxOutcome.WrongRound));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void QueuedCommentFromOldStageCannotVoteAfterStageTransition()
        {
            var owner = new GameObject("live-stage-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long oldTime = Now();
                var vote = Board(oldTime, "old-vote");
                vote.Content = "左";
                Assert.That(source.Send(vote, oldTime), Is.True);
                var game = (RescueGame)typeof(RescueController)
                    .GetField("game", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(controller);
                game.Advance(20.1);
                Thread.Sleep(10);

                Tick(controller);
                Assert.That(controller.Current.LeftVotes, Is.Zero);
                Assert.That(source.Handled[0].Outcome, Is.EqualTo(LiveInboxOutcome.Invalid));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void MissingConnectionOrFailedStartupLeavesSimulationPlayable()
        {
            var owner = new GameObject("live-rollback-test");
            try
            {
                var controller = NewController(owner);
                var disconnected = new FakeSource();
                disconnected.Status.MarkDisconnected("test");
                Assert.That(controller.AttachLiveSource(disconnected), Is.False);
                Assert.That(controller.AttachLiveSource(new FakeSource { RoomId = " local-demo " }), Is.False);
                var throwing = new FakeSource { FailStart = true };
                Assert.That(controller.AttachLiveSource(throwing), Is.False);
                Assert.That(controller.Current.RoomId, Is.EqualTo("local-demo"));
                controller.StartOrRestart();
                controller.Emit(GameCommand.Board);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void AttachingLiveResetsDemoSpeedAndRejectsSimulatedAudienceCommands()
        {
            var owner = new GameObject("live-speed-test");
            try
            {
                var controller = NewController(owner);
                controller.ToggleSpeed();
                controller.ToggleSpeed();
                Assert.That(controller.Speed, Is.EqualTo(8));
                Assert.That(controller.AttachLiveSource(new FakeSource()), Is.True);
                Assert.That(controller.Speed, Is.EqualTo(1));
                controller.ToggleSpeed();
                Assert.That(controller.Speed, Is.EqualTo(1));
                controller.StartOrRestart();
                controller.Emit(GameCommand.Board);
                Assert.That(controller.Current.JoinedCount, Is.Zero);
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void DisconnectPausesCountdownUntilHostResumesAfterReconnect()
        {
            var owner = new GameObject("live-disconnect-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                source.Status.MarkDisconnected("test disconnect");
                Tick(controller);
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused));
                controller.TogglePause();
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused),
                    "host cannot resume while the SDK is disconnected");
                source.Status.Evaluate(true, true, true);
                source.Status.MarkConnected();
                Tick(controller);
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused));
                controller.TogglePause();
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void MessageAlreadyQueuedBeforeDisconnectAppliesBeforeCountdownPauses()
        {
            var owner = new GameObject("live-drain-before-pause-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                Assert.That(source.Send(Board(time), time), Is.True);
                source.Status.MarkDisconnected("test disconnect");

                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
                Assert.That(source.Handled[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void DisconnectDrainsExistingBacklogAcrossFramesWithoutAdvancingCountdown()
        {
            var owner = new GameObject("live-backlog-before-pause-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                for (int i = 0; i < 70; i++)
                {
                    var message = Board(time, "queued-" + i);
                    message.StableUserId = "viewer-" + i;
                    Assert.That(source.Send(message, time), Is.True);
                }
                Task.Run(() => source.Status.MarkDisconnected("test disconnect")).GetAwaiter().GetResult();
                Assert.That(source.Send(Board(Now(), "after-disconnect"), Now()), Is.False);
                double before = controller.Current.RemainingSeconds;

                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(64));
                Assert.That(controller.Current.RemainingSeconds, Is.EqualTo(before));
                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(70));
                Assert.That(source.Handled.Count, Is.EqualTo(70));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void HundredsOfLiveJoinsDrainAcrossFramesWithoutLosingReceipts()
        {
            var owner = new GameObject("live-many-viewers-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                for (int i = 0; i < 200; i++)
                {
                    var message = Board(time, "audience-" + i);
                    message.StableUserId = "viewer-" + i;
                    Assert.That(source.Send(message, time), Is.True);
                }
                var game = (RescueGame)typeof(RescueController)
                    .GetField("game", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(controller);
                long beforeMessages = game.CompleteSnapshotCount;
                for (int frame = 0; frame < 4; frame++) Tick(controller);
                var counter = typeof(RescueGame).GetProperty("CompleteSnapshotCount");
                Assert.That(counter, Is.Not.Null);
                Assert.That(game.CompleteSnapshotCount, Is.EqualTo(beforeMessages),
                    "accepted audience messages must append durably without copying the full audience history");
                long beforeIdleFrame = (long)counter.GetValue(game);
                Tick(controller);
                Assert.That((long)counter.GetValue(game), Is.EqualTo(beforeIdleFrame),
                    "an idle controller frame must not copy the accumulated audience history");
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(200));
                Assert.That(source.Handled.Count, Is.EqualTo(200));
                Assert.That(source.Handled.TrueForAll(receipt => receipt.Outcome == LiveInboxOutcome.Applied), Is.True);
                var store = (CheckpointStore)typeof(RescueController)
                    .GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(controller);
                Assert.That(store.TryLoad(source.RoomId, 1, out var recovered), Is.True);
                Assert.That(recovered.JoinedCount, Is.EqualTo(200));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void FullInboxStopsLiveRoundBeforeDrainingAndPreservesOnlyDurableJoins()
        {
            var owner = new GameObject("live-overflow-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                Assert.That(source.Send(Board(time, "durable-join"), time), Is.True);
                Tick(controller);
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
                Assert.That(source.Handled.Count, Is.EqualTo(1));

                for (int i = 0; i < 256; i++)
                {
                    var message = Board(time, "queued-" + i);
                    message.StableUserId = "queued-viewer-" + i;
                    Assert.That(Task.Run(() => source.Send(message, time)).GetAwaiter().GetResult(), Is.True);
                }
                Assert.That(Task.Run(() => source.Send(Board(time, "overflow"), time)).GetAwaiter().GetResult(), Is.False);
                Assert.That(source.Stopped, Is.False, "SDK callbacks must not stop the source from a worker thread");
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Connected));
                Assert.DoesNotThrow(() => Tick(controller));

                Assert.That(source.Stopped, Is.True);
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Status.Reason, Does.Contain("过载"));
                Assert.That(Array.Exists(UnityEngine.Object.FindObjectsOfType<Text>(),
                    label => label.text == "直播已停止 · 输入过载"), Is.True,
                    "the streamer badge must distinguish overload from a storage failure");
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1),
                    "all queued but unacknowledged joins must remain unapplied");
                Assert.That(source.Handled.Count, Is.EqualTo(1),
                    "only the earlier durable join may have a fulfilment receipt");
                controller.EndRound();
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void FullBacklogRejectedAfterDisconnectStillDrainsWithoutOverflowFault()
        {
            var owner = new GameObject("live-disconnected-full-backlog-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                long time = Now();
                for (int i = 0; i < 256; i++)
                {
                    var message = Board(time, "accepted-" + i);
                    message.StableUserId = "viewer-" + i;
                    Assert.That(source.Send(message, time), Is.True);
                }
                source.Status.MarkDisconnected("test disconnect");
                Assert.That(source.Send(Board(time, "rejected-disconnected"), time), Is.False);
                for (int frame = 0; frame < 4; frame++) Tick(controller);
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Disconnected));
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(256));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Paused));
                Assert.That(source.Handled.Count, Is.EqualTo(256));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void InvalidCallbackInputDoesNotFaultConnectedLiveRound()
        {
            var owner = new GameObject("live-invalid-input-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                Assert.That(source.Send(null, Now()), Is.False);
                Tick(controller);
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Connected));
                Assert.That(source.Stopped, Is.False);
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void LiveReceiptIsEmittedOnlyAfterAudienceJoinIsRecoverable()
        {
            var owner = new GameObject("live-durable-receipt-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                var store = (CheckpointStore)typeof(RescueController)
                    .GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(controller);
                source.JoinedAtReceipt = () => store.TryLoad(source.RoomId, 1, out var recovered)
                    ? recovered.JoinedCount : -1;
                long time = Now();
                Assert.That(source.Send(Board(time), time), Is.True);
                Tick(controller);

                Assert.That(source.Handled[0].Outcome, Is.EqualTo(LiveInboxOutcome.Applied));
                Assert.That(source.ObservedJoined, Is.EqualTo(1));
                var game = (RescueGame)typeof(RescueController)
                    .GetField("game", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(controller);
                Assert.That(game.CompleteSnapshotCount, Is.EqualTo(1));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void JournalWriteFailureStopsLiveDrainWithoutReceiptAndRestoresDurableState()
        {
            var owner = new GameObject("live-storage-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                var durable = controller.Current;
                var journalPath = Path.Combine(TestFolders[owner], "checkpoint.json.journal");
                Directory.CreateDirectory(journalPath); // FileStream.Append must fail.
                long time = Now();
                Assert.That(source.Send(Board(time, "cannot-save"), time), Is.True);
                var queued = Board(time, "must-not-drain");
                queued.StableUserId = "viewer-2";
                Assert.That(source.Send(queued, time), Is.True);

                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Stopped, Is.True);
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Status.Reason, Does.Contain("存储"));
                Assert.That(source.Handled, Is.Empty, "a failed durable write cannot receive fulfillment ACK");
                Assert.That(controller.Current.RoundId, Is.EqualTo(durable.RoundId));
                Assert.That(controller.Current.JoinedCount, Is.Zero, "the accepted but unwritten join must roll back");
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Handled, Is.Empty, "queued events must stay frozen after failure");
                controller.TogglePause();
                controller.EndRound();
                controller.ResetRound();
                Assert.That(controller.Current.RoundId, Is.EqualTo(durable.RoundId));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void UnreadableCheckpointAfterWriteFailureStillStopsLiveRound()
        {
            var owner = new GameObject("live-unreadable-storage-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                string checkpointPath = Path.Combine(TestFolders[owner], "checkpoint.json");
                File.Delete(checkpointPath);
                Directory.CreateDirectory(checkpointPath);
                Directory.CreateDirectory(checkpointPath + ".journal");
                long time = Now();
                Assert.That(source.Send(Board(time), time), Is.True);

                Assert.DoesNotThrow(() => Tick(controller));
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Handled, Is.Empty);
                Assert.DoesNotThrow(() => Tick(controller));
                controller.EndRound();
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void HostPauseCheckpointFailureRollsBackAndStopsLiveRound()
        {
            var owner = new GameObject("live-host-storage-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                var durable = controller.Current;
                Directory.CreateDirectory(Path.Combine(TestFolders[owner], "checkpoint.json.tmp"));

                Assert.DoesNotThrow(() => controller.TogglePause());
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(controller.Current.RoundId, Is.EqualTo(durable.RoundId));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
                Assert.DoesNotThrow(() => Tick(controller));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void HostResetCheckpointFailureRollsBackAndStopsLiveRound()
        {
            var owner = new GameObject("live-reset-storage-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                var durable = controller.Current;
                Directory.CreateDirectory(Path.Combine(TestFolders[owner], "checkpoint.json.tmp"));

                Assert.DoesNotThrow(() => controller.ResetRound());
                Assert.That(source.Stopped, Is.True);
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Status.Reason, Does.Contain("存储"));
                Assert.That(controller.Current.RoundId, Is.EqualTo(durable.RoundId));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
                Assert.DoesNotThrow(() => Tick(controller));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void HostResetFailureAfterResultRestoresTheFinishedDurableRound()
        {
            var owner = new GameObject("live-reset-result-storage-failure-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                controller.EndRound();
                var durable = controller.Current;
                Assert.That(durable.Phase, Is.EqualTo(GamePhase.Result));
                Directory.CreateDirectory(Path.Combine(TestFolders[owner], "checkpoint.json.tmp"));

                Assert.DoesNotThrow(() => controller.ResetRound());
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Stopped, Is.True);
                Assert.That(controller.Current.RoundId, Is.EqualTo(durable.RoundId));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Result));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void DisconnectedLiveSourceCannotResetTheRound()
        {
            var owner = new GameObject("live-reset-disconnected-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                controller.StartOrRestart();
                string roundId = controller.Current.RoundId;
                source.Status.MarkDisconnected("test disconnect");

                controller.ResetRound();
                Assert.That(controller.Current.RoundId, Is.EqualTo(roundId));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void RecoveryPromptMustBeResolvedBeforeHostCanResetTheRound()
        {
            var owner = new GameObject("live-reset-recovery-test");
            string folder = Path.Combine(Path.GetTempPath(), "lighthouse-live-reset-recovery-" + Guid.NewGuid().ToString("N"));
            try
            {
                var saved = new RescueGame(GameConfig.Default, "verified-room", "saved-round", 11);
                saved.Apply(new GameEvent { Source = "host", RoomId = "verified-room", RoundId = "saved-round",
                    EventId = "start-saved", UserId = "host", Command = GameCommand.Start }, 0);
                var store = new CheckpointStore(Path.Combine(folder, "checkpoint.json"));
                store.Save(saved.Snapshot());

                var controller = NewController(owner);
                typeof(RescueController).GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(controller, store);
                Assert.That(controller.AttachLiveSource(new FakeSource()), Is.True);
                string roundId = controller.Current.RoundId;

                controller.ResetRound();
                Assert.That(controller.Current.RoundId, Is.EqualTo(roundId));
                Assert.That(store.TryLoad("verified-room", 1, out var recovered), Is.True);
                Assert.That(recovered.RoundId, Is.EqualTo("saved-round"));
            }
            finally
            {
                Cleanup(owner);
                if (Directory.Exists(folder)) Directory.Delete(folder, true);
            }
        }

        [Test]
        public void PendingRecoveryRejectsHostCommandsWithoutOverwritingSavedRound()
        {
            var owner = new GameObject("live-recovery-host-guard-test");
            string folder = Path.Combine(Path.GetTempPath(), "lighthouse-live-recovery-host-" + Guid.NewGuid().ToString("N"));
            try
            {
                var saved = new RescueGame(GameConfig.Default, "verified-room", "saved-round", 11);
                saved.Apply(new GameEvent { Source = "host", RoomId = "verified-room", RoundId = "saved-round",
                    EventId = "start-saved", UserId = "host", Command = GameCommand.Start }, 0);
                var store = new CheckpointStore(Path.Combine(folder, "checkpoint.json"));
                store.Save(saved.Snapshot());

                var controller = NewController(owner);
                typeof(RescueController).GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(controller, store);
                Assert.That(controller.AttachLiveSource(new FakeSource()), Is.True);
                string provisionalRound = controller.Current.RoundId;

                controller.StartOrRestart();
                controller.Emit(GameCommand.Start, "host");
                controller.EndRound();
                controller.TogglePause();
                Assert.That(controller.Current.RoundId, Is.EqualTo(provisionalRound));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Waiting));
                Assert.That(store.TryLoad("verified-room", 1, out var recovered), Is.True);
                Assert.That(recovered.RoundId, Is.EqualTo("saved-round"));
            }
            finally
            {
                Cleanup(owner);
                if (Directory.Exists(folder)) Directory.Delete(folder, true);
            }
        }

        [Test]
        public void RecoveryRestartWriteFailureStopsSourceAndRestoresSavedRound()
        {
            var owner = new GameObject("live-recovery-restart-failure-test");
            string folder = Path.Combine(Path.GetTempPath(), "lighthouse-live-restart-failure-" + Guid.NewGuid().ToString("N"));
            try
            {
                var saved = new RescueGame(GameConfig.Default, "verified-room", "saved-round", 11);
                saved.Apply(new GameEvent { Source = "host", RoomId = "verified-room", RoundId = "saved-round",
                    EventId = "start-saved", UserId = "host", Command = GameCommand.Start }, 0);
                var store = new CheckpointStore(Path.Combine(folder, "checkpoint.json"));
                store.Save(saved.Snapshot());

                var controller = NewController(owner);
                typeof(RescueController).GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(controller, store);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                Directory.CreateDirectory(Path.Combine(folder, "checkpoint.json.tmp"));

                Assert.DoesNotThrow(() => GameObject.Find("重新开局 control")
                    .GetComponentInChildren<Button>().onClick.Invoke());
                Assert.That(source.Status.State, Is.EqualTo(LiveConnectionState.Faulted));
                Assert.That(source.Stopped, Is.True);
                Assert.That(source.Handled, Is.Empty);
                Assert.That(controller.Current.RoundId, Is.EqualTo("saved-round"));
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Gathering));
                Assert.DoesNotThrow(() => Tick(controller));
            }
            finally
            {
                Cleanup(owner);
                if (Directory.Exists(folder)) Directory.Delete(folder, true);
            }
        }

        [Test]
        public void DisconnectedLiveSourceCannotStartANewRound()
        {
            var owner = new GameObject("live-start-disconnected-test");
            try
            {
                var controller = NewController(owner);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                source.Status.MarkDisconnected("test disconnect");
                controller.StartOrRestart();
                Assert.That(controller.Current.Phase, Is.EqualTo(GamePhase.Waiting));
            }
            finally { Cleanup(owner); }
        }

        [Test]
        public void VerifiedRoomCanRestoreItsCheckpointBeforeAcceptingNewMessages()
        {
            var owner = new GameObject("live-recovery-test");
            string folder = Path.Combine(Path.GetTempPath(), "lighthouse-live-recovery-" + Guid.NewGuid().ToString("N"));
            try
            {
                var saved = new RescueGame(GameConfig.Default, "verified-room", "saved-round", 11);
                saved.Apply(new GameEvent { Source = "host", RoomId = "verified-room", RoundId = "saved-round",
                    EventId = "start-saved", UserId = "host", Command = GameCommand.Start }, 0);
                saved.Apply(new GameEvent { Source = "douyin", RoomId = "verified-room", RoundId = "saved-round",
                    EventId = "join-saved", UserId = "viewer-old", Command = GameCommand.Board }, 0);
                var store = new CheckpointStore(Path.Combine(folder, "checkpoint.json"));
                store.Save(saved.Snapshot());

                var controller = NewController(owner);
                typeof(RescueController).GetField("checkpoint", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(controller, store);
                var source = new FakeSource();
                Assert.That(controller.AttachLiveSource(source), Is.True);
                Assert.That(GameObject.Find("Recovery prompt"), Is.Not.Null);
                GameObject.Find("恢复上一局 control").GetComponentInChildren<Button>().onClick.Invoke();
                Assert.That(controller.Current.RoundId, Is.EqualTo("saved-round"));
                Assert.That(controller.Current.JoinedCount, Is.EqualTo(1));
            }
            finally
            {
                Cleanup(owner);
                if (Directory.Exists(folder)) Directory.Delete(folder, true);
            }
        }

        private static void Cleanup(GameObject owner)
        {
            foreach (var canvas in UnityEngine.Object.FindObjectsOfType<Canvas>())
                UnityEngine.Object.DestroyImmediate(canvas.gameObject);
            UnityEngine.Object.DestroyImmediate(owner);
            if (TestFolders.TryGetValue(owner, out string folder))
            {
                if (Directory.Exists(folder)) Directory.Delete(folder, true);
                TestFolders.Remove(owner);
            }
        }
    }
}
