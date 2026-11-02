# Crew Grok executor

The Crew Host (`src/host/executors.js`) registers the official `@deepseek-ai/dsh-subagent-acp` provider as `grok` and exposes it as the separate tool `subagent_grok`, next to the in-process `subagent` and `subagent_codex`. It needs the key named by `crew-ui.grok.keyEnv` (default `XAI_API_KEY`) in the DSH environment; without it only this child fails.

`launch.mjs` copies the Grok source home for each run into this directory's `.tmp` area, sets the copied `GROK_HOME`, disables Grok's nested subagents, and records the run's public ACP progress for the Crew lanes view (`../acp-progress.mjs`). The source home defaults to `home/` next to this file (a credential-free `config.toml` that names `env_key = "XAI_API_KEY"`); override with `crew-ui.grok.home` or `CREW_GROK_SOURCE_HOME`. The Grok CLI defaults to `%USERPROFILE%/.grok/bin/grok.exe`; override with `crew-ui.grok.executable` or `CREW_GROK_EXECUTABLE`.

Inline `api_key` values in the source config are refused. The ACP provider has no model-selection, preset, output-schema or depth-limit capability, so the model is the one in the source `config.toml`. External ACP runs have no local child Session; the lanes view shows their recorded steps instead.
