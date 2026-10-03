using System;
using System.Collections.Generic;

namespace LighthouseRescue.Rules
{
    public sealed class RescueGame
    {
        private const double Epsilon = 0.000001;
        private readonly GameConfig config;
        private readonly string roomId;
        private readonly string roundId;
        private readonly int seed;
        private readonly HashSet<string> seenEvents = new HashSet<string>();
        private readonly HashSet<string> joinedUsers = new HashSet<string>();
        private readonly HashSet<string> votedUsers = new HashSet<string>();
        private readonly Dictionary<string, double> lastCommandTime = new Dictionary<string, double>();
        private readonly Dictionary<string, int> stageCommandCount = new Dictionary<string, int>();

        private GamePhase phase = GamePhase.Waiting;
        private GamePhase phaseBeforePause = GamePhase.Waiting;
        private RescueRoute route = RescueRoute.Undecided;
        private RescueRoute captainChoice = RescueRoute.Undecided;
        private GameOutcome outcome = GameOutcome.Pending;
        private double elapsedSeconds;
        private double stageStartedAtSeconds;
        private double remainingSeconds;
        private int hull;
        private int savedCount;
        private int leftVotes;
        private int rightVotes;
        private int repairProgress;
        private int lightProgress;
        private int likeCarry;
        private int likePointsAwarded;
        private int repairActions;
        private int lightActions;
        private int likeLightPoints;

        public RescueGame(GameConfig config, string roomId, string roundId, int seed)
        {
            this.config = config ?? throw new ArgumentNullException(nameof(config));
            this.roomId = roomId ?? throw new ArgumentNullException(nameof(roomId));
            this.roundId = roundId ?? throw new ArgumentNullException(nameof(roundId));
            this.seed = seed;
            hull = config.StartingHull;
        }

        public static RescueGame Restore(GameConfig config, RescueSnapshot snapshot)
        {
            if (snapshot == null || snapshot.RulesVersion != 1 ||
                string.IsNullOrWhiteSpace(snapshot.RoomId) || string.IsNullOrWhiteSpace(snapshot.RoundId))
                throw new ArgumentException("Incompatible or incomplete rescue snapshot", nameof(snapshot));
            var game = new RescueGame(config, snapshot.RoomId, snapshot.RoundId, snapshot.Seed)
            {
                phase = snapshot.Phase,
                phaseBeforePause = snapshot.PhaseBeforePause,
                route = snapshot.Route,
                captainChoice = snapshot.CaptainChoice,
                outcome = snapshot.Outcome,
                elapsedSeconds = snapshot.ElapsedSeconds,
                stageStartedAtSeconds = snapshot.StageStartedAtSeconds,
                remainingSeconds = snapshot.RemainingSeconds,
                hull = snapshot.Hull,
                savedCount = snapshot.SavedCount,
                leftVotes = snapshot.LeftVotes,
                rightVotes = snapshot.RightVotes,
                repairProgress = snapshot.RepairProgress,
                lightProgress = snapshot.LightProgress,
                likeCarry = snapshot.LikeCarry,
                likePointsAwarded = snapshot.LikePointsAwarded,
                repairActions = snapshot.RepairActions,
                lightActions = snapshot.LightActions,
                likeLightPoints = snapshot.LikeLightPoints
            };
            if (snapshot.RecentEventIds != null)
                foreach (string id in snapshot.RecentEventIds) game.seenEvents.Add(id);
            if (snapshot.JoinedUserIds != null)
                foreach (string id in snapshot.JoinedUserIds) game.joinedUsers.Add(id);
            if (snapshot.VotedUserIds != null)
                foreach (string id in snapshot.VotedUserIds) game.votedUsers.Add(id);
            if (snapshot.CooldownKeys != null && snapshot.CooldownTimes != null)
                for (int i = 0; i < Math.Min(snapshot.CooldownKeys.Count, snapshot.CooldownTimes.Count); i++)
                    game.lastCommandTime[snapshot.CooldownKeys[i]] = snapshot.CooldownTimes[i];
            if (snapshot.CommandCapKeys != null && snapshot.CommandCapCounts != null)
                for (int i = 0; i < Math.Min(snapshot.CommandCapKeys.Count, snapshot.CommandCapCounts.Count); i++)
                    game.stageCommandCount[snapshot.CommandCapKeys[i]] = snapshot.CommandCapCounts[i];
            return game;
        }

