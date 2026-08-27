using System.Diagnostics;
using System.Text.Json;

namespace CodexThreadWorkbench.Tests.Packaging;

public sealed class PackagingScriptTests
{
    private static readonly string RepositoryRoot = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    [Theory]
    [InlineData("osx-arm64", "CodexConfirmationBar-macOS-arm64.app.zip")]
    [InlineData("osx-x64", "CodexConfirmationBar-macOS-x64.app.zip")]
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
        Assert.Contains("dev.wthpein010.codex-confirmation-bar", script);
        Assert.Contains("Codex 待确认悬浮助手", script);
    }

    [Fact]
    public void MacPackageTest_VerifiesArchitectureSignatureSmokeAndLaunch()
    {
        var script = Read("scripts", "test-macos-package.sh");

        Assert.Contains("codesign --verify --deep --strict", script);
        Assert.Contains("--smoke-test", script);
        Assert.Contains("file \"${executable}\"", script);
        Assert.Contains("kill \"${app_pid}\"", script);
        Assert.Contains("CodexConfirmationBar.app", script);
        Assert.Contains("CodexConfirmationBar", script);
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
        Assert.Contains("CodexConfirmationBar-macOS-arm64.app.zip", workflow);
        Assert.Contains("CodexConfirmationBar-macOS-x64.app.zip", workflow);
    }

    [Fact]
    public void WindowsScript_UsesTheBrandedExecutableAndArchive()
    {
        var script = Read("scripts", "Publish-Windows.ps1");

        Assert.Contains("CodexConfirmationBar-Windows-x64", script);
        Assert.Contains("CodexConfirmationBar-Windows-x64.zip", script);
        Assert.Contains("CodexConfirmationBar.exe", script);
        Assert.DoesNotContain("CodexThreadWorkbench-Windows-x64.zip", script);
    }

    [Fact]
    public async Task WindowsRecoveryInstaller_DescribesOneMinuteSelfHealingTask()
    {
        var scriptPath = Path.Combine(
            RepositoryRoot,
            "scripts",
            "Install-WindowsRecoveryTask.ps1");
        var executablePath = @"C:\Program Files\Codex Bar\CodexConfirmationBar.exe";
        var taskName = $"Codex recovery test {Guid.NewGuid():N}";
        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(scriptPath);
        startInfo.ArgumentList.Add("-ExecutablePath");
        startInfo.ArgumentList.Add(executablePath);
        startInfo.ArgumentList.Add("-TaskName");
        startInfo.ArgumentList.Add(taskName);
        startInfo.ArgumentList.Add("-Describe");

        using var process = Process.Start(startInfo);
        Assert.NotNull(process);
        var output = await process.StandardOutput.ReadToEndAsync();
        var error = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        Assert.True(
            process.ExitCode == 0,
            $"Recovery installer exited {process.ExitCode}: {error}");
        using var document = JsonDocument.Parse(output);
        var root = document.RootElement;
        Assert.Equal(taskName, root.GetProperty("TaskName").GetString());
        Assert.Equal(
            executablePath,
            root.GetProperty("ExecutablePath").GetString());
        Assert.Equal(
            "--confirmation-overlay",
            root.GetProperty("Arguments").GetString());
        Assert.Equal(1, root.GetProperty("RepetitionMinutes").GetInt32());
        Assert.Equal(1, root.GetProperty("RestartMinutes").GetInt32());
        Assert.Equal(999, root.GetProperty("RestartCount").GetInt32());
        Assert.Equal(
            "IgnoreNew",
            root.GetProperty("MultipleInstances").GetString());
        Assert.Equal(
            @"C:\Program Files\Codex Bar\CodexConfirmationBar-lifecycle.log",
            root.GetProperty("DiagnosticsPath").GetString());
        Assert.EndsWith(
            @"WindowsPowerShell\v1.0\powershell.exe",
            root.GetProperty("TaskActionExecutable").GetString(),
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains(
            "-EncodedCommand",
            root.GetProperty("TaskActionArguments").GetString());
    }

    private static string Read(params string[] segments) =>
        File.ReadAllText(
            segments.Aggregate(RepositoryRoot, Path.Combine));
}
