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
        Assert.NotNull(card.FindControl<ListBox>("MessagesList"));
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
}
