using System.Collections.Specialized;
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
    private ThreadCardViewModel? _viewModel;

    public ThreadCardView()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
        DetachedFromVisualTree += OnDetachedFromVisualTree;
    }

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
            this.FindControl<ListBox>("MessagesList")?.ScrollIntoView(last));
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
}
