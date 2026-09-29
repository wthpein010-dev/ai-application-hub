namespace LighthouseRescue.Rules
{
    public sealed class GameEvent
    {
        public string Source;
        public string RoomId;
        public string RoundId;
        public string EventId;
        public string UserId;
        public GameCommand Command;
        public int Count = 1;
        public double OccurredAtSeconds;
    }
}
