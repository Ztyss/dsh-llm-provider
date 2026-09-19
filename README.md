# @dsh-one/dsh-llm-provider

[中文说明](https://github.com/imchangchang/dsh-llm-provider/blob/main/README.zh.md) · **English**

A plugin for [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (DeepSeek Harness). It replaces four entries of dsh's plugin tree — the pi-ai adapter (`llm-pi-ai`), the native DeepSeek adapter (`llm-deepseek`), the model selector (`ui-model-selection`) and the official Models settings page (`ui-settings-models`) — and adds quota lookups and provider management on top.

What you get:

1. **pi-ai version follows upstream.** dsh pins its LLM SDK, [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai), at build time; this plugin runs a copy it maintains itself, so new upstream models don't wait for a dsh release.
2. **Quota lookups.** Balance and usage windows per provider, feeding the provider cards and the quota indicator in the model selector.
3. **Model selector.** The official two-level structure (model / reasoning effort) plus provider filtering, quota indicator, capability badges and a model detail card.
4. **Provider settings page.** Add, remove, test and refresh providers; writes to the same settings section and credential store the official page uses.

The UI strings are Chinese; the plugin ships no English UI yet.

## Contents

- [Usage](#usage): [Install](#install) · [First run](#first-run) · [Configuration](#configuration) · [Test instance](#test-instance) · [Command-line checks](#command-line-checks)
- [Implementation](#implementation): [pi-ai bridge](#pi-ai-bridge) · [Candidate sources](#candidate-sources) · [Compatibility check](#compatibility-check) · [Model selector](#model-selector) · [Provider settings page](#provider-settings-page) · [Quota adapters](#quota-adapters) · [Route discovery](#route-discovery) · [Credential check](#credential-check) · [HTTP endpoints](#http-endpoints) · [Build](#build)
- [Boundaries](#boundaries)
- [Effect on model requests](#effect-on-model-requests)
- [Known gaps](#known-gaps)
- [Source layout](#source-layout)

## Usage

### Install

From npm:

```sh
dsh plugin --profile web add @dsh-one/dsh-llm-provider
dsh web     # restart required: the plugin tree changed
```

Add `@<version>` to the package name to install one specific version.

To work on this repository, link the checkout into the profile instead:

```sh
scripts/install-deps.sh   # install dev dependencies
npm run build             # lib/ is build output and is not committed
# link ~/.dsh/profiles/<profile>/node_modules/@dsh-one/dsh-llm-provider -> this checkout
# and set "@dsh-one/dsh-llm-provider": "link:<path>" in the profile's package.json dependencies
cd vendor && npm install  # optional: a pinned pi-ai kept in the checkout
dsh web                   # restart required: the plugin tree changed
```

Published packages ship neither `vendor/` nor its lockfile, so the pinned pi-ai only exists in a checkout. It is optional either way: a source that isn't installed is skipped and the plugin falls back to the pi-ai that ships with dsh. A missing directory means "not installed", not "incompatible", so nothing about it appears in the UI.

### First run

The plugin declares a DeepSeek route in its own config (`llm-pi-ai.providers.deepseek`, credential name `DEEPSEEK_API_KEY`), because the built-in `llm-deepseek` entry is disabled. A new install therefore shows a DeepSeek card with no key:

- Expand the card in Settings → 「模型服务」 → 「服务商」; the "API 密钥" row is an input field when no credential is stored. Saving it runs a quota query right away.
- For any other provider: 「＋ 添加供应商」, pick a preset, fill in key and endpoint, pass the test, save.
- The card then shows the balance, and the model selector shows the same snapshot on the current provider.

Keys are stored through dsh's own credential service under the route's `apiKeyEnv`, so they are the same credentials the official stack reads. Nothing here needs a plugin config file.

### Configuration

Providers come from `llm-pi-ai.providers` in `settings.yaml`. With no route there, the quota panel is empty — add one from the settings page as above. Keys are resolved by dsh's credentials service through each route's `apiKeyEnv`.

pi-ai updates are triggered two ways: once in the background at plugin startup (throttled to 6 hours, `DSH_PROVIDER_UPDATE=off` disables it) and by the 「检查更新」 button on the provider page (`POST /provider/update`).

Either way, **nothing is replaced before it passes both checks**: the tarball integrity from the registry (`dist.integrity`) and the compatibility check. Only then is the new version marked as pending a restart, and a version you already run is not downloaded again. pi-ai versions take effect only after a dsh restart, because the bridge is loaded at process start.

### Test instance

```sh
scripts/test-profile.sh        # start the plan-test profile (port 3081) and open a browser
scripts/test-profile.sh stop   # stop it
```

The test instance uses a separate profile, so instances can run side by side: `PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`. It sets `DSH_PROVIDER_TEST=1`, which makes the browser half append ` · 测试` to the page title and stamp 「测」 on the favicon. The generated profile also links a second local plugin, `dsh-sidekick` (`$DSH_HOME/workspaces/dsh-mobile/plugin`); edit those lines in the script on a machine that doesn't have that checkout.

### Command-line checks

```sh
node lib/adapters/run.js all            # run every quota adapter (keys from env or ~/.dsh/.credentials.yaml)
node lib/adapters/run.js kimi-coding --key sk-xx

npm test                                # build + 7 offline tests; this is what finishing and merging run
npm run typecheck                       # tsc --noEmit (npm test does not include it)
```

The seven tests cover route discovery, the credential check, the patch layer, the pi-ai check, the provider preset list, the vendor state merge, and the browser half's wiring. `AGENTS.md` describes the development workflow (no coding on main, everything in a worktree).

## Implementation

### pi-ai bridge

dsh's model catalog comes from the pi-ai version it was built with. The bridge makes it run on a version the plugin maintains:

- The installed `dsh-llm-pi-ai` bundle is copied to `vendor/llm-bridge/`, with a link next to it pointing at `vendor/pi-ai/<version>/`. Node resolves bare specifiers from there, so the copy picks up the newer pi-ai.
- pi-ai's model catalog and wire protocol implementations (`api/*.lazy`, `providers/all`) are lazy imports and all come from the new version; the dsh bundle copy only provides the stable glue.
- The official `llm-pi-ai` entry is disabled in `cordis.patch.yml`; the plugin takes over its settings section, model discovery and catalog.

Which pi-ai gets used is decided by the [compatibility check](#compatibility-check) before anything is loaded. Rolling back needs no link edit: delete the downloaded version and the next start falls back to the next source.

### Candidate sources

`loadBridge()` lists candidates in priority order, checks each one and takes the first that passes:

| Source | Directory | Used when |
|---|---|---|
| Downloaded | `vendor/pi-ai/<version>/` (newest first) | the updater downloaded it and it passed the check |
| Pinned dependency | `vendor/node_modules/@earendil-works/pi-ai` | optional; used when installed (`cd vendor && npm install`) |
| Bundled with dsh | found along the official bundle's `node_modules` chain (no hardcoded path) | neither of the above is installed, or fails the check |

Sources that are not installed are skipped silently. A source is only listed as skipped, with a reason, when it exists but fails the compatibility check. The pi-ai that ships with dsh follows dsh's own release cycle and is not necessarily older than upstream.

**On equal versions the one bundled with dsh wins.** A downloaded copy ranks first for a good reason (it may be a newer version), but when the versions are equal there is nothing to gain from letting the copy win: it duplicates a directory for nothing, and switching over requires a restart even though the host copy is already running. So on equal versions the host entry is promoted, and the "pi-ai bridge" tab shows which source ended up active.

Neither of the last two directories is hardcoded. The official bundle is resolved along the module resolution chain in this order: the profile's `node_modules`, the dsh installation tree (including the `node_modules` nested inside the dsh package), then this plugin. pi-ai is resolved the same way, starting from the bundle that was found. A different dsh layout (bundle inside its own install directory, dependencies hoisted elsewhere) therefore does not make a source disappear.

### Disk usage (`vendor/` is not a cache — do not delete it by hand)

The plugin's own code is about 220 KB, but `vendor/` holds runtime copies — **three orders of magnitude apart**:

| Path | Typical size | Contents |
|---|---|---|
| `vendor/pi-ai/<version>/` | ~80 MB | the downloaded pi-ai package plus its dependency closure (only the newest one is kept; older ones are reclaimed automatically) |
| `vendor/llm-bridge/` | ~1 MB | the bridge copy that actually runs |

Two former space hogs are gone from the plugin directory: the npm install cache now lives in the system temp directory and is removed right after the install (it used to stay in `vendor/.npm-cache`, measured at 178 MB once), and older pi-ai versions are pruned down to the newest one (previously every upgrade added another ~80 MB).

**`vendor/` is not a cache — do not delete it by hand.** Removing `vendor/pi-ai` is not a harmless "free the space, it will re-download next time": the copy inside may be the pi-ai that is currently active, and your model list, detail cards and display names all hang off it; an extracted copy with its dependency closure is about 80 MB and re-downloading takes time. To reclaim space, use the cleanup action in the "pi-ai bridge" tab, or delete a `vendor/pi-ai/<old version>` directly (only versions beyond the retention count are reclaimed automatically).

`vendor/package.json` pins the version of the optional dependency, and the two do not overwrite each other: updates only ever write to `vendor/pi-ai/<new version>/`. Both live under `vendor/` because the bridge copy at `vendor/llm-bridge/` resolves upwards into `vendor/node_modules` first, so choosing that source needs no link.

### Compatibility check

The bridge copy's imports of pi-ai (subpaths and named exports) are extracted from its source, a probe file is generated from them in the plugin's own temporary directory with a link to the candidate, and that file is required. The resolution rules match the copy exactly, but the module URL differs, so one failing candidate does not affect the next and does not pollute the real copy.

The extraction covers named imports and re-exports, dynamic `import()`, side-effect and namespace imports, and `export *`. **Checking before loading is required**: Node keeps a half-initialized record for an ESM file that failed to load, and requiring it again only reports `not yet fully loaded`. There is no "load first and fall back on failure" path.

Candidates that fail the check are listed in `bridge.rejected` from `/provider/status`. When the imports cannot be extracted at all the check cannot run, and the chosen source is accepted on the grounds that its directory exists — that case is reported as `probeUnverified: true`. The updater likewise only replaces a version that passes the check.

### Model selector

Takes over the composer's `conversation.input.model` slot and the `/model` command (the official `ui-model-selection` entry is disabled in `cordis.patch.yml`):

- Interaction matches the official one: trigger pill (`<provider-id>/<model-id>` · reasoning effort) → root panel with 「模型」 and 「推理等级」 rows → model panel → effort panel. Choosing a model or an effort closes the menu.
- Same data path as the official one: the catalog comes from `session/modelCatalog`, switching from `session/selectModel`, quota from `/plan/status`. The official `modelDirectories` client service is used when it is present, and the plugin's own RPC otherwise.
- The current selection is the session's own record when there is one, and the catalog default otherwise. The default effort is the `defaultEffort` the catalog declares; when it declares none, the official `Default` label is shown.
- A session recorded before this plugin may name the official `deepseek-official` route, which no longer exists. That selection is mapped to its current route (`deepseek`) for display and quota, and the seat rewrites the session's record once — the host refuses to send a prompt while the recorded provider has no adapter. The rewrite only happens when the target route and model are both in the catalog.
- Extras: provider filter chips with quota dots, cross-provider search (substring, acronym, edit distance), capability badges, context labels, and a model detail card.
- The quota indicator on the trigger reads the same snapshot as the provider cards and shows the tightest window's percentage; the card lists every window separately.
- When space runs out, the provider segment is hidden first and the model name is truncated last; effort and quota never shrink. Below a composer width of 760px the provider segment is hidden, below 620px the quota drops to a dot. The pill is capped at `min(560px, 60cqw)`, and the full name is always in its `title`.

### Provider settings page

Adds a 「模型服务」 tab to the settings page (the official `ui-settings-models` entry is disabled), with two sub-tabs: 「服务商」 and 「pi-ai 桥接」.

- Cards follow the official PluginCard: status dot, name, website link, one line of quota summary (`5h: 84% ◷ 3h7m ｜ 7d: 30% ◷ 3d20h`), and refresh time, per-card refresh and delete on the right. The expanded body shows the route configuration (route ID, masked key, API base URL, protocol, credential name) and that provider's model list with filtering and a detail card.
- Adding a provider: pick a preset → enter key and endpoint → a live test must pass before it is written. Writes go to `llm-pi-ai.providers` via `settings/mutate` and to the credential store via `credentials/set`, the same storage the official page uses.
- Adding a key: when a route exists but has no credential, that row in the card body is an input field (the official Models page is disabled, so this is the only place to enter it). Saving it runs a live quota query immediately. Such providers are labelled 「缺密钥」 in the add-provider list rather than 「已配置」, so they stay selectable.
- Removing: clears the route and the credential. Built-in native routes cannot be removed here.
- The 「pi-ai 桥接」 sub-tab shows the current version and source, skipped candidates with reasons, the upstream version and the update button.

### Quota adapters

One file per provider under `src/adapters/`, one registration line in `registry.ts`, the contract in `shared.ts`; `node lib/adapters/run.js` runs them standalone. Every adapter except qwen uses the provider's API key against a free GET endpoint; none needs a browser session.

| Adapter | Data source |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| moonshot | `api.moonshot.cn/v1/users/me/balance` (`.cn` or `.ai`, following the configured base URL) |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| minimax | `api.minimaxi.com/v1/api/openplatform/coding_plan/remains` (`.io` on the international site) |
| opencode-go | `opencode.ai/zen/go/v1/usage` |
| zenmux | the configured `baseURL` itself (`quota_5_hour` / `quota_7_day` in the response) |
| openrouter | `openrouter.ai/api/v1/credits` |
| qwen | no public endpoint: no request is sent, the card shows a 「看控制台」 link |

Numbers and presentation follow CC Switch ([farion1231/cc-switch](https://github.com/farion1231/cc-switch), a desktop tool that switches provider configs for coding CLIs): the fields it shows, and no others. Plan tier fields are dropped before they reach the browser, and the Kimi top-up balance is not shown because the figure disagrees with CC Switch and looks unreliable.

### Route discovery

Which providers appear in the quota panel and in the preset list comes from two sources:

1. `llm-pi-ai.providers` in `settings.yaml` — the pi-ai routes the user configured.
2. Native adapter routes from `ctx.llm.listConfigurableProviders()` (such as `deepseek-official`): they carry a default `apiKeyEnv` without a settings entry, and that default is not readable through the service, so `routes.ts` matches them against a `NATIVE_ROUTE_DEFAULTS` table.

A display name is the route's own `displayName` when it has one, otherwise the name from the `*Provider()` factory in the pi-ai registry (`pi-ai-names.ts`, cached), otherwise built from the id. Outside that registry only one entry is kept: Custom Gateway. Model IDs and route IDs are always shown as they are, matching the keys in settings.

### Credential check

The host compares keys while resolving them for each provider and warns in the UI when two providers use the same key. dsh itself does not do this, and the configuration UI never sees key values, so elsewhere this mistake only shows up as one provider that keeps failing. Key values are compared in-process and never leave it.

### HTTP endpoints

| Route | Purpose |
|---|---|
| `GET /plan/status` | quota snapshot for every provider (60s cache, `?refresh=1` bypasses it) |
| `GET /provider/status` | bridge status, route table, update status, test-instance flag |
| `POST /provider/update` | trigger one upstream check and update |
| `GET /provider/models` | full pi-ai model metadata (60s cache; used by detail cards and capability badges) |
| `GET /provider/presets` | provider presets available for adding (with configured flags) |
| `POST /provider/refresh` | refresh one card's quota (live query, updates the global snapshot) |
| `POST /provider/remove` | remove a provider (route and credential) |
| `POST /provider/test` | query one provider's quota with the stored key (read-only, does not update the snapshot) |

The add-provider form does not call `/provider/test`; it runs the official `llm/discoverModels` draft probe instead.

These are plain routes rather than official Typert Remotes: that generator only understands the monorepo layout (packages under `<root>/packages/`, `@Remote` sources inside registered packages), which does not fit a single-package plugin. That leaves no type-safe call sites, so the offline tests cover the routes.

### Build

```sh
npm run build      # tsdown: host src/*.ts -> lib/*.js (unbundled); browser src/client/index.ts -> lib/client.js (single CJS file with the window.__ModuleLoader__ wrapper)
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
```

The host half is translated file by file, and the output paths match the package.json exports. The browser half inlines everything under `src/client/` into one file; the three loader lines are added by the build's banner/footer/intro and are not in the source.

The plugin runs from `lib/`, so a source change without a build runs the old code.

Dependencies are installed with `scripts/install-deps.sh`, not `npm install` directly: `node_modules/@deepseek-ai` is a link into the host profile, and npm would follow it, try to reify the two hundred packages inside and fail. The script moves it aside, installs, and puts it back.

## Boundaries

- **Never writes host configuration.** The dsh installation, `settings.yaml` and credentials are read-only. Writes happen in two places only: the plugin's own `vendor/` (downloaded pi-ai, bridge copy, status files, some of which are written at load time) and explicit user actions in the UI (adding or removing a provider). Nothing host-side is written at startup.
- **Never modifies third-party files.** Not a byte of pi-ai is patched, even when its model data is a static snapshot that lags behind upstream — patching would break the registry integrity check and make installs unreproducible.
- **Never modifies official plugins.** Takeover happens by disabling official entries in `cordis.patch.yml` (`llm-pi-ai`, `llm-deepseek`, `ui-model-selection`, `ui-settings-models`); everything else official is untouched. The plugin's own model seat registers with `priority: -10`, which is what would shadow an official occupant at the same slot.
- **Key values never leave the host process.** The browser half receives conclusions and metadata only (a mask of the first 3 and last 4 characters).
- **No browser sessions.** Only API-key providers are supported.
- **The web server has no authentication** (dsh's design; it binds to loopback by default). These routes assume loopback-only reachability: exposing the host on `0.0.0.0` exposes balances and credential names through `/plan/status`.

## Effect on model requests

The plugin changes neither the system prompt, the tool schemas nor the message content. It decides which models are available, which wire protocol each one uses, and how the reasoning effort setting maps onto request parameters; the last two are implemented per model in pi-ai's wire code, not here.

- With no effort selected (the UI shows `Default`) no `reasoning_effort` is sent. Whether a thinking switch is sent, and with what value, follows pi-ai's implementation for that model.
- With an effort selected, pi-ai maps it for that provider — a `reasoning_effort` field for some, a `budget_tokens` value for providers that bill thinking by budget, adaptive thinking for others.

Quota lookups are separate free HTTP calls and add no tokens to model requests. Switching pi-ai versions swaps the model catalog and the usage figures with it. Switching model or provider changes the request prefix, so KV cache hits start from zero; switching effort within the same model only changes thinking parameters. The plugin does not rewrite session content; its own caches are the 60-second quota and model-metadata snapshots listed above.

## Known gaps

Capabilities the official entries have that this plugin does not:

- **Per-model list editing.** `ModelListEditor`, `DeepSeekModelsEditor` and `CustomProviderCard` are not available; per-model parameters have to be edited by hand in `llm-pi-ai.providers.<id>` in `settings.yaml`.
- **"Current model not routable" greying.** The official `ui-model-selection` greys out the composer when the current model cannot be routed. With that entry disabled, the input stays active even when the current provider is not configured.
- **Official onboarding.** The DeepSeek onboarding flow of the Models page has no replacement.

Not implemented yet:

- A sidebar entry and a global quota badge via `shell.overlay`.
- Live usage and failure attribution inside a session (reading usage from `llm/stream` and `session/event`, and quota/rate-limit failure codes from `llm/retry`). Quota data is polled from endpoints, which answers "how much is left on the account", not "what did this request cost and why did it fail".

Out of scope:

- Providers that need a browser session (OAuth for Claude, Codex, Gemini, Grok, Copilot). The Kimi console API needs a web-session JWT and is left out for the same reason.
- Forking the official plugin sources, or taking on the monorepo layout (which Typert Remote would require).

## Source layout

| Path | Purpose |
|---|---|
| `src/index.ts` | host entry: mounts the bridge, registers the HTTP routes |
| `src/bridge.ts` | bridge loading: copy the bundle, pick pi-ai through the check, manage links |
| `src/updater.ts` | upstream updater: check the registry, verify the tarball, install, mark pending |
| `src/routes.ts` | route discovery, website links, display name fallback |
| `src/provider-presets.ts` | preset list for adding a provider (generated from the pi-ai catalog plus Custom Gateway) |
| `src/model-details.ts` | model details: read the providers data files of the active pi-ai package |
| `src/pi-ai-names.ts` | read names from the pi-ai registry (the source of display names) |
| `src/credential-check.ts` | credential check |
| `src/adapters/*.ts` | quota adapters (one file per provider, plus registry and CLI runner) |
| `src/client/*.ts` | browser half: `index` (entry, slot registration) · `model-seat` · `settings` · `command` · `data` · `format` · `styles` · `i18n` · `icons` · `diag` · `types` |
| `cordis.patch.yml` | bundle patch layer: disable official entries, insert this plugin, declare the DeepSeek route |
| `test/*.mjs` | seven offline tests (no dsh, no services) |
| `scripts/*.sh` | worktree workflow, test instance, dependency install |
