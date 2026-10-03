using LighthouseRescue.Runtime;
using NUnit.Framework;

namespace LighthouseRescue.Tests
{
    public sealed class LiveConnectionTests
    {
        [Test]
        public void MissingSdkAndPermissionKeepLiveModeUnavailable()
        {
            var status = new LiveConnectionStatus();
            status.Evaluate(false, false, false);
            Assert.AreEqual(LiveConnectionState.Unavailable, status.State);
            StringAssert.Contains("SDK", status.Reason);
            status.Evaluate(true, false, true);
            Assert.AreEqual(LiveConnectionState.Unavailable, status.State);
            StringAssert.Contains("权限", status.Reason);
        }

        [Test]
        public void MissingStableEventIdentityIsRejectedBeforeConnection()
        {
            var status = new LiveConnectionStatus();
            status.Evaluate(true, true, false);
            Assert.AreEqual(LiveConnectionState.Unavailable, status.State);
            StringAssert.Contains("事件 ID", status.Reason);
            status.Evaluate(true, true, true);
            Assert.AreEqual(LiveConnectionState.Authorising, status.State);
            Assert.IsFalse(status.IsConnected);
        }

        [Test]
        public void StorageFailureReasonSupersedesAnEarlierNetworkDisconnect()
        {
            var status = new LiveConnectionStatus();
            status.Evaluate(true, true, true);
            status.MarkConnected();
            status.MarkDisconnected("网络断开");
            status.MarkFaulted("本地存储失败，本局已停止");
            Assert.That(status.State, Is.EqualTo(LiveConnectionState.Faulted));
            Assert.That(status.Reason, Does.Contain("存储失败"));
            status.Evaluate(true, true, true);
            status.MarkConnected();
            Assert.That(status.State, Is.EqualTo(LiveConnectionState.Faulted),
                "a failed live process cannot silently reconnect in the same process");
        }
    }
}
