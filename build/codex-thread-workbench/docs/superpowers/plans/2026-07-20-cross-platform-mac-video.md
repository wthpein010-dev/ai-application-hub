# CodexThreadWorkbench Cross-Platform Mac and Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Windows-only WPF shell with one Avalonia desktop application, publish verified Windows/macOS packages, and add the missing video and Mac download experiences to AI Application Hub.

**Architecture:** Move protocol, state, persistence, and presentation logic into a UI-independent `net8.0` Core project. A single Avalonia 11.3.18 Desktop project renders the existing direct multi-thread workspace for `win-x64`, `osx-x64`, and `osx-arm64`; Hub owns the public media and verified sharded downloads.

**Tech Stack:** .NET 8, C# 12, Avalonia 11.3.18, xUnit, Avalonia.Headless.XUnit, PowerShell, GitHub Actions macOS runners, Node.js static tests, FFmpeg, GitHub Pages

## Global Constraints

- Preserve the direct 1–6 task conversation grid; do not add a dashboard, permanent sidebar, or aggregate statistics.
- Preserve direct send, steer, stop, approval, close-card, desktop/fullscreen, and safe repeatable shutdown behavior.
- Do not read or persist Codex credentials or chat text.
- Keep `CodexThreadWorkbench-Windows-x64.zip` as the Windows filename.
- Publish `CodexThreadWorkbench-macOS-arm64.app.zip` and `CodexThreadWorkbench-macOS-x64.app.zip` only after matching-architecture macOS smoke tests pass.
- Target macOS 13+; use ad-hoc signing and explicitly state that the first release is not notarized.
- Keep video at 60–90 seconds, H.264, 16:9, with non-overlapping one-line Chinese WebVTT cues.
- Use at most 8 MiB per Pages download part, three attempts per part, per-part SHA-256, and final length/SHA-256 verification.
- Never force-push or overwrite unrelated Hub changes; activate links only after every public dependency is available.

---

### Task 1: Extract the platform-neutral Core project

**Files:**
- Create: `src/CodexThreadWorkbench.Core/CodexThreadWorkbench.Core.csproj`
- Move: `src/CodexThreadWorkbench/{Codex,Infrastructure,Models,Persistence,Presentation}/**` to `src/CodexThreadWorkbench.Core/**`
- Modify: `tests/CodexThreadWorkbench.Tests/CodexThreadWorkbench.Tests.csproj`
- Modify: `CodexThreadWorkbench.sln`
- Modify: `tests/CodexThreadWorkbench.Tests/Infrastructure/CodexProcessLocatorTests.cs`
- Modify: `src/CodexThreadWorkbench.Core/Infrastructure/CodexProcessLocator.cs`
- Modify: `src/CodexThreadWorkbench.Core/Codex/CodexAppServerClient.cs`

**Interfaces:**
- Produces: `ICodexProcessLocator.Find() -> string`
- Produces: `CodexProcessLocator(bool isWindows, string? path, string userProfile, Func<string,bool> exists)`
- Produces: the existing `ICodexThreadClient`, `MainViewModel`, and `ThreadCardViewModel` from a plain `net8.0` assembly

- [ ] **Step 1: Add failing Windows/macOS locator tests**

```csharp
[Theory]
[InlineData(true, "codex.exe")]
[InlineData(false, "codex")]
public void Find_UsesPlatformExecutableName(bool isWindows, string executable)
{
    var expected = Path.Combine("tools", executable);
    var locator = new CodexProcessLocator(isWindows, "tools", "/Users/test", p => p == expected);
    Assert.Equal(expected, locator.Find());
}

[Fact]
public void Find_OnMac_DoesNotOfferWindowsSandboxPath()
{
    var locator = new CodexProcessLocator(false, "", "/Users/test", _ => false);
    var error = Assert.Throws<FileNotFoundException>(() => locator.Find());
    Assert.DoesNotContain("codex.exe", error.Message, StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 2: Run the locator tests and verify RED**

Run: `dotnet test tests/CodexThreadWorkbench.Tests --filter CodexProcessLocatorTests`

Expected: FAIL because the instance constructor and `ICodexProcessLocator` do not exist.

- [ ] **Step 3: Create Core and implement the locator boundary**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
```

