namespace LighthouseRescue.Rules
{
    public sealed class GameConfig
    {
        public static GameConfig Default => new GameConfig();

        public double GatheringSeconds = 20;
        public double VotingSeconds = 20;
        public double ShortCheckpointSeconds = 35;
        public double LongCheckpointSeconds = 40;
        public double FinaleSeconds = 40;
        public int StartingHull = 100;
        public int ShortRepairTarget = 4;
        public int ShortLightTarget = 3;
        public int ShortBaseDamage = 8;
        public int LongRepairTarget = 3;
        public int LongLightTarget = 4;
        public int LongBaseDamage = 6;
        public int MissingRepairDamage = 12;
        public int SystemStartingProgress = 1;
        public double CommentCooldownSeconds = 3;
        public int PerUserCommandStageCap = 4;
        public int LikesPerLightPoint = 20;
        public int MaxLikeLightPerStage = 2;
    }

    public enum GamePhase
    {
        Waiting,
        Gathering,
        Voting,
        Checkpoint1,
        Checkpoint2,
        Checkpoint3,
        Finale,
        Result,
        Paused
    }

    public enum RescueRoute { Undecided, ShortLeft, LongRight }
    public enum GameOutcome { Pending, FullSuccess, PartialSuccess, Failure }
    public enum ApplyResult { Accepted, Duplicate, WrongRoom, WrongRound, WrongPhase, Cooldown, Capped, Stale, Invalid }
    public enum GameCommand { Start, Pause, Resume, End, Board, VoteLeft, VoteRight, CaptainLeft, CaptainRight, Repair, Light, Like, Gift }
}
