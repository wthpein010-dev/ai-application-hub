# 叮当打包铺 v1.1.0 集成交接
原链接保持不变：https://wthpein010-dev.github.io/ai-application-hub/projects/ding-dang-parcel/play/
工程：D:/AI-Workspace/Projects/ding-dang-parcel
工作树：D:/AI-Workspace/Projects/ding-dang-parcel-hub，分支game/ding-dang-parcel-mobile
版本：1.1.0，720×1280竖屏基准、手机单指拖放、直接点按旋转/撤销/提示/重开，安全区与长屏适配，鼠标保留可玩。
取消、越界、失焦及尺寸变化保留原摆放；弹层阻止底层按钮；DPR最高2倍，窗口尺寸变化保留对应渲染像素，避免混用旧缓存资源。
关卡、字体、美术、音效及parcel.*存档键保留。旧v1.0.0实际写入第二关部分进度，新版同源同路径恢复；不声称新版本保存撤销历史。
本地最终Unity构建：Builds/build-mobile-verified.log，Succeeded bytes=27495467，10关参考解答验证通过。
完整触控10关及四尺寸报告：QA/mobile-1.1.0/report.json；高DPI最后复核：QA/mobile-1.1.0-hidpi/report.json。
旧存档证据：QA/mobile-1.1.0/legacy-save-report.json；截图在相同目录。QA/Regression/modal-before.txt为修复前预期失败，正例验收包含modal-controls-blocked。
手机和安全区为Chromium模拟；尚未验证真实iOS/Android设备，未新增原生商店发行包。
本次仅修改本游戏projects/ding-dang-parcel及downloads/ding-dang-parcel-unity-project.zip。父线程可将作品站展示版本更新为1.1.0、介绍“720×1280手机触控版”，入口仍用原链接。
网页源码下载继续沿用原管理员门禁，不绕过未配置服务；完整源工程ZIP保持原仓库路径。