```csharp
public interface ICodexProcessLocator { string Find(); }

public sealed class CodexProcessLocator : ICodexProcessLocator
{
    public string Find() => EnumerateCandidates().FirstOrDefault(_exists)
        ?? throw new FileNotFoundException(_isWindows
            ? "未找到 Codex CLI（codex.exe）。"
            : "未找到 Codex CLI（codex）。");
}
```

Change `CodexAppServerClient.ConnectAsync` to accept an optional `ICodexProcessLocator` and use `locator.Find()` before starting the existing argument-list transport.

- [ ] **Step 4: Retarget tests to `net8.0`, move Core files, and run all 35 tests**

Run: `dotnet test tests/CodexThreadWorkbench.Tests -c Debug`

Expected: all existing 35 tests plus the new locator cases pass on plain `net8.0`.

- [ ] **Step 5: Commit the extraction**

```powershell
git add CodexThreadWorkbench.sln src/CodexThreadWorkbench.Core tests/CodexThreadWorkbench.Tests src/CodexThreadWorkbench
git commit -m "refactor: extract cross-platform workbench core"
```

### Task 2: Scaffold the Avalonia Desktop shell and headless tests

**Files:**
- Modify: `src/CodexThreadWorkbench/CodexThreadWorkbench.csproj`
- Replace: `src/CodexThreadWorkbench/App.xaml` with `App.axaml`
- Replace: `src/CodexThreadWorkbench/App.xaml.cs`
- Create: `src/CodexThreadWorkbench/Program.cs`
- Delete: `src/CodexThreadWorkbench/AssemblyInfo.cs`
- Create: `tests/CodexThreadWorkbench.Desktop.Tests/CodexThreadWorkbench.Desktop.Tests.csproj`
- Create: `tests/CodexThreadWorkbench.Desktop.Tests/AppFixture.cs`
- Modify: `CodexThreadWorkbench.sln`

**Interfaces:**
- Consumes: `CodexAppServerClient.ConnectAsync(ICodexProcessLocator?, CancellationToken)` and `MainViewModel`
- Produces: `Program.BuildAvaloniaApp() -> AppBuilder`
- Produces: one Avalonia application assembly for all three runtime identifiers

- [ ] **Step 1: Write a failing headless application-load test**

```csharp
[AvaloniaFact]
public void App_LoadsSharedResources()
{
    var app = Assert.IsType<App>(Application.Current);
    Assert.True(app.Resources.ContainsKey("PrimaryBrush"));
    Assert.True(app.Resources.ContainsKey("CardBackgroundBrush"));
}
```

- [ ] **Step 2: Run the headless test and verify RED**

Run: `dotnet test tests/CodexThreadWorkbench.Desktop.Tests --filter App_LoadsSharedResources`

Expected: FAIL because the Avalonia application and test project do not exist.

- [ ] **Step 3: Convert the desktop project to Avalonia 11.3.18**

```xml
<PackageReference Include="Avalonia" Version="11.3.18" />
<PackageReference Include="Avalonia.Desktop" Version="11.3.18" />
<PackageReference Include="Avalonia.Themes.Fluent" Version="11.3.18" />
<PackageReference Include="Avalonia.Fonts.Inter" Version="11.3.18" />
<ProjectReference Include="..\CodexThreadWorkbench.Core\CodexThreadWorkbench.Core.csproj" />
```

```csharp
public static AppBuilder BuildAvaloniaApp() =>
    AppBuilder.Configure<App>()
        .UsePlatformDetect()
        .WithInterFont()
        .LogToTrace();
```

Use Avalonia styles and Inter plus the platform CJK fallback list so Simplified Chinese renders completely on Windows and macOS.

- [ ] **Step 4: Add Avalonia.Headless.XUnit 11.3.18 and verify GREEN**

Run: `dotnet test tests/CodexThreadWorkbench.Desktop.Tests`

