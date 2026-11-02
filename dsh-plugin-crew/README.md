# dsh-plugin-crew

本地 DSH `0.2.1-rc.5` 组合包，提供 Crew Leader preset 和只读 Web 会话面板。官方 `plugin add` 会同时加载 `cordis.patch.yml` 与 `preset.patch.yml`，注册 `crew-ui`、完整 `preset-crew`，并将新主会话的默认 preset 设为 `crew`。

浏览器入口通过官方 `conversation.session.header.actions` slot 挂载 Crew。视图读取 Session Controller 的公开投影（`subagentCatalog`、child `modelSelection`、`tokenUsage`、`subagentTiming`、session status）及公开 Conversation `chat` 视图中的 `workflow-run` 节点，不读取会话文件或内部存储。

Crew 弹窗的「泳道视图」与右侧栏「新建标签」引导页都能打开 `Crew 泳道`（官方 `sidebar.right.pane.tab` / `.title` 座位，tab kind `crewLanes`）。数据全部来自官方公开值，不按时间或措辞推断：

- **泳道**：Leader、Agent Teams 队友（`agentTeam` 投影的 roster）、进程内子 agent、Workflow、以及实际用到的外部执行者（Codex / Gemini / Grok / Claude Code，按委派工具名区分）；未认领的团队任务放在「任务板 · 待认领」。
- **卡片**：每次委派一张（`subagentCatalog` 行，状态、耗时、已知 tokens）；没有委派的团队任务按 owner 放进对应泳道。点进程内 / 队友卡片可打开子会话（`uiWorkspace.openSession` 的 subagent 地址），外部执行卡片展开官方结束通知里的结果。
- **依赖**：团队任务的 `blockedBy`，以及 workflow 前后 phase。
- **委派与任务的关联**：委派 description 以任务 id 开头（如 `task-3 实现计时器`）即执行该任务；Leader persona 规定了这一约定。同一任务的第二次及以后的委派记为返工，画红色虚线并计数。
- **外部执行过程**：DSH 的 ACP 接入只保留最终回答，所以 Gemini / Grok 启动脚本（`gemini/launch.mjs`、`grok/launch.mjs`）旁路记录每次运行的 ACP 公开更新（工具调用、计划、消息）到 `<DSH_HOME>/crew-progress/`（`acp-progress.mjs`，保留 7 天，记录失败不影响协议流）。Crew Host 通过官方 Typert Remote `crewProgress/list` 提供给浏览器；卡片按「委派工具调用里的 prompt 被该次运行的 ACP prompt 包含 + 执行者一致」配对，显示步数、当前步骤和步骤列表。Codex 走官方 app-server 插件，过程来自 Codex 原生 hooks：`codex/install-hooks.mjs <CODEX_HOME>` 写入 `hooks.json`、开启 `[features] hooks`，并通过 Codex 自己的 app-server 接口（`hooks/list` → `config/batchWrite`）信任这 5 个 hook；`codex/hook.mjs` 把每个事件追加到 `crew-progress/codex-<session>.jsonl`（工具 hook 异步、提示与结束 hook 同步）。信任按 hooks.json 路径和内容哈希记录，换目录或改 hook 命令后要重跑安装。
- **画布**：[React Flow](https://github.com/xyflow/xyflow)（`@xyflow/react`，MIT）渲染，[dagre](https://github.com/dagrejs/dagre)（MIT）按依赖排列列；泳道行固定。React Flow 只在第一次打开该标签时加载。

## 固定工作流

同类任务每次按同一套步骤执行：每个固定工作流是一个 DSH skill（`<name>/SKILL.md`，可带 `scripts/` 等文件），存放在用户级 skill 目录 `%USERPROFILE%/.agents/skills`——所有 preset（standard、Crew 等）、所有工作区都会扫描它，DSH 监视目录，新增或修改无需重启。对话框输入 `/name` 调用；默认 `disable-model-invocation: true`，只有用户主动调用才执行。

- `/save-workflow`（主副本 `skills/save-workflow`，安装时复制到用户级 skill 目录）：把本次对话做通的操作整理成统一格式的 SOP（适用场景、输入、固定步骤与通过标准、检查、禁止事项、交付物、回滚），或按要求修改已有工作流。
- `workflow_save` 工具：DSH 沙箱只允许写工作区，所以由 Host 写入。Crew Host 把它注册在 Host 级 `tools` 注册表，所有 agent 都继承；校验名称（小写短横线）与文件路径（仅 `scripts/`、`references/`、`assets/`），覆盖前把旧版本复制到 `%USERPROFILE%/.agents/skills-history/<name>/`，frontmatter 记录版本号。
- `CREW_WORKFLOWS_DIR` 覆盖保存目录（旁路验收配合隔离的 USERPROFILE 使用，见 `overlay/smoke/workflow-live.mjs`）。

## 安装与配置

见仓库根目录 [README.md](../README.md)：`node install.mjs` 通过官方 `dsh plugin add` 安装，所有路径、模型、key 名都是可选配置。

## 运行产物与兼容性

`engines.dsh` 精确锁定 `0.2.1-rc.5`。`lib/index.js`、`lib/client.js` 是 DSH 直接消费的已构建产物，`src/client/index.js` 为浏览器源码。包内还包含 `grok/` 的可选 ACP provider；它不由默认 bundle 启用，配置方式、环境凭据和外部会话投影限制见 [grok/README.md](grok/README.md)。Claude Code 登录失效时 Leader 应降级到 Codex。

浏览器源码在 `src/client/`（`index.js` 入口，`lanes-model.cjs` 纯函数折叠，`lanes-view.cjs` 画布）。`build.mjs` 用 esbuild 打成单个 ModuleLoader 产物 `lib/client.js`：React Flow、dagre 打进包内，React / React DOM / `@deepseek-ai/*` 保持外部，由 DSH ModuleLoader 提供（页面只有一份 React）。构建工具链锁定在包外的 `overlay/build/crew-client/`（`npm ci` 一次即可），因此本包作为 link 安装时不会给正式 profile 带进任何依赖。`node build.mjs` 重建，`node build.mjs --check` 校验产物与源码一致。

Leader preset 以该版本官方 standard 的完整 22 个顶层插件行为基线，保留 plan、todo、技能、subagent、workflow、嵌套 group 和两个平台 `!!js` 表达式；定制仅为 Leader persona 和 `skill-filesystem` 的额外技能目录（环境变量 `CREW_SKILLS_DIR`）（保留默认 roots）。因此沿用原正式启动方式也能发现精选技能，无需额外启动参数。DSH 整体替换 row 的 `config`，升级时须重新核对完整 preset，并在旁路验收后更新版本锁；不能只叠加 persona 或技能字段。
