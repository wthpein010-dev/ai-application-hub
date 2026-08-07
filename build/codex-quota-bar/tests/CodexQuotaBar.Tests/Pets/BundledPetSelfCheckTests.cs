using CodexQuotaBar.App.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class BundledPetSelfCheckTests
{
    [Fact]
    public async Task VerifyAsync_loads_the_embedded_resource_without_desktop_startup()
    {
        Assert.True(await BundledPetSelfCheck.VerifyAsync());
    }
}
