namespace LighthouseRescue.Runtime
{
    public enum LiveConnectionState { Unavailable, Authorising, Connected, Disconnected }

    public sealed class LiveConnectionStatus
    {
        private readonly object gate = new object();
        private LiveConnectionState state = LiveConnectionState.Unavailable;
        private string reason = "未安装或核验抖音官方 Unity SDK；当前仅支持本地演示。";
        public LiveConnectionState State { get { lock (gate) return state; } }
        public string Reason { get { lock (gate) return reason; } }
        public bool IsConnected => State == LiveConnectionState.Connected;

        public void Evaluate(bool officialSdkPresent, bool permissionVerified, bool stableEventIds)
        {
            if (!officialSdkPresent) Set(LiveConnectionState.Unavailable, "缺少已获授权的官方 Unity SDK，不能连接抖音直播间。");
            else if (!permissionVerified) Set(LiveConnectionState.Unavailable, "当前账号尚未验证直播互动玩法权限。");
            else if (!stableEventIds) Set(LiveConnectionState.Unavailable, "未验证稳定事件 ID，无法安全去重，直播模式已禁用。");
            else Set(LiveConnectionState.Authorising, "等待官方授权与真实直播间握手。");
        }

        public void MarkConnected()
        {
            lock (gate)
            {
                if (state == LiveConnectionState.Authorising)
                {
                    state = LiveConnectionState.Connected;
                    reason = "官方直播连接已建立。";
                }
            }
        }
        public void MarkDisconnected(string reason)
        {
            lock (gate)
            {
                if (state == LiveConnectionState.Connected)
                {
                    state = LiveConnectionState.Disconnected;
                    this.reason = reason;
                }
            }
        }
        private void Set(LiveConnectionState next, string explanation)
        {
            lock (gate) { state = next; reason = explanation; }
        }
    }
}
