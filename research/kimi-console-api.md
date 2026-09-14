# Kimi Code 控制台接口逆向（2026-09-12 抓包实测）

> **状态：仅调研记录，插件未接入。** 控制台接口要网页登录态的 JWT（见下），
> 按"不依赖浏览器 token"的原则被否掉。kimi 计费走 `lib/adapters/kimi-coding.js`
> 的 sk- key 接口。本文留作备查，哪天官方开放 key 鉴权的额度接口再说。

用 kimi-webbridge 在登录态浏览器里打开 https://www.kimi.com/code/console 抓包的结论。
适配器实现在 `lib/adapters/kimi-console.js`，头部注释就是完整契约。

## 端点

控制台调 `https://www.kimi.com/apiv2/` 下的 gRPC-web 一族，全部 POST、body 为 `{}`：

| 方法 | 给什么 |
|---|---|
| `kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats` | 5h/7d 限流窗口、订阅余额占比、加油包钱包 |
| `kimi.gateway.billing.v1.BillingService/GetUsages` | `totalQuota {limit, used, remaining}` —— 唯一有明确 remaining 的地方 |
| `kimi.gateway.membership.v2.MembershipService/GetSubscription` | 套餐元信息（档位、价格、周期） |
| `kimi.gateway.code.v1.UsageService/ListUnifiedRequests` | 逐请求流水（含 UA、key 名，计费不需要） |

## 鉴权（关键结论）

- `Authorization: Bearer <JWT>`，JWT 就是页面 **localStorage 里的 `access_token`**（HS512）。
- **不吃 Coding Plan 的 sk- key**：带假 Bearer 报 "invalid user token: token contains an invalid
  number of segments"（按 JWT 解析失败）；dsh 凭据里的 sk- key 是单段字符串。
- 纯 cookie 也不行（credentials:include 仍 401 session expired），必须显式 Bearer。

## 对插件的含义

- 结论：**不接入**。这些接口只能用网页登录态的 JWT，不符合插件"只用 API key、
  不碰浏览器凭据"的边界；token 会过期、要人手动维护，得不偿失。
- sk- key 走的老接口 `api.kimi.com/coding/v1/usages` 是唯一数据源。

## 顺带发现

- dsh 凭据里存的 KIMI_CODING_API_KEY 尾号 `1f33b`，而控制台流水里在用的 key 尾号
  `HGyNX` —— 凭据已过期轮换，401 是真实的。更新 key：控制台 API Keys 页复制新的，
  写回 `~/.dsh/.credentials.yaml`。
