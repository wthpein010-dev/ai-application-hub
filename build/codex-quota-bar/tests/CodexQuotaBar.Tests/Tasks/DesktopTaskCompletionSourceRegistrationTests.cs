using CodexQuotaBar.App.Tasks;
using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.Tests.Tasks;

public sealed class DesktopTaskCompletionSourceRegistrationTests
{
    [Fact]
    public async Task Registration_creates_the_sessions_watcher_and_owns_its_disposal()
    {
        var codexHome = Path.Combine(Path.GetTempPath(), $"quota-registration-{Guid.NewGuid():N}");
        var registration = DesktopTaskCompletionSourceRegistration.Create(
            codexHome,
            TimeProvider.System,
            _ => { });

        try
        {
            await registration.Source.StartAsync();
            Assert.True(Directory.Exists(Path.Combine(codexHome, "sessions")));

            await registration.DisposeAsync();

            await Assert.ThrowsAsync<ObjectDisposedException>(
                () => registration.Source.StartAsync());
        }
        finally
        {
            await registration.DisposeAsync();
            Directory.Delete(codexHome, recursive: true);
        }
    }

    [Fact]
    public async Task Registration_disposes_the_composed_task_source_once()
    {
        var source = new StubTaskCompletionSource();
        var registration = new DesktopTaskCompletionSourceRegistration(source);

        await registration.DisposeAsync();
        await registration.DisposeAsync();

        Assert.Same(source, registration.Source);
        Assert.Equal(1, source.DisposeCount);
    }

    private sealed class StubTaskCompletionSource : ITaskCompletionSource
    {
        public event EventHandler<CodexTaskCompletion>? TaskCompleted
        {
            add { }
            remove { }
        }

        public int DisposeCount { get; private set; }

        public Task StartAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public ValueTask DisposeAsync()
        {
            DisposeCount++;
            return ValueTask.CompletedTask;
        }
    }
}
