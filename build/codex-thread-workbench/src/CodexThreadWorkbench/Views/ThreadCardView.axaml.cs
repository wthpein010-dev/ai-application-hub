using System.Collections.Specialized;
using System.Runtime.CompilerServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Avalonia.VisualTree;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Views;

public partial class ThreadCardView : UserControl
{
    private const double DragThresholdPixels = 6;
    private static readonly DataFormat<string> ThreadIdDataFormat =
        DataFormat.CreateStringApplicationFormat("codex-thread-workbench.thread-id");
    private static readonly ConditionalWeakTable<TopLevel, ActiveDropTargetState>
        ActiveDropTargets = new();

    private ThreadCardViewModel? _viewModel;
    private Point? _dragStartPoint;
    private bool _dragInProgress;
    private WeakReference<TopLevel>? _dragVisualRoot;
    private WeakReference<TopLevel>? _dropTargetVisualRoot;

    public ThreadCardView()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
        DetachedFromVisualTree += OnDetachedFromVisualTree;
    }

    public bool AllowDrop
    {
        get => DragDrop.GetAllowDrop(this);
        set => DragDrop.SetAllowDrop(this, value);
    }

    public event EventHandler<ThreadReorderRequestedEventArgs>? ReorderRequested;

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void OnDataContextChanged(object? sender, EventArgs e)
    {
        Detach();
        _viewModel = DataContext as ThreadCardViewModel;
        if (_viewModel is not null)
        {
            _viewModel.Messages.CollectionChanged += MessagesOnCollectionChanged;
        }
    }

    private void OnDetachedFromVisualTree(object? sender, VisualTreeAttachmentEventArgs e) =>
        Detach();

    private void Detach()
    {
        _dragStartPoint = null;
        if (_dragInProgress ||
            _dragVisualRoot is not null ||
            HasCardClass("dragging"))
        {
            ClearDragVisuals();
        }
        else
        {
            ClearDropTargetVisual();
        }

        if (_viewModel is null)
        {
            return;
        }

        _viewModel.Messages.CollectionChanged -= MessagesOnCollectionChanged;
        _viewModel = null;
    }

    private void MessagesOnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (_viewModel?.Messages.LastOrDefault() is not { } last)
        {
            return;
        }

        Dispatcher.UIThread.Post(() =>
            this.FindControl<ScrollViewer>("MessagesScroller")?.ScrollToEnd());
    }

    private void MessageInput_OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || e.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            return;
        }

        if (_viewModel?.SendCommand.CanExecute(null) == true)
        {
            _viewModel.SendCommand.Execute(null);
        }

        e.Handled = true;
    }

    private void DragSurface_OnPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (_dragInProgress ||
            !e.GetCurrentPoint(this).Properties.IsLeftButtonPressed ||
            IsButtonDescendant(e.Source) ||
            string.IsNullOrWhiteSpace(_viewModel?.ThreadId))
        {
            return;
        }

        _dragStartPoint = e.GetPosition(this);
        if (sender is IInputElement inputElement)
        {
            e.Pointer.Capture(inputElement);
        }
    }

    private async void DragSurface_OnPointerMoved(object? sender, PointerEventArgs e)
    {
        if (_dragInProgress ||
            _dragStartPoint is not { } dragStartPoint ||
            string.IsNullOrWhiteSpace(_viewModel?.ThreadId))
        {
            return;
        }

        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            CancelArmedDrag();
            return;
        }

        var currentPoint = e.GetPosition(this);
        var horizontalDistance = currentPoint.X - dragStartPoint.X;
        var verticalDistance = currentPoint.Y - dragStartPoint.Y;
        if (Math.Sqrt(horizontalDistance * horizontalDistance + verticalDistance * verticalDistance) < DragThresholdPixels)
        {
            return;
        }

        _dragStartPoint = null;
        e.Pointer.Capture(null);
        await StartDragAsync(e, _viewModel.ThreadId);
    }

    private void DragSurface_OnPointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        CancelArmedDrag();
        ClearDragVisuals();
        if (e.Pointer.Captured == sender)
        {
            e.Pointer.Capture(null);
        }
    }

    private void DragSurface_OnPointerCaptureLost(object? sender, PointerCaptureLostEventArgs e)
    {
        CancelArmedDrag();
        ClearDragVisuals();
    }

    private async Task StartDragAsync(PointerEventArgs triggerEvent, string sourceThreadId)
    {
        _dragInProgress = true;
        if (TopLevel.GetTopLevel(this) is { } root)
        {
            _dragVisualRoot = new WeakReference<TopLevel>(root);
        }

        try
        {
            SetCardClass("dragging", true);

            var dataTransfer = new DataTransfer();
            dataTransfer.Add(DataTransferItem.Create(ThreadIdDataFormat, sourceThreadId));
            await DragDrop.DoDragDropAsync(triggerEvent, dataTransfer, DragDropEffects.Move);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            CancelArmedDrag();
            ClearDragVisuals();
            _dragInProgress = false;
        }
    }

    private void ThreadCard_OnDragEnter(object? sender, DragEventArgs e) =>
        UpdateDropTarget(e);

    private void ThreadCard_OnDragOver(object? sender, DragEventArgs e) =>
        UpdateDropTarget(e);

    private void ThreadCard_OnDragLeave(object? sender, DragEventArgs e)
    {
        try
        {
            e.DragEffects = DragDropEffects.None;
        }
        finally
        {
            ClearDropTargetVisual();
        }
    }

    private void ThreadCard_OnDrop(object? sender, DragEventArgs e)
    {
        try
        {
            if (!TryGetReorderThreadIds(e, out var sourceThreadId, out var targetThreadId))
            {
                e.DragEffects = DragDropEffects.None;
                return;
            }

            e.DragEffects = DragDropEffects.Move;
            ReorderRequested?.Invoke(this, new ThreadReorderRequestedEventArgs(sourceThreadId, targetThreadId));
            e.Handled = true;
        }
        finally
        {
            ClearDropTargetVisual();
        }
    }

    private void UpdateDropTarget(DragEventArgs e)
    {
        if (TryGetReorderThreadIds(e, out _, out _))
        {
            e.DragEffects = DragDropEffects.Move;
            SetDropTargetVisual();
            return;
        }

        e.DragEffects = DragDropEffects.None;
        ClearDropTargetVisual();
    }

    private bool TryGetReorderThreadIds(
        DragEventArgs e,
        out string sourceThreadId,
        out string targetThreadId)
    {
        sourceThreadId = e.DataTransfer.TryGetValue(ThreadIdDataFormat) ?? string.Empty;
        targetThreadId = _viewModel?.ThreadId ?? string.Empty;

        return !string.IsNullOrWhiteSpace(sourceThreadId) &&
               !string.IsNullOrWhiteSpace(targetThreadId) &&
               !string.Equals(sourceThreadId, targetThreadId, StringComparison.Ordinal);
    }

    private static bool IsButtonDescendant(object? source) =>
        source is Button ||
        source is Visual visual && visual.FindAncestorOfType<Button>() is not null;

    private void ClearDragVisuals()
    {
        var dragRoot = TryGetRoot(_dragVisualRoot) ?? TopLevel.GetTopLevel(this);
        SetCardClass("dragging", false);
        ClearDropTargetVisual();
        if (dragRoot is not null && ActiveDropTargets.TryGetValue(dragRoot, out var state))
        {
            state.Clear();
        }

        _dragVisualRoot = null;
    }

    private void SetDropTargetVisual()
    {
        if (TopLevel.GetTopLevel(this) is not { } root)
        {
            SetCardClass("drop-target", true);
            return;
        }

        _dropTargetVisualRoot = new WeakReference<TopLevel>(root);
        ActiveDropTargets.GetValue(root, _ => new ActiveDropTargetState())
            .Set(this);
    }

    private void ClearDropTargetVisual()
    {
        var root = TryGetRoot(_dropTargetVisualRoot) ?? TopLevel.GetTopLevel(this);
        if (root is not null && ActiveDropTargets.TryGetValue(root, out var state))
        {
            state.Clear(this);
        }
        else
        {
            SetCardClass("drop-target", false);
        }

        _dropTargetVisualRoot = null;
    }

    private void CancelArmedDrag() =>
        _dragStartPoint = null;

    private void SetCardClass(string className, bool enabled)
    {
        var cardShell = this.FindControl<Border>("CardShell");
        if (cardShell is null)
        {
            return;
        }

        if (enabled)
        {
            cardShell.Classes.Add(className);
            return;
        }

        cardShell.Classes.Remove(className);
    }

    private bool HasCardClass(string className) =>
        this.FindControl<Border>("CardShell")?.Classes.Contains(className) == true;

    private static TopLevel? TryGetRoot(WeakReference<TopLevel>? reference) =>
        reference is not null && reference.TryGetTarget(out var root)
            ? root
            : null;

    private sealed class ActiveDropTargetState
    {
        private WeakReference<ThreadCardView>? _target;

        public void Set(ThreadCardView target)
        {
            if (_target is not null &&
                _target.TryGetTarget(out var previous) &&
                !ReferenceEquals(previous, target))
            {
                previous.SetCardClass("drop-target", false);
                previous._dropTargetVisualRoot = null;
            }

            _target = new WeakReference<ThreadCardView>(target);
            target.SetCardClass("drop-target", true);
        }

        public void Clear(ThreadCardView? expectedTarget = null)
        {
            if (_target is null || !_target.TryGetTarget(out var target))
            {
                _target = null;
                expectedTarget?.SetCardClass("drop-target", false);
                return;
            }

            if (expectedTarget is not null && !ReferenceEquals(target, expectedTarget))
            {
                expectedTarget.SetCardClass("drop-target", false);
                return;
            }

            target.SetCardClass("drop-target", false);
            target._dropTargetVisualRoot = null;
            _target = null;
        }
    }
}
