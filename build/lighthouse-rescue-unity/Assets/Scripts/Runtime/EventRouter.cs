using System;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    public sealed class EventRouter
    {
        private const int MaxEventCount = 100000;
        private const double ClockSkewAllowanceSeconds = 0.25;

        public ApplyResult Route(GameEvent gameEvent, RescueGame game, double nowSeconds)
        {
            if (game == null || gameEvent == null || string.IsNullOrWhiteSpace(gameEvent.Source) ||
                gameEvent.Count <= 0 || gameEvent.Count > MaxEventCount ||
                double.IsNaN(gameEvent.OccurredAtSeconds) || double.IsInfinity(gameEvent.OccurredAtSeconds) ||
                double.IsNaN(nowSeconds) || double.IsInfinity(nowSeconds) ||
                gameEvent.OccurredAtSeconds > nowSeconds + ClockSkewAllowanceSeconds)
                return ApplyResult.Invalid;
            return game.Apply(gameEvent, nowSeconds);
        }
    }
}
