using CodexQuotaBar.App.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class CodexDesktopLocatorTests
{
    [Fact]
    public void FindAppAsarInPackageRootsFindsInstalledStorePackage()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            $"codex-quota-bar-store-package-{Guid.NewGuid():N}");
        var expected = Path.Combine(root, "app", "resources", "app.asar");

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(expected)!);
            File.WriteAllBytes(expected, [1, 2, 3]);

            var actual = CodexDesktopLocator.FindAppAsarInPackageRoots([root]);

            Assert.Equal(expected, actual);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
