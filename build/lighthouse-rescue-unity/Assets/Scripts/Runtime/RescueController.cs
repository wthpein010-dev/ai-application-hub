using System;
using System.IO;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    public sealed class RescueController : MonoBehaviour
    {
        private sealed class StorageFaultStopException : Exception { }
        private const string DemoRoom = "local-demo";
        private const int LiveInboxCapacity = 256;
        private const int LiveItemsPerFrame = 64;
        private RescueGame game;
        private EventRouter router;
        private SimulationEventSource simulation;
        private CheckpointStore checkpoint;
        private RescueView view;
        private ILiveMessageSource liveSource;
        private LiveMessageInbox liveInbox;
        private string roomId = DemoRoom;
        private GamePhase observedLivePhase;
        private long stageStartedUnixMilliseconds;
        private bool awaitingLiveRecovery;
        private bool storageFaulted;
        private int roundNumber;
        private double speed = 1;

        public RescueSnapshot Current => game?.ViewSnapshot();
        public double Speed => speed;

        private void Awake()
        {
            Application.targetFrameRate = 60;
            router = new EventRouter();
            simulation = new SimulationEventSource();
            checkpoint = new CheckpointStore(Path.Combine(Application.persistentDataPath, "lighthouse-rescue-checkpoint.json"));
            game = NewGame();
            var host = gameObject.AddComponent<HostControls>();
            host.Bind(this);
            view = gameObject.AddComponent<RescueView>();
            view.Build(host);
            simulation.Start(OnEvent);
            if (checkpoint.TryLoad(DemoRoom, 1, out RescueSnapshot recovered))
                view.OfferRecovery(() => { game = RescueGame.Restore(GameConfig.Default, recovered); var snapshot = game.ViewSnapshot(); view.ResetTransitionBaseline(snapshot); view.Render(snapshot); },
                    () => { game = NewGame(); checkpoint.Save(game.Snapshot()); view.Render(game.ViewSnapshot()); });
            view.Render(game.ViewSnapshot());
            foreach (string argument in Environment.GetCommandLineArgs())
                if (argument == "--capture-short" || argument == "--capture-long")
                {
                    gameObject.AddComponent<DemoCaptureHarness>().Begin(this, argument == "--capture-short");
                    break;
                }
        }

        private RescueGame NewGame()
        {
            roundNumber++;
            var next = new RescueGame(GameConfig.Default, roomId,
                "round-" + DateTime.UtcNow.Ticks + "-" + roundNumber, roundNumber);
            if (liveInbox != null) BindLiveRound(next);
            return next;
        }

        public bool AttachLiveSource(ILiveMessageSource source)
        {
            if (source == null || source.Status == null || !source.Status.IsConnected ||
                string.IsNullOrWhiteSpace(source.RoomId) || source.RoomId != source.RoomId.Trim() ||
                source.RoomId == DemoRoom || liveSource != null)
                return false;
            string verifiedRoom = source.RoomId.Trim();
            int nextRound = roundNumber + 1;
            var nextGame = new RescueGame(GameConfig.Default, verifiedRoom,
                "round-" + DateTime.UtcNow.Ticks + "-" + nextRound, nextRound);
            var nextInbox = new LiveMessageInbox(LiveInboxCapacity);
            nextInbox.SetRound(verifiedRoom, nextGame.ViewSnapshot().RoundId);
            try
            {
                source.Start((message, sourceRoom, receivedAt) =>
                    source.Status.IsConnected && nextInbox.Post(message, sourceRoom, receivedAt));
            }
            catch (Exception error)
            {
                try { source.Stop(); } catch (Exception) { }
                Debug.LogWarning("Live source startup failed: " + error.GetType().Name);
                return false;
            }

            simulation.Stop();
            liveSource = source;
            liveInbox = nextInbox;
            roomId = verifiedRoom;
            roundNumber = nextRound;
            speed = 1;
            game = nextGame;
            ObserveLivePhase(game.ViewSnapshot(), UnixNow());
            view.SetLiveMode(source.Status);
            view.ResetTransitionBaseline(game.ViewSnapshot());
            view.Render(game.ViewSnapshot());
            if (checkpoint.TryLoad(verifiedRoom, 1, out RescueSnapshot recovered))
            {
                awaitingLiveRecovery = true;
                view.OfferRecovery(() =>
                {
                    game = RescueGame.Restore(GameConfig.Default, recovered);
                    BindLiveRound(game);
                    awaitingLiveRecovery = false;
                    view.ResetTransitionBaseline(game.ViewSnapshot());
                    view.Render(game.ViewSnapshot());
                }, () =>
                {
                    game = NewGame();
                    awaitingLiveRecovery = false;
                    checkpoint.Save(game.Snapshot());
                    view.ResetTransitionBaseline(game.ViewSnapshot());
                    view.Render(game.ViewSnapshot());
                });
            }
            return true;
        }

        private static long UnixNow() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        private void BindLiveRound(RescueGame next)
        {
            liveInbox.SetRound(roomId, next.ViewSnapshot().RoundId);
            stageStartedUnixMilliseconds = 0;
            ObserveLivePhase(next.ViewSnapshot(), UnixNow());
        }

        private void ObserveLivePhase(RescueSnapshot snapshot, long now)
        {
            if (liveInbox == null) return;
            if (stageStartedUnixMilliseconds == 0 || observedLivePhase != snapshot.Phase)
            {
                observedLivePhase = snapshot.Phase;
                stageStartedUnixMilliseconds = now;
            }
        }

        private void Update()
        {
            if (game == null || view == null) return;
            if (awaitingLiveRecovery || storageFaulted) { view.Render(game.ViewSnapshot()); return; }
            if (liveSource != null)
            {
                long now = UnixNow();
                ObserveLivePhase(game.ViewSnapshot(), now);
                try
                {
                    liveInbox.Drain(game, router, now, stageStartedUnixMilliseconds,
                        LiveItemsPerFrame, OnLiveReceipt);
                }
                catch (StorageFaultStopException) { return; }
                if (!liveSource.Status.IsConnected)
                {
                    // Finish already received events within the frame budget, without moving the timer.
                    if (liveInbox.PendingCount > 0) { view.Render(game.ViewSnapshot()); return; }
                    var disconnected = game.ViewSnapshot();
                    if (disconnected.Phase != GamePhase.Paused && disconnected.Phase != GamePhase.Waiting &&
                        disconnected.Phase != GamePhase.Result)
                        Emit(GameCommand.Pause, "host");
                }
            }
            GamePhase before = game.ViewSnapshot().Phase;
            var snapshot = game.AdvanceForView(Time.deltaTime * speed);
            if (snapshot.Phase != before)
            {
                try { checkpoint.Save(game.Snapshot()); }
                catch (Exception error)
                {
                    if (liveSource == null) throw;
                    StopForStorageFault(error);
                    return;
                }
            }
            ObserveLivePhase(snapshot, UnixNow());
            view.Render(snapshot);
        }

        private void OnDestroy() { simulation?.Stop(); liveSource?.Stop(); }

        private void OnLiveReceipt(LiveInboxReceipt receipt)
        {
            if (receipt.GameEvent != null)
            {
                if (receipt.Outcome == LiveInboxOutcome.Applied)
                {
                    try { PersistAccepted(receipt.GameEvent); }
                    catch (Exception error)
                    {
                        StopForStorageFault(error);
                        throw new StorageFaultStopException();
                    }
                }
                view.ShowFeedback(receipt.GameEvent, receipt.RuleResult);
                view.Render(game.ViewSnapshot());
            }
            liveSource.HandleReceipt(receipt);
        }

        private void OnEvent(GameEvent gameEvent)
        {
            var before = game.ViewSnapshot();
            var result = router.Route(gameEvent, game, before.ElapsedSeconds);
            if (result == ApplyResult.Accepted)
            {
                var snapshot = game.ViewSnapshot();
                try { PersistAccepted(gameEvent); }
                catch (Exception error)
                {
                    if (liveSource == null) throw;
                    StopForStorageFault(error);
                    return;
                }
                ObserveLivePhase(snapshot, UnixNow());
                view.ShowFeedback(gameEvent, result);
                view.Render(snapshot);
            }
            else view.ShowFeedback(gameEvent, result);
        }

        private void PersistAccepted(GameEvent gameEvent)
        {
            if (gameEvent.Command == GameCommand.Start || gameEvent.Command == GameCommand.Pause ||
                gameEvent.Command == GameCommand.Resume || gameEvent.Command == GameCommand.End)
                checkpoint.Save(game.Snapshot());
            else
                checkpoint.AppendAccepted(gameEvent, game);
        }

        private void StopForStorageFault(Exception error)
        {
            storageFaulted = true;
            awaitingLiveRecovery = true;
            liveSource.Status.MarkDisconnected("本地存储失败，本局已停止；请检查磁盘并重启。");
            try { liveSource.Stop(); }
            catch (Exception stopError) { Debug.LogWarning("Live source stop failed: " + stopError.GetType().Name); }
            try
            {
                if (checkpoint.TryLoad(roomId, 1, out RescueSnapshot durable))
                {
                    game = RescueGame.Restore(GameConfig.Default, durable);
                    view.ResetTransitionBaseline(durable);
                }
            }
            catch (Exception readError) { Debug.LogWarning("Live checkpoint read failed: " + readError.GetType().Name); }
            Debug.LogWarning("Live input stopped after storage failure: " + error.GetType().Name);
            view.Render(game.ViewSnapshot());
        }

        public void Emit(GameCommand command, string userId = "试玩观众", int count = 1)
        {
            if (game == null || storageFaulted) return;
            if (liveSource != null && command != GameCommand.Start && command != GameCommand.Pause &&
                command != GameCommand.Resume && command != GameCommand.End &&
                command != GameCommand.CaptainLeft && command != GameCommand.CaptainRight) return;
            var snapshot = game.ViewSnapshot();
            var gameEvent = new GameEvent
            {
                Source = liveSource == null ? "simulation" : "host", RoomId = roomId, RoundId = snapshot.RoundId,
                EventId = (liveSource == null ? "demo-" : "host-") + Guid.NewGuid().ToString("N"), UserId = userId,
                DisplayName = userId == "host" ? null : "试玩观众",
                Command = command, Count = count, OccurredAtSeconds = snapshot.ElapsedSeconds
            };
            if (liveSource == null) simulation.Emit(gameEvent);
            else OnEvent(gameEvent);
        }

        public void StartOrRestart()
        {
            if (storageFaulted) return;
            if (liveSource != null && !liveSource.Status.IsConnected) return;
            if (game.ViewSnapshot().Phase == GamePhase.Result) game = NewGame();
            Emit(GameCommand.Start, "host");
        }

        public void TogglePause()
        {
            if (liveSource != null && !liveSource.Status.IsConnected && game.ViewSnapshot().Phase == GamePhase.Paused) return;
            Emit(game.ViewSnapshot().Phase == GamePhase.Paused ? GameCommand.Resume : GameCommand.Pause, "host");
        }

        public void EndRound() => Emit(GameCommand.End, "host");
        public void ResetRound() { if (storageFaulted) return; game = NewGame(); checkpoint.Save(game.Snapshot()); view.Render(game.ViewSnapshot()); }
        public void ToggleSpeed() { if (liveSource != null) return; speed = speed < 4 ? 4 : speed < 8 ? 8 : 1; view.Render(game.ViewSnapshot()); }
        public void SetCaptureSpeed() => speed = 8;
    }
}
