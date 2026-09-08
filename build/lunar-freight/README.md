# 月面货运

基于 Three.js 与 cannon-es 的实时 3D 月球车货运游戏。当前版本包含四名驻站 NPC、三段连续委托和五次货物交付：重连三座基地、回收失联勘探数据，再运送易损中继电源。货物载重会影响车辆动力，碰撞会降低完整度并影响最终评级。

在本目录使用 Node 22.13+：

```text
npm ci
npm test
npm run typecheck
npm run build
```

构建输出到 `projects/lunar-freight/game/`，使用相对资源路径，无需后端、登录或第三方 CDN。Hub 外壳入口为 `projects/lunar-freight/index.html`。

操作：WASD / 方向键驾驶，空格制动，E 装卸，F 与 NPC 对话，Enter 确认对话，R 扶正，T 停车充电，1/2/3 切换镜头，Esc 暂停。移动端提供触控操作。

角色、车辆、基地、货箱和车轮模型由 Blender 5.2.1 原创生成，交付 GLB 为 719,376 字节、9,234 个三角形，内嵌 512×512 atlas。文章资料因策略限制未读取，未作为内容来源。

用户明确要求不制作视频或预渲染动画。Hub 使用真实游戏截图和在线入口，`videoExemption: "user-request-no-video"` 只适用于本项目；纯网页游戏不提供桌面安装包。

验收记录见 `docs/verification.md` 和 `docs/publication.md`。