Expected: PASS and resource keys resolve.

- [ ] **Step 5: Commit the shell**

```powershell
git add CodexThreadWorkbench.sln src/CodexThreadWorkbench tests/CodexThreadWorkbench.Desktop.Tests
git commit -m "feat: scaffold Avalonia desktop shell"
```

### Task 3: Migrate the direct multi-task UI to AXAML

**Files:**
- Replace: `src/CodexThreadWorkbench/MainWindow.xaml` with `MainWindow.axaml`
- Modify: `src/CodexThreadWorkbench/MainWindow.xaml.cs`
- Replace: `src/CodexThreadWorkbench/Views/ThreadCardView.xaml` with `ThreadCardView.axaml`
- Modify: `src/CodexThreadWorkbench/Views/ThreadCardView.xaml.cs`
- Replace: `src/CodexThreadWorkbench/Views/ThreadPickerOverlay.xaml` with `ThreadPickerOverlay.axaml`
- Modify: `src/CodexThreadWorkbench/Views/ThreadPickerOverlay.xaml.cs`
- Create: `src/CodexThreadWorkbench/Converters/ChatRoleConverters.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/MainWindowTests.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/ThreadCardViewTests.cs`

**Interfaces:**
- Consumes: existing `MainViewModel.OpenThreads`, `GridRows`, `GridColumns`, and commands
- Produces: controls named `ThreadGrid`, `MessageInput`, `MessagesList`, `PickerOverlay`, and `StatusLabel`

- [ ] **Step 1: Write failing control-tree and keyboard tests**

