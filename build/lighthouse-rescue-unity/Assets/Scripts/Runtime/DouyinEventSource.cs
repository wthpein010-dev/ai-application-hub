using System;
using LighthouseRescue.Rules;

namespace LighthouseRescue.Runtime
{
    // An authorised SDK-specific assembly can implement IEventSource without entering WebGL.
    // This distribution contains no SDK binary or account credentials.
    public sealed class DouyinEventSource : IEventSource
    {
        public LiveConnectionStatus Status { get; } = new LiveConnectionStatus();

        public void Start(Action<GameEvent> onEvent)
        {
            Status.Evaluate(false, false, false);
            throw new InvalidOperationException(Status.Reason);
        }

        public void Stop() { }
    }
}
