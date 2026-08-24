# Codex Chat Message Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make user messages appear as right-aligned pale-green bubbles while rendering Codex replies as wide, borderless text with a compact `Codex` role label.

**Architecture:** Keep the existing `ChatMessage`, message projection, streaming updates, and send flow unchanged. Replace the shared message border with two explicit visual branches selected by one role-visibility converter, so assistant content has no border container at all while user content retains a compact bubble.

**Tech Stack:** .NET 8, C# 12, Avalonia UI 11.3.18, xUnit, PowerShell packaging.

## Global Constraints

- User messages are right-aligned, use background `#E1F2EA`, retain rounded corners, and wrap at a maximum width of `560`.
- Codex messages are left-aligned, have no background or border container, include a small `Codex` role label, and use the available card width.
- Streaming and completed assistant messages use the same template.
- Do not change message protocol, projection, send behavior, approvals, error panels, card chrome, or input controls.
- Rebuild the Windows x64 package and refresh the fixed `outputs` executable and ZIP so the existing desktop shortcut picks up the change.

---

### Task 1: Add role-layout regression coverage

**Files:**
- Modify: `tests/CodexThreadWorkbench.Desktop.Tests/WorkspaceViewTests.cs`

**Interfaces:**
- Consumes: `ChatMessage`, `ChatRole`, `ThreadCardView`, and `ChatRoleVisibilityConverter`.
- Produces: view regressions proving that each message role exposes exactly one visible layout branch.

- [ ] **Step 1: Write the failing converter and realized-template tests**

Add imports for `Avalonia.VisualTree`, `CodexThreadWorkbench.Converters`, and `CodexThreadWorkbench.Models`, then add these tests:

```csharp
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
    var messages = card.FindControl<ListBox>("MessagesList")!;
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

private static T FindNamed<T>(Control root, string name)
    where T : Control =>
    root.GetVisualDescendants().OfType<T>().Single(control => control.Name == name);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj -c Debug --filter "WorkspaceViewTests"
```

Expected: compilation fails because `ChatRoleVisibilityConverter` and the named template branches do not exist.

- [ ] **Step 3: Commit the failing regression test**

```powershell
git add tests/CodexThreadWorkbench.Desktop.Tests/WorkspaceViewTests.cs
git commit -m "test: define codex-style message layout"
```

### Task 2: Implement separate user and Codex message layouts

**Files:**
- Modify: `src/CodexThreadWorkbench/Converters/ChatRoleConverters.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.axaml`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/WorkspaceViewTests.cs`

**Interfaces:**
- Consumes: `ChatRole` values from every existing `ChatMessage`.
- Produces: `ChatRoleVisibilityConverter.Convert(...)` returning `true` only when the message role matches the `User` or `Assistant` converter parameter.

- [ ] **Step 1: Replace obsolete role converters with the visibility converter**

Keep `StatusColorToBrushConverter` unchanged and replace the chat-role converter classes with:

```csharp
public sealed class ChatRoleVisibilityConverter : IValueConverter
{
    public object Convert(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        value is ChatRole role &&
        parameter is string requestedRole &&
        Enum.TryParse<ChatRole>(requestedRole, ignoreCase: true, out var parsedRole) &&
        role == parsedRole;

    public object ConvertBack(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        throw new NotSupportedException();
}
```

- [ ] **Step 2: Register the new application resource**

Replace the two obsolete converter resources with:

```xml
<converters:ChatRoleVisibilityConverter x:Key="ChatRoleVisibilityConverter" />
```

- [ ] **Step 3: Replace the shared message border with two explicit branches**

Use this `DataTemplate` body:

```xml
<Grid>
  <Border x:Name="UserMessageBubble"
          MaxWidth="560"
          Padding="10,7"
          HorizontalAlignment="Right"
          Background="#E1F2EA"
          CornerRadius="8"
          IsVisible="{Binding Role, Converter={StaticResource ChatRoleVisibilityConverter}, ConverterParameter=User}">
    <TextBlock FontSize="12"
               LineHeight="18"
               Text="{Binding Text}"
               TextWrapping="Wrap" />
  </Border>

  <StackPanel x:Name="AssistantMessageBody"
              Margin="5,3,10,6"
              HorizontalAlignment="Stretch"
              IsVisible="{Binding Role, Converter={StaticResource ChatRoleVisibilityConverter}, ConverterParameter=Assistant}">
    <TextBlock x:Name="CodexRoleLabel"
               Margin="0,0,0,4"
               Foreground="{StaticResource SecondaryTextBrush}"
               FontSize="10"
               FontWeight="SemiBold"
               Text="Codex" />
    <TextBlock FontSize="12"
               LineHeight="19"
               Text="{Binding Text}"
               TextWrapping="Wrap" />
  </StackPanel>
</Grid>
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
dotnet test tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj -c Debug --filter "WorkspaceViewTests"
```

Expected: all `WorkspaceViewTests` pass.

- [ ] **Step 5: Commit the implementation**

```powershell
git add src/CodexThreadWorkbench/Converters/ChatRoleConverters.cs src/CodexThreadWorkbench/App.axaml src/CodexThreadWorkbench/Views/ThreadCardView.axaml
git commit -m "feat: use codex-style conversation messages"
```

### Task 3: Verify and refresh the Windows desktop delivery

**Files:**
- Refresh: `../../outputs/CodexThreadWorkbench.exe`
- Refresh: `../../outputs/CodexThreadWorkbench-Windows-x64.zip`
- Preserve: `../../outputs/README.md`

**Interfaces:**
- Consumes: the verified Avalonia application and `scripts/Publish-Windows.ps1`.
- Produces: a self-contained Windows x64 executable and ZIP consumed by the existing desktop shortcut.

- [ ] **Step 1: Run the complete Debug suite**

```powershell
dotnet test CodexThreadWorkbench.sln -c Debug --no-restore
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the complete Release suite**

```powershell
dotnet test CodexThreadWorkbench.sln -c Release --no-restore
```

Expected: the same test count passes with zero failures.

- [ ] **Step 3: Publish the Windows package**

```powershell
powershell -NoProfile -File scripts/Publish-Windows.ps1 -Configuration Release
```

Expected: `artifacts/release/CodexThreadWorkbench-Windows-x64.zip` contains a non-empty `CodexThreadWorkbench.exe` and `README.md`.

- [ ] **Step 4: Refresh the fixed desktop artifacts**

```powershell
Copy-Item -LiteralPath artifacts/release/CodexThreadWorkbench-Windows-x64/CodexThreadWorkbench.exe -Destination ../../outputs/CodexThreadWorkbench.exe -Force
Copy-Item -LiteralPath artifacts/release/CodexThreadWorkbench-Windows-x64.zip -Destination ../../outputs/CodexThreadWorkbench-Windows-x64.zip -Force
Copy-Item -LiteralPath README.md -Destination ../../outputs/README.md -Force
```

Expected: the desktop shortcut remains valid because it targets the fixed `outputs/CodexThreadWorkbench.exe` path.

- [ ] **Step 5: Perform a Windows visual smoke check**

Launch `../../outputs/CodexThreadWorkbench.exe`, open a task containing both roles, and verify the user bubble is right-aligned and pale green while the Codex reply is wide, left-aligned, and has no surrounding background block.

- [ ] **Step 6: Check delivery integrity and commit**

```powershell
git diff --check
git status -sb
git add docs/superpowers/plans/2026-07-22-codex-chat-message-style.md
git commit -m "build: refresh codex thread workbench desktop package"
```

Expected: the corrected plan is committed, the external fixed deliverables are refreshed, and the working tree is clean.