        public ApplyResult Apply(GameEvent gameEvent, double nowSeconds)
        {
            if (gameEvent == null || string.IsNullOrWhiteSpace(gameEvent.EventId) ||
                string.IsNullOrWhiteSpace(gameEvent.UserId) || gameEvent.Count <= 0 ||
                double.IsNaN(nowSeconds) || double.IsInfinity(nowSeconds))
                return ApplyResult.Invalid;
            if (gameEvent.RoomId != roomId) return ApplyResult.WrongRoom;
            if (gameEvent.RoundId != roundId) return ApplyResult.WrongRound;
            if (seenEvents.Contains(gameEvent.EventId)) return ApplyResult.Duplicate;
            if (gameEvent.OccurredAtSeconds < stageStartedAtSeconds - Epsilon &&
                gameEvent.Command != GameCommand.Resume && gameEvent.Command != GameCommand.End)
                return ApplyResult.Stale;

            ApplyResult result;
            switch (gameEvent.Command)
            {
                case GameCommand.Start:
                    result = phase == GamePhase.Waiting ? BeginGathering() : ApplyResult.WrongPhase;
                    break;
                case GameCommand.Pause:
                    result = Pause();
                    break;
                case GameCommand.Resume:
                    result = Resume();
                    break;
                case GameCommand.End:
                    result = End();
                    break;
                case GameCommand.Board:
                    result = Board(gameEvent.UserId);
                    break;
                case GameCommand.VoteLeft:
                case GameCommand.VoteRight:
                    result = Vote(gameEvent.UserId, gameEvent.Command);
                    break;
                case GameCommand.CaptainLeft:
                case GameCommand.CaptainRight:
                    result = CaptainVote(gameEvent.Command);
                    break;
                case GameCommand.Repair:
                case GameCommand.Light:
                    result = Contribute(gameEvent.UserId, gameEvent.Command, nowSeconds);
                    break;
                case GameCommand.Like:
                    result = Like(gameEvent.Count);
                    break;
                case GameCommand.Gift:
                    result = IsActive() ? ApplyResult.Accepted : ApplyResult.WrongPhase;
                    break;
                default:
                    result = ApplyResult.Invalid;
                    break;
            }
            if (result == ApplyResult.Accepted)
                seenEvents.Add(gameEvent.EventId);
            return result;
        }

        public RescueSnapshot Advance(double deltaSeconds)
        {
            if (double.IsNaN(deltaSeconds) || double.IsInfinity(deltaSeconds) || deltaSeconds < 0)
                throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
            if (phase == GamePhase.Waiting || phase == GamePhase.Paused || phase == GamePhase.Result)
                return Snapshot();
            while (deltaSeconds > Epsilon && phase != GamePhase.Result)
            {
                double step = Math.Min(deltaSeconds, remainingSeconds);
                elapsedSeconds += step;
                remainingSeconds -= step;
                deltaSeconds -= step;
                if (remainingSeconds <= Epsilon)
                    CompletePhase();
            }
            return Snapshot();
        }

