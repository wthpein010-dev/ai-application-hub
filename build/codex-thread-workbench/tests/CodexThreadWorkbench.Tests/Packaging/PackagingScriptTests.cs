namespace CodexThreadWorkbench.Tests.Packaging;

public sealed class PackagingScriptTests
{
    private static readonly string RepositoryRoot = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    [Theory]
    [InlineData("osx-arm64", "CodexThreadWorkbench-macOS-arm64.app.zip")]
    [InlineData("osx-x64", "CodexThreadWorkbench-macOS-x64.app.zip")]
    public void MacScript_MapsRuntimeToExactArchiveName(
        string runtime,
        string archiveName)
    {
        var script = Read("scripts", "publish-macos.sh");

        Assert.Contains(runtime, script);
        Assert.Contains(archiveName, script);
        Assert.Contains("codesign --force --deep --sign -", script);
        Assert.Contains("LSMinimumSystemVersion", script);
        Assert.Contains("<string>13.0</string>", script);
    }

    [Fact]
    public void MacPackageTest_VerifiesArchitectureSignatureSmokeAndLaunch()
    {
        var script = Read("scripts", "test-macos-package.sh");

        Assert.Contains("codesign --verify --deep --strict", script);
        Assert.Contains("--smoke-test", script);
        Assert.Contains("file \"${executable}\"", script);
        Assert.Contains("kill \"${app_pid}\"", script);
    }

    [Fact]
    public void MacScript_DerivesBothBundleVersionsFromValidatedProjectVersion()
    {
        var script = Read("scripts", "publish-macos.sh");

        Assert.Contains(
            "src/CodexThreadWorkbench/CodexThreadWorkbench.csproj",
            script);
        Assert.Contains("project_version", script);
        Assert.Contains("^[0-9]+\\.[0-9]+\\.[0-9]+$", script);
        Assert.DoesNotContain("<string>1.1.0</string>", script);
        Assert.Equal(
            2,
            System.Text.RegularExpressions.Regex.Matches(
                script,
                "<string>\\$\\{project_version\\}</string>").Count);
    }

    [Fact]
    public void MacPackageTest_VerifiesBothBundleVersionsWithPlutil()
    {
        var script = Read("scripts", "test-macos-package.sh");

        Assert.Contains(
            "plutil -extract CFBundleShortVersionString raw",
            script);
        Assert.Contains(
            "plutil -extract CFBundleVersion raw",
            script);
        Assert.Contains("expected_version", script);
        Assert.Contains("CFBundleShortVersionString=${short_version}", script);
        Assert.Contains("CFBundleVersion=${bundle_version}", script);
    }

    [Fact]
    public void Workflow_UsesMatchingMacArchitectureRunners()
    {
        var workflow = Read(".github", "workflows", "build-cross-platform.yml");

        Assert.Contains("runner: macos-14", workflow);
        Assert.Contains("runtime: osx-arm64", workflow);
        Assert.Contains("runner: macos-15-intel", workflow);
        Assert.Contains("runtime: osx-x64", workflow);
        Assert.Contains("scripts/test-macos-package.sh", workflow);
    }

    private static string Read(params string[] segments) =>
        File.ReadAllText(
            segments.Aggregate(RepositoryRoot, Path.Combine));
}
