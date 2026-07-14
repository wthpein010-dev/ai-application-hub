# 网页素材一键收桌面版

一个 Windows / macOS 可打包的 Electron 桌面应用。它支持输入网页 URL，扫描公开网页中的图片、视频、音频和常见文档资源，并在原生桌面窗口中筛选、预览和批量下载。

## 运行

```powershell
npm.cmd install
npm.cmd start
```

## 打包

Windows 可执行目录：

```powershell
npm.cmd run dist:win
```

产物位置：`dist/win-unpacked/网页素材一键收.exe`。发布时需要保留整个 `win-unpacked` 文件夹，不能只单独复制 exe。

Windows 单文件便携版：

```powershell
npm.cmd run dist:win-portable
```

macOS Intel：

```bash
npm run pack:mac-x64
```

macOS Apple Silicon：

```bash
npm run pack:mac-arm64
```

## 说明

- 桌面版支持真正的“始终置顶”窗口。
- 桌面版不能直接读取浏览器当前标签页，需要用户输入网页 URL。
- 只支持扫描当前网络可访问的公开网页，不绕过登录、付费墙、DRM 或网站权限限制。
- Windows 已支持本机打包可执行目录。
- macOS 应用建议在 Mac 上打包和签名；在 Windows 非管理员环境中交叉打包会因为 `.app` 所需符号链接权限被跳过。
