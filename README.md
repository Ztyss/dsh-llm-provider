# @dsh-one/dsh-llm-provider

A plugin for [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (DeepSeek Harness).
It replaces four entries of dsh's plugin tree — the pi-ai adapter (`llm-pi-ai`), the
native DeepSeek adapter (`llm-deepseek`), the model selector (`ui-model-selection`) and
the official Models settings page (`ui-settings-models`) — and adds quota lookups and
provider management on top.

[中文说明](README.zh.md) · **English**

## Where this comes from

| | |
|---|---|
| Upstream | [imchangchang/dsh-llm-provider](https://github.com/imchangchang/dsh-llm-provider) |
| This fork | [Ztyss/dsh-llm-provider](https://github.com/Ztyss/dsh-llm-provider) (private) |
| Base commit | upstream `1eb017f` (v0.1.0-rc.2) |
| Remotes | `origin` → this fork · `upstream` → the original repo |

Upstream `0.2.0` has no source in that repository (only `main` exists), so every
source-level change here is based on `1eb017f`. Features that exist only in `0.2.0`
(OAuth, github-copilot) are out of scope.

## What is customised here

1. **pi-ai is read-only.** The plugin uses the copy bundled with dsh and never downloads
   its own; all download/update entries are closed. The recursive-delete write paths that
   installed copies are gone (see [pi-ai bridge](#pi-ai-bridge)).
2. **Card-level provider editing.** Each provider card has an edit mode (✎) for display
   name, protocol, endpoint and credential name. Only changed fields are written, and
   clearing a field removes the key instead of writing an empty value.
3. **The browser half is bilingual (zh/en)** through dsh's own locale mechanism.
4. **Issue fixes #1–#8** (see [Fixed issues](#fixed-issues)).
5. **Fork-shaped packaging**: build output (`lib/`) is committed so the repo installs with
   one `dsh plugin add`, and a test instance can run beside the real profile.

## Usage

### Install

```sh
# One command. This fork is private, so git needs credentials (gh auth login is enough).
dsh plugin --profile web add github:Ztyss/dsh-llm-provider
dsh web     # restart required: the plugin tree is assembled at process start
```

`dsh plugin add` forwards to pnpm *and* reconciles `dsh.profile.bundles`. Both halves
matter — installing the dependency alone does not load the plugin. Verify:

```sh
dsh --profile web --dump-config | grep -A2 'id: dsh-llm-provider'
```

To work on the source instead, link the checkout into the profile:

```sh
npm run build             # writes lib/
# link ~/.dsh/profiles/<profile>/node_modules/@dsh-one/dsh-llm-provider -> this checkout
# and set "@dsh-one/dsh-llm-provider": "link:<path>" in the profile's package.json
```

### First run

The plugin declares a DeepSeek route in its own config (`llm-pi-ai.providers.deepseek`,
credential name `DEEPSEEK_API_KEY`) because the built-in `llm-deepseek` entry is disabled.
A new install therefore shows a DeepSeek card with no key:

- Expand the card in Settings → 「模型服务」 → 「服务商」. The 「API 密钥」 row is an input
  field when no credential is stored; saving it runs a quota query right away.
- Any other provider: 「＋ 添加供应商」 → pick a preset → fill in key and endpoint → pass the
  test → save.
- Edit an existing provider with the ✎ button on its card.

Keys are stored through dsh's own credential service under the route's `apiKeyEnv`, so they
are the same credentials the official stack reads. No plugin config file is involved.

### Configuration

Providers come from `llm-pi-ai.providers` in `settings.yaml`; with no route there the quota
panel is empty. Keys are resolved by dsh's credentials service through each route's
`apiKeyEnv`.

**pi-ai updates are off.** The plugin follows the pi-ai bundled with dsh and never
downloads one: there is no background check and no update button. `/provider/update`
still answers, but only to say so. To move pi-ai, update dsh itself.

### Test instance

```sh
scripts/test-profile.sh        # start the plan-test profile (port 3081) and open a browser
scripts/test-profile.sh stop   # stop it
```

It uses a separate profile, so it can run beside the real one:
`PORT=3082 PROFILE=plan-test-foo LOG=/tmp/dsh-plan-foo.log scripts/test-profile.sh`.
It sets `DSH_PROVIDER_TEST=1`, which makes the browser half append ` · 测试` to the page
title and stamp 「测」 on the favicon. Edit the script's extra plugin link on a machine
that lacks that checkout.

### Command-line checks

```sh
node lib/adapters/run.js all            # run every quota adapter (keys from env or ~/.dsh/.credentials.yaml)
node lib/adapters/run.js kimi-coding --key sk-xx

npm test                                # build + 12 offline tests
npm run typecheck                       # tsc --noEmit (npm test does not include it)
```

## Implementation

### pi-ai bridge

dsh's model catalog comes from the pi-ai version it was built with. This fork does **not**
maintain its own copy: it uses the one bundled with dsh, read-only.

- Before use, `src/pi-ai-source.ts` verifies `package.json`, `dist/index.js` and the four
  subpaths the official bundle actually imports (`providers/all.js`,
  `api/anthropic-messages.lazy.js`, `api/openai-completions.lazy.js`,
  `api/openai-responses.lazy.js`). Checking only `package.json` is not enough: in the
  2026-09-18 incident the directory and manifest were intact with `dist/` emptied, and
  Node then reported an unrelated `Cannot find package '...pi-ai\index.js'`.
- The bridge copy at `vendor/llm-bridge/` gets a link pointing at the host package; the
  bundle's lazy imports (`api/*.lazy`, `providers/all`) then resolve there.
- The official `llm-pi-ai` entry is disabled by `cordis.patch.yml`, and the plugin takes
  over its settings section, model discovery and catalog.

**The four official rows are disabled conditionally**, which is what keeps a broken pi-ai
from taking the whole host down:

```yaml
- id: llm-pi-ai
  disabled: !!js (()=>{try{…}catch{return false}})()
```

The expression is generated by `src/patch-condition.ts` and synced into the patch file by
`scripts/sync-patch-condition.mjs`; `npm test` verifies the two have not drifted. It
resolves pi-ai from the dsh entry point, so when pi-ai is intact the official row is
disabled and the bridge takes over, and when pi-ai is missing or incomplete the official
row is **kept** — the host still boots. Two constraints when editing it (both measured):
the evaluation scope has **no `require`**, and a throwing expression fails the whole plugin
tree, hence the `try/catch`.

### Model selector

Takes over the composer's `conversation.input.model` slot and the `/model` command (the
official `ui-model-selection` entry is disabled — two state machines would fight):

- Interaction matches the official one: trigger pill → model panel → effort panel.
- Same data path: catalog from `session/modelCatalog`, switching from `session/selectModel`,
  quota from `/plan/status`. A session recorded before this plugin may name the official
  `deepseek-official` route; that selection is mapped onto its current route once.
- Extras: provider filter chips with quota dots, cross-provider search, capability badges,
  context labels, model detail cards. The quota indicator shows the tightest window; the
  card lists every window separately.

### Provider settings page

Adds a 「模型服务」 tab with two sub-tabs: 「服务商」 and 「pi-ai 桥接」.

- Cards follow the official PluginCard: status dot, name, one line of quota summary,
  refresh time, and per-card refresh/delete. The expanded body shows route configuration
  and that provider's model list with filtering.
- Adding: preset → key + endpoint → a live test must pass before anything is written.
  Writes go to `llm-pi-ai.providers` via `settings/mutate` and to the credential store via
  `credentials/set` — the same storage the official page uses.
- The per-model list editor writes `llm-pi-ai.providers.<id>.models`.
- **Every write is per field** (`['providers', id, field]`). A `set` whose path lands on the
  route object itself is a whole-object replacement in the host's `applyPathOp`, which
  silently discards hand-written `models` / `compat` (issue #1).
- Removing clears the route and the credential; built-in native routes cannot be removed
  here.

### Quota adapters

One file per provider under `src/adapters/`, one registration line in `registry.ts`, the
contract in `shared.ts`; `node lib/adapters/run.js` runs them standalone. Every adapter
except qwen uses the provider's API key against a free GET endpoint; none needs a browser
session.

| Adapter | Data source |
|---|---|
| deepseek | `api.deepseek.com/user/balance` |
| kimi-coding | `api.kimi.com/coding/v1/usages` |
| moonshot | `api.moonshot.cn/v1/users/me/balance` (`.cn` or `.ai`, following the base URL) |
| glm | `open.bigmodel.cn/api/monitor/usage/quota/limit` |
| minimax | `api.minimaxi.com/v1/api/openplatform/coding_plan/remains` |
| opencode-go | `opencode.ai/zen/go/v1/usage` |
| zenmux | the configured `baseURL` itself (`quota_5_hour` / `quota_7_day` in the response) |
| openrouter | `openrouter.ai/api/v1/credits` |
| qwen | no public endpoint: no request is sent, the card shows a 「看控制台」 link |

Numbers and presentation follow CC Switch
([farion1231/cc-switch](https://github.com/farion1231/cc-switch)): the fields it shows, and
no others.

### HTTP endpoints

| Route | Purpose |
|---|---|
| `GET /plan/status` | quota snapshot for every provider (60s cache, `?refresh=1` bypasses it) |
| `GET /provider/status` | bridge status, route table, test-instance flag |
| `GET /provider/models` | full pi-ai model metadata (60s cache; detail cards and badges) |
| `GET /provider/presets` | presets available for adding (with configured flags) |
| `POST /provider/refresh` | refresh one card's quota |
| `POST /provider/remove` | remove a provider (route and credential) |
| `POST /provider/test` | query one provider's quota with the stored key (read-only) |
| `POST /provider/update` | **disabled** — answers "downloads are off" |

These are plain routes rather than official Typert Remotes: that generator only understands
the monorepo layout, which does not fit a single-package plugin. That leaves no type-safe
call sites, so the offline tests cover the routes.

### Build

```sh
npm run build      # tsdown: host src/*.ts -> lib/*.js (unbundled); browser -> lib/client.js
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
```

The host half is translated file by file; the browser half inlines everything under
`src/client/` into one CJS file behind a `window.__ModuleLoader__` wrapper (added by the
build's banner/footer/intro, not present in the source). The host build is **unbundle**:
only files listed in `tsdown.config.ts` `entry` are compiled, so a new host module must be
added there.

**`lib/` is committed to this fork** so that `dsh plugin add github:…` installs a loadable
package. After changing the source, run `npm run build` and commit `lib/` together with
`src/`. There is deliberately **no `prepare` script**: pnpm runs it inside a temporary
directory when installing from git, where `tsdown` is unavailable, which fails the install.

Dependencies are installed with `scripts/install-deps.sh`, not `npm install` directly:
`node_modules/@deepseek-ai` is a link into the host profile, and npm would follow it, try
to reify two hundred packages inside and fail.

## Boundaries

- **Never writes host configuration.** The dsh installation, `settings.yaml` and credentials
  are read-only. Writes happen only in the plugin's own `vendor/` and through explicit UI
  actions.
- **Never downloads pi-ai, and never modifies it.** Not a byte of it is patched, even where
  its model data is a static snapshot: patching would break registry integrity checks.
- **Never modifies official plugins.** Takeover happens by disabling official entries in
  `cordis.patch.yml`; everything else official is untouched.
- **Key values never leave the host process.** The browser half receives a mask (first 3
  and last 4 characters) and metadata only.
- **No browser sessions.** Only API-key providers are supported.
- **The web server has no authentication** (dsh's design; it binds to loopback by default).
  These routes assume loopback-only reachability: exposing the host on `0.0.0.0` exposes
  balances and credential names through `/plan/status`.

## Effect on model requests

The plugin changes neither the system prompt, the tool schemas nor the message content. It
decides which models are available, which wire protocol each uses, and how the reasoning
effort setting maps onto request parameters; the last two are implemented per model in
pi-ai's wire code, not here.

- With no effort selected (`Default` in the UI) no `reasoning_effort` is sent.
- With an effort selected, pi-ai maps it for that provider — a `reasoning_effort` field for
  some, `budget_tokens` for providers that bill thinking by budget, adaptive thinking for
  others.

Quota lookups are separate free HTTP calls and add no tokens. Switching model or provider
changes the request prefix, so KV cache hits start from zero; switching effort within the
same model only changes thinking parameters.

## Known gaps

- **"Current model not routable" greying.** The official `ui-model-selection` greys out the
  composer when the current model cannot be routed. With that entry disabled, the input
  stays active even when the current provider is not configured.
- **Official onboarding.** The DeepSeek onboarding flow of the Models page has no
  replacement.
- **No enable/disable toggle per provider** — only deletion.
- Roughly twenty host-side log strings remain Chinese (process logs, not browser UI).

Not implemented yet: a sidebar entry with a global quota badge; live usage and failure
attribution inside a session (quota is polled from endpoints, which answers "how much is
left", not "what did this request cost").

Out of scope: providers that need a browser session (OAuth for Claude, Codex, Gemini,
Grok, Copilot); forking the official plugin sources or adopting the monorepo layout.

## Fixed issues

| # | Problem | Fix |
|---|---|---|
| #1 | no per-model editing; adding a provider wiped hand-written config | list editor, per-field writes, card-level editing |
| #2 | root cause fixed together with #8 | — |
| #3 | delete confirm sat on top of ✕ (a double-click deleted) | confirm panel moved to the card bottom |
| #4 | plugin directory 260 MB while the code is 220 KB | no downloaded copies at all now |
| #5 | custom models never got a "vision" badge | capabilities read from the route's declared `input` |
| #6 | deleting `vendor/pi-ai` broke the host; diagnostics blank | read-only policy, per-candidate diagnostics |
| #7 | the `/model` command did nothing | the required `available(session)` was missing |
| #8 | the three-window header drew a single divider | grouped by window; "monthly" no longer shows as 7d |

## Source layout

| Path | Purpose |
|---|---|
| `src/index.ts` | host entry: mounts the bridge, registers the HTTP routes |
| `src/bridge.ts` | bridge loading: bundle copy, candidate probing, link handling |
| `src/pi-ai-source.ts` | pi-ai integrity check and the recovery hint |
| `src/patch-condition.ts` | generates the `!!js` guard that disables the four rows |
| `src/updater.ts` | disabled download entry (kept as a no-op for `/provider/update`) |
| `src/routes.ts` | route discovery, website links, display-name fallback |
| `src/provider-presets.ts` | preset list for adding a provider |
| `src/model-details.ts` | model details from the active pi-ai package |
| `src/pi-ai-names.ts` | display names read from the pi-ai registry |
| `src/credential-check.ts` | warns when two providers share a key |
| `src/adapters/*.ts` | quota adapters (one file per provider, plus registry and CLI runner) |
| `src/client/*.ts` | browser half: `index` · `model-seat` · `settings` · `provider-edit` · `model-editor` · `command` · `data` · `format` · `i18n` · `styles` |
| `cordis.patch.yml` | patch layer: conditional disables, plugin insert, DeepSeek route |
| `test/*.mjs` | twelve offline tests (no dsh, no services) |
| `scripts/*.sh` | worktree workflow, test instance, dependency install |
