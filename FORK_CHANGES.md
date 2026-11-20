# Bruno 二次开发改动说明 / Fork Changes

> This fork extends the MIT-licensed Bruno OSS with: collection Git management
> (free), zh-CN UI, response fullscreen, and Send-and-Download.
> 本 fork 基于 MIT 开源版 Bruno，增加了免费的集合 Git 管理、中文界面、
> 响应区全屏和发送并下载功能。不含任何绕过付费授权的改动。

**Base / 基线**: `usebruno/bruno` main @ `9403b71`
**Branch / 功能分支**: `internal/oss-git-zh-cn`

---

## 一、功能清单

### 1. 集合级 Git 管理（开源版原生能力接入）

开源版 `packages/bruno-electron/src/utils/git.js` 本已内置全套 git 能力
（init/status/commit/fetch/pull/push/log/stash/diff），只是没有接 IPC 和 UI。
本 fork 将其接通并补齐：

- **入口**: 集合 → 集合设置 → 顶部 `Git` 标签（与 Settings 并排）
- `Initialize Git Repository`：非 git 目录一键 `git init`（自动 `main` 分支）
- 分支 / 远程 / ahead-behind / 变更文件列表（M/A/D/R）
- `Commit All Changes` = `git add -A && git commit`，支持自定义 message
- `Fetch` / `Pull` / `Push` + 手动 `Add origin`
- **Auto-commit**：每 N 分钟检查一次，有改动才提交（干净则跳过），
  提交信息 `chore: auto-commit collection changes (时间戳)`；
  配置持久化于 `%APPDATA%\bruno\git-auto-commit.json`，**应用启动即恢复全部定时器**
- **Git 身份兜底**：机器未配全局 `user.name/user.email` 时，只写**仓库级**
  `Bruno <bruno@localhost>`，不污染全局 git 配置

新增/修改文件：

```
packages/bruno-electron/src/ipc/git.js                 # Git IPC 注册 + auto-commit handlers
packages/bruno-electron/src/utils/git.js               # ensureGitIdentity 等
packages/bruno-electron/src/services/git-auto-commit/  # 定时调度服务（新增）
packages/bruno-app/src/components/CollectionSettings/GitSettings/   # UI（新增）
packages/bruno-app/src/components/CollectionSettings/index.js       # Git 顶层标签
packages/bruno-app/src/components/CollectionSettings/Settings/index.js
```

### 2. 中文界面（运行时注入，不改业务源码）

采用 `ljcyt/bruno-i18n-zh` 的思路并源码化：在 React 写 DOM 前拦截
`textContent` / `setAttribute` / `createTextNode`，按词典英文原文精确匹配替换。
**不改动任何功能逻辑、不依赖具体版本**。

```
packages/bruno-app/i18n/engine.js     # 拦截引擎（词典占位符 /*__DICT__*/{}）
packages/bruno-app/i18n/zh-CN.json    # 1253 条词典（含本 fork 自研功能词条）
packages/bruno-app/i18n/build.js      # 内联词典 → public/static/js/i18n.js
packages/bruno-app/rsbuild.config.mjs # html.tags 把 i18n.js 插到 bundle 之前
packages/bruno-electron/src/app/menu-template.js  # 原生菜单汉化
```

**补词方法**：编辑 `zh-CN.json` → 运行 `node packages/bruno-app/i18n/build.js`
→ 重新 `build:web`。代码编辑器、输入框、脚本区被排除，不会误翻用户数据。

### 3. 响应区全屏

Response 面板右上角 ⛶ 按钮，覆盖整个请求工作区（`section.main` 区域），
`Esc` 或再点按钮退出。实现：`getBoundingClientRect` 测量工作区矩形 +
`ResizeObserver` 跟随窗口/侧栏变化，不会遮挡应用顶部工具栏。

```
packages/bruno-app/src/components/ResponsePane/index.js
packages/bruno-app/src/components/ResponsePane/StyledWrapper.js
```

### 4. Send and Download（Postman 式分裂按钮）

Send 右侧 `▾` 下拉 → `Send and Download`：发送完成后弹保存对话框，
文件名按 `Content-Disposition` / URL / `Content-Type` 推断
（复用已有 `renderer:save-response-to-file` IPC）。WebSocket 请求不显示。

```
packages/bruno-app/src/components/RequestPane/SendButton/
packages/bruno-app/src/components/RequestPane/QueryUrl/index.js
```

### 5. 应用改名 bruno_mrb（fork 品牌化）

- `electron-builder-config.js`：`productName: 'bruno_mrb'` → exe 名、
  安装包名、开始菜单、安装目录、窗口标题全部跟随；
  `appId: 'com.github.mrpolarbear.brunomrb'` → 与官方 Bruno **互不冲突可共存**，
  卸载注册表、用户数据目录（`%APPDATA%\bruno_mrb`）均独立
- `publish` 指向本 fork（`Mr-PolarBear/bruno_fork`）——**关键修复**：
  上游默认会让自动更新去 `usebruno/bruno` 拉新版本覆盖二开版；
  改成自己的仓库后，更新通道由 fork 的 Releases 控制
- `packages/bruno-electron/package.json`：`name: 'bruno_mrb'`（`artifactName`
  的 `${name}` 来源）、repository 指向 fork
- 自定义你自己的名字：改上述 `productName` + `name` + `appId` 三处即可

### 6. 构建脚本与平台

- `pack.bat`：一键打包（`pack.bat` 全量 / `pack.bat fast` 快速），
  自动跑 i18n 构建 + web + electron + 签名；签名证书缺失自动降级无签名
- `electron-builder-config.js`：Windows 仅 x64（构建机无 VS 工具链编不了 arm64）

---

## 二、构建 / Build

```bat
:: Windows, Node 24+, 仓库根目录
npm install
pack.bat          :: 全量：install + 子包 + sandbox + i18n + web + electron
pack.bat fast     :: 快速：只改 app/electron 源码时用
```

产物：`packages/bruno-electron/out/win-unpacked/`（便携目录）+
`packages/bruno-electron/out/*.exe`（NSIS 安装包）。

可选代码签名（自签名）：

```bat
set CSC_LINK=C:\path\to\your.pfx
set CSC_KEY_PASSWORD=your-password
pack.bat fast
```

## 三、注意事项

- **Commit 作用域是整个 git 仓库**：collection 若位于大仓库子目录，
  commit/auto-commit 会连带同仓库其他改动。建议一个 collection 一个目录。
- 远程 push/pull 走本机 git 标准凭据流程（Windows 下通常是 GCM 弹窗，
  输一次即缓存）；SSH 远程需本机已配 key。
- 代码里所有注释遵循仓库英文风格；i18n 词典可独立维护，不随版本升级失效。

## 四、协议与致谢

- 本仓库保持 **MIT License**，与上游一致；`license.md` 未改动。
- Git 能力来源于上游开源代码（MIT），未使用/绕过任何 Enterprise 授权逻辑。
- 中文翻译方案致谢 [ljcyt/bruno-i18n-zh](https://github.com/ljcyt/bruno-i18n-zh)。
