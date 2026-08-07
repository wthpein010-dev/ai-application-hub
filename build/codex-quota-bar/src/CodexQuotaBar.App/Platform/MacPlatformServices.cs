using System.Security;
using System.Xml;
using System.Xml.Linq;
using CodexQuotaBar.Core.Platform;

namespace CodexQuotaBar.App.Platform;

public sealed class MacPlatformServices : IPlatformServices
{
    private readonly string _appExecutablePath;
    private readonly string _launchAgentPath;

    public MacPlatformServices(
        string? appExecutablePath = null,
        string? applicationSupportDirectory = null,
        string? launchAgentPath = null)
    {
        _appExecutablePath = appExecutablePath ?? Environment.ProcessPath
            ?? throw new InvalidOperationException("The application executable path is unavailable.");
        var supportRoot = applicationSupportDirectory
            ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Library",
                "Application Support");
        SettingsDirectory = Path.Combine(supportRoot, "CodexQuotaBar");
        LogsDirectory = Path.Combine(SettingsDirectory, "logs");
        _launchAgentPath = launchAgentPath
            ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Library",
                "LaunchAgents",
                "com.codexquotabar.app.plist");
    }

    public string SettingsDirectory { get; }
    public string LogsDirectory { get; }

    public Task<string?> FindCodexExecutableAsync(
        string? explicitOverride,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var candidates = new[]
        {
            "/Applications/Codex.app/Contents/Resources/codex",
            Path.Combine(home, "Applications", "Codex.app", "Contents", "Resources", "codex"),
            Path.Combine(home, ".local", "bin", "codex"),
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
        };
        var result = CodexExecutableDiscovery.FindFirstExisting(
            explicitOverride,
            candidates,
            Environment.GetEnvironmentVariable("PATH"),
            "codex");
        return Task.FromResult(result);
    }

    public async Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!File.Exists(_launchAgentPath))
        {
            return false;
        }

        try
        {
            var xml = await File.ReadAllTextAsync(_launchAgentPath, cancellationToken).ConfigureAwait(false);
            return LaunchAgentTargetsExecutable(xml, _appExecutablePath);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or XmlException)
        {
            return false;
        }
    }

    public async Task SetLaunchAtLoginAsync(bool enabled, CancellationToken cancellationToken = default)
    {
        if (!enabled)
        {
            if (File.Exists(_launchAgentPath))
            {
                File.Delete(_launchAgentPath);
            }

            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(_launchAgentPath)!);
        await File.WriteAllTextAsync(
            _launchAgentPath,
            BuildLaunchAgent(_appExecutablePath),
            cancellationToken).ConfigureAwait(false);
    }

    public static string BuildLaunchAgent(string executablePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(executablePath);
        var escaped = SecurityElement.Escape(executablePath)
            ?? throw new InvalidOperationException("The application path could not be XML escaped.");
        return $$"""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <dict>
                <key>Label</key>
                <string>com.codexquotabar.app</string>
                <key>ProgramArguments</key>
                <array>
                  <string>{{escaped}}</string>
                </array>
                <key>RunAtLoad</key>
                <true/>
                <key>KeepAlive</key>
                <false/>
              </dict>
            </plist>
            """;
    }

    private static bool LaunchAgentTargetsExecutable(string xml, string executablePath)
    {
        var document = XDocument.Parse(xml);
        var entries = document.Root?.Element("dict")?.Elements().ToArray();
        if (entries is null)
        {
            return false;
        }

        string? configuredExecutable = null;
        var runAtLoad = false;
        for (var index = 0; index + 1 < entries.Length; index++)
        {
            if (entries[index].Name.LocalName != "key")
            {
                continue;
            }

            var key = entries[index].Value;
            var value = entries[index + 1];
            if (key == "ProgramArguments" && value.Name.LocalName == "array")
            {
                configuredExecutable = value.Elements("string").FirstOrDefault()?.Value;
            }
            else if (key == "RunAtLoad")
            {
                runAtLoad = value.Name.LocalName == "true";
            }
        }

        return runAtLoad
            && string.Equals(configuredExecutable, executablePath, StringComparison.Ordinal);
    }
}
