using System.Collections.Generic;

namespace LighthouseRescue.Rules
{
    public sealed class RescueSnapshot
    {
        public int RulesVersion = 1;
        public long JournalSequence;
        public string RoomId;
        public string RoundId;
        public int Seed;
        public GamePhase Phase;
        public GamePhase PhaseBeforePause;
        public RescueRoute Route;
        public RescueRoute CaptainChoice;
        public GameOutcome Outcome;
        public double ElapsedSeconds;
        public double StageStartedAtSeconds;
        public double RemainingSeconds;
        public int Hull;
        public int SavedCount;
        public int JoinedCount;
        public int LeftVotes;
        public int RightVotes;
        public int RepairProgress;
        public int LightProgress;
        public int RepairTarget;
        public int LightTarget;
        public int CheckpointNumber;
        public int LikeCarry;
        public int LikePointsAwarded;
        public int RepairActions;
        public int LightActions;
        public int LikeLightPoints;
        public bool ContributionTotalsComplete;
        public List<string> RecentEventIds = new List<string>();
        public List<string> JoinedUserIds = new List<string>();
        public List<string> VotedUserIds = new List<string>();
        public List<string> CooldownKeys = new List<string>();
        public List<double> CooldownTimes = new List<double>();
        public List<string> CommandCapKeys = new List<string>();
        public List<int> CommandCapCounts = new List<int>();
    }
}
