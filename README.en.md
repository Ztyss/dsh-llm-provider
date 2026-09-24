# @ztyss/dsh-llm-provider

A [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (DeepSeek Harness) plugin that takes over
the official pi-ai adapter (`llm-pi-ai`), the native DeepSeek adapter (`llm-deepseek`), the model
selector (`ui-model-selection`) and the Models settings page (`ui-settings-models`), providing a
self-maintained pi-ai bridge, model selector, quota lookups and provider management UI.

[中文](README.md) · **English**

> This repository is forked from [imchangchang/dsh-llm-provider](https://github.com/imchangchang/dsh-llm-provider) and maintained independently since. Current version [v0.2.3](https://github.com/Ztyss/dsh-llm-provider/releases/tag/v0.2.3) (installs from main).

## Install

```sh
dsh plugin --profile web add github:Ztyss/dsh-llm-provider   # private repo; git needs credentials (gh auth login)
dsh web     # restart required: the plugin tree is assembled at process start
```

The build output (`lib/`) ships with the repository, so it works right after install. After
changing source, run `npm run build` and commit `lib/` together with `src/` (there is deliberately
no `prepare` script: pnpm runs it in a temp dir on git installs where `tsdown` is missing, which
fails the whole install).

## Features

### pi-ai bridge: enable the latest version

The **"Enable latest pi-ai" toggle** in the settings page (Provider → pi-ai bridge) runs the
official pi-ai adapter on the newest `@earendil-works/pi-ai` downloaded from npm, replacing the
DSH-bundled copy — new pi-ai versions and model support arrive without waiting for a dsh release.

- **ON = a standing intent**: pull `dist-tags.latest` of `@earendil-works/pi-ai` from the npm
  registry — sha512 verification → extract → install the dependency closure → probe against the
  bridge copy's own import requirements — into the **safe zone**
  `$DSH_HOME/llm-provider-bridge/pi-ai/<version>/` (the plugin package can be recursively deleted
  at any time, so hundreds of MB never live inside it). After a restart the bridge link points at
  the downloaded copy, replacing the DSH-bundled one; a failed probe falls back automatically, so
  the switch always has a safety net.
- **OFF = fall back to the DSH-bundled copy**: downloaded files are kept, and flipping back ON
  costs nothing.
- **The toggle preference also lives in the safe zone**:
  `$DSH_HOME/llm-provider-bridge/vendor-status.json` — the preference used to be written inside the
  package as `vendor/status.json`, and the package manager rebuilds the plugin directory from
  scratch on every reinstall/upgrade, resetting the switch to OFF. Moved out, a reinstall loses
  nothing (an in-package legacy file is merged into the safe zone on first read, then removed).
- **Only the newest downloaded version is kept**: `loadBridge` cleans older ones after the switch
  has completed (the running process never steps on a directory being deleted).
- **The network is touched only while the switch is ON, in two places**: the flip itself, and
  **one check on every startup** — no local copy ready, the download starts right away (the UI
  enters its downloading state, no second flip needed); a copy ready, npm is still checked and a
  newer version downloads automatically (`updateDecision` skips "latest ≤ newest local"). The
  60-second floor is crash-loop damping, not a throttle on intent. **OFF never touches the
  network.**
- **The version row tells the truth**: current x.y.z (DSH-bundled / npm latest / vendor) — which
  copy is in use at a glance. The toggle row only speaks when there is something in progress or
  to do: downloading / x.y.z downloaded (restart to apply) / x.y.z updated (restart to apply) /
  x.y.z downloaded (restart to fall back to official) / x.y.z downloaded (cannot be enabled) /
  x.y.z downloaded (not in use). Whether a restart is pending is derived live by
  `piAiNeedsRestart` (preference + newest ready safe version + the copy currently loaded) — the
  enable-in-place state (nothing to download) says so too; a pending version that this very check
  actually downloaded (`lastCheck.installed` is it — typically the startup auto-update after a
  restart) says "updated", while a copy that was already on disk says "downloaded"; verification
  failures live in the detail rows. While downloading, poll every 2s.

### Model services settings page

- **Bilingual (zh/en)**: dictionary + `tf` interpolation through dsh's own locale mechanism,
  following language switches live.
- **Inline provider editing**: display name, endpoint, protocol and credential name are edited
  right on the card — no edit mode, no separate form. With no changes the card shows no editing
  affordances at all; as soon as a draft exists, "Save changes / Cancel" appear. Only changed
  fields are written, clearing a field **removes the key**. The route id stays read-only.
- **The model list is the checklist**: expanding "Models (N)" shows checkboxes directly, decoupled
  from any edit button. Existing entries are read-only (capability badges + formatted context,
  same columns as the display list); configured rows get an ✕ to delete them in one click; only
  custom ids not in the catalog need context window / max output and vision / video. Saving goes
  through the dedicated route `POST /provider/set-models` (server-side validation, native routes
  rejected), with the declared entry as the base — hand-written `reasoningEfforts` / `compat`
  survive; "Follow catalog (restore)" deletes the key and returns to the full catalog.
- **pi-ai bridge card, now a toggle**: the "Enable latest pi-ai" switch plus a status line
  (current version + source / already latest / downloaded, restart pending / failed verification
  with the reason, persistent); after flipping ON — and during each startup check — it polls
  every 2s until the download settles.
- **Delete confirmation modal**: cost list + "Export config (YAML)" backup (secrets excluded).
- **Three-state capability badges**: supported / explicitly unsupported / **unknown** are rendered
  separately; models missing from the catalog get capabilities from the route declaration and
  adapter self-report (modlens-style synthetic providers).

### Console cookie storage

Providers that need a console session (StepFun's Step Plan points, for one) keep their cookies in
`$DSH_HOME/llm-provider-bridge/.cookies.yaml` — **one file, dot-prefixed** to match the
`.credentials.yaml` habit; same schema as credentials (`version` + flat key table), keys are
credential ref names (e.g. `STEPFUN_CONSOLE_COOKIE`), so a new provider or cookie is just another
key. Parsing tolerates hand edits, and a bad row never kills a lookup.

- **Legacy single-slot session files migrate automatically**:
  `stepfun-console-session.json` is merged into the new file on first read, then removed.
- **Seed fingerprint dedup (write convergence)**: an entry records `seedSha`, the fingerprint of
  the seed credential — later quota lookups for the same credential reuse the stored value instead
  of writing the static credential back. Previously one lookup meant two writes plus a pointless
  renewal RPC; now writes happen only on two real changes: repasting a cookie, and renewal
  rotation.
- **Fragment seed guard**: a seed must contain an `Oasis-Token` section — a fragment with only
  `Oasis-Webid` can no longer overwrite a rotated good jar.
- **First write on a fresh machine**: the bridge directory is created when missing.

### Model selector

- **Full takeover**: once the official model selector is disabled, the selection seat (current
  model state), the `/model` command and the model-catalog state machine are all provided by this
  plugin.
- **The `/model` command**: filter by provider, search models, candidates grouped by provider
  with quota/balance shown per group.
- **The `available` contract**: implements the officially required `available(session)` for `/`
  command contributions — sessions addressed as subagents get no model selection; the host calls
  it unguarded, so one throw would take the whole `/` candidate batch down — the implementation
  never throws and swallows every exception, preferring to show one extra menu entry.

## Stability & safety design

- **Pre-load integrity check and candidate chain**: `src/pi-ai-source.ts` verifies the manifest,
  the entry file and the four subpaths the official bundle actually imports; when broken it
  prints an executable restore recipe (`npm pack` over the host directory — the plugin never
  downloads for you). `piAiCandidates()` = safe zone (when ON, newest → oldest) → legacy vendor
  tiers → bundled dependency → DSH-bundled, probed in order, first pass wins.
- **The bridge workspace lives outside the package**, in `$DSH_HOME/llm-provider-bridge/`: on
  Node ≥24.15 `rmSync` follows junctions and empties their targets, and in this layout there is
  no link left to follow. Invariant: **the installed package contains zero links** (enforced by
  `test/host-safety.mjs`).
- **The npm cache never sticks around**: during a download the npm cache lives in the OS temp dir
  and is deleted when the install finishes (success or failure); on startup a sweep removes any
  legacy `.npm-cache` left in the safe zone.
- **Conditional disable of the official entries (fail-open)**: `cordis.patch.yml` uses `!!js`
  expressions — the official entries are disabled only while the host's pi-ai is intact; if it is
  missing or broken they stay enabled and DSH boots normally. Generated by
  `src/patch-condition.ts`, kept in sync with `scripts/sync-patch-condition.mjs --check`.

## Tests

```sh
npm test                      # build + an 18-step offline chain (no dsh needed; the last step is the patch-condition drift check)
node test/host-safety.mjs     # junction-safety regression: run under BOTH node 24.14 and the DSH runtime (≥24.15)
```
