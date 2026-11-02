# DSH Crew 插件

装在官方 DSH（`0.2.1-rc.5`）上的两个插件，用官方 `dsh plugin add` 安装，不修改 DSH 本体。

| 插件 | 内容 |
|---|---|
| `dsh-plugin-crew` | Crew Leader preset（统筹多个执行者）；会话页头「Crew」指挥台；右侧栏「Crew 泳道」画布（React Flow + dagre：执行者泳道、团队任务依赖、返工回环、每个外部执行者的步骤）；Gemini / Grok 外部执行者（`subagent_gemini`、`subagent_grok`）；Codex 过程记录 hook；固定工作流（`/save-workflow` + `workflow_save` 工具） |
| `dsh-plugin-projects` | 左侧「项目与交付」：项目、交付卡、工作流配方、定时 |

`releases/` 里是可直接安装的包。Crew 源码在 `dsh-plugin-crew/`；Projects 的源码在它的 tgz 包内（`src/`）。

## 安装（Windows）

1. **准备**
   - Node.js 22.19+（LTS）
   - DSH：`npm i -g @deepseek-ai/dsh@0.2.1-rc.5`
   - Gemini CLI（用 `subagent_gemini` 时）：`npm i -g @google/gemini-cli`
   - Grok CLI（用 `subagent_grok` 时）：按官方方式安装到 `%USERPROFILE%\.grok\bin\grok.exe`
   - Codex 不用单独装（DSH 自带）
2. **设置 key**（DSH 从环境变量读，新开的终端才生效）：
   ```powershell
   setx OPENAI_API_KEY "sk-..."   # 主模型 / Codex（或你的 OpenAI 兼容中转 key）
   setx GEMINI_API_KEY "..."      # subagent_gemini
   setx XAI_API_KEY "..."         # subagent_grok
   ```
   变量名都可以在配置里改（`apiKeyEnv` / `keyEnv`），用中转时换成你自己的名字即可。
3. **安装**（在本仓库目录）：
   ```powershell
   node install.mjs
   ```
   会依次：确认 DSH 的 `web` profile → `dsh plugin add` Agent Teams、Codex、Projects、Crew → 把 `/save-workflow` 装进 `%USERPROFILE%\.agents\skills` → 给 Codex（`%USERPROFILE%\.codex`）装过程记录 hook。
   常用参数：`--home <DSH_HOME>`（默认 `%USERPROFILE%\.dsh`）、`--dsh <...\@deepseek-ai\dsh\lib\bin.js>`、`--profile web`、`--codex-home <dir>`、`--no-codex-hooks`、`--registry <npm 源>`。可以重复运行。
4. **启动**：`dsh web`，浏览器里新建会话。默认 preset 是 Crew；页头点「Crew」→「泳道视图」。

## 配置

在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 里按 `id` 覆盖（保存后重启 DSH）。以下都是可选的，不写就用默认值。

**模型路由**（第一次装必须配一个能用的模型，也可以在 DSH 设置页里配）：
```yaml
- id: llm-pi-ai
  config:
    providers:
      relay:
        displayName: 我的中转
        apiKeyEnv: OPENAI_API_KEY
        api: openai-responses
        baseURL: https://<你的中转>/v1         # 或 https://api.openai.com/v1
        models:
          - id: gpt-6.1-sol
            name: gpt-6.1-sol
            reasoningEfforts: { off: null, medium: medium, high: high }
- id: agent-default-model
  config: { provider: relay, model: gpt-6.1-sol, reasoningEffort: medium }
```

**Crew 外部执行者**：
```yaml
- id: crew-ui
  config:
    gemini:
      enabled: true                  # false 关掉 subagent_gemini
      model: gemini-2.5-flash
      keyEnv: GEMINI_API_KEY         # 从哪个环境变量取 key
      # baseUrl: https://<你的中转>    # 不写就直连 Google
      # entry: C:/.../@google/gemini-cli/bundle/gemini.js   # 默认 %APPDATA%\npm\node_modules\...
    grok:
      enabled: true
      keyEnv: XAI_API_KEY            # 须与 Grok home 的 config.toml 里 env_key 一致
      # home: C:/my/grok-home         # 默认插件自带 grok/home（xAI 官方 grok-4）
      # executable: C:/.../grok.exe   # 默认 %USERPROFILE%\.grok\bin\grok.exe
    # progressDir: C:/...             # 外部执行者过程记录，默认 <DSH_HOME>\crew-progress
```

**Codex 子 agent**（官方 `subagent-codex`）：
```yaml
- id: subagent-codex
  config:
    model: gpt-6.1-sol
    permissionMode: never
    env:
      CODEX_HOME: C:/Users/<你>/.codex       # 装 hook 时用的同一个目录
      OPENAI_API_KEY: !!js process.env.OPENAI_API_KEY
```
Codex 自己的中转配置写在该 `CODEX_HOME\config.toml`（`model_provider`、`base_url`、`env_key = "OPENAI_API_KEY"`）。改了 hook 或挪了目录：`node <profile>\node_modules\dsh-plugin-crew\codex\install-hooks.mjs <CODEX_HOME>`。

**Projects**：
```yaml
- id: dsh-plugin-projects
  config:
    projectsRoot: D:/Work/projects            # 默认 <DSH_HOME>/projects
    dataDir: D:/Work/projects-data            # 默认 <DSH_HOME>/projects-data
    # uiCheckCommand: 默认用包内 tools/ui-check.mjs
    leaderPreset: crew
```

**环境变量**：`CREW_SKILLS_DIR`（Crew preset 额外的技能目录）、`CREW_WORKFLOWS_DIR`（固定工作流保存目录，默认 `%USERPROFILE%\.agents\skills`）。

## 调用 agent 时选模型

| 执行者 | 能否按次选模型 | 怎么配 |
|---|---|---|
| 主会话 | 能 | 输入框右下角模型下拉 |
| 进程内子 agent `subagent` | **能**：Leader 每次委派可指定 provider / model / 推理强度 | DSH「插件 → 官方 → 子智能体」页勾选允许子 agent 用的模型；勾了之后工具会多出 `provider`、`model`、`reasoning_effort` 参数和 `list_subagent_models` |
| `subagent_codex` | 固定 | `subagent-codex` 的 `model`；要多个模型就再配一个实例（不同 `providerName` / `toolName`） |
| `subagent_gemini` | 固定 | `crew-ui.gemini.model` |
| `subagent_grok` | 固定 | Grok home 的 `config.toml` |

想让 Leader 按任务换模型，最直接的是在需求里说明，比如"复核用 gemini、实现用 gpt-6.1-sol"。

## 固定工作流

做通一次后输入 `/save-workflow 把刚才的做法存成固定工作流，叫 xxx`；以后输入 `/xxx` 按同一套步骤执行；`/save-workflow 修改 xxx：…` 改流程（旧版本自动备份到 `%USERPROFILE%\.agents\skills-history`）。

## 更新

`git pull` 后重新运行 `node install.mjs`（包版本号变化时 pnpm 会替换）。开发：`cd build/crew-client && npm ci`，改源码后在 `dsh-plugin-crew` 里 `node build.mjs`，再 `npm pack --pack-destination ../releases` 并更新版本号。
