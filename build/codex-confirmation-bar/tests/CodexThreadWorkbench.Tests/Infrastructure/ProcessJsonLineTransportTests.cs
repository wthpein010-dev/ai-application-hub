using System.Diagnostics;
using System.Reflection;
using System.Text;
using CodexThreadWorkbench.Infrastructure;

namespace CodexThreadWorkbench.Tests.Infrastructure;

public sealed class ProcessJsonLineTransportTests
{
    [Fact]
    public void CreateStartInfo_DecodesCodexOutputAsUtf8WithoutChangingInputEncoding()
    {
        var method = typeof(ProcessJsonLineTransport).GetMethod(
            "CreateStartInfo",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);
        var startInfo = Assert.IsType<ProcessStartInfo>(
            method.Invoke(null, ["codex.exe"]));

        Assert.Equal(Encoding.UTF8, startInfo.StandardOutputEncoding);
        Assert.Equal(Encoding.UTF8, startInfo.StandardErrorEncoding);
        Assert.Null(startInfo.StandardInputEncoding);
    }
}
