using System.Windows.Input;
using Avalonia.Controls;

namespace CodexQuotaBar.App.Tray;

public static class TrayMenuFactory
{
    public static NativeMenu Create(
        ICommand showHideCommand,
        ICommand refreshCommand,
        ICommand alwaysOnTopCommand,
        ICommand launchAtLoginCommand,
        ICommand petCommand,
        ICommand taskNotificationsCommand,
        ICommand chooseCodexCommand,
        ICommand quitCommand,
        bool alwaysOnTop,
        bool launchAtLogin,
        bool petAvailable,
        bool petEnabled,
        bool taskNotificationsEnabled)
    {
        var menu = new NativeMenu();
        menu.Items.Add(Item("显示/隐藏窗口", showHideCommand));
        menu.Items.Add(Item("立即刷新", refreshCommand));
        menu.Items.Add(CheckItem("始终置顶", alwaysOnTopCommand, alwaysOnTop));
        menu.Items.Add(CheckItem("开机启动", launchAtLoginCommand, launchAtLogin));
        if (petAvailable)
        {
            menu.Items.Add(CheckItem("桌宠", petCommand, petEnabled));
            menu.Items.Add(CheckItem("任务完成提示", taskNotificationsCommand, taskNotificationsEnabled));
        }

        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(Item("选择 Codex 程序...", chooseCodexCommand));
        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(Item("退出", quitCommand));
        return menu;
    }

    private static NativeMenuItem Item(string header, ICommand command) => new(header)
    {
        Command = command,
    };

    private static NativeMenuItem CheckItem(string header, ICommand command, bool isChecked) => new(header)
    {
        Command = command,
        ToggleType = NativeMenuItemToggleType.CheckBox,
        IsChecked = isChecked,
    };
}