```csharp
[AvaloniaFact]
public void MainWindow_ContainsDirectWorkspaceControls()
{
    var window = new MainWindow();
    Assert.NotNull(window.FindControl<ItemsControl>("ThreadGrid"));
    Assert.NotNull(window.FindControl<ThreadPickerOverlay>("PickerOverlay"));
}

[AvaloniaFact]
public void ThreadCard_ExposesInlineMessageInput()
{
    var card = new ThreadCardView();
    Assert.NotNull(card.FindControl<TextBox>("MessageInput"));
    Assert.NotNull(card.FindControl<Button>("SendButton"));
}
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `dotnet test tests/CodexThreadWorkbench.Desktop.Tests --filter "MainWindow|ThreadCard"`

Expected: FAIL because the WPF XAML cannot load in Avalonia.

- [ ] **Step 3: Port the views without adding navigation or statistics**

Use Avalonia `IsVisible` bindings instead of WPF visibility triggers, `UniformGrid` for 1–3 columns, one `ThreadCardView` per task, and the existing toolbar actions. Bind chat bubble alignment/background through converters; preserve title, working directory, state text, messages, approvals, error panel, input, send, stop, minimize, and close.

- [ ] **Step 4: Port direct input and auto-scroll behavior**

```csharp
private void MessageInput_OnKeyDown(object? sender, KeyEventArgs e)
{
    if (e.Key != Key.Enter || e.KeyModifiers.HasFlag(KeyModifiers.Shift)) return;
    if (_viewModel?.SendCommand.CanExecute(null) == true) _viewModel.SendCommand.Execute(null);
    e.Handled = true;
}
```

Use `Dispatcher.UIThread.Post(() => MessagesList.ScrollIntoView(last))` for streamed content.

- [ ] **Step 5: Run Core and Desktop suites and commit**

Run: `dotnet test -c Debug`

Expected: every Core and headless UI test passes.

```powershell
git add src/CodexThreadWorkbench tests/CodexThreadWorkbench.Desktop.Tests
git commit -m "feat: migrate workbench UI to Avalonia"
```

### Task 4: Implement cross-platform window lifecycle and deterministic smoke mode

**Files:**
- Modify: `src/CodexThreadWorkbench/MainWindow.axaml.cs`
- Modify: `src/CodexThreadWorkbench/App.axaml.cs`
- Modify: `src/CodexThreadWorkbench/Program.cs`
- Create: `src/CodexThreadWorkbench/SmokeTestRunner.cs`
- Test: `tests/CodexThreadWorkbench.Desktop.Tests/WindowLifecycleTests.cs`
- Test: `tests/CodexThreadWorkbench.Tests/Presentation/MainViewModelTests.cs`

**Interfaces:**
- Produces: `SmokeTestRunner.RunAsync(string[] args, CancellationToken) -> Task<int>`
- Produces: `Program.Main` exit code 0 only after `initialize` and `thread/list` succeed in `--smoke-test` mode

- [ ] **Step 1: Add failing repeated-close and smoke-runner tests**

```csharp
[Fact]
public async Task DisposeAsync_CalledTwice_WaitsForOneSharedShutdown()
{
    var vm = CreateViewModel();
    await Task.WhenAll(vm.DisposeAsync().AsTask(), vm.DisposeAsync().AsTask());
    Assert.Equal(1, Client.DisposeCalls);
}
```

```csharp
[Fact]
public async Task SmokeTest_InitializesAndListsThreads()
{
    var fake = new FakeCodexThreadClient();
    Assert.Equal(0, await SmokeTestRunner.RunAsync(fake, CancellationToken.None));
    Assert.Equal(1, fake.ListCalls);
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `dotnet test --filter "RepeatedClose|SmokeTest"`

Expected: FAIL until a shared shutdown task and smoke runner exist.

- [ ] **Step 3: Implement Avalonia fullscreen/bounds and shared close task**

Map `MainViewModel.IsFullScreen` to `WindowState.FullScreen`; restore `PixelPoint Position`, width, and height when returning to desktop mode. The closing handler cancels once, disables the window, awaits one cached shutdown task, then closes without recursively disposing.

- [ ] **Step 4: Implement `--smoke-test` before Avalonia initialization**

```csharp
if (args.Contains("--smoke-test", StringComparer.Ordinal))
    return SmokeTestRunner.RunAsync(args, CancellationToken.None).GetAwaiter().GetResult();
```

The runner locates Codex, starts app-server, initializes, calls `ListThreadsAsync(1)`, disposes, and returns 0. It prints no thread content or credential data.

- [ ] **Step 5: Verify tests and commit**

Run: `dotnet test -c Release`

Expected: all suites pass with no shutdown hang.

```powershell
git add src tests
git commit -m "feat: add cross-platform lifecycle and smoke checks"
```

### Task 5: Add Windows and macOS packaging with package-structure tests

**Files:**
- Modify: `scripts/Publish-Windows.ps1`
- Create: `scripts/publish-macos.sh`
- Create: `scripts/Test-Package.ps1`
- Create: `scripts/test-macos-package.sh`
- Create: `.github/workflows/build-cross-platform.yml`
- Modify: `README.md`
- Test: `tests/CodexThreadWorkbench.Tests/Packaging/PackagingScriptTests.cs`

**Interfaces:**
- Produces: `artifacts/release/CodexThreadWorkbench-Windows-x64.zip`
- Produces: `artifacts/release/CodexThreadWorkbench-macOS-{arm64|x64}.app.zip`

- [ ] **Step 1: Write failing static package-script tests**

```csharp
[Theory]
[InlineData("osx-arm64", "CodexThreadWorkbench-macOS-arm64.app.zip")]
[InlineData("osx-x64", "CodexThreadWorkbench-macOS-x64.app.zip")]
public void MacScript_MapsRuntimeToExactArchiveName(string rid, string name)
{
    var script = File.ReadAllText(Repo("scripts/publish-macos.sh"));
    Assert.Contains(rid, script);
    Assert.Contains(name, script);
    Assert.Contains("codesign --force --deep --sign -", script);
}
```

- [ ] **Step 2: Run and verify RED**

Run: `dotnet test --filter PackagingScriptTests`

Expected: FAIL because macOS packaging files do not exist.

- [ ] **Step 3: Implement deterministic packaging**

`publish-macos.sh` publishes self-contained, creates `Contents/MacOS`, `Contents/Resources`, and `Info.plist` with `LSMinimumSystemVersion=13.0`, applies ad-hoc signing, and zips with `ditto -c -k --sequesterRsrc --keepParent`.

`test-macos-package.sh` unzips the final artifact, checks `file` for the expected CPU, runs `codesign --verify --deep --strict`, executes `Contents/MacOS/CodexThreadWorkbench --smoke-test`, launches the app process, confirms it remains alive for five seconds, then terminates it.

- [ ] **Step 4: Add matching-architecture GitHub Actions jobs**

Use `macos-15-intel` for `osx-x64` and `macos-14` for `osx-arm64`. Each job runs Release tests, packages, tests the final ZIP, calculates SHA-256, and uploads the artifact. A Windows job repeats Debug/Release tests and Windows package validation.

- [ ] **Step 5: Run local static tests and Windows packaging**

Run: `dotnet test -c Release` then `powershell -File scripts/Publish-Windows.ps1`

Expected: all tests pass and the new Avalonia Windows ZIP contains the executable and README.

- [ ] **Step 6: Commit packaging**

```powershell
git add scripts .github README.md tests
git commit -m "build: package workbench for Windows and macOS"
```

### Task 6: Create the Hub video page and validated media

**Files (Hub repository):**
- Create: `projects/codex-thread-workbench/video/index.html`
- Create: `projects/codex-thread-workbench/video/poster.jpg`
- Create: `projects/codex-thread-workbench/video/codex-thread-workbench-demo.mp4`
- Create: `projects/codex-thread-workbench/video/codex-thread-workbench-demo.vtt`
- Create: `projects/codex-thread-workbench/video/tutorial-script.md`
- Create: `scripts/render-codex-thread-workbench-video.mjs`
- Create: `tests/codex-thread-workbench-video.test.mjs`

**Interfaces:**
- Produces: relative video page `./projects/codex-thread-workbench/video/index.html`
- Produces: 1280×720 H.264 MP4 and non-overlapping single-line Chinese WebVTT

- [ ] **Step 1: Write failing video-page and media tests**

```javascript
test("Workbench video page lazy-loads validated media", () => {
  const html = readFileSync(join(videoRoot, "index.html"), "utf8");
  assert.match(html, /data-src="\.\/codex-thread-workbench-demo\.mp4"/);
  assert.match(html, /kind="captions"[^>]+default/);
  assert.match(html, /返回主页/);
});

test("captions are ordered, non-overlapping, and single-line", () => {
  const cues = parseVtt(readFileSync(vttPath, "utf8"));
  cues.forEach((cue, i) => {
    assert.equal(cue.text.includes("\\n"), false);
    if (i) assert.ok(cues[i - 1].end <= cue.start);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/codex-thread-workbench-video.test.mjs`

Expected: FAIL because the video page and media are absent.

- [ ] **Step 3: Render anonymized 60–90 second walkthrough media**

Use only synthetic task titles and messages. Render the approved six chapters at 1280×720 with a single active caption line and encode with `libx264 -pix_fmt yuv420p -movflags +faststart`. Generate a matching poster from the first clean overview frame.

- [ ] **Step 4: Build the unified lazy-load page and verify media**

Run: `$env:FFMPEG_PATH=(node -e "process.stdout.write(require('ffmpeg-static'))"); node --test tests/codex-thread-workbench-video.test.mjs`

Expected: PASS; duration is 60–90 seconds, codec is H.264, aspect is 16:9, and all captions are one line.

- [ ] **Step 5: Commit the video**

```powershell
git add projects/codex-thread-workbench/video scripts/render-codex-thread-workbench-video.mjs tests/codex-thread-workbench-video.test.mjs
git commit -m "feat: add workbench walkthrough video"
```

### Task 7: Add the dual-architecture Mac download experience

**Files (Hub repository):**
- Create: `projects/codex-thread-workbench/download/mac/index.html`
- Create: `projects/codex-thread-workbench/download/mac/styles.css`
- Create: `projects/codex-thread-workbench/download/mac/download.js`
- Create: `projects/codex-thread-workbench/download/mac/manifests/arm64.json`
- Create: `projects/codex-thread-workbench/download/mac/manifests/x64.json`
- Reuse: `projects/codex-thread-workbench/download/download-core.js`
- Modify: `scripts/split-codex-thread-workbench.mjs`
- Create: `tests/codex-thread-workbench-mac-download.test.mjs`

**Interfaces:**
- Produces: `downloadArchitecture("arm64" | "x64")`
- Consumes: per-architecture manifests with `fileName`, `totalSize`, `sha256`, and ordered `parts`

- [ ] **Step 1: Write failing dual-manifest/download tests**

```javascript
test("Mac page offers real Apple Silicon and Intel downloads", async () => {
  const html = await read("../projects/codex-thread-workbench/download/mac/index.html");
  assert.match(html, /Apple Silicon/);
  assert.match(html, /Intel/);
  assert.match(html, /macOS 13/);
  assert.match(html, /未经过 Apple 公证/);
});

test("both manifests use ordered <= 8 MiB parts", async () => {
  for (const arch of ["arm64", "x64"]) {
    const manifest = JSON.parse(await read(`../projects/codex-thread-workbench/download/mac/manifests/${arch}.json`));
    manifest.parts.forEach((part, index) => {
      assert.equal(part.index, index);
      assert.ok(part.size <= 8 * 1024 * 1024);
    });
  }
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/codex-thread-workbench-mac-download.test.mjs`

Expected: FAIL because the Mac download page and manifests are absent.

- [ ] **Step 3: Implement architecture selection and reuse verified reconstruction**

Load only the selected manifest, call the shared three-attempt fetch/reconstruct path, update progress/status per architecture, and trigger save only after final SHA-256 and byte count match.

- [ ] **Step 4: Extend the splitter for exact Mac names**

Run:

```powershell
node scripts/split-codex-thread-workbench.mjs --input artifacts/release/CodexThreadWorkbench-macOS-arm64.app.zip --output projects/codex-thread-workbench/download/mac/arm64 --manifest projects/codex-thread-workbench/download/mac/manifests/arm64.json
node scripts/split-codex-thread-workbench.mjs --input artifacts/release/CodexThreadWorkbench-macOS-x64.app.zip --output projects/codex-thread-workbench/download/mac/x64 --manifest projects/codex-thread-workbench/download/mac/manifests/x64.json
```

The script rejects any input basename other than the two approved Mac filenames.

- [ ] **Step 5: Verify tests and commit infrastructure without activating links**

Run: `node --test tests/codex-thread-workbench-mac-download.test.mjs tests/codex-thread-workbench-download.test.mjs`

Expected: tests for layout/retry logic pass; manifest artifact assertions remain gated until real packages exist.

```powershell
git add projects/codex-thread-workbench/download/mac scripts tests
git commit -m "feat: add verified Mac download flow"
```

### Task 8: Build and verify real Mac packages on GitHub Actions

**Files (Hub repository):**
- Create on release branch: `build/codex-thread-workbench/**` from the app repository tracked source (excluding `bin`, `obj`, `artifacts`, and `.git`)
- Create: `.github/workflows/build-codex-thread-workbench.yml`
- Produce by workflow: `projects/codex-thread-workbench/download/mac/{arm64,x64}/parts/*.bin`
- Produce by workflow: `projects/codex-thread-workbench/download/mac/manifests/{arm64,x64}.json`

**Interfaces:**
- Consumes: the exact committed app source snapshot and packaging scripts
- Produces: verified final Mac ZIP metadata and Pages parts on the release branch

- [ ] **Step 1: Add a push-triggered release-branch workflow**

The build matrix runs `osx-arm64` on `macos-14` and `osx-x64` on `macos-15-intel`, installs .NET 8 and public Codex CLI, runs tests, packages, executes the final ZIP smoke checks, and uploads each ZIP plus a SHA metadata file.

- [ ] **Step 2: Add a final Linux assembly job**

After both Mac jobs pass, download both workflow artifacts, run the Hub splitter, run Mac download tests, commit generated manifests/parts to the same release branch using `GITHUB_TOKEN`, and push without force. The commit message is `release: add verified workbench Mac packages`.

- [ ] **Step 3: Push the release branch and wait for the workflow**

Run: `git push origin HEAD:agent/workbench-mac-video`

Expected: workflow concludes success for x64, arm64, and assembly jobs; the branch advances with generated parts and exact full-file SHA metadata.

- [ ] **Step 4: Fetch and verify generated evidence**

Run: `git fetch origin agent/workbench-mac-video` and inspect the workflow-generated commit.

Expected: both manifests have non-zero sizes, distinct filenames, ordered parts, and SHA-256 values matching workflow metadata; no credentials or chat content are present.

### Task 9: Activate Hub video and Mac links with complete regression coverage

**Files (Hub repository):**
- Modify: `app-20260706-restore-games.js`
- Modify: `projects/codex-thread-workbench/index.html`
- Modify: `tests/codex-thread-workbench-page.test.mjs`
- Modify: `tests/card-action-layout.test.mjs`

**Interfaces:**
- Produces: `video: "./projects/codex-thread-workbench/video/index.html"`
- Produces: `platforms.mac.href: "./projects/codex-thread-workbench/download/mac/"`

- [ ] **Step 1: Add failing four-action tests**

```javascript
assert.match(source, /video:\s*"\.\/projects\/codex-thread-workbench\/video\/index\.html"/);
assert.match(source, /mac:\s*\{ href: "\.\/projects\/codex-thread-workbench\/download\/mac\/"/);
assert.match(projectPage, /视频/);
assert.match(projectPage, /Mac下载/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/codex-thread-workbench-page.test.mjs tests/card-action-layout.test.mjs`

Expected: FAIL because Workbench still has no video field and an empty Mac platform.

- [ ] **Step 3: Activate exact verified URLs**

Update the project object and project page only after Task 8 evidence exists. Keep `package` and `platforms.windows` on the existing Windows page. Preserve card order: demo, video, Windows, Mac.

- [ ] **Step 4: Run full application and Hub suites**

Run in the app repository: `dotnet test -c Debug` and `dotnet test -c Release`.

Run in Hub: `npm test` with `FFMPEG_PATH` set to the repository `ffmpeg-static` executable.

Expected: zero failures; only the previously documented Windows symlink-permission skip may remain.

- [ ] **Step 5: Commit activation**

```powershell
git add app-20260706-restore-games.js projects/codex-thread-workbench tests
git commit -m "release: activate workbench video and Mac downloads"
```

### Task 10: Publish safely and perform real online verification

**Files:**
- Update after confirmed release: `README.md`
- Update after confirmed release: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\CodexThreadWorkbench.md`
- Update after confirmed release: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md`

**Interfaces:**
- Produces: public Hub/demo/video/Windows/Mac URLs and final commit SHA

- [ ] **Step 1: Rebase the release branch on exact latest `origin/main`**

Fetch, verify the release branch contains the latest main as an ancestor, resolve only in-scope files if required, rerun Hub tests, and refuse a force push.

- [ ] **Step 2: Fast-forward `main` safely**

Push with an exact lease after confirming remote main has not moved. Record the final SHA and GitHub Pages workflow/deployment identifiers.

- [ ] **Step 3: Wait for Pages and verify HTTP resources**

Check Hub, project page, video page, MP4, VTT, Windows page, Mac page, both manifests, and every Mac part for successful public responses and correct content length.

- [ ] **Step 4: Perform real browser media and reconstruction checks**

Play the MP4 with captions and confirm only one line is visible. Reconstruct both Mac ZIPs through the page logic, compare saved byte counts and SHA-256 against the manifests, then inspect each archive for one correctly named `.app`.

- [ ] **Step 5: Verify the four Hub actions visually**

At desktop and mobile widths, confirm no horizontal overflow, console error, missing background, misplaced return button, or wrong action order.

- [ ] **Step 6: Update README and long-term memory with confirmed evidence**

Record only stable final URLs, build/test counts, package sizes/SHA-256, deployment state, and any notarization limitation. Do not store credentials or raw chats.
