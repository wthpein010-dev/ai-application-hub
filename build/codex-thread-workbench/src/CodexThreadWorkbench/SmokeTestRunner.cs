using CodexThreadWorkbench.Codex;

namespace CodexThreadWorkbench;

public static class SmokeTestRunner
{
    public static async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        await using var client = await CodexAppServerClient.ConnectAsync(
            cancellationToken: cancellationToken);
        return await RunConnectedAsync(client, cancellationToken);
    }

    public static async Task<int> RunAsync(
        ICodexThreadClient client,
        CancellationToken cancellationToken)
    {
        await using (client)
        {
            return await RunConnectedAsync(client, cancellationToken);
        }
    }

    private static async Task<int> RunConnectedAsync(
        ICodexThreadClient client,
        CancellationToken cancellationToken)
    {
        if (!client.IsConnected)
        {
            await client.InitializeAsync(cancellationToken);
        }

        await client.ListThreadsAsync(limit: 1, cancellationToken: cancellationToken);
        return 0;
    }
}
