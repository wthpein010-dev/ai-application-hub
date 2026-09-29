using System;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    public interface IEventSource
    {
        void Start(Action<GameEvent> onEvent);
        void Stop();
    }

    public sealed class SimulationEventSource : IEventSource
    {
        private Action<GameEvent> onEvent;

        public void Start(Action<GameEvent> callback)
        {
            onEvent = callback ?? throw new ArgumentNullException(nameof(callback));
        }

        public void Stop()
        {
            onEvent = null;
        }

        public bool Emit(GameEvent gameEvent)
        {
            if (onEvent == null) return false;
            onEvent(gameEvent);
            return true;
        }
    }
}
