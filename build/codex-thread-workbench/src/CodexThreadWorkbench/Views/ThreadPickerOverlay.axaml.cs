using Avalonia.Controls;
using Avalonia.Markup.Xaml;

namespace CodexThreadWorkbench.Views;

public partial class ThreadPickerOverlay : UserControl
{
    public ThreadPickerOverlay() => InitializeComponent();

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);
}