        public RescueSnapshot Snapshot()
        {
            var result = new RescueSnapshot
            {
                RoomId = roomId, RoundId = roundId, Seed = seed,
                Phase = phase, PhaseBeforePause = phaseBeforePause,
                Route = route, CaptainChoice = captainChoice, Outcome = outcome,
                ElapsedSeconds = elapsedSeconds,
                StageStartedAtSeconds = stageStartedAtSeconds,
                RemainingSeconds = remainingSeconds,
                Hull = hull, SavedCount = savedCount,
                JoinedCount = joinedUsers.Count,
                LeftVotes = leftVotes, RightVotes = rightVotes,
                RepairProgress = repairProgress, LightProgress = lightProgress,
                RepairTarget = RepairTarget(), LightTarget = LightTarget(),
                CheckpointNumber = CheckpointNumber(),
                LikeCarry = likeCarry, LikePointsAwarded = likePointsAwarded,
                RepairActions = repairActions, LightActions = lightActions, LikeLightPoints = likeLightPoints,
                RecentEventIds = new List<string>(seenEvents),
                JoinedUserIds = new List<string>(joinedUsers),
                VotedUserIds = new List<string>(votedUsers)
            };
            foreach (var pair in lastCommandTime)
            {
                result.CooldownKeys.Add(pair.Key);
                result.CooldownTimes.Add(pair.Value);
            }
            foreach (var pair in stageCommandCount)
            {
                result.CommandCapKeys.Add(pair.Key);
                result.CommandCapCounts.Add(pair.Value);
            }
            return result;
        }

        private bool IsActive() => phase != GamePhase.Waiting && phase != GamePhase.Paused && phase != GamePhase.Result;
        private bool IsCheckpoint() => phase == GamePhase.Checkpoint1 || phase == GamePhase.Checkpoint2 || phase == GamePhase.Checkpoint3;
        private int CheckpointNumber() => IsCheckpoint() ? (int)phase - (int)GamePhase.Checkpoint1 + 1 : 0;
        private int RepairTarget() => !IsCheckpoint() ? 0 : route == RescueRoute.ShortLeft ? config.ShortRepairTarget : config.LongRepairTarget;
        private int LightTarget() => !IsCheckpoint() ? 0 : route == RescueRoute.ShortLeft ? config.ShortLightTarget : config.LongLightTarget;

        private ApplyResult BeginGathering()
        {
            phase = GamePhase.Gathering;
            remainingSeconds = config.GatheringSeconds;
            stageStartedAtSeconds = elapsedSeconds;
            return ApplyResult.Accepted;
        }

        private ApplyResult Pause()
        {
            if (!IsActive()) return ApplyResult.WrongPhase;
            phaseBeforePause = phase;
            phase = GamePhase.Paused;
            return ApplyResult.Accepted;
        }

        private ApplyResult Resume()
        {
            if (phase != GamePhase.Paused) return ApplyResult.WrongPhase;
            phase = phaseBeforePause;
            return ApplyResult.Accepted;
        }

        private ApplyResult End()
        {
            if (phase == GamePhase.Waiting || phase == GamePhase.Result) return ApplyResult.WrongPhase;
            FinishRound();
            return ApplyResult.Accepted;
        }

        private ApplyResult Board(string userId)
        {
            if (!IsActive()) return ApplyResult.WrongPhase;
            return joinedUsers.Add(userId) ? ApplyResult.Accepted : ApplyResult.Capped;
        }

        private ApplyResult Vote(string userId, GameCommand command)
        {
            if (phase != GamePhase.Voting) return ApplyResult.WrongPhase;
            if (!votedUsers.Add(userId)) return ApplyResult.Capped;
            if (command == GameCommand.VoteLeft) leftVotes++;
            else rightVotes++;
            return ApplyResult.Accepted;
        }

        private ApplyResult CaptainVote(GameCommand command)
        {
            if (phase != GamePhase.Voting) return ApplyResult.WrongPhase;
            captainChoice = command == GameCommand.CaptainLeft ? RescueRoute.ShortLeft : RescueRoute.LongRight;
            return ApplyResult.Accepted;
        }

