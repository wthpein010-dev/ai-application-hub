namespace LighthouseRescue.Runtime
{
    public enum LiveConnectionState { Unavailable, Authorising, Connected, Disconnected }

    public sealed class LiveConnectionStatus
    {
        public LiveConnectionState State { get; private set; } = LiveConnectionState.Unavailable;
        public string Reason { get; private set; } = "未安装或核验抖音官方 Unity SDK；当前仅支持本地演示。";
        public bool IsConnected => State == LiveConnectionState.Connected;

        public void Evaluate(bool officialSdkPresent, bool permissionVerified, bool stableEventIds)
        {
            if (!officialSdkPresent) Set(LiveConnectionState.Unavailable, "缺少已获授权的官方 Unity SDK，不能连接抖音直播间。");
            else if (!permissionVerified) Set(LiveConnectionState.Unavailable, "当前账号尚未验证直播互动玩法权限。");
            else if (!stableEventIds) Set(LiveConnectionState.Unavailable, "未验证稳定事件 ID，无法安全去重，直播模式已禁用。");
            else Set(LiveConnectionState.Authorising, "等待官方授权与真实直播间握手。");
        }

        public void MarkConnected() { if (State == LiveConnectionState.Authorising) Set(LiveConnectionState.Connected, "官方直播连接已建立。"); }
        public void MarkDisconnected(string reason) { if (State == LiveConnectionState.Connected) Set(LiveConnectionState.Disconnected, reason); }
        private void Set(LiveConnectionState state, string reason) { State = state; Reason = reason; }
    }
}
