using System.Windows.Input;
using Avalonia.Controls;
using CodexQuotaBar.App.Tray;

namespace CodexQuotaBar.Tests.UI;

public sealed class TrayMenuFactoryTests
{
    [Avalonia.Headless.XUnit.AvaloniaFact]
    public void Menu_contains_all_expected_daily_actions()
    {
        var command = new NoOpCommand();

        var menu = TrayMenuFactory.Create(
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            alwaysOnTop: true,
            launchAtLogin: true,
            petAvailable: true,
            petEnabled: true,
            taskNotificationsEnabled: false);

        var items = menu.Items.OfType<NativeMenuItem>()
            .Where(item => item is not NativeMenuItemSeparator)
            .ToArray();
        Assert.Equal(
            ["显示/隐藏窗口", "立即刷新", "始终置顶", "开机启动", "桌宠", "任务完成提示", "选择 Codex 程序...", "退出"],
            items.Select(item => item.Header));
        Assert.True(items[2].IsChecked);
        Assert.True(items[3].IsChecked);
        Assert.True(items[4].IsChecked);
        Assert.False(items[5].IsChecked);
    }

    [Avalonia.Headless.XUnit.AvaloniaFact]
    public void Menu_omits_pet_actions_without_a_valid_pet()
    {
        var command = new NoOpCommand();

        var menu = TrayMenuFactory.Create(
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            alwaysOnTop: true,
            launchAtLogin: true,
            petAvailable: false,
            petEnabled: false,
            taskNotificationsEnabled: true);

        var headers = menu.Items.OfType<NativeMenuItem>()
            .Where(item => item is not NativeMenuItemSeparator)
            .Select(item => item.Header)
            .ToArray();

        Assert.DoesNotContain("桌宠", headers);
        Assert.DoesNotContain("任务完成提示", headers);
    }

    private sealed class NoOpCommand : ICommand
    {
        public event EventHandler? CanExecuteChanged
        {
            add { }
            remove { }
        }

        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) { }
    }
}
