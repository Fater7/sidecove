# FaterSide 开发入口

FaterSide 是 Sidecove 的自用 fork：Chrome Manifest V3 扩展，用原生侧边栏管理 Space、标签页和收藏。技术栈是 JavaScript ES modules、HTML/CSS、Vite，无框架。

## 开始工作

- 仓库：`/Users/bytedance/SProjects/sidecove`；远端：`git@github.com:Fater7/sidecove.git`；长期维护分支：`fater7/main`。先检查当前分支和未提交改动。
- 按需求查看 [ARCHITECTURE.md](ARCHITECTURE.md) 的架构和功能入口、[DEVELOPMENT.md](DEVELOPMENT.md) 的运行验证流程；用户连续提出的需求记在 [WORKLIST.md](WORKLIST.md)，完成后更新状态。
- 按用户当前要求直接实施，不擅自增加功能或改变其他行为。保留现有书签和用户数据，除非用户明确要求处理。
- 以自用需求为准，不为旧状态额外设计迁移；需要兼容或保留的数据以用户当前要求为准。同步上游前先核对自用改动，不把商店版当作本 fork 发布。

## 开发与交付

- 用 Node 24（`.nvmrc`）；依赖缺失时运行 `npm ci`。本机可执行命令见 `DEVELOPMENT.md`。
- 提交前运行 `npm run test:unit`，按改动运行必要的 lint、构建和相关自动化测试。用户自行体验界面，默认不使用 Computer Use 操作日常 Chrome 验证。测试和更新步骤见 `DEVELOPMENT.md`。
- 扩展代码改动后执行 `npm run build` 和 `npm run verify:dist`，更新 Chrome 当前加载的本仓库 `dist/`，并自行重载已安装的 FaterSide；不能静默重载时使用 Chrome 界面操作。保留其他标签页、扩展设置和用户数据，不把构建完成当作已重载。
- 不要为更新而卸载后重装，以免更换 ID 或丢失设置、快捷键。用户将 `⌘S` 指派为侧栏开关，重载后保留该指派。
- 触摸板手势和动画手感不能仅凭模拟滚轮或截图认定通过；说明验证范围，由用户实际体验。
- 完成用户请求后直接在 `fater7/main` 提交并推送至 `origin/fater7/main`，无需再次询问。只暂存本次改动；行为变更在 `CHANGELOG.md` 的 Unreleased 下补一行。无需因自用改动执行上游商店发布流程。

## 实现约束

- 新侧栏功能优先放 `src/sidebar/features/<feature>/`，现有逻辑按本次需求逐步拆分；不要为拆分而大范围重构。纯逻辑与 DOM、Chrome API 分开，跨上下文代码放 `src/shared/`。目录依赖方向见架构文档和 ESLint 配置。
- Space 状态由后台的 `SpaceStore` 维护；侧栏通过 `spaceRequest` 请求修改，不能直接写 `chrome.storage.local.spaces`。书签本身使用 Chrome Bookmarks API，具体写入入口见架构文档。
- `FaterSide` 是实际书签根目录名和数据键，空间、收藏和快捷键不能因改名或重装意外丢失。保留扩展页面 URL、storage 键和 `manifest.json` command 名；Chrome 绑定快捷键依赖 command 名。
- 不增加未经需求支持的权限、内容脚本、远程代码、埋点或网络请求；变更权限时在交付中说明并同步隐私说明。消息监听器只对自己处理的消息返回 `true` 或 Promise。复制链接继续通过 offscreen 文档完成。
- 静态资源使用 `public/assets/` 的稳定路径。使用项目现有代码风格和 `Logger`；相关文档随行为变化更新。`CLAUDE.md` 是本文件的软链接。
