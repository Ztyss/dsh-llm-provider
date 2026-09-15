# @dsh-one/dsh-llm-provider

[中文说明](https://github.com/imchangchang/dsh-llm-provider/blob/main/README.zh.md) · **English**

A dsh plugin for LLM providers. It takes over four rows of dsh's built-in model stack — the pi-ai adapter (`llm-pi-ai`), the native DeepSeek adapter (`llm-deepseek`), the model selector (`ui-model-selection`) and the official Models settings page (`ui-settings-models`) — and adds quota lookups and provider management on top.

What you get:

1. **pi-ai version follows upstream.** dsh pins pi-ai at build time; this plugin runs a copy it maintains itself, so new upstream models don't wait for a dsh release.
2. **Quota lookups.** Balance and usage windows per provider, feeding the provider cards and the quota indicator in the model selector.
3. **Model selector.** The official two-level structure (model / reasoning effort) plus provider filtering, quota indicator, capability badges and a model detail card.
4. **Provider settings page.** Add, remove, test and refresh providers; writes to the same settings section and credential store the official page uses.

## Contents

- [Usage](#usage): [Install](#install) · [Configuration](#configuration) · [Test instance](#test-instance) · [Command-line checks](#command-line-checks)
- [Implementation](#implementation): [pi-ai bridge](#pi-ai-bridge) · [Candidate sources](#candidate-sources) · [Compatibility check](#compatibility-check) · [Model selector](#model-selector) · [Provider settings page](#provider-settings-page) · [Quota adapters](#quota-adapters) · [Route discovery](#route-discovery) · [Credential check](#credential-check) · [HTTP endpoints](#http-endpoints) · [Build](#build)
- [Boundaries](#boundaries)
- [What the model sees](#what-the-model-sees)
- [Known gaps](#known-gaps)
- [Source layout](#source-layout)

## Usage

### Install

From npm:

```sh
dsh plugin --profile web add @dsh-one/dsh-llm-provider
dsh web     # restart required: the plugin tree changed
```

pnpm's release cooldown means a version published minutes ago is not picked up yet. Pin the version to install it right away: `dsh plugin --profile web add @dsh-one/dsh-llm-provider@0.1.0`. The same applies to alpha builds (`@0.1.0-alpha.5`).

To work on this repository, link the checkout into the profile instead:

```sh
scripts/install-deps.sh   # install dev dependencies
npm run build             # lib/ is build output and is not committed
# link ~/.dsh/profiles/<profile>/node_modules/@dsh-one/dsh-llm-provider -> this checkout
# and set "@dsh-one/dsh-llm-provider": "link:<path>" in the profile's package.json dependencies
dsh web                   # restart required: the plugin tree changed
```

`vendor/` holds an optional pinned pi-ai (`cd vendor && npm install`; the lockfile is committed). It is not required: a source that isn't installed is skipped and the plugin falls back to the pi-ai that ships with dsh, with no "check failed" notice in the UI — a missing directory means "not installed", not "incompatible".

### Configuration

Quota lookups and routing need no configuration. Providers are discovered from `llm-pi-ai.providers` in `settings.yaml`, and keys are resolved by dsh's credentials service through each route's `apiKeyEnv`.

pi-ai updates are triggered two ways: once in the background at plugin startup (throttled to 6 hours, `DSH_PROVIDER_UPDATE=off` disables it) and by the "Check for updates" button on the provider page (`POST /provider/update`).

Either way, **nothing is replaced before it passes both checks**: the tarball integrity from the registry (`dist.integrity`) and the compatibility check. Only then is the new version marked as pending a restart. A version you already run is not downloaded again. Switching pi-ai versions needs a dsh restart — the bridge is loaded at process start.

### Test instance

```sh
scripts/test-profile.sh        # start the plan-test profile (port 3081) and open a browser
scripts/test-profile.sh stop   # stop it
```

The test instance uses a separate profile, so instances can run side by side: `PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`. It sets `DSH_PROVIDER_TEST=1`, which makes the browser half append "· test" to the title and stamp the favicon. The script writes the profile files idempotently; change the script to change the profile.

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
- The official `llm-pi-ai` row is disabled in `cordis.patch.yml`; the plugin takes over its settings section, model discovery and catalog.

Which pi-ai gets used is decided by the [compatibility check](#compatibility-check) before anything is loaded. A new version takes effect after a dsh restart. Rolling back needs no link edit: delete the downloaded version and the next start falls back to the next source.

### Candidate sources

`loadBridge()` lists candidates in priority order, checks each one and takes the first that passes:

| Source | Directory | Used when |
|---|---|---|
| Downloaded | `vendor/pi-ai/<version>/` (newest first) | the updater downloaded it and it passed the check |
| Pinned dependency | `vendor/node_modules/@earendil-works/pi-ai` | optional; used when installed (`cd vendor && npm install`) |
| Bundled with dsh | found along the official bundle's `node_modules` chain (no hardcoded path) | neither of the above is installed, or fails the check |

Sources that are not installed are skipped silently. A source is only listed as skipped, with a reason, when it exists but fails the compatibility check. The pi-ai that ships with dsh follows dsh's own release cycle and is not necessarily older than upstream — dsh 0.1.5-rc.1 ships 0.85.1, which was the newest at the time.

Neither of the last two directories is hardcoded. The official bundle is resolved along the module resolution chain in this order: the profile's `node_modules`, the dsh installation tree (including the `node_modules` nested inside the dsh package), then this plugin. pi-ai is resolved the same way, starting from the bundle that was found. A different dsh layout (bundle inside its own install directory, dependencies hoisted elsewhere) therefore does not make a source disappear.

`vendor/package.json` pins the version of the optional dependency, and the two do not overwrite each other (updates only ever write to `vendor/pi-ai/<new version>/`). Both live under `vendor/` for a reason: the bridge copy is at `vendor/llm-bridge/`, so resolving upwards hits `vendor/node_modules` first and no link is needed when that source is chosen; and `node_modules/@deepseek-ai` at the plugin root is a manual link (the dsh package inside the bridge copy resolves through it), which `npm install` would treat as an entry to reify and fail on.

### Compatibility check

The bridge copy's imports of pi-ai (subpaths and named exports) are extracted from its source, a probe file is generated from them in the plugin's own temporary directory with a link to the candidate, and that file is required. The resolution rules match the copy exactly, but the module URL differs, so one failing candidate does not affect the next and does not pollute the real copy.

The extraction covers named imports and re-exports, dynamic `import()`, side-effect and namespace imports, and `export *`. **Checking before loading is required**: Node keeps a half-initialized record for an ESM file that failed to load, and requiring it again only reports `not yet fully loaded`. There is no "load first and fall back on failure" path.

Candidates that fail the check, or that could not be checked at all because their imports could not be extracted, are reported in `bridge.rejected` / `probeUnverified` from `/provider/status`. The updater likewise only replaces a version that passes the check.

### Model selector

Takes over the composer's `conversation.input.model` slot and the `/model` command (the official `ui-model-selection` row is disabled in `cordis.patch.yml`):

- Interaction matches the official one: trigger pill (`provider-id/model-id` · reasoning effort) → root panel with "model / reasoning effort" rows → model panel → reasoning effort panel. Choosing a model or an effort closes the menu.
- Same data path as the official one: the catalog comes from `session/modelCatalog`, switching from `session/selectModel`, quota from `/plan/status`. The official `modelDirectories` client service is used when present (that is, when the official row is enabled again); otherwise the plugin uses its own RPC and the `modelSelection` session projection.
- Current selection is `session projection next ?? catalog default`. The default effort is only the `defaultEffort` the catalog declares; when it declares none, the official `Default` label is shown.
- Extras: provider filter chips with quota dots, cross-provider search (substring, acronym, edit distance), capability badges, context labels, and a model detail card.
- The quota indicator on the trigger shows the same value as the provider card. When space runs out, effort and quota never shrink, the provider segment gives way first, and the model name is truncated last; beyond that the layout degrades with the composer width (provider segment hidden at ≤760px, quota reduced to a dot at ≤620px). The maximum width is `min(560px, 60cqw)`. The full name is always in the trigger's `title`.

### Provider settings page

Adds a `Provider` tab to the settings page (the official `ui-settings-models` row is disabled), with two sub-tabs: providers and pi-ai bridge.

- Cards follow the official PluginCard: status dot, name, website link, one line of quota summary (`5h: 84% ◷ 3h7m ｜ 7d: 30% ◷ 3d20h`), and refresh time, per-card refresh and delete on the right. The expanded body shows the route configuration (route ID, masked key, API base URL, protocol, credential name) and that provider's model list with filtering and a detail card.
- Adding a provider: pick a preset → enter key and endpoint → a live test must pass before it is written. Writes go to `llm-pi-ai.providers` via `settings/mutate` and to the credential store via `credentials/set`, the same storage the official page uses.
- Adding a key: when a route exists but has no credential, that row in the card body is an input field (the official Models page is disabled, so this is the only place to enter it). Saving it runs a live quota query immediately. Such half-configured providers are labelled "缺密钥" (key missing) in the add-provider list rather than "已配置" (configured), so they are not greyed out.
- Removing: clears the route and the credential. Built-in native routes cannot be removed here.
- The pi-ai bridge sub-tab shows the current version and source, skipped candidates with reasons, the upstream version and the update button.

### Quota adapters

One file per provider under `src/adapters/`, one registration line in `registry.ts`, the contract in `shared.ts`; `node lib/adapters/run.js` runs them standalone. All of them use only the provider's API key and free GET endpoints, with no browser session.

| Adapter | Data source |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| moonshot | `api.moonshot.cn/v1/users/me/balance` |
| minimax | MiniMax usage endpoint |
| opencode-go | OpenCode Go subscription usage |
| zenmux | OpenCode Zen usage |
| openrouter | OpenRouter balance |
| qwen | no public endpoint; shows an explanatory note only |

Numbers and presentation follow CC Switch: whatever it shows, this shows, with no extra fields. (The Kimi top-up balance is not shown: the figure disagrees with CC Switch and looks unreliable.)

### Route discovery

Which providers appear in the quota panel and in the preset list comes from two sources:

1. `llm-pi-ai.providers` in `settings.yaml` — the pi-ai routes the user configured.
2. Native adapter routes from `ctx.llm.listConfigurableProviders()` (such as `deepseek-official`): they carry a default `apiKeyEnv` without a settings entry, and that default is not readable through the service, so `routes.ts` matches them against a `NATIVE_ROUTE_DEFAULTS` table.

Display names always come from the `*Provider()` factory names in the pi-ai registry (`pi-ai-names.ts`, cached). Outside that registry only one entry is kept: Custom Gateway. Model IDs and route IDs are always shown as they are, matching the keys in settings.

### Credential check

The host compares keys while resolving them for each provider and warns in the UI when two providers use the same key. dsh itself does not do this, and the configuration UI never sees key values, so elsewhere this mistake only shows up as one provider that keeps failing. Only the conclusion leaves the host process; key values are compared in-process.

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
| `POST /provider/test` | live test before adding |

These are plain routes rather than official Typert Remotes: that generator only understands the monorepo layout (packages under `<root>/packages/`, `@Remote` sources inside registered packages), which does not fit a single-package plugin. The cost is no type-safe call sites, covered by the offline tests.

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

- **Never writes host configuration.** The dsh installation, `settings.yaml` and credentials are read-only. Writes happen in two places only: the plugin's own `vendor/` (downloaded pi-ai, bridge copy) and explicit user actions in the UI (adding or removing a provider). Nothing is written at startup.
- **Never modifies third-party files.** Not a byte of pi-ai is patched, even when its model data is a static snapshot that lags behind upstream — patching would break the registry integrity check and make installs unreproducible.
- **Never modifies official plugins.** Takeover happens by disabling official rows in `cordis.patch.yml` (`llm-pi-ai`, `llm-deepseek`, `ui-model-selection`, `ui-settings-models`); everything else official is untouched. Where a row is not the target, a negative priority hides it instead. When a patch does not match an id, dsh warns and skips, so the patch is safe on profiles without those rows.
- **Key values never leave the host process.** The browser half receives conclusions and metadata only (a mask of the first 3 and last 4 characters).
- **No browser sessions.** Only API-key providers are supported.
- **The web server has no authentication** (dsh's design; it binds to loopback by default). These routes assume loopback-only reachability: exposing the host on `0.0.0.0` exposes balances and credential names through `/plan/status`.

## What the model sees

The plugin changes neither the system prompt, the tool schemas nor the message content. It decides which models are available, which wire protocol they use, and how reasoning effort maps onto request parameters.

- With no effort selected (the UI shows `Default`) the request carries no `reasoning_effort`. Each provider's thinking switch follows its wire protocol: deepseek, zai, qwen and MiniMax send `thinking: disabled` / `enable_thinking: false` at that level, while kimi-coding (Anthropic protocol) sends nothing and leaves it to the provider default.
- With an effort selected: deepseek sends `thinking: enabled` plus `reasoning_effort`; MiniMax and opencode-go send `thinking: enabled` plus `budget_tokens`; kimi-coding sends adaptive thinking.

Quota lookups are separate free HTTP calls and add no tokens to model requests. Switching pi-ai versions swaps both the model catalog and the usage/billing interpretation. Switching model or provider changes the request prefix, so KV cache hits start from zero; switching effort within the same model only changes thinking parameters. The plugin keeps no cache and does not rewrite session content.

## Known gaps

Retired together with the official rows, not yet reimplemented:

- **Per-model list editing.** `ModelListEditor`, `DeepSeekModelsEditor` and `CustomProviderCard` from the official Models page are gone with it; per-model parameters now have to be edited by hand in `llm-pi-ai.providers.<id>` in `settings.yaml`.
- **"Current model not routable" greying.** The official `ui-model-selection` pushed that state to the composer; with it disabled, the input no longer greys out automatically when the current provider has been removed.
- **Official onboarding.** The DeepSeek onboarding flow that came with the Models page is gone as well.

Not implemented:

- A sidebar entry and a global quota badge via `shell.overlay`.
- Live usage and failure attribution inside a session (reading usage from `llm/stream` and `session/event`, and quota/rate-limit failure codes from `llm/retry`). Quota data is polled from endpoints today, which answers "how much is left on the account", not "what did this request cost and why did it fail".

Non-goals:

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
| `src/pi-ai-names.ts` | read names from the pi-ai registry (the single source of display names) |
| `src/credential-check.ts` | credential check |
| `src/adapters/*.ts` | quota adapters (one file per provider, plus registry and CLI runner) |
| `src/client/*.ts` | browser half: `index` (entry, slot registration) · `model-seat` · `settings` · `command` · `data` · `format` · `styles` · `i18n` · `icons` · `diag` · `types` |
| `cordis.patch.yml` | bundle patch layer: disable official rows, insert this plugin, declare the DeepSeek route |
| `test/*.mjs` | seven offline tests (no dsh, no services) |
| `scripts/*.sh` | worktree workflow, test instance, dependency install |
