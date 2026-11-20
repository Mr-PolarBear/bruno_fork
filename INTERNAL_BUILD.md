# Bruno 开源版 + 自研 Git 管理功能（内网部署用）

## 构建产物

- 便携目录（直接拷贝到内网即可运行）：`bruno/packages/bruno-electron/out/win-unpacked/`
  - 入口：`Bruno.exe`
- NSIS 安装包：`bruno/packages/bruno-electron/out/bruno_2.0.0_x64_win.exe`

## 一键打包

```bat
pack.bat        :: 全量构建（install + 全部子包 + sandbox + web + electron + 签名）
pack.bat fast   :: 快速构建（只改 bruno-app / bruno-electron 源码时用）
```

脚本自动使用 `codesign\bruno-codesign.pfx` 签名；证书缺失时会降级为无签名构建并提示。

## 本次新增的 Git 管理功能

入口：**Collection → Settings(齿轮) → Settings 标签页 → 左侧 "Git"**

- Initialize Git Repository：collection 非 git 仓库时一键 `git init`（自动切到 `main` 分支）
- Repository 信息：当前分支、远程地址、ahead/behind 计数
- Fetch / Pull / Push：有 origin 时可用；无远程时可手动 Add origin
- Changes：查看变更文件列表（M/A/D/R 标记），填写提交信息后 **Commit All Changes**（等价 `git add -A && git commit`）
- Auto-commit：按分钟周期自动 `add -A && commit`，提交信息为 `chore: auto-commit collection changes (时间戳)`；
  配置持久化在 `%APPDATA%\bruno\git-auto-commit.json`，重启应用后自动恢复调度；"Run now" 可立即执行一次
- Recent commits：最近 15 条提交记录
- git 身份兜底：机器未配置全局 `user.name/user.email` 时，仅对当前仓库写入 `Bruno <bruno@localhost>`，不影响全局配置

## 其它新增功能

- **Send 按钮分裂下拉**（类 Postman）：Send ▾ → "Send and Download"，响应到达后自动弹保存对话框，
  文件名按 Content-Disposition/Content-Type 智能推断。仅 HTTP/GraphQL 请求显示，WS 请求保持原样
- **响应区全屏**：Response 区域右上角新增 ⛶ 按钮，点击后响应面板覆盖整个请求工作区（含 Timeline/Headers/Tests 标签），
  再点一次或按 Esc 收起，方便看长日志

## 代码改动清单（相对上游 usebruno/bruno@9403b71）

| 文件 | 改动 |
|---|---|
| `packages/bruno-electron/src/utils/git.js` | 新增 `ensureGitUserIdentity`（repo-local git 身份兜底） |
| `packages/bruno-electron/src/ipc/git.js` | 新增 12 个 `renderer:git-*` IPC handler，复用 utils/git.js 现有能力 |
| `packages/bruno-electron/src/services/git-auto-commit/index.js` | 新增：定时自动提交调度 + electron-store 持久化 |
| `packages/bruno-app/src/components/CollectionSettings/GitSettings/` | 新增：Git 设置面板（index.js + StyledWrapper.js） |
| `packages/bruno-app/src/components/CollectionSettings/Settings/index.js` | 注册 Git 区块入口 |
| `packages/bruno-app/src/components/RequestPane/SendButton/index.js` + `StyledWrapper.js` | Send 分裂按钮 + Send and Download 菜单 |
| `packages/bruno-app/src/components/RequestPane/QueryUrl/index.js` | 发送完成后自动调 `renderer:save-response-to-file` |
| `packages/bruno-app/src/components/ResponsePane/index.js` + `StyledWrapper.js` | 响应区全屏开关（fixed overlay，Esc 退出） |
| `packages/bruno-electron/electron-builder-config.js` | win nsis arch 改为 `['x64']`（本机无 VS 无法编译 arm64 原生模块；需要 arm64 时改回 `['x64','arm64']`） |

说明：electron 侧 `utils/git.js` 本来就内置全套 git 能力（commit/push/pull/log/status/stash/diff），
付费版只是接了 IPC + UI。本实现未动任何 premium/license 校验代码，纯新增，合规干净。

## 重建步骤（外网机器）

```powershell
cd E:\Idea_work\bruno_dev\bruno
npm install
npm run build:graphql-docs
npm run build:bruno-query
npm run build:bruno-common
npm run build:bruno-converters
npm run build:bruno-requests
npm run build:schema-types
npm run build:bruno-filestore
npm run build:bruno-io
npm run build:bruno-sqlite
npm run sandbox:bundle-libraries --workspace=packages/bruno-js   # 关键！漏了启动直接报错
npm run build:web
# 复制 web 产物 + 打包（脚本内含 dist→web 拷贝）
npm run build:electron
# 或者已经复制过 web 时直接：
# cd packages/bruno-electron; npx electron-builder --win --config electron-builder-config.js
```

注意：构建/启动的 shell 不能带 `ELECTRON_RUN_AS_NODE=1`（Windsurf 终端会泄漏这个变量，导致 Electron 秒退）。

## 代码签名（自签名）

- 证书文件：`E:\Idea_work\bruno_dev\codesign\`
  - `bruno-codesign.pfx`（含私钥，密码：`bruno-internal-2026`，妥善保管勿进内网包）
  - `bruno-codesign.cer`（公钥证书，用于分发到内网机器的信任库）
- 发行者：`CN=Bruno Internal Build, O=Internal, C=CN`
- 证书指纹：`2FF41493827C9BD304516C1A995F842257147AF9`
- 已签名产物：`win-unpacked\Bruno.exe`、安装包、elevate.exe、uninstaller 全部已签
- Bruno.exe SHA256：`7B6F45291426031C036D41E8925CE829BBA06CE3E1819902E2DE86A97698F329`

**让签名变为"完全受信任"的两条路**（任选）：
1. **域环境**：域控 GPO → 计算机配置 → Windows 设置 → 安全设置 → 公钥策略 →
   "受信任的根证书颁发机构" 导入 `bruno-codesign.cer`，全内网生效
2. **单机/工作组**：`certutil -addstore -f Root bruno-codesign.cer`（需管理员），
   或安全软件里按"发行者/证书指纹"加白

重新打包时让 electron-builder 自动签名：

```powershell
$env:CSC_LINK='E:\Idea_work\bruno_dev\codesign\bruno-codesign.pfx'
$env:CSC_KEY_PASSWORD='bruno-internal-2026'
npx electron-builder --win --config electron-builder-config.js
```

## 使用注意

- Commit/Auto-commit 作用域是**整个 git 仓库**：若 collection 只是某个大仓库的子目录，会把仓库内其它改动一并提交。建议一个 collection 独立一个仓库目录。
- Push/Pull 走的是本机 git 凭据（credential manager / ssh agent），内网 GitLab 用 http:// 地址即可。
- Auto-commit 只在 Bruno 运行期间生效（定时器在主进程里），不会生成后台驻留服务。
