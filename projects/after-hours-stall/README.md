# 下班收摊 v1.0.1

Unity 2022.3.62f3c1 原创轻休闲滑动整理解谜。拖动小物沿四方向滑动，遇到纸箱或同伴才停；滑入右侧同色小摊就收好。十个固定手工布局，不限时，可撤销、提示、重开和任选关卡。

## 怎么玩
Windows：运行 Builds/Windows/AfterHoursStall.exe。鼠标拖动，也可选中后按方向键或屏幕方向按钮；Z 撤销，R 重开，Esc 选关。自动存档与撤销历史在可执行文件旁 Saves/progress.txt。

WebGL：通过 HTTP/HTTPS 访问 Builds/WebGL/index.html。手机单指滑动，浏览器自动保存；清除站点数据会清除进度。

## 工程与复测
用已安装的 Unity 2022.3.62f3c1 打开本目录，场景 Assets/Scenes/Stall.unity。编辑器构建入口 StallBuild.Windows / StallBuild.WebGL / StallBuild.All。纯逻辑测试运行 Tests/RunTests.ps1；它只使用已装 Unity 内附 Mono，不会调用其他仓库或 ClickFlow。

## 资源来源与范围
角色、纸箱、条纹小摊、界面、粒子与合成音效为原创程序生成。中文字体来源及 OFL 许可见 docs/asset-sources.md 和 docs/NotoSansSC-OFL.txt。没有广告、付费、账户或后台服务。

Mac 未构建、未做真机验证；390×844 为桌面窗口和浏览器模拟触摸，不等同于手机真机验证。真实验收记录见 docs/verification.md，截图见 QA。

## 手游操作版 1.0.1（2026-10-07）
720×1280 竖屏逻辑画布、安全区、单指拖动及大方向键；按钮按实际缩放保持至少44像素命中区。取消、多指、出界、失焦和调整尺寸均取消当前手势。网页手机横屏提示转回竖屏。十关与 v1.0.0 本地进度兼容。

新增验收：Tests/MobileTests.cs、Tools/browser-mobile.mjs；截图及记录在 QA/mobile-v1.0.1。浏览器手机为 Chromium CDP 模拟触摸，不等同手机真机。Android/iOS/Mac原生未构建、未上架。
