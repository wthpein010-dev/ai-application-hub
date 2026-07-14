# 网页素材一键收桌面版 macOS 版

macOS 需要在 Mac 上本机安装依赖并打包 `.app`。Windows 生成的 `.exe` 不能在 macOS 上直接运行。

## 运行源码

```bash
cd "$(dirname "$0")/.."
npm install
npm start
```

## 打包 Intel Mac

```bash
npm run pack:mac-x64
```

## 打包 Apple Silicon

```bash
npm run pack:mac-arm64
```

产物会生成在上一级目录的：

```text
dist/
```

## 说明

- 需要先安装 Node.js。
- macOS 首次打开未签名 `.app` 时，可能需要在系统设置中允许打开。
- 已清理随包携带的 `node_modules` 与临时 `dist`，拷贝到 Mac 后请重新执行 `npm install`。
