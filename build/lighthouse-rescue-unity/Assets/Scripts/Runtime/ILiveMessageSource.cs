using System;

namespace LighthouseRescue.Runtime
{
    // Implement this in an authorised Windows-only SDK assembly after room and identity verification.
    // Start's callback may be called from any thread; HandleReceipt is called on Unity's main thread.
    public interface ILiveMessageSource
    {
        string RoomId { get; }
        LiveConnectionStatus Status { get; }
        void Start(Func<LivePushEnvelope, string, long, bool> post);
        void Stop();
        void HandleReceipt(LiveInboxReceipt receipt);
    }
}
