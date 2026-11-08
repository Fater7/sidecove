# FaterSide 架构与代码入口

FaterSide 是 Sidecove 的自用 fork。用户操作 Chrome 原生侧栏中的扩展页面；Space 的运行状态由后台 Service Worker 管理，持久收藏和文件夹使用 Chrome 书签。

## 模块

| 位置 | 职责 |
| --- | --- |
| `manifest.json` | 扩展名称、权限、侧栏、设置页和快捷键 command；修改 command 名会影响用户绑定。 |
| `src/sidebar.html`、`src/sidebar/sidebar.js` | 侧栏页面和入口：渲染 Space、标签页、文件夹、菜单，以及切换和拖拽事件。入口文件已有较多历史逻辑。 |
| `src/sidebar/features/` | 已拆出的功能：`pinned-favorites`、`space-switch`、`tab-search`、`new-tab`、`close-tab`、`clean-all`、`color-overrides`。 |
| `src/background/background.js` | MV3 Service Worker 入口；注册消息、快捷键、书签事件和后台任务。 |
| `src/shared/space-store.js`、`space-client.js` | 前者在后台串行维护 Space；后者由其他上下文发送 `spaceStore` 消息。 |
| `src/options.html`、`src/options/options.js` | 设置界面及保存；`src/shared/utils.js` 的 `getSettings()` 提供默认值。 |
| `src/shared/` | 多上下文共用的数据、纯逻辑和样式。`styles.css` 同时供侧栏和设置页使用；共享模块不要在导入时访问 DOM。 |
| `src/onboarding/`、`src/offscreen/` | 安装引导与练习页；offscreen 文档负责复制链接。 |
| `vite.config.js`、`public/` | 多入口构建到固定目录 `dist/`；静态资源从 `public/` 复制。 |

侧栏、设置页、Service Worker 是不同的扩展上下文。`shared/` 不依赖具体上下文，侧栏和后台各自依赖 `shared/`。需要确认具体实现时直接从表中的入口追踪，不要假设所有 Chrome API 操作都通过后台。

## 数据

- Chrome 书签根目录的名称由 `src/shared/constants.js` 的 `ROOT_FOLDER_TITLE` 定为 `FaterSide`。根目录下的 URL 是顶部 Favorites；根目录下的文件夹分别是 Space，其内部书签及嵌套文件夹是该 Space 的固定项。顶部 Favorites 关闭标签后仍保留。
- `chrome.storage.local` 保存 `spaces`、`spaceRegistry`、`spaceTabSnapshot`、归档记录、文件夹展开状态和 `favoriteBookmarkOwners` 等。Space 的稳定 ID 与书签文件夹 ID 的关系由 `src/shared/localstorage.js` 的 registry 管理；`favoriteBookmarkOwners` 用于可选的按 Space 显示顶部收藏。
- `chrome.storage.session` 保存当前浏览器会话内的 `activeSpaces`、`lastActiveSpace`、标签恢复队列及 `favoriteOpenTabs` 等；标签 ID 不能跨浏览器会话直接复用。`spaceTabSnapshot` 用于恢复会话中标签的 Space 和顺序，具体匹配逻辑在 `space-store.js`。
- `chrome.storage.sync` 保存设置，例如 `showTabSearch`、颜色和是否按 Space 区分顶部收藏；设置通过 `src/options/options.js` 保存，侧栏监听变化。
- 书签和本地 storage 是不同的数据来源。调整书签根目录或 Space 文件夹时先考虑现有节点 ID 和关联；不要靠删除目录或扩展来重置。用户允许重新设置不等于允许清空书签。

## 常见需求从哪里开始

- **顶部 Favorites**：`src/sidebar/features/pinned-favorites/pinned-favorites.js` 渲染和打开；`favorite-bookmarks.js` 通过 Bookmarks API 写收藏并维护归属。点击时优先切到已打开的对应标签，否则新建标签。
- **Space 与标签归属**：`src/sidebar/sidebar.js` 调用 `spaceRequest` → `src/background/background.js` 分发 → `src/shared/space-store.js` 串行处理和持久化。后台也处理侧栏关闭时的标签事件；Chrome 标签组同步由 `src/shared/tab-group-sync.js` 负责，默认关闭。
- **Space 切换和快捷键**：`src/shared/space-navigation.js` 管理目标选择；`src/sidebar/sidebar.js` 处理侧栏内点击、键盘及横向滚动手势，`src/background/background.js` 处理 Chrome command 和侧栏关闭时的切换。用户的 `⌘S` 是在 Chrome 快捷键页面对 `_execute_action` 的个人绑定，不是 manifest 默认值。
- **书签文件夹与顺序**：`src/sidebar/space-bookmarks.js` 读取 Space 书签树；`src/sidebar/folder-policy.js` 管理文件夹操作规则；排序相关写入走 `src/background/bookmark-writer.js`。后台 `bookmark-events.js` 通知侧栏刷新；顶部 Favorites 也直接监听书签事件。
- **设置**：`src/options.html` 添加控件、`src/options/options.js` 读写，`src/shared/utils.js` 设置默认值；按需在侧栏监听 `chrome.storage.onChanged`。搜索框的显示逻辑见 `src/sidebar/features/tab-search/visibility.js`。
- **关闭、归档、撤销和新标签**：分别从 `src/sidebar/features/close-tab/`、`clean-all/`、`new-tab/` 和 `src/background/pending-clean.js`、`auto-archive.js` 开始。

## 验证与浏览器边界

`tests/unit/` 对应源码模块；`tests/e2e/` 使用独立 Chrome 实例和构建后的 `dist/`，公共启动逻辑在 `tests/e2e/helpers/extension-helper.js`。测试通过只证明对应场景；日常 Chrome 中的实际体验由用户验证。

原生侧栏的标题栏和浏览器工具栏的侧栏按钮由 Chrome 绘制，扩展只控制侧栏内容。Chrome 当前 Side Panel API 没有隐藏这些控件的接口；相关需求暂不处理。具体能力应以当前 Chrome 版本及官方 API 为准。
