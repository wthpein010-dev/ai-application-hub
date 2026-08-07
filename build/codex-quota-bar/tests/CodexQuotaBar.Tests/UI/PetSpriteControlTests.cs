using Avalonia.Headless.XUnit;
using CodexQuotaBar.App.Pets;
using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.Tests.UI;

public sealed class PetSpriteControlTests
{
    [AvaloniaFact]
    public void Animated_gif_loads_every_frame_with_source_timing()
    {
        using var control = new PetSpriteControl();

        control.SetPet(BundledPet());

        Assert.Equal(62, control.LoadedFrameCountForTest);
        Assert.Equal(TimeSpan.FromMilliseconds(30), control.CurrentFrameDurationForTest);
    }

    [AvaloniaFact]
    public void Animation_state_change_does_not_reset_the_gif_sequence()
    {
        using var control = new PetSpriteControl();
        control.SetPet(BundledPet());
        control.AdvanceFrameForTest();
        control.AdvanceFrameForTest();
        var before = control.FrameIndexForTest;

        control.SetAnimation(PetAnimationState.Review);

        Assert.Equal(2, before);
        Assert.Equal(before, control.FrameIndexForTest);
    }

    [AvaloniaFact]
    public void Reapplying_the_same_pet_does_not_reset_or_reload_frames()
    {
        using var control = new PetSpriteControl();
        var pet = BundledPet();
        control.SetPet(pet);
        control.AdvanceFrameForTest();
        var generation = control.LoadGenerationForTest;

        control.SetPet(pet with { Payload = [.. pet.Payload] });

        Assert.Equal(1, control.FrameIndexForTest);
        Assert.Equal(generation, control.LoadGenerationForTest);
    }

    [AvaloniaFact]
    public void Codex_atlas_state_change_keeps_existing_row_reset_behavior()
    {
        using var control = new PetSpriteControl();
        control.SetPet(new PetAsset(
            "codex",
            "Codex",
            TestPetAssets.ValidWebpAtlas,
            PetAssetFormat.CodexWebpAtlas,
            PetAssetSource.Codex));
        control.AdvanceFrameForTest();

        control.SetAnimation(PetAnimationState.Review);

        Assert.Equal(0, control.FrameIndexForTest);
    }

    [AvaloniaFact]
    public void Clearing_the_pet_disposes_all_loaded_gif_frames()
    {
        using var control = new PetSpriteControl();
        control.SetPet(BundledPet());

        control.SetPet(null);

        Assert.Equal(0, control.LoadedFrameCountForTest);
    }

    private static PetAsset BundledPet() => new(
        "bundled-suit-hamster",
        "西装仓鼠",
        File.ReadAllBytes(Path.Combine(
            AppContext.BaseDirectory,
            "Assets",
            "Pets",
            "suit-hamster.gif")),
        PetAssetFormat.AnimatedGif,
        PetAssetSource.BundledFallback);
}
