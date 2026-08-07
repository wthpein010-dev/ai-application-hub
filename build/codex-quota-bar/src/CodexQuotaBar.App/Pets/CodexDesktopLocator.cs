using System.Diagnostics;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace CodexQuotaBar.App.Pets;

public static class CodexDesktopLocator
{
    private const string WindowsPackagesRegistryPath =
        @"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";

    public static string CodexHome
    {
        get
        {
            var configured = Environment.GetEnvironmentVariable("CODEX_HOME");
            return string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".codex")
                : configured;
        }
    }

    public static string? FindAppAsar()
    {
        foreach (var processName in new[] { "ChatGPT", "Codex" })
        {
            foreach (var process in Process.GetProcessesByName(processName))
            {
                using (process)
                {
                    try
                    {
                        var executablePath = process.MainModule?.FileName;
                        if (string.IsNullOrWhiteSpace(executablePath))
                        {
                            continue;
                        }

                        var candidate = Path.Combine(
                            Path.GetDirectoryName(executablePath)!,
                            "resources",
                            "app.asar");
                        if (File.Exists(candidate))
                        {
                            return candidate;
                        }
                    }
                    catch (Exception)
                    {
                        // Protected helper processes are expected on desktop installs.
                    }
                }
            }
        }

        return FindKnownInstall();
    }

    private static string? FindKnownInstall()
    {
        var candidates = new List<string>();
        if (OperatingSystem.IsWindows())
        {
            var storeAsar = FindAppAsarInPackageRoots(GetWindowsStorePackageRoots());
            if (storeAsar is not null)
            {
                candidates.Add(storeAsar);
            }

            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            candidates.Add(Path.Combine(localAppData, "Programs", "Codex", "resources", "app.asar"));

            var installRoot = Path.Combine(localAppData, "OpenAI", "Codex");
            if (Directory.Exists(installRoot))
            {
                try
                {
                    candidates.AddRange(
                        Directory.EnumerateDirectories(installRoot, "app-*")
                            .OrderDescending()
                            .Select(path => Path.Combine(path, "resources", "app.asar")));
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }
        else if (OperatingSystem.IsMacOS())
        {
            candidates.Add("/Applications/Codex.app/Contents/Resources/app.asar");
            candidates.Add(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Applications",
                "Codex.app",
                "Contents",
                "Resources",
                "app.asar"));
        }

        return candidates.FirstOrDefault(File.Exists);
    }

    public static string? FindAppAsarInPackageRoots(IEnumerable<string> packageRoots)
    {
        ArgumentNullException.ThrowIfNull(packageRoots);

        return packageRoots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Select(root => Path.Combine(root, "app", "resources", "app.asar"))
            .FirstOrDefault(File.Exists);
    }

    [SupportedOSPlatform("windows")]
    private static IReadOnlyList<string> GetWindowsStorePackageRoots()
    {
        var roots = new List<string>();
        try
        {
            using var packages = Registry.CurrentUser.OpenSubKey(
                WindowsPackagesRegistryPath,
                writable: false);
            if (packages is null)
            {
                return roots;
            }

            foreach (var packageName in packages.GetSubKeyNames()
                         .Where(name => name.StartsWith("OpenAI.Codex_", StringComparison.OrdinalIgnoreCase))
                         .OrderDescending())
            {
                using var package = packages.OpenSubKey(packageName, writable: false);
                if (package?.GetValue("PackageRootFolder") is string root
                    && !string.IsNullOrWhiteSpace(root))
                {
                    roots.Add(root);
                }
            }
        }
        catch (Exception exception) when (exception is IOException
                                           or UnauthorizedAccessException
                                           or System.Security.SecurityException)
        {
        }

        return roots;
    }
}
