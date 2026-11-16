# Free-Only Threat Model & API Cost Register (PR-00 / T02)

- **Date:** 2026-11-16
- **Scope:** `FREE_SOURCES_ONLY=true` deployment mode across Cloudflare Workers, Docker Standalone, Workflows, Cron, and MCP Server.

## 1. Outbound Domain & API Cost Register

| Provider / Domain | Classification | Mode / Flag / Credential | Cost / Quota Model | Free-Only Gate Behavior |
|---|---|---|---|---|
| `api.dataforseo.com` (DataForSEO) | `PAID_ONLY` | `DATAFORSEO_API_KEY` or Every App Gateway | Pay-per-request | **Blocked server-side** in `getDataforseoFetch()` (`src/server/lib/provider-access.ts`) before any network call; throws `PAID_SOURCE_DISABLED` / `FREE_SOURCES_ONLY` |
| `openrouter.ai` / AI SDK models | `PAID_ONLY` | `OPENROUTER_API_KEY` | Pay-per-token | Must be blocked from automatic/cron/free-only flows; never called by Keyword Opportunities, Clustering, or GEO Evidence |
| `api.context.dev` (Context.dev JS rendering) | `PAID_ONLY` | `CONTEXT_API_KEY` or Every App Gateway | Paid rendering credits | Disabled when `FREE_SOURCES_ONLY=true` unless explicitly opted in; never required for free-only audit |
| `serpapi.com` (SerpApi) | `FREE_QUOTA` (Optional) | `SERP_PROVIDER=serpapi`, `SERPAPI_API_KEY` | 250/mo, 50/hr, 8/day/project defaults | Strictly opt-in; atomic quota reservation (`serpApiQuota`); not a release dependency |
| `openserp` (`OPENSERP_URL`, `karust/openserp:v0.8.17`) | `SELF_HOSTED` | `SERP_PROVIDER=openserp`, `OPENSERP_ENABLED=true`, `OPENSERP_URL` | $0 API fee; 20 uncached/project/UTC day default | Allowed on private network or authenticated HTTPS reverse proxy |
| `searchconsole.googleapis.com` (GSC) | `FREE_QUOTA` | Google OAuth (`GOOGLE_CLIENT_ID/SECRET`) | Google API quota | Allowed; incremental sync + DB caching |
| `analyticsdata.googleapis.com` (GA4) | `FREE_QUOTA` | Google OAuth (`GOOGLE_CLIENT_ID/SECRET`) | Google API quota | Allowed; cached/bounded date windows |
| `www.googleapis.com/pagespeedonline/v5` (PSI) | `FREE_QUOTA` | `PAGESPEED_API_KEY` | Google Cloud quota | Allowed; no cron auto-spend |
| `chromeuxreport.googleapis.com` (CrUX) | `FREE_QUOTA` | `CRUX_API_KEY` or `PAGESPEED_API_KEY` | 150 QPM free | Allowed; R2 cached (12h ok, 6h no_data) |
| `ssl.bing.com/webmaster/api.svc/json` (Bing) | `FREE_QUOTA` | Per-project encrypted `bing_webmaster_connections` | Bing throttling (`429`) | Allowed; sequential calls, no infinite retries |
| `openpagerank.com` (Open PageRank) | `FREE_QUOTA` | `OPEN_PAGERANK_API_KEY` | 30k/mo, 60 RPM (IPv4 bound) | Allowed optional; R2 cached 24h |
| `api.indexnow.org` (IndexNow) | `ZERO_COST` | Per-project IndexNow key | Free | Allowed |
| Unknown outbound hosts | `UNKNOWN` | Any unconfigured URL | Unknown | **Default disabled / blocked** in free-only mode |

## 2. Threat Scenarios & Mitigations

1. **Paid API Fallback / Bypass via Hidden Route, Cron, or MCP:**
   - *Risk:* UI hides `/keywords`, `/ai-visibility`, etc., but direct server function, MCP tool, or scheduled workflow triggers DataForSEO or paid LLM.
   - *Mitigation:* Enforce fail-closed `isFreeSourcesOnly()` check at network boundary (`getDataforseoFetch()`, `getContextFetch()`, `ScheduledAiVisibility`, `RankCheckWorkflow`), emit `PAID_SOURCE_DISABLED` (`FREE_SOURCES_ONLY`) and increment `blocked_provider_calls_total` diagnostic counter.
2. **SSRF via User-Supplied URLs (Crawler, Webhook, OpenSERP URL):**
   - *Risk:* User inputs `http://127.0.0.1`, `169.254.169.254`, private LAN IPs, or redirect targets to internal services.
   - *Mitigation:* Validate all URLs via `src/shared/safe-url.ts` / crawler SSRF guard (block loopback, private, link-local, metadata IPs, non-HTTP(S), non-standard ports, and validate redirect hops). Apply identical SSRF rules to alert webhooks.
3. **Cross-Tenant Data Access:**
   - *Risk:* User A queries `projectId` belonging to Org B, or imports CSV rows for another domain.
   - *Mitigation:* Every server function uses `requireProjectContext` + `requireOrgPermission`; every DB table has `project_id` + `organization_id` with verified membership; CSV imports validate project verified domain.
4. **CSV Injection (Formula Injection) & Oversized Uploads:**
   - *Risk:* Uploaded Bing/Google GEO CSV contains `=CMD(...)`, `+`, `-`, `@` formulas that execute when re-exported to Excel, or >5MB / >50k rows causing OOM in Workers.
   - *Mitigation:* Enforce 5 MB / 50,000 row hard caps, UTF-8 BOM stripping, header-based mapping via Zod, and formula-prefix escaping (`'`) on all CSV exports.
5. **Secret & OAuth Token Leakage:**
   - *Risk:* `DATAFORSEO_API_KEY`, `BETTER_AUTH_SECRET`, Bing API keys, or GSC OAuth tokens logged in error details or returned to client.
   - *Mitigation:* Redact via `src/server/lib/free-sources/redact.ts`, never pass secrets to `VITE_` env, never return raw keys in `getFreeSourcesStatus` or diagnostics.
6. **Quota Exhaustion / Request Storm / Zombie Retries:**
   - *Risk:* Concurrent rank checks or `429` loops exhaust OpenSERP/Bing/GSC quotas.
   - *Mitigation:* Atomic quota reservations (`openSerpQueries`), job deduplication, no retries on `401/403/429`, bounded jittered retries only on transient `5xx`.
