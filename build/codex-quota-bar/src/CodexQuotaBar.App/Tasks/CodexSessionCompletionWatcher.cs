using System.Text.Json;
using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.App.Tasks;

public sealed class CodexSessionCompletionWatcher : ITaskCompletionSource
{
    private const int MaximumRememberedTurnIds = 256;
    [ThreadStatic]
    private static Stack<CodexSessionCompletionWatcher>? s_notificationWatchers;

    private readonly string _sessionsRoot;
    private readonly TimeProvider _timeProvider;
    private readonly Action<string>? _log;
    private readonly StringComparer _pathComparer = OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;
    private readonly object _pendingPathsLock = new();
    private readonly object _scheduledScansLock = new();
    private readonly HashSet<string> _pendingPaths;
    private readonly HashSet<Task> _scheduledScans = [];
    private readonly Dictionary<string, SessionFileState> _sessionFiles;
    private readonly HashSet<string> _seenTurnIds = new(StringComparer.Ordinal);
    private readonly Queue<string> _seenTurnIdOrder = new();
    private readonly SemaphoreSlim _startGate = new(1, 1);
    private readonly SemaphoreSlim _scanGate = new(1, 1);
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private FileSystemWatcher? _fileSystemWatcher;
    private Task? _reconciliationTask;
    private int _initializationComplete;
    private int _disposed;
    private bool _started;

    public CodexSessionCompletionWatcher(
        string sessionsRoot,
        TimeProvider? timeProvider = null,
        Action<string>? log = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sessionsRoot);

