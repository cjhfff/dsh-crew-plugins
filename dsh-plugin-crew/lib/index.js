var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/host/index.js
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// acp-progress.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var RETAIN_MS = 7 * 24 * 3600 * 1e3;
var MAX_TOOLS = 300;
var pluginRoot = path.dirname(fileURLToPath(import.meta.url));
function progressDir(env = process.env) {
  if (env.CREW_PROGRESS_DIR) return env.CREW_PROGRESS_DIR;
  return env.DSH_HOME ? path.join(env.DSH_HOME, "crew-progress") : path.join(pluginRoot, ".progress");
}
var clip = (value, max) => String(value ?? "").slice(0, max);
function codexTitle(tool, input) {
  let args = input;
  try {
    args = JSON.parse(input);
  } catch {
    const head = /^\{"(?:command|cmd)":"((?:[^"\\]|\\.)*)/.exec(String(input));
    if (head) args = head[1].replace(/\\(["\\/])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, "	");
  }
  const command = typeof args === "object" && args ? args.command ?? args.cmd : args;
  const text = Array.isArray(command) ? command.join(" ") : String(command ?? "");
  const files = [...new Set([...text.matchAll(/(?:^|`n|\\n)\*\*\* (?:Add|Update|Delete) File: (.+?)(?=\\n|`n|["'`\r\n]|$)/gm)].map((match) => match[1].trim()))].filter((file) => file.length > 1);
  if (files.length) return { title: `Edit ${files.map((file) => file.split(/[\\/]/).pop()).join(", ")}`, kind: "edit", paths: files.slice(0, 5) };
  const line = text.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length > 3) ?? text.trim();
  if (/^Bash$|shell|exec/i.test(tool) && text) return { title: clip(line, 200), kind: "execute", paths: [] };
  return { title: clip(tool || "tool", 200), kind: "other", paths: [] };
}
function foldCodexLog(text, session) {
  const lines = String(text).split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => a.at - b.at);
  if (!lines.length) return void 0;
  const run = {
    id: `codex-${session}`,
    provider: "codex",
    cwd: "",
    startedAt: lines[0].at,
    updatedAt: lines.at(-1).at,
    endedAt: null,
    exitCode: null,
    stopReason: null,
    prompt: "",
    tools: [],
    plan: [],
    message: "",
    thoughts: 0
  };
  const tools = /* @__PURE__ */ new Map(), done = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (line.event === "SessionStart") run.cwd = line.cwd || run.cwd;
    else if (line.event === "UserPromptSubmit" && !run.prompt) run.prompt = line.prompt || "";
    else if (line.event === "PreToolUse" && !tools.has(line.id)) {
      const finished = done.get(line.id);
      const tool = { id: line.id, ...codexTitle(line.tool, line.input), status: finished ? "completed" : "in_progress", at: line.at, ...finished ? { endedAt: finished } : {} };
      tools.set(line.id, tool);
      run.tools.push(tool);
    } else if (line.event === "PostToolUse") {
      const tool = tools.get(line.id);
      if (tool) Object.assign(tool, { status: "completed", endedAt: line.at });
      else done.set(line.id, line.at);
    } else if (line.event === "Stop") Object.assign(run, { message: line.message || "", endedAt: line.at, stopReason: "end_turn", exitCode: 0 });
  }
  if (run.tools.length > MAX_TOOLS) run.tools.splice(0, run.tools.length - MAX_TOOLS);
  return run;
}
function readRuns({ since = 0, dir = progressDir(), limit = 100 } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const runs = [];
  for (const name2 of names) {
    const file = path.join(dir, name2);
    try {
      if (name2.endsWith(".json")) {
        if (Number(name2.split("-", 1)[0]) >= since) runs.push(JSON.parse(fs.readFileSync(file, "utf8")));
      } else if (name2.startsWith("codex-") && name2.endsWith(".jsonl") && fs.statSync(file).mtimeMs >= since) {
        const run = foldCodexLog(fs.readFileSync(file, "utf8"), name2.slice(6, -6));
        if (run && run.startedAt >= since) runs.push(run);
      }
    } catch {
    }
  }
  return runs.sort((a, b) => a.startedAt - b.startedAt).slice(-limit);
}

// src/host/executors.js
import os from "node:os";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import * as acp from "@deepseek-ai/dsh-subagent-acp";
import * as subagentTool from "@deepseek-ai/dsh-tool-subagent";
var pluginRoot2 = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
function progressDirOf(config = {}, env = process.env) {
  return config.progressDir || env.CREW_PROGRESS_DIR || (env.DSH_HOME ? path2.join(env.DSH_HOME, "crew-progress") : void 0);
}
var strings = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0));
function executorDefinitions(config = {}, env = process.env) {
  const progressDir2 = progressDirOf(config, env);
  const proxy = { NO_PROXY: env.NO_PROXY, no_proxy: env.no_proxy };
  const gemini = { enabled: true, model: "gemini-2.5-flash", keyEnv: "GEMINI_API_KEY", ...config.gemini };
  const grok = { enabled: true, keyEnv: "XAI_API_KEY", ...config.grok };
  const common = { command: process.execPath, permission: "allow", disposeEofGraceMs: 1e4, disposeGraceMs: 3e3 };
  return [
    gemini.enabled !== false && {
      provider: {
        ...common,
        providerName: "gemini",
        args: [path2.join(pluginRoot2, "gemini", "launch.mjs")],
        env: strings({
          CREW_GEMINI_API_KEY: env[gemini.keyEnv],
          CREW_GEMINI_MODEL: gemini.model,
          CREW_GEMINI_BASE_URL: gemini.baseUrl,
          CREW_GEMINI_ENTRY: gemini.entry || env.CREW_GEMINI_ENTRY,
          CREW_PROGRESS_DIR: progressDir2,
          ...proxy
        })
      },
      tool: { provider: "gemini", toolName: "subagent_gemini", maxDepth: "provider-managed" }
    },
    grok.enabled !== false && {
      provider: {
        ...common,
        providerName: "grok",
        args: [path2.join(pluginRoot2, "grok", "launch.mjs")],
        env: strings({
          [grok.keyEnv]: env[grok.keyEnv],
          CREW_GROK_SOURCE_HOME: grok.home || env.CREW_GROK_SOURCE_HOME || path2.join(pluginRoot2, "grok", "home"),
          CREW_GROK_EXECUTABLE: grok.executable || env.CREW_GROK_EXECUTABLE || path2.join(os.homedir(), ".grok", "bin", "grok.exe"),
          CREW_PROGRESS_DIR: progressDir2,
          ...proxy
        })
      },
      tool: { provider: "grok", toolName: "subagent_grok", maxDepth: "provider-managed" }
    }
  ].filter(Boolean);
}
function registerExecutors(ctx, config = {}) {
  for (const { provider, tool } of executorDefinitions(config)) {
    ctx.plugin(acp, provider);
    ctx.plugin(subagentTool, tool);
  }
}

// src/host/workflows.js
import fs2 from "node:fs/promises";
import os2 from "node:os";
import path3 from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
var WORKFLOWS_DIR = process.env.CREW_WORKFLOWS_DIR || path3.join(os2.homedir(), ".agents", "skills");
var NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var FILE = /^(?:scripts|references|assets)(?:\/[A-Za-z0-9._-]+)+$/;
var MAX_FILE = 2e5;
var MAX_TOTAL = 1e6;
var yamlString = (value) => JSON.stringify(String(value));
async function currentVersion(file) {
  try {
    return Number(/^\s+version:\s*(\d+)\s*$/m.exec(await fs2.readFile(file, "utf8"))?.[1] ?? 0);
  } catch {
    return 0;
  }
}
async function saveWorkflow(args, { root = WORKFLOWS_DIR, history = `${root}-history`, now = /* @__PURE__ */ new Date() } = {}) {
  const name2 = String(args.name ?? "").trim();
  if (!NAME.test(name2) || name2.length > 64) throw new Error("name must be lowercase kebab-case ASCII (a-z, 0-9, -), at most 64 characters, e.g. selinux-from-logs");
  const title = String(args.title ?? "").trim(), description = String(args.description ?? "").trim(), body = String(args.body ?? "").trim();
  if (!title || !description) throw new Error("title and description are required");
  if (body.length < 80) throw new Error("body must be the full SOP (inputs, fixed steps, checks, prohibitions, deliverables)");
  const files = args.files ?? void 0;
  if (files !== void 0) {
    if (typeof files !== "object" || Array.isArray(files)) throw new Error("files must map relative paths to text content");
    let total = 0;
    for (const [file, content] of Object.entries(files)) {
      if (!FILE.test(file) || file.split("/").includes("..")) throw new Error(`file path not allowed: ${file} (use scripts/, references/ or assets/)`);
      if (typeof content !== "string" || content.length > MAX_FILE) throw new Error(`file ${file} must be text up to ${MAX_FILE} characters`);
      total += content.length;
    }
    if (total > MAX_TOTAL) throw new Error("files exceed 1 MB in total");
  }
  const dir = path3.join(root, name2), skillFile = path3.join(dir, "SKILL.md");
  const previous = await currentVersion(skillFile);
  let backup;
  if (previous || await fs2.stat(dir).then(() => true, () => false)) {
    backup = path3.join(history, name2, `v${previous}-${now.toISOString().replace(/[:.]/g, "-")}`);
    await fs2.mkdir(path3.dirname(backup), { recursive: true });
    await fs2.cp(dir, backup, { recursive: true });
  }
  if (files !== void 0) for (const sub of ["scripts", "references", "assets"]) await fs2.rm(path3.join(dir, sub), { recursive: true, force: true });
  await fs2.mkdir(dir, { recursive: true });
  const version = previous + 1;
  const frontmatter = [
    "---",
    `name: ${name2}`,
    `description: ${yamlString(`${title}：${description}`)}`,
    ...args.modelInvocable === true ? [] : ["disable-model-invocation: true"],
    "metadata:",
    "  kind: crew-fixed-workflow",
    `  title: ${yamlString(title)}`,
    `  version: ${version}`,
    `  updatedAt: ${yamlString(now.toISOString())}`,
    "---"
  ].join("\n");
  for (const [file, content] of Object.entries(files ?? {})) {
    const target = path3.join(dir, ...file.split("/"));
    await fs2.mkdir(path3.dirname(target), { recursive: true });
    await fs2.writeFile(target, content, "utf8");
  }
  await fs2.writeFile(skillFile, `${frontmatter}

${body}
`, "utf8");
  return { name: name2, title, version, path: skillFile, invoke: `/${name2}`, previousVersionSavedTo: backup ?? null, files: Object.keys(files ?? {}) };
}
function workflowSaveTool() {
  return defineTool({
    name: "workflow_save",
    description: "Save or update a fixed workflow (the user's reusable SOP) as a DSH skill the user runs with /name. Use only when the user asks to save or change a fixed workflow, normally via the save-workflow skill. Overwrites the same name and keeps the previous version.",
    parameters: {
      name: { type: "string", required: true, description: "kebab-case ASCII, e.g. selinux-from-logs; becomes /selinux-from-logs." },
      title: { type: "string", required: true, description: "Short display title in the user's language." },
      description: { type: "string", required: true, description: "One line: what it does and when to use it." },
      body: { type: "string", required: true, description: "Full SOP markdown: inputs, fixed ordered steps with exact commands, checks, prohibitions, deliverables." },
      files: { type: "object", additionalProperties: true, description: 'Optional helper files, e.g. {"scripts/parse.sh": "..."}; only scripts/, references/, assets/. Omit to keep existing files.' },
      modelInvocable: { type: "boolean", description: "Default false: only the user starts it with /name." }
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    async execute(args) {
      return saveWorkflow(args);
    }
  });
}

// src/host/index.js
var _list_dec, _a, _init;
var CrewProgressService = class extends (_a = TypertRemoteService, _list_dec = [Remote("list")], _a) {
  constructor(ctx, config = {}) {
    super(ctx, "crewProgress", { namespace: "crewProgress" });
    __runInitializers(_init, 5, this);
    this.progressDir = progressDirOf(config);
  }
  async list(request) {
    return { runs: readRuns({ since: request.since, dir: this.progressDir }) };
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "list", _list_dec, CrewProgressService);
__decoratorMetadata(_init, CrewProgressService);
__publicField(CrewProgressService, "inject", ["typert"]);
var name = "dsh-plugin-crew";
var inject = CrewProgressService.inject;
function apply(ctx, config = {}) {
  ctx.plugin(CrewProgressService, config);
  registerExecutors(ctx, config);
  ctx.inject(["tools"], (toolCtx) => {
    toolCtx.tools.register(workflowSaveTool());
  });
}
export {
  WORKFLOWS_DIR,
  apply,
  executorDefinitions,
  inject,
  name,
  saveWorkflow
};
