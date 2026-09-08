# 月面货运

实时 Three.js + cannon-es 月球车运输游戏。源自 lunar-freight commit `6ce846dfd83e3e8b5b1a4df3842928fc5c5db29c`；物理、任务、场景和控件原样保留，改用 Vite 输出相对资源路径，供 GitHub Pages 子目录公开运行。

在此目录使用 Node 22.13+：`npm ci`、`npm test`、`npm run typecheck`、`npm run build`。构建输出到 `projects/lunar-freight/game/`，无需后端、登录或第三方 CDN。返回合集入口为 `projects/lunar-freight/index.html`。

WASD / 方向键驾驶，空格刹车，E 装卸，R 扶正，T 停车充电，1/2/3 切换镜头，Esc 暂停。移动设备提供触控按钮。

用户明确要求不制作视频或预渲染动画，因此此项目使用真实游戏截图和在线操作入口，目录 `videoExemption: "user-request-no-video"` 仅适用于本项目。纯网页游戏不提供伪桌面安装包。

验证记录见 `docs/verification.md` 和 `docs/publication.md`。
