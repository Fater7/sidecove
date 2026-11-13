# 开发与验证

## 环境

在 `/Users/bytedance/SProjects/sidecove` 工作，先检查 `git status --short --branch`。长期维护分支是 `fater7/main`，`origin` 是 `git@github.com:Fater7/sidecove.git`。不要覆盖已有改动。

项目要求 Node 24。终端没有 `node` 时，本机可用以下方式运行 Node 24 命令：

```sh
PATH="$HOME/.nvm/versions/node/v22.16.0/bin:$PATH" npx --yes --package=node@24 -c 'node --version'
```

把单引号内的命令替换为所需命令；避免在其中再嵌套 `npx`。依赖未安装时，在同一 Node 环境执行 `npm ci`。

## 测试和构建

日常功能开发，尤其是小改动，先做必要的初步验证并交给用户体验；用户确认体验没有问题后，再进行完整验证和自测。用户提出调整时先继续迭代。按改动选择验证；提交前运行 `npm run test:unit`，涉及扩展代码时构建并检查产物：

```sh
npm run test:unit
npm run build
npm run verify:dist
```

浏览器测试使用独立测试配置，不使用用户的日常 Chrome 资料。先构建，再按需运行单个测试文件，例如：

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/e2e/sidebar-settings.test.js --runInBand --forceExit
```

测试入口和其他脚本在 `package.json`。按改动选择必要的自动化测试，简单改动不必运行完整 E2E。用户自行体验界面，默认不使用 Computer Use 操作日常 Chrome 验证；未运行的验证在交付时说明。

## 更新日常 Chrome

当前用户配置中的 FaterSide 是加载自本仓库 `dist/` 的解压扩展。上次确认的扩展 ID 是 `bcjgkicdlgagoabhophenhomhfpdlkgk`；实际操作前先以 `chrome://extensions/` 的详情页为准。

1. 构建到 `dist/`，做必要的初步验证。
2. 自行重载已安装的 FaterSide；不能静默重载时在 `chrome://extensions/` 中操作。构建完成不代表 Chrome 已加载新代码。
3. 由用户体验侧栏，确认没有问题后运行 `npm run verify:dist` 和其他完整验证、自测。不要卸载扩展或改用其他目录；保留用户已有标签页、数据和 `⌘S` 侧栏快捷键。

仅修改仓库文档无需重载扩展。Chrome 商店中的 Sidecove 属于上游产品；自用版从本仓库构建，未经用户要求不执行商店发布流程。

## 提交

核对 `git diff --check`、实际差异和工作区状态，只暂存本次文件。用户已授权完成后直接提交并推送 `origin/fater7/main`；若远端或本地状态发生变化，先检查并保留他人的改动。
