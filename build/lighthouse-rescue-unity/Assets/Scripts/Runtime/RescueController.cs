using System;
using System.IO;
using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    public sealed class RescueController : MonoBehaviour
    {
        private const string Room = "local-demo";
        private RescueGame game;
        private EventRouter router;
        private SimulationEventSource simulation;
        private CheckpointStore checkpoint;
        private RescueView view;
        private int eventNumber;
        private int roundNumber;
        private double speed = 1;

        public RescueSnapshot Current => game?.Snapshot();
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
            if (checkpoint.TryLoad(Room, 1, out RescueSnapshot recovered))
                view.OfferRecovery(() => { game = RescueGame.Restore(GameConfig.Default, recovered); view.Render(game.Snapshot()); },
                    () => { game = NewGame(); view.Render(game.Snapshot()); });
            view.Render(game.Snapshot());
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
            return new RescueGame(GameConfig.Default, Room, "round-" + DateTime.UtcNow.Ticks + "-" + roundNumber, roundNumber);
        }

        private void Update()
        {
            if (game == null || view == null) return;
            GamePhase before = game.Snapshot().Phase;
            var snapshot = game.Advance(Time.deltaTime * speed);
            if (snapshot.Phase != before) checkpoint.Save(snapshot);
            view.Render(snapshot);
        }

        private void OnDestroy() => simulation?.Stop();

        private void OnEvent(GameEvent gameEvent)
        {
            var before = game.Snapshot();
            var result = router.Route(gameEvent, game, before.ElapsedSeconds);
            if (result == ApplyResult.Accepted)
            {
                var snapshot = game.Snapshot();
                checkpoint.Save(snapshot);
                view.ShowFeedback(gameEvent.Command, result);
                view.Render(snapshot);
            }
            else view.ShowFeedback(gameEvent.Command, result);
        }

        public void Emit(GameCommand command, string userId = "试玩观众", int count = 1)
        {
            if (game == null) return;
            var snapshot = game.Snapshot();
            simulation.Emit(new GameEvent
            {
                Source = "simulation", RoomId = Room, RoundId = snapshot.RoundId,
                EventId = "demo-" + (++eventNumber), UserId = userId,
                Command = command, Count = count, OccurredAtSeconds = snapshot.ElapsedSeconds
            });
        }

        public void StartOrRestart()
        {
            if (game.Snapshot().Phase == GamePhase.Result) game = NewGame();
            Emit(GameCommand.Start, "host");
        }

        public void TogglePause()
        {
            Emit(game.Snapshot().Phase == GamePhase.Paused ? GameCommand.Resume : GameCommand.Pause, "host");
        }

        public void EndRound() => Emit(GameCommand.End, "host");
        public void ResetRound() { game = NewGame(); view.Render(game.Snapshot()); }
        public void ToggleSpeed() { speed = speed < 4 ? 4 : speed < 8 ? 8 : 1; view.Render(game.Snapshot()); }
        public void SetCaptureSpeed() => speed = 8;
    }
}
