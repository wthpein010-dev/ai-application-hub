using LighthouseRescue.Rules;
using UnityEngine;

namespace LighthouseRescue.Runtime
{
    public sealed class HostControls : MonoBehaviour
    {
        private RescueController controller;
        public bool Muted { get; private set; }
        public void Bind(RescueController target) => controller = target;
        public void StartRound() => controller.StartOrRestart();
        public void PauseOrResume() => controller.TogglePause();
        public void EndRound() => controller.EndRound();
        public void ResetRound() => controller.ResetRound();
        public void ToggleMute() => Muted = !Muted;
        public void ToggleSpeed() => controller.ToggleSpeed();
        public void Board() => controller.Emit(GameCommand.Board);
        public void VoteLeft() => controller.Emit(GameCommand.VoteLeft);
        public void VoteRight() => controller.Emit(GameCommand.VoteRight);
        public void CaptainLeft() => controller.Emit(GameCommand.CaptainLeft, "host");
        public void CaptainRight() => controller.Emit(GameCommand.CaptainRight, "host");
        public void Repair() => controller.Emit(GameCommand.Repair);
        public void Light() => controller.Emit(GameCommand.Light);
        public void Like() => controller.Emit(GameCommand.Like, "demo-likes", 20);
        public void Gift() => controller.Emit(GameCommand.Gift);
    }
}
