using Avalonia.Controls.Presenters;
using Avalonia.VisualTree;
using CodexThreadWorkbench.Converters;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Views;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class WorkspaceViewTests
{
    [AvaloniaFact]
    public void MainWindow_ContainsDirectWorkspaceControls()
    {
        var window = new MainWindow();

        Assert.NotNull(window.FindControl<ItemsControl>("ThreadGrid"));
        Assert.NotNull(window.FindControl<ThreadPickerOverlay>("PickerOverlay"));
        Assert.NotNull(window.FindControl<Button>("OpenThreadButton"));
    }

    [AvaloniaFact]
    public void ThreadCard_ExposesInlineConversationControls()
    {
        var card = new ThreadCardView();

        Assert.NotNull(card.FindControl<TextBox>("MessageInput"));
        Assert.NotNull(card.FindControl<ScrollViewer>("MessagesScroller"));
        Assert.IsNotType<ListBox>(card.FindControl<ItemsControl>("MessagesList"));
        Assert.NotNull(card.FindControl<Button>("SendButton"));
        Assert.NotNull(card.FindControl<TextBlock>("StatusLabel"));
    }

    [AvaloniaFact]
    public void ThreadPicker_ContainsSearchAndTaskList()
    {
        var picker = new ThreadPickerOverlay();

        Assert.NotNull(picker.FindControl<TextBox>("ThreadSearchBox"));
        Assert.NotNull(picker.FindControl<ListBox>("ThreadList"));
    }

    [Fact]
    public void ChatRoleVisibilityConverter_MatchesRequestedRole()
    {
        var converter = new ChatRoleVisibilityConverter();

        Assert.True((bool)converter.Convert(ChatRole.User, typeof(bool), "User", null!));
        Assert.False((bool)converter.Convert(ChatRole.Assistant, typeof(bool), "User", null!));
        Assert.True((bool)converter.Convert(ChatRole.Assistant, typeof(bool), "Assistant", null!));
        Assert.False((bool)converter.Convert(ChatRole.User, typeof(bool), "Assistant", null!));
    }

    [AvaloniaFact]
    public void ThreadCard_UsesBubbleOnlyForUserAndBorderlessBodyForCodex()
    {
        var card = new ThreadCardView();
        var messages = card.FindControl<ItemsControl>("MessagesList")!;
        messages.ItemsSource = new[]
        {
            new ChatMessage("user", ChatRole.User, "用户消息"),
            new ChatMessage("assistant", ChatRole.Assistant, "Codex 回复")
        };

        var window = new Window { Width = 900, Height = 700, Content = card };
        window.Show();
        try
        {
            var userItem = messages.ContainerFromIndex(0)!;
            var assistantItem = messages.ContainerFromIndex(1)!;

            Assert.True(FindNamed<Border>(userItem, "UserMessageBubble").IsVisible);
            Assert.False(FindNamed<StackPanel>(userItem, "AssistantMessageBody").IsVisible);
            Assert.False(FindNamed<Border>(assistantItem, "UserMessageBubble").IsVisible);
            Assert.True(FindNamed<StackPanel>(assistantItem, "AssistantMessageBody").IsVisible);
            Assert.Equal("Codex", FindNamed<TextBlock>(assistantItem, "CodexRoleLabel").Text);
        }
        finally
        {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void ThreadCard_MessagesUseNonSelectableDisplayContainers()
    {
        var card = new ThreadCardView();
        var messages = card.FindControl<ItemsControl>("MessagesList")!;
        messages.ItemsSource = new[]
        {
            new ChatMessage("assistant", ChatRole.Assistant, "Codex 回复")
        };

        var window = new Window { Width = 900, Height = 700, Content = card };
        window.Show();
        try
        {
            var container = messages.ContainerFromIndex(0)!;

            Assert.IsNotType<ListBox>(messages);
            Assert.Empty(messages.GetVisualDescendants().OfType<ListBoxItem>());
            Assert.DoesNotContain(
                container.GetVisualDescendants().OfType<ContentPresenter>(),
                presenter => presenter.Name == "PART_ContentPresenter");
        }
        finally
        {
            window.Close();
        }
    }

    private static T FindNamed<T>(Control root, string name)
        where T : Control =>
        root.GetVisualDescendants().OfType<T>().Single(control => control.Name == name);
}
