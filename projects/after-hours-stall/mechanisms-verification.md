# v1.2.0 验收证据

工程 D:\AI-Workspace\Projects\after-hours-stall-mechanisms，feature/distinct-mechanics，基于 v1.1.0 source abae002。已有 Unity 2022.3.62f3c1，无引擎/模块安装。

- 五个纯C#套件通过：原17条模型断言、十关最短解/恢复、AH1长历史与8类损坏存档、28条触摸/布局断言、1723条挑战断言。六关最短3/2/3/3/4/8步，都触发自身机制。
- 规则独立预期位置测试：单行错误入/出方向、传送阻塞/停止、木箱推进/边界/占用、压板帮手/门更新、节拍占格门、9步真实耗尽后撤销可返还。提示搜索遵守预算。180次随机重复操作及完整撤销，暂停/Ready禁止动作，零秒先失败，正剩余可胜。
- Windows实际可视运行960×900：原十关与新六关解法、动画、过关；六机制教学/画面/暂停/撤销；计时失败/重试。退出0。工作集峰值167800832字节，Unity已分配45192711字节；不声称手机帧率。
- 实际构建成功：Windows70460787字节；最终WebGL13128770字节。最终WebGL修正读屏，移除测试诊断字段、中文播报状态；窗口诊断变量仅供验收。
- 最终WebGL390×844触摸、360×640 DPR3触摸与24/20安全区、1100×900鼠标：三种尺寸均实玩六关，并逐关验证教学/提示扣时/撤销机关/暂停/胜利。触摸取消、多指、失焦/后台显式恢复、真实35秒超时及重试通过。
- 同源真实v1.1.0 WebGL先过关生成AC1旧纪录，再升级1.2.0：旧纪录保留、新纪录初始0，新AC2胜利与刷新恢复；回休闲仍保留第3摊未完成的一步和撤销历史。
- 原休闲WebGL720×1280、360×640、390×844、1100×900输入、提示/撤销/重开/下一关、取消/多指/边界/键盘/横屏提示/安全区/不滚动回归通过；真实v1.0.0触摸保存迁移到1.2.0通过。
- 原StallModel/StallLevels/StallProgress/StallMobile相对abae002无改动。AC1与AH1键/文件保持不覆盖；新纪录AC2和v2键/文件单独保存。
- 发布前本机仅跑明确两个Node文件，9项静态检查通过；已确认ClickFlow真实Python套件在Windows无条件skip，未执行ClickFlow或无过滤全仓测试。Hub改动仅本游戏子目录。

自审发现并修复：单行关最短路可绕过机制、压板出口被固定墙挡住、读屏混入测试诊断。均在最终验收前修正；没有遗留核心玩法问题。仅六关有界版本，不扩展广告/账号/其他游戏。

测试产物见QA/models.txt、build-v1.2.0.log、build-webgl-final.log、windows/desktop-runtime.txt、windows/performance.json、browser/local-mechanisms.json、baseline/local-browser.json。截图为实际程序渲染，非概念图。公开版本的CI/Pages与在线资源哈希、浏览器回归另存交付QA/public-assets.json及browser/public-mechanisms.json、baseline/public-browser.json。

限制：手机是浏览器触摸/DPR/安全区模拟，无Android/iOS/mac原生构建或真机验收；目标60FPS、WebGL初始128MB，并未测手机硬件帧率。挑战关闭重开从新局开始，旧休闲进度与两版纪录保存。