        _sessionsRoot = Path.GetFullPath(sessionsRoot);
        _timeProvider = timeProvider ?? TimeProvider.System;
        _log = log;
        _pendingPaths = new HashSet<string>(_pathComparer);
        _sessionFiles = new Dictionary<string, SessionFileState>(_pathComparer);
    }

    public event EventHandler<CodexTaskCompletion>? TaskCompleted;

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        var runInitialReconciliation = false;
        FileSystemWatcher? watcher = null;
        ThrowIfDisposed();
        await _startGate.WaitAsync(cancellationToken);
        try
        {
            ThrowIfDisposed();
            if (_started)
            {
                return;
            }

            Directory.CreateDirectory(_sessionsRoot);
            var baselines = CaptureBaselines();
            Log("Codex session watcher baseline captured.");
            cancellationToken.ThrowIfCancellationRequested();

            watcher = new FileSystemWatcher(_sessionsRoot, "*.jsonl")
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                EnableRaisingEvents = false,
            };
            watcher.Created += OnFileChanged;
            watcher.Changed += OnFileChanged;
            watcher.Renamed += OnFileRenamed;
            watcher.Error += OnWatcherError;
            _fileSystemWatcher = watcher;
            watcher.EnableRaisingEvents = true;
            Log("Codex session watcher enabled.");

            await InitializeBaselinesAsync(baselines, cancellationToken);
            _started = true;
            Volatile.Write(ref _initializationComplete, 1);
            _reconciliationTask = ReconcileAsync(_cancellationTokenSource.Token);
            runInitialReconciliation = true;
        }
        catch
        {
            await ResetFailedStartAsync(watcher);
            throw;
        }
        finally
        {
            _startGate.Release();
        }

        if (runInitialReconciliation)
        {
            await ReconcileOnceAsync(_cancellationTokenSource.Token);
        }
    }

    public async ValueTask DisposeAsync()
    {
        var calledFromNotification = s_notificationWatchers?.Contains(this) == true;
        await BeginShutdownAsync();
        if (calledFromNotification)
        {
            return;
        }

        if (_reconciliationTask is not null)
        {
            await _reconciliationTask;
        }

        await WaitForScheduledScansAsync();
    }

    private async Task BeginShutdownAsync()
    {
        await _startGate.WaitAsync();
        try
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            if (_fileSystemWatcher is not null)
            {
                _fileSystemWatcher.EnableRaisingEvents = false;
                _fileSystemWatcher.Dispose();
            }

            _fileSystemWatcher = null;
            _cancellationTokenSource.Cancel();
        }
        finally
        {
            _startGate.Release();
        }
    }

    private async Task ResetFailedStartAsync(FileSystemWatcher? watcher)
    {
        if (ReferenceEquals(_fileSystemWatcher, watcher))
        {
            _fileSystemWatcher = null;
        }

        if (watcher is not null)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
        }
        _started = false;
        Volatile.Write(ref _initializationComplete, 0);
        lock (_pendingPathsLock)
        {
            _pendingPaths.Clear();
        }

        await _scanGate.WaitAsync();
        try
        {
            _sessionFiles.Clear();
            _seenTurnIds.Clear();
            _seenTurnIdOrder.Clear();
        }
        finally
        {
            _scanGate.Release();
        }
    }

    private List<SessionBaseline> CaptureBaselines()
    {
        var baselines = new List<SessionBaseline>();
        foreach (var path in EnumerateSessionFilesSafely())
        {
            try
            {
                var fileInfo = new FileInfo(path);
                baselines.Add(new SessionBaseline(path, fileInfo.Length, fileInfo.LastWriteTimeUtc.Ticks));
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                Log($"Could not capture Codex session baseline for '{path}': {exception.Message}");
            }
        }

        return baselines;
    }

    private async Task InitializeBaselinesAsync(IReadOnlyList<SessionBaseline> baselines, CancellationToken cancellationToken)
    {
        await _scanGate.WaitAsync(cancellationToken);
        try
        {
            foreach (var baseline in baselines)
            {
                var workspaceName = string.Empty;
                try
                {
                    workspaceName = await ReadWorkspaceNameAsync(baseline.Path, cancellationToken);
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                {
                    Log($"Could not index Codex session file '{baseline.Path}': {exception.Message}");
                }

                _sessionFiles[baseline.Path] = new SessionFileState(
                    workspaceName,
                    new JsonlReadState(baseline.Length, [], baseline.LastWriteTimeUtcTicks));
            }
        }
        finally
        {
            _scanGate.Release();
        }
    }

    private async Task ReconcileAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2), _timeProvider);
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await ReconcileOnceAsync(cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private Task ReconcileOnceAsync(CancellationToken cancellationToken) => ScheduleScanAsync(reconcile: true, cancellationToken);

    private void OnFileChanged(object sender, FileSystemEventArgs eventArgs) => QueuePath(eventArgs.FullPath);

    private void OnFileRenamed(object sender, RenamedEventArgs eventArgs) => QueuePath(eventArgs.FullPath);

    private void OnWatcherError(object sender, ErrorEventArgs eventArgs) => Log($"Codex session watcher error: {eventArgs.GetException().Message}");

    private void QueuePath(string path)
    {
        if (Volatile.Read(ref _disposed) != 0)
        {
            return;
        }

        lock (_pendingPathsLock)
        {
            _pendingPaths.Add(path);
        }

        if (Volatile.Read(ref _initializationComplete) != 0)
        {
            _ = ScheduleScanAsync(reconcile: false, _cancellationTokenSource.Token);
        }
    }

    private Task ScheduleScanAsync(bool reconcile, CancellationToken cancellationToken)
    {
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Task task;
        lock (_scheduledScansLock)
        {
            if (Volatile.Read(ref _disposed) != 0)
            {
                return Task.CompletedTask;
            }

            task = RunScheduledScanAsync(start.Task, reconcile, cancellationToken);
            _scheduledScans.Add(task);
        }

        start.SetResult();
        _ = RemoveScheduledScanAsync(task);
        return task;
    }

    private async Task RunScheduledScanAsync(Task start, bool reconcile, CancellationToken cancellationToken)
    {
        await start;
        await RunScanAsync(reconcile, cancellationToken);
    }

    private async Task RemoveScheduledScanAsync(Task task)
    {
        try
        {
            await task;
        }
        finally
        {
            lock (_scheduledScansLock)
            {
                _scheduledScans.Remove(task);
            }
        }
    }

    private async Task WaitForScheduledScansAsync()
    {
        while (true)
        {
            Task[] scans;
            lock (_scheduledScansLock)
            {
                _scheduledScans.RemoveWhere(scan => scan.IsCompleted);
                scans = _scheduledScans.ToArray();
            }

            if (scans.Length == 0)
            {
                return;
            }

            await Task.WhenAll(scans);
        }
    }

    private async Task RunScanAsync(bool reconcile, CancellationToken cancellationToken)
    {
        List<CodexTaskCompletion>? completions = null;
        try
        {
            await _scanGate.WaitAsync(cancellationToken);
            try
            {
                completions = await ScanUnderGateAsync(reconcile, cancellationToken);
            }
            finally
            {
                _scanGate.Release();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }

        if (completions is not null)
        {
            NotifySubscribers(completions);
        }
    }

    private async Task<List<CodexTaskCompletion>> ScanUnderGateAsync(bool reconcile, CancellationToken cancellationToken)
    {
        var completions = new List<CodexTaskCompletion>();
        if (reconcile)
        {
            QueueChangedFilesUnderGate();
        }

        while (!cancellationToken.IsCancellationRequested)
        {
            var paths = TakePendingPaths();
            if (paths.Length == 0)
            {
                break;
            }

            foreach (var path in paths)
            {
                await ReadNewLinesUnderGateAsync(path, completions, cancellationToken);
            }
        }

        return completions;
    }

    private void QueueChangedFilesUnderGate()
    {
        foreach (var path in EnumerateSessionFilesSafely())
        {
            try
            {
                var fileInfo = new FileInfo(path);
                if (!_sessionFiles.TryGetValue(path, out var state) || state.ReadState.Offset != fileInfo.Length)
                {
                    lock (_pendingPathsLock)
                    {
                        _pendingPaths.Add(path);
                    }
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                Log($"Could not reconcile Codex session file '{path}': {exception.Message}");
            }
        }
    }

    private string[] TakePendingPaths()
    {
        lock (_pendingPathsLock)
        {
            if (_pendingPaths.Count == 0)
            {
                return [];
            }

            var paths = _pendingPaths.ToArray();
            _pendingPaths.Clear();
            return paths;
        }
    }

    private async Task ReadNewLinesUnderGateAsync(
        string path,
        ICollection<CodexTaskCompletion> completions,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return;
        }

        try
        {
            if (!_sessionFiles.TryGetValue(path, out var state))
            {
                state = new SessionFileState(string.Empty, JsonlReadState.Empty);
                _sessionFiles[path] = state;
            }

            var result = await IncrementalJsonlReader.ReadAsync(path, state.ReadState, cancellationToken);
            state.ReadState = result.State;
            foreach (var line in result.Lines)
            {
                var workspaceName = TryGetWorkspaceName(line);
                if (workspaceName is not null)
                {
                    state.WorkspaceName = workspaceName;
                    EmitDeferredCompletionsUnderGate(state, completions);
                }

                var completion = CodexSessionEventParser.Parse(line, state.WorkspaceName);
                if (completion is null)
                {
                    continue;
                }

                if (string.IsNullOrEmpty(state.WorkspaceName))
                {
                    state.DeferredCompletionLines.Add(line);
                }
                else
                {
                    AddCompletionIfNewUnderGate(completion, completions);
                }
            }

            EmitDeferredCompletionsUnderGate(state, completions);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            Log($"Could not read Codex session file '{path}': {exception.Message}");
        }
    }

    private void EmitDeferredCompletionsUnderGate(SessionFileState state, ICollection<CodexTaskCompletion> completions)
    {
        if (string.IsNullOrEmpty(state.WorkspaceName) || state.DeferredCompletionLines.Count == 0)
        {
            return;
        }

        foreach (var line in state.DeferredCompletionLines)
        {
            var completion = CodexSessionEventParser.Parse(line, state.WorkspaceName);
            if (completion is not null)
            {
                AddCompletionIfNewUnderGate(completion, completions);
            }
        }

        state.DeferredCompletionLines.Clear();
    }

    private void AddCompletionIfNewUnderGate(CodexTaskCompletion completion, ICollection<CodexTaskCompletion> completions)
    {
        if (!_seenTurnIds.Add(completion.TurnId))
        {
            return;
        }

        _seenTurnIdOrder.Enqueue(completion.TurnId);
        if (_seenTurnIdOrder.Count > MaximumRememberedTurnIds)
        {
            _seenTurnIds.Remove(_seenTurnIdOrder.Dequeue());
        }

        completions.Add(completion);
    }

    private async Task<string> ReadWorkspaceNameAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            var workspaceName = TryGetWorkspaceName(line);
            if (workspaceName is not null)
            {
                return workspaceName;
            }
        }

        return string.Empty;
    }

    private IEnumerable<string> EnumerateSessionFilesSafely()
    {
        var directories = new Stack<string>();
        directories.Push(_sessionsRoot);
        while (directories.TryPop(out var directory))
        {
            string[] entries;
            try
            {
                entries = Directory.GetFileSystemEntries(directory);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                Log($"Could not enumerate Codex session directory '{directory}': {exception.Message}");
                continue;
            }

            foreach (var entry in entries)
            {
                FileAttributes attributes;
                try
                {
                    attributes = File.GetAttributes(entry);
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                {
                    Log($"Could not inspect Codex session path '{entry}': {exception.Message}");
                    continue;
                }

                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if ((attributes & FileAttributes.ReparsePoint) == 0)
                    {
                        directories.Push(entry);
                    }

                    continue;
                }

                if (entry.EndsWith(".jsonl", StringComparison.OrdinalIgnoreCase))
                {
                    yield return entry;
                }
            }
        }
    }

    private static string? TryGetWorkspaceName(string line)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var type) || type.GetString() != "session_meta" ||
                !root.TryGetProperty("payload", out var payload) ||
                !payload.TryGetProperty("cwd", out var cwdElement))
            {
                return null;
            }

            var cwd = cwdElement.GetString();
            if (string.IsNullOrWhiteSpace(cwd))
            {
                return null;
            }

            return Path.GetFileName(cwd.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private void NotifySubscribers(IReadOnlyList<CodexTaskCompletion> completions)
    {
        foreach (var completion in completions)
        {
            if (Volatile.Read(ref _disposed) != 0)
            {
                return;
            }

            try
            {
                var notificationWatchers = s_notificationWatchers ??= new Stack<CodexSessionCompletionWatcher>();
                notificationWatchers.Push(this);
                TaskCompleted?.Invoke(this, completion);
            }
            catch (Exception exception)
            {
                Log($"Codex completion handler failed: {exception.Message}");
            }
            finally
            {
                var notificationWatchers = s_notificationWatchers!;
                notificationWatchers.Pop();
                if (notificationWatchers.Count == 0)
                {
                    s_notificationWatchers = null;
                }
            }
        }
    }

    private void Log(string message)
    {
        try
        {
            _log?.Invoke(message);
        }
        catch
        {
        }
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
    }

    private sealed record SessionBaseline(string Path, long Length, long LastWriteTimeUtcTicks);

    private sealed class SessionFileState(string workspaceName, JsonlReadState readState)
    {
        public string WorkspaceName { get; set; } = workspaceName;

        public JsonlReadState ReadState { get; set; } = readState;

        public List<string> DeferredCompletionLines { get; } = [];
    }
}
