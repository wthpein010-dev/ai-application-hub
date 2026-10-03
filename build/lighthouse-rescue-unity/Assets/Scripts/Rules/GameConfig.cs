using System;

namespace LighthouseRescue.Rules
{
    [Serializable]
    public sealed class GameConfig
    {
        public static GameConfig Default => new GameConfig();

        // Zero identifies a deserialized object that did not contain a complete round config.
        public int SnapshotFormat;

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

        public GameConfig Copy()
        {
            var copy = (GameConfig)MemberwiseClone();
            copy.SnapshotFormat = 1;
            return copy;
        }

        public bool IsValid() =>
            Duration(GatheringSeconds) && Duration(VotingSeconds) &&
            Duration(ShortCheckpointSeconds) && Duration(LongCheckpointSeconds) &&
            Duration(FinaleSeconds) &&
            StartingHull >= 1 && StartingHull <= 10000 &&
            Target(ShortRepairTarget) && Target(ShortLightTarget) &&
            Target(LongRepairTarget) && Target(LongLightTarget) &&
            Damage(ShortBaseDamage) && Damage(LongBaseDamage) && Damage(MissingRepairDamage) &&
            SystemStartingProgress >= 0 &&
            SystemStartingProgress <= Math.Min(Math.Min(ShortRepairTarget, ShortLightTarget),
                Math.Min(LongRepairTarget, LongLightTarget)) &&
            !double.IsNaN(CommentCooldownSeconds) && !double.IsInfinity(CommentCooldownSeconds) &&
            CommentCooldownSeconds >= 0 && CommentCooldownSeconds <= 3600 &&
            PerUserCommandStageCap >= 1 && PerUserCommandStageCap <= 1000 &&
            LikesPerLightPoint >= 1 && LikesPerLightPoint <= 1000000 &&
            MaxLikeLightPerStage >= 0 && MaxLikeLightPerStage <= 1000;

        private static bool Duration(double value) =>
            !double.IsNaN(value) && !double.IsInfinity(value) && value >= 0.01 && value <= 3600;

        private static bool Target(int value) => value >= 1 && value <= 1000;
        private static bool Damage(int value) => value >= 0 && value <= 10000;
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
