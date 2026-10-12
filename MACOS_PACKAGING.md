# macOS 打包变更记录

本次变更为 PixelMug Studio 增加 Intel Mac（x64）和 Apple silicon（arm64）的 DMG 打包支持。

## 应提交到 Git 的文件

| 文件 | 变更 |
| --- | --- |
| `package.json` | 新增 `package:mac`、`package:mac:x64`、`package:mac:arm64` 脚本；新增 electron-builder 的 macOS DMG 目标与 `desktop/icon.icns` 配置。 |
| `desktop/icon.png` | 从现有 `ui/assets/device-icon.png` 导出的 1024×1024 macOS 图标原图。 |
| `desktop/icon.icns` | 由 `desktop/icon.png` 生成的多分辨率 macOS 应用图标。 |
| `src/runtime/studio-sdk-loader.js` | Studio 调试子进程始终使用应用内置 Bot SDK，避免已安装 macOS 应用与外部项目各自加载一份 SDK，从而导致设备绑定与 MPY 部署钩子失效。 |
| `test/studio-sdk-loader.test.mjs` | 覆盖外部项目含有独立 Bot SDK 副本时，Studio 仍统一使用内置 SDK 的回归测试。 |
| `README.md` | 增加 macOS 构建命令和产物位置说明。 |
| `MACOS_PACKAGING.md` | 本变更记录。 |

## 构建命令和产物

```sh
npm run package:mac          # 同时构建 x64 和 arm64
npm run package:mac:x64      # 仅 Intel Mac
npm run package:mac:arm64    # 仅 Apple silicon
```

- Intel Mac DMG：`release/mac/x64/PixelMug Studio-<version>-mac-x64.dmg`
- Apple silicon DMG：`release/mac/arm64/PixelMug Studio-<version>-mac-arm64.dmg`

`release/`、`ui-dist/` 和 `node_modules/` 均为已忽略的生成目录，不应提交。当前构建未使用 Apple Developer ID 证书，因此 DMG 未签名、未公证；正式对外发布前应配置签名和 notarization。
