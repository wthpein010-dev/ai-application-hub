# Paws 内网关卡工作台

这套启动方式让同一份 Paws 网页编辑器直接读取 Unity 工程关卡，并提供编辑、AI 生成、2D/3D 预览、试玩、删除到 `_Trash` 和恢复。公网 GitHub Pages 仍是浏览器本地演示，不会写入工程。

## 启动

要求 Windows PowerShell 与 Node.js 20 或更新版本。在仓库根目录运行：

```powershell
.\scripts\start-paws-level-editor-lan.ps1
```

启动器会隐藏输入本次服务的写入口令，然后显示：

- 本机地址：`http://127.0.0.1:8090`
- 内网地址：`http://<本机局域网 IPv4>:8090`

默认目录：

- 关卡：`E:\Mahjong\PawsHomeClient\Assets\GameRes\Resources\Config\Gameplay\EditorLevels`
- 牌图：`E:\Mahjong\PawsHomeClient\Assets\SheepLevelEditor\Res\SheepLevelEditor\Blocks`
- 默认关：`level_0021_r2_第二关模板12.json`

启动器优先使用工程当前 `Res` 目录；只有未显式传入 `-BlockAssetDir`、且当前目录不存在而旧 `Resources` 目录仍存在时，才兼容回退旧目录。显式路径无效会直接报错。

如需改端口、目录或默认关，可传入参数：

```powershell
.\scripts\start-paws-level-editor-lan.ps1 `
  -Port 8091 `
  -LevelDir 'D:\Project\EditorLevels' `
  -BlockAssetDir 'D:\Project\Blocks' `
  -DefaultLevel 'level_0001_第一关.json'
```

仅在可信内网使用。Windows 防火墙如有提示，只允许“专用网络”；不要把该端口映射到公网。按 `Ctrl+C` 停止服务，口令与会话随进程一起失效。

## 使用与同步

- 浏览、2D/3D 查看和试玩不需要口令。
- 保存、另存、导入、AI 生成、删除和恢复首次执行时要求输入本次口令；验证成功后使用同源会话 Cookie。
- 所有内网页面通过 SSE 监听 `EditorLevels` 与 `_Trash`。网页、Unity 或资源管理器产生目录变化时，关卡库与回收站会自动刷新。
- 如果当前关卡被其他用户删除，已保存页面自动打开默认关；有未保存修改的页面会保留内存内容，供另存或等待恢复，不会静默丢失。
- 保存与删除使用 SHA-256 版本校验。遇到版本冲突时先刷新或另存，不会覆盖其他用户的新修改。

## 删除与恢复

内网模式的“移到回收站”会把关卡 JSON 与同名 `.json.meta` 成对移动到：

```text
EditorLevels\_Trash
```

文件名追加删除时间；同秒重名时自动追加序号。点击“回收站”可查看并恢复，恢复后 Unity GUID 随 `.meta` 原样返回。

恢复不会覆盖活动目录中的同名 JSON，也不会覆盖孤立 `.meta`。若目标已存在，先人工确认并处理冲突。任何成对移动中途失败时，服务会反向回滚，避免只移动一半。

## 公网演示边界

[GitHub Pages 在线编辑器](https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/index.html) 自动读取随页面发布的静态健康声明，并进入“公网演示模式”：

- 内置工程关卡不可删除；
- 导入、编辑和 AI 生成只保存到当前浏览器；
- 不访问局域网服务，不读写 Unity 工程，也没有工程回收站。

需要多人同步和工程 `_Trash` 时，必须从上述 PowerShell 启动器打开内网地址。
