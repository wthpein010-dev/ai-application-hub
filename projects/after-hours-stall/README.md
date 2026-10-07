# 下班收摊 v1.2.0

Unity 2022.3.62f3c1 原创休闲滑动整理游戏。原十摊自由整理 + 六关不同机制的限时夜市：单行、传送、推箱、压板联动、节拍、9步预算。

打开工程后加载 Assets/Scenes/Stall.unity。拖动或点选小物再点方向；PC方向键，Z撤销、R重开、Esc模式、空格暂停，只有节拍关Q等一拍。每关点开始后计时，失焦或后台自动暂停。

`Tests/RunTests.ps1` 用已有 Unity Mono 跑五个纯C#套件。`StallBuild.All` 批处理生成 Builds/Windows 和 Builds/WebGL。WebGL请用HTTP服务器打开。源码无需联网游戏账户；缓存和构建输出不在源码包。

旧休闲 AH1 完全兼容；旧夜市 AC1 只读保留，菜单可查；新版 AC2 独立纪录。机制细节见 mechanisms-spec.md，实际验收见 mechanisms-verification.md。

720×1280画布适配安全区域和桌面。移动浏览器为触摸模拟验证；Android/iOS/macOS本地构建及手机真机未验证。工具脚本默认本机D路径，请按环境调整。
