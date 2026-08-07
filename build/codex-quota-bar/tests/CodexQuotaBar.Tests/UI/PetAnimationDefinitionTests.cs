using CodexQuotaBar.App.Pets;
using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.Tests.UI;

public sealed class PetAnimationDefinitionTests
{
    [Theory]
    [InlineData(PetAnimationState.Idle, 0, 6)]
    [InlineData(PetAnimationState.Failed, 5, 8)]
    [InlineData(PetAnimationState.Waiting, 6, 6)]
    [InlineData(PetAnimationState.Review, 8, 6)]
    public void Standard_states_use_the_Codex_atlas_contract(
        PetAnimationState state,
        int row,
        int frameCount)
    {
        var definition = PetAnimationDefinition.For(state);

        Assert.Equal(row, definition.Row);
        Assert.Equal(frameCount, definition.Durations.Count);
        Assert.All(definition.Durations, duration => Assert.True(duration > TimeSpan.Zero));
    }
}