        private ApplyResult Contribute(string userId, GameCommand command, double nowSeconds)
        {
            if (!IsCheckpoint()) return ApplyResult.WrongPhase;
            int target = command == GameCommand.Repair ? RepairTarget() : LightTarget();
            int progress = command == GameCommand.Repair ? repairProgress : lightProgress;
            if (progress >= target) return ApplyResult.Capped;
            string key = userId + ":" + command;
            if (stageCommandCount.TryGetValue(key, out int count) && count >= config.PerUserCommandStageCap)
                return ApplyResult.Capped;
            if (lastCommandTime.TryGetValue(key, out double previous) && nowSeconds - previous < config.CommentCooldownSeconds - Epsilon)
                return ApplyResult.Cooldown;
            lastCommandTime[key] = nowSeconds;
            stageCommandCount[key] = count + 1;
            if (command == GameCommand.Repair) { repairProgress++; repairActions++; }
            else { lightProgress++; lightActions++; }
            return ApplyResult.Accepted;
        }

        private ApplyResult Like(int count)
        {
            if (!IsCheckpoint()) return ApplyResult.WrongPhase;
            if (likePointsAwarded >= config.MaxLikeLightPerStage || lightProgress >= LightTarget())
                return ApplyResult.Capped;
            likeCarry += count;
            int points = Math.Min(likeCarry / config.LikesPerLightPoint,
                Math.Min(config.MaxLikeLightPerStage - likePointsAwarded, LightTarget() - lightProgress));
            if (points > 0)
            {
                likeCarry -= points * config.LikesPerLightPoint;
                likePointsAwarded += points;
                lightProgress += points;
                likeLightPoints += points;
            }
            return ApplyResult.Accepted;
        }

        private void CompletePhase()
        {
            switch (phase)
            {
                case GamePhase.Gathering:
                    phase = GamePhase.Voting;
                    remainingSeconds = config.VotingSeconds;
                    break;
                case GamePhase.Voting:
                    route = leftVotes > rightVotes ? RescueRoute.ShortLeft :
                        rightVotes > leftVotes ? RescueRoute.LongRight :
                        captainChoice != RescueRoute.Undecided ? captainChoice : RescueRoute.LongRight;
                    BeginCheckpoint(1);
                    return;
                case GamePhase.Checkpoint1:
                case GamePhase.Checkpoint2:
                case GamePhase.Checkpoint3:
                    int current = CheckpointNumber();
                    ResolveCheckpoint();
                    if (phase == GamePhase.Result) return;
                    if (current == 3)
                    {
                        phase = GamePhase.Finale;
                        remainingSeconds = config.FinaleSeconds;
                    }
                    else
                    {
                        BeginCheckpoint(current + 1);
                        return;
                    }
                    break;
                case GamePhase.Finale:
                    FinishRound();
                    return;
            }
            stageStartedAtSeconds = elapsedSeconds;
        }

        private void BeginCheckpoint(int number)
        {
            phase = (GamePhase)((int)GamePhase.Checkpoint1 + number - 1);
            remainingSeconds = route == RescueRoute.ShortLeft ? config.ShortCheckpointSeconds : config.LongCheckpointSeconds;
            repairProgress = config.SystemStartingProgress;
            lightProgress = config.SystemStartingProgress;
            likeCarry = 0;
            likePointsAwarded = 0;
            lastCommandTime.Clear();
            stageCommandCount.Clear();
            stageStartedAtSeconds = elapsedSeconds;
        }

        private void ResolveCheckpoint()
        {
            int baseDamage = route == RescueRoute.ShortLeft ? config.ShortBaseDamage : config.LongBaseDamage;
            hull = Math.Max(0, hull - baseDamage - Math.Max(0, RepairTarget() - repairProgress) * config.MissingRepairDamage);
            if (hull == 0)
            {
                FinishRound();
                return;
            }
            if (lightProgress >= LightTarget()) savedCount++;
        }

        private void FinishRound()
        {
            phase = GamePhase.Result;
            remainingSeconds = 0;
            outcome = hull == 0 || savedCount == 0 ? GameOutcome.Failure :
                savedCount == 3 ? GameOutcome.FullSuccess : GameOutcome.PartialSuccess;
        }
    }
}
