# 开发与验证

## 环境

在 `/Users/bytedance/SProjects/sidecove` 工作，先检查 `git status --short --branch`。长期维护分支是 `fater7/main`，`origin` 是 `git@github.com:Fater7/sidecove.git`。不要覆盖已有改动。

项目要求 Node 24。终端没有 `node` 时，本机可用以下方式运行 Node 24 命令：

```sh
PATH="$HOME/.nvm/versions/node/v22.16.0/bin:$PATH" npx --yes --package=node@24 -c 'node --version'
```

把单引号内的命令替换为所需命令；避免在其中再嵌套 `npx`。依赖未安装时，在同一 Node 环境执行 `npm ci`。

## 测试和构建

按改动选择相关验证。提交前运行 `npm run test:unit`；涉及扩展代码时构建并检查产物：

```sh
npm run test:unit
npm run build
npm run verify:dist
```

浏览器测试使用独立测试配置，不使用用户的日常 Chrome 资料。先构建，再按需运行单个测试文件，例如：

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/e2e/sidebar-settings.test.js --runInBand --forceExit
```

测试入口和其他脚本在 `package.json`。UI 修改验证对应行为；简单改动不必运行完整 E2E。未运行的验证或无法模拟的手感在交付时说明。

## 更新日常 Chrome

当前用户配置中的 FaterSide 是加载自本仓库 `dist/` 的解压扩展。上次确认的扩展 ID 是 `bcjgkicdlgagoabhophenhomhfpdlkgk`；实际操作前先以 `chrome://extensions/` 的详情页为准。

1. 构建到 `dist/` 并运行 `npm run verify:dist`。
2. 打开 `chrome://extensions/?id=bcjgkicdlgagoabhophenhomhfpdlkgk`，确认名称、ID 和加载目录，点击扩展的“重新加载”。不要卸载扩展或改用其他目录。
3. 重新打开侧栏，检查本次改动和用户原有 Space、Favorites；快捷键 `⌘S` 是用户在 `chrome://extensions/shortcuts` 中设置的侧栏开关。保留用户已有标签页和数据。重载可能打开引导页；仅关闭本次操作产生的引导页。
4. 真实触摸板手势或动画手感由用户体验；模拟滚轮事件、自动化断言和截图只能证明各自覆盖的部分。

仅修改仓库文档无需重载扩展。Chrome 商店中的 Sidecove 属于上游产品；自用版从本仓库构建，未经用户要求不执行商店发布流程。

## 提交

核对 `git diff --check`、实际差异和工作区状态，只暂存本次文件。用户已授权完成后直接提交并推送 `origin/fater7/main`；若远端或本地状态发生变化，先检查并保留他人的改动。
