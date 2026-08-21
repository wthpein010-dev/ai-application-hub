using Avalonia.Controls.Presenters;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.VisualTree;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Converters;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Presentation;
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
    public void ThreadCard_ExposesTitleBarDragSurfaceWithoutRemovingConversationControls()
    {
        var card = new ThreadCardView();

        Assert.True(card.AllowDrop);
        Assert.NotNull(card.FindControl<Border>("CardShell"));
        Assert.NotNull(card.FindControl<Border>("DragSurface"));
        Assert.NotNull(card.FindControl<TextBlock>("DragGrip"));
        Assert.NotNull(card.FindControl<TextBox>("MessageInput"));
        Assert.NotNull(card.FindControl<Button>("SendButton"));
    }

    [AvaloniaFact]
    public void ThreadCard_DraggingAndDropTargetStatesUsePrimaryGreenVisualContract()
    {
        var card = new ThreadCardView();
        var window = new Window { Width = 900, Height = 700, Content = card };
        window.Show();
        try
        {
            Layout(card);
            var cardShell = card.FindControl<Border>("CardShell")!;
            var dragSurface = card.FindControl<Border>("DragSurface")!;
            var primary = Assert.IsAssignableFrom<ISolidColorBrush>(
                Application.Current!.Resources["PrimaryBrush"]);
            var restingShadow = cardShell.BoxShadow;

            cardShell.Classes.Add("dragging");
            Layout(card);

            Assert.Equal(
                primary.Color,
                Assert.IsAssignableFrom<ISolidColorBrush>(cardShell.BorderBrush).Color);
            Assert.NotEqual(restingShadow, cardShell.BoxShadow);

            cardShell.Classes.Remove("dragging");
            cardShell.Classes.Add("drop-target");
            Layout(card);

            Assert.Equal(new Thickness(2), cardShell.BorderThickness);
            Assert.Equal(
                primary.Color,
                Assert.IsAssignableFrom<ISolidColorBrush>(cardShell.BorderBrush).Color);
            Assert.Equal(
                Color.Parse("#E5F5EE"),
                Assert.IsAssignableFrom<ISolidColorBrush>(dragSurface.Background).Color);
        }
        finally
        {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task ThreadCard_SendAndStopButtons_ExecuteBoundCommandsWithoutArmingTitleDrag()
    {
        var client = new ObservableThreadClient();
        var summary = new ThreadSummary(
            "thread-ui",
            "UI integration",
            "Preview",
            "C:\\work",
            DateTimeOffset.UtcNow,
            ThreadStatusKind.Idle);
        var viewModel = new ThreadCardViewModel(
            client,
            new ThreadCardState(summary, [], ThreadStatusKind.Idle))
        {
            Draft = "start from the real button"
        };
        var card = new ThreadCardView { DataContext = viewModel };
        var window = new Window { Width = 900, Height = 700, Content = card };
        window.Show();
        try
        {
            Layout(card);
            var dragSurface = card.FindControl<Border>("DragSurface")!;
            var sendButton = card.FindControl<Button>("SendButton")!;
            var stopButton = card.GetVisualDescendants()
                .OfType<Button>()
                .Single(button => ReferenceEquals(button.Command, viewModel.StopCommand));

            Assert.DoesNotContain(sendButton, dragSurface.GetVisualDescendants());
            Assert.Contains(stopButton, dragSurface.GetVisualDescendants());

            Click(window, sendButton, card);
            await client.TurnStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));

            Assert.Equal(
                ["resume:thread-ui", "start:thread-ui:start from the real button"],
                client.Calls);
            Assert.Equal(ThreadStatusKind.Running, viewModel.Status);
            Assert.Equal("turn-ui", viewModel.ActiveTurnId);
            Assert.True(viewModel.IsRunning);
            Assert.Null(GetPrivateField<Point?>(card, "_dragStartPoint"));

            Layout(card);
            var stopPoint = CenterInWindow(stopButton, window);
            window.MouseDown(stopPoint, MouseButton.Left, RawInputModifiers.None);
            Assert.Null(GetPrivateField<Point?>(card, "_dragStartPoint"));
            window.MouseUp(stopPoint, MouseButton.Left, RawInputModifiers.None);
            await client.Interrupted.Task.WaitAsync(TimeSpan.FromSeconds(2));

            Assert.Equal(
                [
                    "resume:thread-ui",
                    "start:thread-ui:start from the real button",
                    "interrupt:thread-ui:turn-ui"
                ],
                client.Calls);
            Assert.Equal(ThreadStatusKind.Interrupted, viewModel.Status);
            Assert.Null(viewModel.ActiveTurnId);
            Assert.False(viewModel.IsRunning);
            Assert.Null(GetPrivateField<Point?>(card, "_dragStartPoint"));
        }
        finally
        {
            window.Close();
        }
    }

    [Fact]
    public void ThreadReorderRequestedEventArgs_ExposeLiteralThreadIds()
    {
        var args = new ThreadReorderRequestedEventArgs("thread-1", "thread-4");

        Assert.Equal("thread-1", args.SourceThreadId);
        Assert.Equal("thread-4", args.TargetThreadId);
    }

    [AvaloniaFact]
    public void ThreadCard_DragLeave_ClearsOnlyItsDropTargetVisual()
    {
        var card = new ThreadCardView();
        var cardShell = card.FindControl<Border>("CardShell")!;
        cardShell.Classes.Add("dragging");
        cardShell.Classes.Add("drop-target");

        card.RaiseEvent(new DragEventArgs(
            DragDrop.DragLeaveEvent,
            new DataTransfer(),
            card,
            new Point(),
            KeyModifiers.None));

        Assert.Contains("dragging", cardShell.Classes);
        Assert.DoesNotContain("drop-target", cardShell.Classes);
    }

    [AvaloniaFact]
    public void ThreadCard_PointerCaptureLost_ClearsSourceAndActiveTargetVisuals()
    {
        var client = new ObservableThreadClient();
        var source = CreateCard(client, "thread-source");
        var target = CreateCard(client, "thread-target");
        var panel = new StackPanel();
        panel.Children.Add(source);
        panel.Children.Add(target);
        var window = new Window { Width = 900, Height = 700, Content = panel };
        window.Show();
        try
        {
            Layout(panel);
            var sourceShell = source.FindControl<Border>("CardShell")!;
            var targetShell = target.FindControl<Border>("CardShell")!;
            var dragSurface = source.FindControl<Border>("DragSurface")!;
            SetPrivateField(source, "_dragStartPoint", new Point(4, 4));
            sourceShell.Classes.Add("dragging");
            RaiseDragEnter(target, "thread-source");
            Assert.Contains("drop-target", targetShell.Classes);

            dragSurface.RaiseEvent(new PointerCaptureLostEventArgs(
                dragSurface,
                new Pointer(1, PointerType.Mouse, isPrimary: true)));

            Assert.Null(GetPrivateField<Point?>(source, "_dragStartPoint"));
            Assert.DoesNotContain("dragging", sourceShell.Classes);
            Assert.DoesNotContain("drop-target", targetShell.Classes);
        }
        finally
        {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void ThreadCard_SourceCleanupClearsOnlyTheActiveTargetInItsWindow()
    {
        var client = new ObservableThreadClient();
        var sourceA = CreateCard(client, "source-a");
        var targetA = CreateCard(client, "target-a");
        var sourceB = CreateCard(client, "source-b");
        var targetB = CreateCard(client, "target-b");
        var panelA = new StackPanel();
        panelA.Children.Add(sourceA);
        panelA.Children.Add(targetA);
        var panelB = new StackPanel();
        panelB.Children.Add(sourceB);
        panelB.Children.Add(targetB);
        var windowA = new Window { Width = 900, Height = 700, Content = panelA };
        var windowB = new Window { Width = 900, Height = 700, Content = panelB };
        windowA.Show();
        windowB.Show();
        try
        {
            Layout(panelA);
            Layout(panelB);
            var sourceShellA = sourceA.FindControl<Border>("CardShell")!;
            var targetShellA = targetA.FindControl<Border>("CardShell")!;
            var targetShellB = targetB.FindControl<Border>("CardShell")!;
            sourceShellA.Classes.Add("dragging");
            RaiseDragEnter(targetA, "source-a");
            RaiseDragEnter(targetB, "source-b");
            Assert.Contains("drop-target", targetShellA.Classes);
            Assert.Contains("drop-target", targetShellB.Classes);

            InvokePrivate(sourceA, "ClearDragVisuals");

            Assert.DoesNotContain("dragging", sourceShellA.Classes);
            Assert.DoesNotContain("drop-target", targetShellA.Classes);
            Assert.Contains("drop-target", targetShellB.Classes);
        }
        finally
        {
            windowA.Close();
            windowB.Close();
        }
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

    private static void Click(Window window, Control control, ThreadCardView card)
    {
        var point = CenterInWindow(control, window);
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        Assert.Null(GetPrivateField<Point?>(card, "_dragStartPoint"));
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
    }

    private static Point CenterInWindow(Control control, Window window) =>
        control.TranslatePoint(
            new Point(control.Bounds.Width / 2, control.Bounds.Height / 2),
            window)!.Value;

    private static void Layout(Control control)
    {
        control.Measure(new Size(900, 700));
        control.Arrange(new Rect(0, 0, 900, 700));
    }

    private static ThreadCardView CreateCard(
        ICodexThreadClient client,
        string threadId)
    {
        var summary = new ThreadSummary(
            threadId,
            threadId,
            "Preview",
            "C:\\work",
            DateTimeOffset.UtcNow,
            ThreadStatusKind.Idle);
        return new ThreadCardView
        {
            DataContext = new ThreadCardViewModel(
                client,
                new ThreadCardState(summary, [], ThreadStatusKind.Idle))
        };
    }

    private static void RaiseDragEnter(ThreadCardView target, string sourceThreadId)
    {
        var format = Assert.IsType<DataFormat<string>>(
            typeof(ThreadCardView)
                .GetField(
                    "ThreadIdDataFormat",
                    System.Reflection.BindingFlags.Static |
                    System.Reflection.BindingFlags.NonPublic)!
                .GetValue(null));
        var transfer = new DataTransfer();
        transfer.Add(DataTransferItem.Create(format, sourceThreadId));
        target.RaiseEvent(new DragEventArgs(
            DragDrop.DragEnterEvent,
            transfer,
            target,
            new Point(),
            KeyModifiers.None));
    }

    private static void InvokePrivate(object target, string methodName) =>
        target.GetType()
            .GetMethod(
                methodName,
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.NonPublic)!
            .Invoke(target, null);

    private static T? GetPrivateField<T>(object target, string fieldName) =>
        (T?)target.GetType()
            .GetField(fieldName, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
            .GetValue(target);

    private static void SetPrivateField<T>(object target, string fieldName, T value) =>
        target.GetType()
            .GetField(fieldName, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
            .SetValue(target, value);

    private sealed class ObservableThreadClient : ICodexThreadClient
    {
        public event Action<CodexNotification>? NotificationReceived
        {
            add { }
            remove { }
        }

        public event Action<CodexApprovalRequest>? ApprovalRequested
        {
            add { }
            remove { }
        }

        public bool IsConnected => true;

        public List<string> Calls { get; } = [];

        public TaskCompletionSource TurnStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Interrupted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task InitializeAsync(CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
            int limit = 100,
            string? searchTerm = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ThreadSummary>>([]);

        public Task<ThreadCardState> ReadThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task ResumeThreadAsync(
            string threadId,
            CancellationToken cancellationToken = default)
        {
            Calls.Add($"resume:{threadId}");
            return Task.CompletedTask;
        }

        public Task<string> StartTurnAsync(
            string threadId,
            string text,
            CancellationToken cancellationToken = default)
        {
            Calls.Add($"start:{threadId}:{text}");
            TurnStarted.TrySetResult();
            return Task.FromResult("turn-ui");
        }

        public Task SteerTurnAsync(
            string threadId,
            string expectedTurnId,
            string text,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task InterruptTurnAsync(
            string threadId,
            string turnId,
            CancellationToken cancellationToken = default)
        {
            Calls.Add($"interrupt:{threadId}:{turnId}");
            Interrupted.TrySetResult();
            return Task.CompletedTask;
        }

        public Task RespondToApprovalAsync(
            CodexApprovalRequest request,
            bool accept,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
