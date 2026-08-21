global using Avalonia;
global using Avalonia.Controls;
global using Avalonia.Headless;
global using Avalonia.Headless.XUnit;
global using Xunit;

[assembly: AvaloniaTestApplication(typeof(CodexThreadWorkbench.Program))]
[assembly: AvaloniaTestIsolation(AvaloniaTestIsolationLevel.PerAssembly)]
[assembly: CollectionBehavior(CollectionBehavior.CollectionPerAssembly, DisableTestParallelization = true)]
