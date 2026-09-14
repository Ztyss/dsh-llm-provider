# Programmatic quota/balance APIs for LLM subscriptions

Research date: 2026-09-11. Every endpoint below is backed by either (a) official vendor docs,
(b) working open-source client source code, or (c) a live HTTP probe I ran from this machine.
Anything I could not back with one of those three is explicitly marked **UNVERIFIED**.

Live probes were run without credentials. They prove an endpoint and its auth-failure shape;
they do NOT prove the success-path response body. Where the success body comes from a
third-party client, the confidence line says so.

Confidence levels used:
- **CONFIRMED (official docs)** — vendor's own documentation.
- **CONFIRMED (OSS code)** — parsed and shipped by one or more open-source tools; several of
  these are also live-verified by their authors.
- **LIVE-PROBED** — I hit the URL from this machine and observed the status/body.
- **COMMUNITY-REPORTED** — issue threads / forum posts only.
- **UNVERIFIED** — no backing source found.

---

## 1. DeepSeek official API (`sk-`)

### Base URLs
- OpenAI-compatible: `https://api.deepseek.com` (also `https://api.deepseek.com/v1`)
- Anthropic-compatible: `https://api.deepseek.com/anthropic`
  ([Using the Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api))

### Auth header
`Authorization: Bearer sk-...` (plus `Accept: application/json`).
This header is not spelled out in the balance page itself, but it is used by every client that
works against it, e.g.
[opencodex `fetchDeepSeekQuota`](https://github.com/lidge-jun/opencodex/blob/main/src/providers/quota.ts).

### Balance endpoint — CONFIRMED (official docs)
`GET https://api.deepseek.com/user/balance`

```bash
curl https://api.deepseek.com/user/balance \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Accept: application/json"
```

Response (verbatim example from the docs):

```json
{
  "is_available": true,
  "balance_infos": [
    {
      "currency": "CNY",
      "total_balance": "110.00",
      "granted_balance": "10.00",
      "topped_up_balance": "100.00"
    }
  ]
}
```

Schema: `is_available` (boolean), `balance_infos[]` with `currency` (enum `CNY`|`USD`),
`total_balance`, `granted_balance`, `topped_up_balance`. **All three money fields are strings,
not numbers.** Source: <https://api-docs.deepseek.com/api/get-user-balance/>

Live probe (no auth) returned `HTTP/2 401` with an empty-ish body — endpoint exists and requires
auth.

### Does it report token-plan / rate-limit quota?
**No.** DeepSeek's [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit) page
documents only *concurrency* limits (2500 for `deepseek-flash`, 500 for `deepseek-v4-pro` per
account, HTTP 429 when exceeded). There is no published RPM/TPM/TPD quota endpoint.
CodexBar's provider notes state it plainly: *"There is no session or weekly window — DeepSeek does
not expose per-window quota via API."*
([docs/deepseek.md](https://github.com/steipete/CodexBar/blob/main/docs/deepseek.md))

### Bonus: platform-session-only endpoints (private, not in the public API)
With a browser `userToken` from `platform.deepseek.com` local storage (not the API key):
- `GET https://platform.deepseek.com/api/v0/users/get_user_summary`
- `GET https://platform.deepseek.com/api/v0/usage/amount?month=<m>&year=<y>`
- `GET https://platform.deepseek.com/api/v0/usage/cost?month=<m>&year=<y>`

These give per-day/month token and cost breakdowns that the API key cannot reach. CodexBar labels
them *"private dashboard endpoints rather than documented public API endpoints and may change
without notice."* Confidence: **CONFIRMED (OSS code)**.

**Confidence for DeepSeek balance: CONFIRMED (official docs).**

---

## 2. Kimi / Moonshot

Two *different* products with two *different* credentials. Do not conflate them:

| | Moonshot Open Platform (pay-as-you-go) | Kimi Coding Plan (subscription) |
|---|---|---|
| Key | `sk-...` from `platform.moonshot.ai` / `platform.moonshot.cn` | `sk-kimi-...` from `www.kimi.com/code/console` |
| Billing | pre-paid balance | weekly request quota + 5-hour rate limit |
| Quota API | balance only | real quota endpoint exists |

CodexBar states the split explicitly: *"Kimi Code is distinct from the Moonshot/Kimi Open
Platform. China-issued Open Platform keys and balance belong under Moonshot / Kimi Open Platform;
they are not Kimi Code subscription credentials."*
([docs/kimi.md](https://github.com/steipete/CodexBar/blob/main/docs/kimi.md))

### 2a. Moonshot Open Platform balance — CONFIRMED (official docs)

`GET https://api.moonshot.ai/v1/users/me/balance` (international, USD)
`GET https://api.moonshot.cn/v1/users/me/balance` (China, CNY)

Your guess is correct. Auth: `Authorization: Bearer <key>`.

```bash
curl https://api.moonshot.cn/v1/users/me/balance \
  -H "Authorization: Bearer $MOONSHOT_API_KEY"
```

```json
{
  "code": 0,
  "data": {
    "available_balance": 49.58894,
    "voucher_balance": 46.58893,
    "cash_balance": 3.00001
  },
  "scode": "0x0",
  "status": true
}
```

`available_balance` = cash + voucher; if `cash_balance` is negative, `available_balance` equals
`voucher_balance`. Numbers here (unlike DeepSeek's strings).
Source: <https://platform.kimi.ai/docs/api/balance.md>

Caveat from the same doc: keys from `platform.kimi.ai` and `platform.kimi.com` are independent
and cross-use returns 401. Currency follows the host — `.cn` is CNY, `.ai` is USD
(per [opencodex `fetchMoonshotQuota`](https://github.com/lidge-jun/opencodex/blob/main/src/providers/quota.ts)).

Live probe: `https://api.moonshot.cn/v1/users/me/balance` → `HTTP/2 401`, headers
`msh-request-id`, `msh-trace-mode: on`. No rate-limit headers.

### 2b. Kimi Coding Plan quota — CONFIRMED (OSS code), not in official docs

`GET https://api.kimi.com/coding/v1/usages`

This is the endpoint you want for the `sk-kimi-` plan. It is **not** in Moonshot's public API
reference; it is the coding subscription's own surface.

Auth — two shapes reported by two different projects, both claiming live verification:
- `Authorization: Bearer <key>` + `Accept: application/json`
  ([CodexBar docs/kimi.md](https://github.com/steipete/CodexBar/blob/main/docs/kimi.md),
  [hermes-agent PR #74424](https://github.com/NousResearch/hermes-agent/pull/74424) —
  *"Response schema (verified against the live endpoint 2026-07)"*)
- `x-api-key: <key>` ([OmniRoute PR #4435](https://github.com/diegosouzapw/OmniRoute/pull/4435) —
  *"verified live: responds with authentication.method = METHOD_API_KEY"*)

Try `Authorization: Bearer` first; fall back to `x-api-key`. **UNVERIFIED which one Kimi prefers
for `sk-kimi-` specifically** — both reports may be correct against different server versions.

Response (CodexBar, live-verified):

```json
{
  "usage": {
    "limit": "2048",
    "used": "214",
    "remaining": "1834",
    "resetTime": "2026-01-09T15:23:13.716839300Z"
  },
  "limits": [{
    "window": {"duration": 300, "timeUnit": "TIME_UNIT_MINUTE"},
    "detail": {
      "limit": "200",
      "used": "139",
      "remaining": "61",
      "resetTime": "2026-01-06T13:33:02.717479433Z"
    }
  }],
  "user": {"membership": {"level": "LEVEL_INTERMEDIATE"}}
}
```

Parse: `usage` = the weekly pool (all values are **strings**). `limits[].window.duration` +
`timeUnit` = the rolling window; `duration: 300` / `TIME_UNIT_MINUTE` = the 5-hour window.
`user.membership.level` gives the tier without a browser session (OpenTokenUsage documents
`LEVEL_INTERMEDIATE`; hermes-agent observed `LEVEL_ADVANCED`).
Source: <https://raw.githubusercontent.com/PowerUserZ/OpenTokenUsage/main/docs/providers/kimi.md>

```bash
curl https://api.kimi.com/coding/v1/usages \
  -H "Authorization: Bearer $KIMI_API_KEY" \
  -H "Accept: application/json"
```

Live probe (no auth): `HTTP/2 401`,
`{"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}`.
Endpoint is live and speaks an Anthropic-shaped error envelope.

**Membership tiers** (CodexBar): Andante ¥49/mo = 1,024 req/week; Moderato ¥99 = 2,048;
Allegretto ¥199 = 7,168. All tiers 200 requests per 5 hours.

**Web-cookie fallback** (no API key): `POST https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages`
with `Authorization: Bearer <kimi-auth JWT cookie>`; same `usages[].detail` shape, plus a
`scope: "FEATURE_CODING"` field. **CONFIRMED (OSS code)**.

**Base URLs for coding agents:** `https://api.kimi.com/coding/v1` is what `sk-kimi-` keys must
use. hermes-agent's fix notes: *"sk-kimi- keys only work on api.kimi.com/coding — same redirect
for both global (kimi-coding) and China-profile (kimi-coding-cn) pools. Without cn here, cn pool
stays stuck on moonshot.cn → 401 forever."*
([PR #69409](https://github.com/NousResearch/hermes-agent/pull/69409))

**Your assumption about `https://api.moonshot.cn/anthropic`:** that base URL is real. I probed
`POST https://api.moonshot.cn/anthropic/v1/messages` unauthenticated → `HTTP/2 401`
`{"error":{"message":"Incorrect API key provided","type":"incorrect_api_key_error"}}`. But it is
the **Open Platform** Anthropic wire, not the Coding Plan.

**Rate-limit headers on Kimi/Moonshot:** none found in any source or in my probes.
**UNVERIFIED** — no client parses `x-ratelimit-*` from either host.

**Confidence: balance = CONFIRMED (official docs); Coding Plan `/usages` = CONFIRMED (OSS code) + LIVE-PROBED endpoint existence.**

---

## 3. Zhipu / Z.ai GLM Coding Plan (`id.secret`)

### Base URLs
- International: `https://api.z.ai/api/coding/paas/v4` (chat: `.../chat/completions`)
- China mainland: `https://open.bigmodel.cn/api/coding/paas/v4`
- China mainland, OpenAI Responses wire: `https://open.bigmodel.cn/api/v1`
  (per [opencodex PR #2028](https://github.com/lidge-jun/opencodex/pull/2028))

### Auth header
`Authorization: Bearer <id.secret>` + `Accept: application/json`.

### Quota endpoint — CONFIRMED (OSS code) + LIVE-PROBED, but NOT in official docs

`GET https://api.z.ai/api/monitor/usage/quota/limit`
`GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`

OpenTokenUsage puts it bluntly: *"These API endpoints are not documented in Z.ai's public API
reference. They are used internally by the subscription management UI and work with both OAuth
tokens and API keys."*
(<https://raw.githubusercontent.com/PowerUserZ/OpenTokenUsage/main/docs/providers/zai.md>)

```bash
curl "https://open.bigmodel.cn/api/monitor/usage/quota/limit" \
  -H "Authorization: Bearer $GLM_API_KEY" \
  -H "Accept: application/json"
```

Response:

```json
{
  "code": 200,
  "success": true,
  "data": {
    "limits": [
      {
        "type": "TOKENS_LIMIT",
        "unit": 3,
        "number": 5,
        "usage": 800000000,
        "currentValue": 127694464,
        "remaining": 672305536,
        "percentage": 15,
        "nextResetTime": 1770648402389
      },
      {
        "type": "TIME_LIMIT",
        "unit": 5,
        "number": 1,
        "usage": 4000,
        "currentValue": 1828,
        "remaining": 2172,
        "percentage": 45,
        "usageDetails": [
          {"modelCode": "search-prime", "usage": 1433},
          {"modelCode": "web-reader", "usage": 462},
          {"modelCode": "zread", "usage": 0}
        ]
      }
    ]
  }
}
```

Field semantics (OpenTokenUsage + CodexBar agree):
- `type`: `TOKENS_LIMIT` (older plans) or `CREDIT_LIMIT` (newer GB-credit plans); `TIME_LIMIT` = monthly MCP tool budget.
- `percentage` = consumed, 0–100. If absent, derive from `currentValue` / `usage`.
- `nextResetTime` = epoch **milliseconds**.
- Window length = `unit` × `number`. CodexBar's multiplier table is
  `{1: 1440, 3: 60, 5: 1, 6: 10080}` minutes, i.e. `unit 3 / number 5` = 300 min = the 5-hour
  window and `unit 6 / number 1` = 10080 min = the weekly window.
  **Conflict:** OpenTokenUsage's doc text says `unit: 6, number: 7` for the weekly row.
  CodexBar's shipped parser and opencodex both say `unit 6 / number 1`. Trust the `unit 6` part
  and compute the duration from `number` at runtime rather than hardcoding `number`.
- `data.planName` (or `plan`, `plan_type`, `packageName`, `level`) = plan label. CodexBar looks
  for all five.

Live probe (no auth):
- `https://api.z.ai/api/monitor/usage/quota/limit` → **HTTP 200** with
  `{"code":1001,"msg":"Authentication parameter not received in Header, unable to authenticate","success":false}`
- `https://open.bigmodel.cn/api/monitor/usage/quota/limit` → **HTTP 200** with
  `{"code":1001,"msg":"Header中未收到Authorization参数，无法进行身份验证。","success":false}`

Note the HTTP status is 200 even on auth failure — a client must check `success`/`code`, not the
status line. CodexBar's parser does exactly that.

### Team plans
Append `type=2` to the quota URL and `type=3` to the model-usage URL, and send selectors:
- `Bigmodel-Organization: <org id>`
- `Bigmodel-Project: <project id>`

Both are required. *"Live API checks return success with empty limits when one of the selectors
is missing."* Get the IDs from DevTools on `https://bigmodel.cn/coding-plan/team/usage-stats`.
Source: [CodexBar docs/zai.md](https://github.com/steipete/CodexBar/blob/main/docs/zai.md)

### Related endpoints
| Endpoint | Gives | Confidence |
|---|---|---|
| `GET https://api.z.ai/api/monitor/usage/model-usage?startTime=<Y-m-d H:M:S>&endTime=<...>` | hourly/daily per-model token totals (`data.x_time[]`, `data.modelDataList[].tokensUsage[]`) | CONFIRMED (OSS code), CodexBar `zai.js` |
| `GET https://api.z.ai/api/biz/subscription/list` | plan name, `nextRenewTime`, subscription status | CONFIRMED (OSS code), OpenTokenUsage |
| `GET https://www.bigmodel.cn/api/biz/account/query-customer-account-report` | CN pay-as-you-go balance: `availableBalance`, `balance`, `rechargeAmount`, `giveAmount`, `totalSpendAmount` | CONFIRMED (OSS code), CodexBar comment *"verified 2026-08: accepts both `Bearer <key>` and raw-key Authorization"* |

### Exhaustion behaviour — CONFIRMED (official docs)
[Z.AI error reference](https://docs.z.ai/api-reference/api-code) documents HTTP 429 with a
business code in the JSON body. The quota-relevant ones:

| Code | Meaning |
|---|---|
| 1302 | Rate limit reached for requests (concurrency) |
| 1305 | *"The service may be temporarily overloaded"* — **also observed firing as a mislabeled content-filter rejection**, see below |
| 1308 | `Usage limit reached for {number} {unit}. Your limit will reset at {next_flush_time}` |
| 1309 | Coding Plan package expired |
| 1310 | `Weekly/Monthly Limit Exhausted. Your limit will reset at {next_flush_time}` |
| 1316 / 1317 | 5-hour / 7-day limit reached, no extra-usage balance. Resets at `{next_flush_time}` |
| 1318–1321 | Same windows, blocked by monthly spend limit |
| 1313 | Fair Usage Policy throttle |

Error body shape: `{"error":{"code":"1305","message":"..."}}`.

So exhaustion is detectable from the 429 body, **but only after you've already been cut off**, and
the message gives a reset timestamp, not a remaining count.

Warning worth recording: [hermes-agent #60118](https://github.com/NousResearch/hermes-agent/issues/60118)
documents z.ai returning `429 / code 1305` for a *content-filter* rejection (any system prompt
containing the literal string `"Hermes Agent"`), with the account in good standing and quota
remaining. Do not treat a single 429 as proof of exhaustion.

### Console URLs
- International personal: `https://z.ai/manage-apikey/coding-plan/personal/my-plan`
- CN personal: `https://bigmodel.cn/coding-plan/personal/usage`
- CN team: `https://bigmodel.cn/coding-plan/team/usage-stats`
- API keys: `https://bigmodel.cn/usercenter/proj-mgmt/apikeys`

**Rate-limit headers:** none found on any Z.ai/BigModel response, including my 401 probes.
**UNVERIFIED** for the success path.

**Confidence: quota endpoint = CONFIRMED (OSS code, 4 independent projects) + LIVE-PROBED; error codes = CONFIRMED (official docs).**

---

## 4. Qwen / Alibaba Cloud Bailian Token Plan (`sk-sp-`)

**Bottom line: there is no publicly documented API-key-authenticated quota endpoint for `sk-sp-`.
The official Alibaba CLI itself cannot do it with the `sk-sp-` key — it needs a console login
token.** Detail below.

### Base URLs
| Wire | URL | Source |
|---|---|---|
| Anthropic-compatible (CN) | `https://dashscope.aliyuncs.com/apps/anthropic` | [Alibaba Model Studio blog](https://modelstudio.alibabacloud.com/intl/blog/manage-token-plan-via-cli/) |
| Anthropic-compatible (CN, Beijing maas) | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` | [qianwen-ai reference](https://github.com/QianWen-AI/qianwen-ai) |
| OpenAI-compatible (CN, Beijing maas) | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | same |
| Anthropic-compatible (intl) | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1` | [OmniRoute PR #10290](https://github.com/diegosouzapw/OmniRoute/pull/10290), *"Verified live 2026-08-14"* |

**Your guess `https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy`** — I probed
`POST https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy/v1/messages`:
`HTTP/2 401` `{"code":"InvalidApiKey","message":"No API-key provided."}`. So the path exists, but
it is a **Coding Plan** proxy, not the Token Plan wire; the official FAQ says using the Coding
Plan Key or the generic `dashscope.aliyuncs.com` base URL with a Token Plan key gives
`401 Incorrect API key provided` / `401 invalid access token or token expired`.

`https://portal.qwen.ai/v1/models` → `HTTP/2 404`. Dead end.

Auth: `Authorization: Bearer sk-sp-...` (**not** `x-api-key` — that yields
`InvalidApiKey: No API-key provided`).

### Quota endpoint — CONFIRMED (no public one)
Official FAQ, 额度与限额 section:
> **Token Plan 的用量在哪里查看？**
> 在百炼控制台的 **Token Plan > 我的订阅** 页面查看当前订阅的 Credits 额度及消耗情况。

Source: <https://help.aliyun.com/zh/model-studio/token-plan-personal-faq>

Console: `https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan`

### What the official `bl` CLI actually does — CONFIRMED (official CLI source)
The Alibaba-published CLI (<https://github.com/modelstudioai/cli>, `@modelstudio/cli`) exposes
`bl usage token-plan` and `bl usage summary`. I cloned it and read the source.

`packages/commands/src/commands/usage/token-plan.ts`:
```ts
const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
// ...
  auth: "console",
// ...
  const result = await ctx.client.console(TOKEN_PLAN_USAGE_API, {});
```

**`auth: "console"`** — this command requires a console access token, not the `sk-sp-` API key.
`client.console()` throws `"This command needs a console access token."` when `consoleCred` is
absent. `bl auth login --config token-plan --api-key sk-sp-xxxxx` configures the *inference* key
for chat calls; it is a separate credential from the console credential.

The exact HTTP call, from `packages/core/src/console/gateway.ts`:

```
POST https://bailian-cs.console.aliyun.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fusage
Authorization: Bearer <console token>
Content-Type: application/x-www-form-urlencoded

params={"Api":"zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage","V":"1.0","Data":{"cornerstoneParam":{"protocol":"V2","console":"ONE_CONSOLE","productCode":"p_efm","switchUserType":3,"consoleSite":"BAILIAN_ALIYUN"}}}
&region=cn-beijing
```

Gateway hosts by region/site:
| Region | Site | Gateway host | action |
|---|---|---|---|
| `cn-beijing` | domestic | `bailian-cs.console.aliyun.com` | `BroadScopeAspnGateway` |
| `cn-beijing` | international | `bailian-cs.console.alibabacloud.com` | `BroadScopeAspnGateway` |
| `ap-southeast-1` | domestic | `modelstudio-cs.console.aliyun.com` | `IntlBroadScopeAspnGateway` |
| `ap-southeast-1` | international | `bailian-singapore-cs.alibabacloud.com` | `IntlBroadScopeAspnGateway` |

Response fields, read by `readUsage()` in the CLI (all numbers, unwrapped from
`data.DataV2.data.data`):

```json
{
  "per5HourPercentage": 0.5,
  "per5HourResetTime": 1786000000000,
  "per1WeekPercentage": 0.32,
  "per1WeekResetTime": 1786100000000
}
```

Percentages are **fractions in [0,1]** (the CLI's own test passes `0.5` and renders 50%);
`*ResetTime` is epoch ms. Fields are **omitted** when a window is unlimited — and per the official
FAQ, the 5-hour limit is currently suspended for all tiers (限时无限制), so in practice expect
`per5Hour*` to be missing.

### Coding Plan (separate Alibaba product, same gateway)
`api=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2` with
`commodityCode` `sfm_codingplan_public_cn` / `sfm_codingplan_public_intl` returns
`codingPlanInstanceInfos[].codingPlanQuotaInfo` with `per5Hour`, `perWeek`, `perBillMonth`,
each holding `{UsedQuota, TotalQuota, QuotaNextRefreshTime}`. CodexBar hits the same RPC via
`POST /data/api.json?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2`
with the API key sent in **all three** of `Authorization: Bearer`, `x-api-key`, and
`X-DashScope-API-Key`. **CONFIRMED (OSS code)**, but CodexBar flags a known failure: *"In some
China mainland accounts/environments, the current Alibaba `/data/api.json` coding-plan endpoint
can still return console-login-required responses (`ConsoleNeedLogin`) even when an API key is
configured."*

### QwenCloud (international) variant — CONFIRMED (OSS code)
`POST {host}/data/api.json?product=sfm_bailian&action=IntlBroadScopeAspnGateway&api=zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2F<endpoint>`
with `endpoint` ∈ `usage` | `subscription` | `quota-config`. Hosts: `https://cs-data.qwencloud.com`
(QwenCloud portal) or `https://bailian-singapore-cs.alibabacloud.com` (Model Studio console).
**Auth is a browser session cookie plus a `sec_token`** — the inference API key does not
authenticate it. OmniRoute's source states: *"The personal Token Plan (5-hour / 7-day sliding
windows) has NO official OpenAPI — the console gateway is the only quota surface, and the
inference API key does NOT authenticate it."*
Source: [OmniRoute PR #10290](https://github.com/diegosouzapw/OmniRoute/pull/10290);
[CodexBar docs/qwen-cloud.md](https://github.com/steipete/CodexBar/blob/main/docs/qwen-cloud.md)

### Exhaustion behaviour — CONFIRMED (official docs)
From the official FAQ error table:
- `429 Allocated quota exceeded` — 5-hour or 7-day limit exhausted; wait for the window to reset.
- `429 Requests rate limit exceeded` — too many requests in a short period; wait ~1 minute.

Note the FAQ also says: *"官方未公开具体的 TPM/TPS/RPM 数值"* — Alibaba does not publish TPM/RPM
numbers, and Token Plan rate limits **cannot be raised**.

### ⚠️ Terms-of-service warning
The same FAQ: Token Plan 个人版 is **for interactive use in official tools only**. It explicitly
forbids *"生产环境的自动化服务、批量脚本或后台定时任务"*. A local tool polling quota with a
test chat completion would burn credits and violate the plan. Treat programmatic polling of this
plan as off-limits.

### Plan tiers and windows (official)
Personal: Lite 2,500 credits / 7 days (5h limit 700, currently suspended); Standard 10,000 / 7d
(5h 3,000, suspended); Pro 40,000 / 7d (5h 12,000, suspended). The 7-day window starts at first
call, not on a calendar boundary.

**Rate-limit headers:** none documented. My probes on `dashscope.aliyuncs.com` and both
`token-plan.*.maas.aliyuncs.com` hosts returned only `x-request-id` and
`x-envoy-upstream-service-time`. **UNVERIFIED** for the success path.

**Confidence: no API-key quota endpoint = CONFIRMED (official docs + official CLI source);
console-gateway shape = CONFIRMED (official CLI source).**

---

## 5. Rate-limit headers on a normal chat completion

This is the weakest area — I could not verify it for any of the five providers, because it needs
a valid key and no source documents it.

**What is confirmed, for reference (Anthropic's own API, not any target provider):**
Anthropic returns on every successful response
`anthropic-ratelimit-tokens-remaining`, `anthropic-ratelimit-tokens-limit`,
`anthropic-ratelimit-tokens-reset`
([openclaw #22282](https://github.com/openclaw/openclaw/issues/22282)), and the unified
subscription headers `anthropic-ratelimit-unified-5h-utilization`,
`anthropic-ratelimit-unified-7d-utilization`, `anthropic-ratelimit-unified-5h-reset`,
`anthropic-ratelimit-unified-7d-reset` — opencodex ships a parser for exactly these four in
[`src/providers/quota.ts`](https://github.com/lidge-jun/opencodex/blob/main/src/providers/quota.ts)
(`parseAnthropicRateLimitHeaders`). Utilization arrives as a **fraction 0–1**, resets as **epoch
seconds**.

**OpenAI-shaped headers** (`x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`,
`x-ratelimit-limit-tokens`) are the convention for OpenAI-compatible wires
([openclaw #22282](https://github.com/openclaw/openclaw/issues/22282),
[semantic-kernel #10393](https://github.com/microsoft/semantic-kernel/issues/10393)) — but that is
a convention, not a guarantee that DeepSeek/Moonshot/Z.ai/BigModel/DashScope emit them.

**What I measured:** I sent unauthenticated requests to
`api.deepseek.com/user/balance`, `api.deepseek.com/v1/models`, `api.moonshot.cn/v1/users/me/balance`,
`api.moonshot.cn/anthropic/v1/messages`, `api.kimi.com/coding/v1/usages`,
`api.kimi.com/coding/v1/messages`, `api.z.ai/api/monitor/usage/quota/limit`,
`open.bigmodel.cn/api/monitor/usage/quota/limit`, `api.z.ai/api/coding/paas/v4/models`,
`open.bigmodel.cn/api/coding/paas/v4/models`, `dashscope.aliyuncs.com/compatible-mode/v1/models`,
`dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy/v1/messages`,
`token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/models`,
`token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages`.

**Not one returned a single `x-ratelimit-*` or `anthropic-ratelimit-*` header.** Headers seen were
only tracing/auth plumbing: `x-ds-trace-id` (DeepSeek), `msh-request-id` / `msh-trace-mode`
(Moonshot), `x-trace-id` (Kimi), `x-log-id` (Z.ai/BigModel), `x-request-id` /
`x-envoy-upstream-service-time` (DashScope).

This is evidence *against* rate-limit headers existing, but it is not proof — these were error
responses, and many gateways only attach rate-limit headers to successful 2xx responses.
**Status: UNVERIFIED.** Do not build a quota tool on the assumption these headers exist.

---

## 6. Cheapest request to trigger rate-limit headers

Since no provider documents that it emits rate-limit headers, there is no cheap *header-probing*
request to recommend. The relevant comparison is different: every provider that has a real quota
endpoint has one that costs **zero tokens and zero credits**.

| Provider | Cheapest quota-bearing call | Cost |
|---|---|---|
| DeepSeek | `GET /user/balance` | free, no tokens |
| Moonshot Open Platform | `GET /v1/users/me/balance` | free, no tokens |
| Kimi Coding Plan | `GET https://api.kimi.com/coding/v1/usages` | free, no tokens |
| Z.ai / BigModel | `GET /api/monitor/usage/quota/limit` | free, no tokens |
| Qwen `sk-sp-` | **none** — only a chat completion, and it is contractually forbidden | burns credits + ToS risk |

**Does `GET /v1/models` return rate-limit headers on any of these?**
- DeepSeek: `GET /models` is officially documented (<https://api-docs.deepseek.com/api/list-models>) and is the cheapest possible authenticated call. Whether it carries rate-limit headers is **UNVERIFIED**; my unauthenticated probe returned none. It returns no quota data.
- Z.ai / BigModel: `GET /api/coding/paas/v4/models` exists (live-probed 401 on both hosts) and is cheap. Header presence **UNVERIFIED**.
- DashScope / Token Plan: `GET /compatible-mode/v1/models` exists on both hosts (live-probed 401). Header presence **UNVERIFIED**.
- Moonshot: `GET /v1/models` exists on the OpenAI wire; not probed for headers.
- Kimi Coding: no documented models endpoint; unknown.

If you want to test this empirically, `GET /v1/models` is the right probe — it costs no tokens on
every one of these providers. But nothing in the sources indicates it will answer the question.

---

## Final ranking: what can be queried programmatically today

### Tier 1 — a working tool can be built today, no browser needed

1. **DeepSeek** — `GET /user/balance`. Official, documented, stable, `sk-` key only.
   Limitation: balance in money, not token quota (DeepSeek has no token quota).
2. **Z.ai / BigModel GLM Coding Plan** — `GET /api/monitor/usage/quota/limit`. Gives 5-hour and
   weekly windows with used/total/remaining/percentage and reset times, plus monthly MCP tool
   budget. Undocumented but parsed by four independent projects and live-probed. Works with the
   `id.secret` coding key on both `api.z.ai` and `open.bigmodel.cn`.
3. **Kimi Coding Plan** — `GET https://api.kimi.com/coding/v1/usages`. Gives weekly request quota
   and the 5-hour window with used/limit/remaining/reset. Not in official docs but live-verified by
   two projects. Note the open question about `Bearer` vs `x-api-key` for `sk-kimi-`.
4. **Moonshot Open Platform** — `GET /v1/users/me/balance`. Official, documented. Balance only;
   no per-window quota exists to read. This is a *different credential* from the Kimi Coding plan.

### Tier 2 — works, but needs more than an API key

5. **Alibaba Bailian Coding Plan** (not Token Plan) — the console RPC
   `queryCodingPlanInstanceInfoV2` accepts the API key in theory, but CodexBar documents
   `ConsoleNeedLogin` failures on some CN accounts. Treat as best-effort.
6. **DeepSeek detailed usage** (per-day/month cost and tokens) — platform `userToken` from
   browser storage only, private endpoints, may break without notice.

### Tier 3 — cannot be queried programmatically with the API key today

7. **Qwen / Alibaba Bailian Token Plan (`sk-sp-`)** — **no public API-key endpoint.** Alibaba's
   official FAQ points at the console. Alibaba's own CLI requires a separate console token for
   `bl usage token-plan`. The only known surfaces are console gateways
   (`bailian-cs.console.aliyun.com/cli/api.json`, `cs-data.qwencloud.com/data/api.json`) that
   authenticate with a browser session cookie, not the `sk-sp-` key. QwenCloud's individual Token
   Plan is additionally documented as **cookie-only** by CodexBar and OmniRoute. And the personal
   plan's terms forbid automated API calls, so even a workaround would be a ToS violation.

### Practical shape for the local tool

Three of four targets answer to a plain `GET` with a `Bearer` header and return JSON — no tokens
consumed:

```
DeepSeek        GET https://api.deepseek.com/user/balance
Moonshot        GET https://api.moonshot.ai/v1/users/me/balance   (or api.moonshot.cn)
Kimi Coding     GET https://api.kimi.com/coding/v1/usages
GLM Coding      GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
                   (or https://api.z.ai/api/monitor/usage/quota/limit)
```

Two parser gotchas worth encoding:
- Z.ai/BigModel returns **HTTP 200 on auth failure** — check `success === true && code === 200`,
  never the status line.
- DeepSeek returns money values as **strings**; Moonshot returns numbers; Kimi `/usages` returns
  strings for `limit`/`used`/`remaining` but the Z.ai numbers are integers. Parse per provider.

Qwen `sk-sp-` should be surfaced as "not queryable — check the console" rather than polled.
