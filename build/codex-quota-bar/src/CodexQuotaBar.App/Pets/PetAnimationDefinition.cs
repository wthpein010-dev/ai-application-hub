using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.App.Pets;

public sealed record PetAnimationDefinition(int Row, IReadOnlyList<TimeSpan> Durations)
{
    private static readonly PetAnimationDefinition Idle = new(
        0,
        Milliseconds(460, 110, 110, 460, 110, 110));

    private static readonly PetAnimationDefinition Failed = new(
        5,
        Milliseconds(150, 150, 170, 210, 150, 150, 170, 260));

    private static readonly PetAnimationDefinition Waiting = new(
        6,
        Milliseconds(260, 200, 200, 260, 200, 200));

    private static readonly PetAnimationDefinition Review = new(
        8,
        Milliseconds(130, 130, 180, 130, 130, 220));

    public static PetAnimationDefinition For(PetAnimationState state) => state switch
    {
        PetAnimationState.Failed => Failed,
        PetAnimationState.Waiting => Waiting,
        PetAnimationState.Review => Review,
        _ => Idle,
    };

    private static IReadOnlyList<TimeSpan> Milliseconds(params int[] durations) =>
        durations.Select(duration => TimeSpan.FromMilliseconds(duration)).ToArray();
}
