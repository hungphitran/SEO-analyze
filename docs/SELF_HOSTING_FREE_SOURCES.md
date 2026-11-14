# Self-hosting: free owned-site sources

This repository can use three **free, owned-site** sources instead of DataForSEO for data about a website you already control:

1. **Google Search Console** — already implemented upstream. OAuth, encrypted tokens, verified-property checks, search analytics, and URL inspection are unchanged. Setup: [SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md](./SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).
2. **PageSpeed Insights** — the official [PageSpeed Insights API v5](https://developers.google.com/speed/docs/insights/v5/get-started) runs Lighthouse in Google's lab and returns performance, accessibility, best-practices, and SEO scores for a URL.
3. **Bing Webmaster** — the official [Bing Webmaster JSON API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access), using an API key from Bing Webmaster Tools, only for sites that API key has verified.

These sources do **not** replace market keyword volume, keyword difficulty, competitor keyword sets, or backlink graphs. This app will not invent those numbers.

## What free-sources mode changes

Set `FREE_SOURCES_ONLY=true` in `.env.selfhost` (or the equivalent runtime env).

When that flag is on:

- Every DataForSEO client call fails before a network request, including from background jobs.
- Scheduled AI visibility runs stay disabled. Scheduled rank checks run only when the operator explicitly selects a ready OpenSERP service.
- Site-audit Lighthouse uses PageSpeed Insights, not DataForSEO. If `PAGESPEED_API_KEY` is missing, the Lighthouse row records a configuration error; it does **not** fall back to DataForSEO.

Leave `DATAFORSEO_API_KEY` in `.env.selfhost` if it is already set. Alchemy reconciles Worker secrets on every deploy, so removing that line can wipe a previously stored production secret. The flag keeps the key unused even when it is present.

You can also set `LIGHTHOUSE_PROVIDER=pagespeed` to use PageSpeed Insights for Lighthouse without turning the rest of free-sources mode on.

## Google SERPs and rank tracking with OpenSERP

OpenSERP supplies Google result pages, not keyword-market metrics. In free-sources mode, set `SERP_PROVIDER=openserp`, `OPENSERP_ENABLED=true`, and a server-only `OPENSERP_URL`. The app sends requests only from its server, caches results, and never falls back to DataForSEO. SERP requests are limited to 20 uncached requests per project per UTC day by default; set `OPENSERP_MAX_KEYWORDS_PER_DAY` to an integer from 1 to 1000 to change the limit. A cache hit does not use quota.

For a private Docker deployment, use the fork's build and the pinned OpenSERP overlay together:

```sh
export COMPOSE_FILE=deploy/standalone/compose.yaml:deploy/standalone/compose.build.yaml:deploy/standalone/compose.openserp.yaml
cp deploy/standalone/.env.example deploy/standalone/.env
# Set unique storage credentials and FREE_SOURCES_ONLY=true in the env file.
docker compose up -d --build
docker compose exec runtime curl -fsS http://openserp:7000/ready
```

The overlay runs OpenSERP `v0.8.17` on the Compose network without publishing its port. The app builds from this checkout rather than using the upstream OpenSEO image. Check `/ready` from the private network; do not expose port 7000 publicly.

For Cloudflare Workers, Docker hostnames are not reachable from the Worker. Set `OPENSERP_URL` to an HTTPS endpoint behind an authenticated reverse proxy, and set `OPENSERP_AUTH_TOKEN` only when that proxy accepts a Bearer token. Restrict access to the proxy where possible. Configure these values as server secrets/variables using the deployment's normal env-file or secret mechanism; never use `VITE_` variables.

Rank tracking stores only successful observations. CAPTCHA, blocked, rate-limited, timeout, invalid, empty, unsupported-targeting, and quota failures are recorded as errors and do not write a false rank. OpenSERP's region is only a market hint, not precise city targeting. Its rankings are device-independent; the existing desktop storage slot is used for compatibility, not as a desktop-specific measurement. Search volume, CPC, difficulty, backlinks, and traffic estimates remain unavailable without their original data sources.

## Google SERPs and rank tracking with SerpApi

[SerpApi](https://serpapi.com) is the hosted alternative to OpenSERP and works from a Cloudflare Worker with no extra server. Set `SERP_PROVIDER=serpapi` and `SERPAPI_API_KEY` (server-only secret). Without a key it stays off: in free-sources mode SERP features say so instead of calling DataForSEO.

| Variable                         | Default | Meaning                                                              |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| `SERPAPI_MAX_KEYWORDS_PER_DAY`   | 8       | Searches per project per UTC day (1–250)                             |
| `SERPAPI_MAX_SEARCHES_PER_MONTH` | 250     | Account-wide per UTC month (free plan)                               |
| `SERPAPI_MAX_SEARCHES_PER_HOUR`  | 50      | Account-wide per UTC hour (free plan)                                |
| `SERPAPI_PAGES_PER_KEYWORD`      | 1       | Result pages per keyword (10 results each; every page is one search) |
| `SERPAPI_TIMEOUT_MS`             | 20000   | Request timeout (100–60000)                                          |

Behavior: every search is reserved against the three counters first (the daily counter is an atomic conditional upsert; month/hour are increment-then-verify, so parallel runs can never exceed a cap). Results are cached for 6 hours (a cache hit uses no quota), identical in-flight searches are merged, and a reservation is returned when SerpApi demonstrably did not run the search. Transient failures (network error, 5xx, one retry for a timeout) are retried with short backoff; quota, auth and throughput errors are never retried. Failures are recorded as an error state on the run — HTTP 429, "run out of searches" (also when delivered with HTTP 200), bad key, timeouts, malformed or empty responses — and never write a rank. A domain that is simply absent from the fetched results is stored as "not ranked" (a null position, not 0). Depth is the number of pages fetched times 10, so with the default one page "not ranked" means "not in the top 10". City-level targeting is not supported (country and language only).

## PageSpeed Insights setup

1. In Google Cloud, enable the **PageSpeed Insights API** for the same project you use for Search Console, or a separate project.
2. Create an API key and restrict it to that API.
3. Set `PAGESPEED_API_KEY` in `.env.selfhost`. The app sends the key as the `X-goog-api-key` header and never returns it to the browser.
4. Refresh owned-site data from the project's Integrations page, or run a site audit. The refresh uses the project's saved website domain only. It will not guess a domain from the OpenSEO worker URL.

Google's public API documentation does not publish a guaranteed daily quota. Keyless requests are not a usable fallback. Check the real limits under **APIs & Services → PageSpeed Insights API → Quotas** in Google Cloud Console. This app does not run PageSpeed on a cron, so a background job cannot spend that quota by itself.

## Optional: real-user Core Web Vitals (Chrome UX Report)

The [Chrome UX Report API](https://developer.chrome.com/docs/crux/api) returns Core Web Vitals measured from real Chrome users (LCP, INP, CLS, plus FCP and TTFB), for the project's origin and homepage URL, with a weekly p75 trend from the [History API](https://developer.chrome.com/docs/crux/history-api). It appears in the Integrations card next to PageSpeed Insights.

1. In Google Cloud, enable the **Chrome UX Report API** and create an API key (no billing account is needed; 150 queries per minute per project, free).
2. Set `CRUX_API_KEY` in `.env.selfhost`. If it is unset, `PAGESPEED_API_KEY` is tried instead, which works only when that key may also call the Chrome UX Report API (a key restricted to the PageSpeed API gets `403 PERMISSION_DENIED`).
3. Redeploy. With no usable key the panel is hidden (a one-line hint shows when a key exists but Google refuses it).

Results are cached in R2 (12 hours; "no data" for 6 hours; errors are never cached). A `404` means Chrome has too little real-user traffic for that origin or URL and is shown as "not enough real-user data", not as an error. Works with `FREE_SOURCES_ONLY=true`; no DataForSEO call is made.

## Optional: Open PageRank domain authority

[Open PageRank](https://www.domcop.com/openpagerank/documentation) gives a 0 to 10 authority score, a global rank and an authority-weighted referring-domain count. It shows as its own card at the top of Domain Overview, also in `FREE_SOURCES_ONLY` mode. It is link-graph authority, **not** traffic or ranking keywords.

1. Create a free account at [Keywords Everywhere / Open PageRank](https://keywordseverywhere.com/openpagerank/pricing) (30,000 domains per month, 60 requests per minute, no card) and copy the API key from the Open PageRank tab.
2. Set `OPEN_PAGERANK_API_KEY` in `.env.selfhost` and redeploy. Without it the card is hidden.

Lookups are batched (up to 100 domains per request), cached for 24 hours, and held to 60 requests per minute (a shared counter in KV plus an in-process limiter; a `429` is also honored). **Caveat:** since 1 November 2026 a free key is tied to one IPv4 address and other addresses get `403 address_error`. Cloudflare Workers do not call from a fixed address, so a free key can fail from a Worker; the card then says so instead of showing a wrong score. A paid plan is not bound to an address.

## Bing Webmaster setup

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters), add the site, and complete verification.
2. Open Settings → API Access and generate an API key. The key belongs to the Bing user, not to a single site.
3. In the project's Integrations page, paste the key, list verified sites, and save the site you want. The server checks that the site is verified, encrypts the key with `BETTER_AUTH_SECRET`, and stores it. The browser does not keep the key after save.
4. Refresh owned-site data to load query stats for that verified site only.

Microsoft's JSON/REST endpoint is `https://ssl.bing.com/webmaster/api.svc/json/METHOD`. SOAP and POX endpoints retire on 31 August 2026; this integration uses JSON only. Official docs do not publish a general reporting-method rate limit; handle errors if Bing throttles the key.

`BETTER_AUTH_SECRET` must be at least 32 characters or the app will refuse to store the Bing key.

## Search Console

Connect a verified property in the existing Search Console card. Free-source refresh then loads the last 28 days of query analytics for that property. No DataForSEO call is involved.

## Honest gaps

| Need                                                        | Free path                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| Clicks, impressions, queries for a verified Google property | Search Console                                             |
| Clicks, impressions, queries for a verified Bing site       | Bing Webmaster                                             |
| Lighthouse lab scores for the project website               | PageSpeed Insights                                         |
| Real-user Core Web Vitals (origin, homepage)                | Chrome UX Report (optional key)                            |
| Domain authority score (not traffic or keywords)            | Open PageRank (optional key)                               |
| Built-in site crawl / on-page audit                         | Already in OpenSEO; Lighthouse uses PageSpeed in free mode |
| Market search volume, keyword difficulty                    | Not available without a paid dataset                       |
| Competitor keyword or backlink graphs                       | Not available without a paid dataset                       |

## Deploy notes

This work does not deploy itself. After review:

1. Apply the SQLite (and, if you use Postgres, Postgres) migrations in `drizzle/`.
2. Set `FREE_SOURCES_ONLY`, `PAGESPEED_API_KEY` (and optionally `CRUX_API_KEY`, `OPEN_PAGERANK_API_KEY`), and keep existing secrets in `.env.selfhost`.
3. Confirm you have already created the first admin account on the live instance before opening sign-up more widely.
4. OAuth and site verification still require operator / site-owner action listed above. Do not paste API keys or OAuth secrets into chat.

The Alchemy `DATAFORSEO_API_KEY` binding is intentionally left required so a later deploy cannot silently wipe a production secret. A brand-new install that never had a DataForSEO key still needs that variable present in the env file for the current deploy path.

## What `FREE_SOURCES_ONLY=true` hides

With the flag on, features that only work with DataForSEO data are removed from
the UI (sidebar, cards, buttons) and their routes redirect to the dashboard with
a short Vietnamese notice. Backend code is untouched; turning the flag off
restores everything. The single source of truth is
`src/shared/free-sources-visibility.ts`.

| Hidden                                                                                                                                                        | Why (no free replacement)                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Keyword research (`/keywords`) and Saved keywords (`/saved`)                                                                                                  | Search volume, difficulty and CPC are DataForSEO-only                                |
| Domain overview (`/domain`)                                                                                                                                   | Traffic and ranked-keyword estimates                                                 |
| Backlinks (`/backlinks`) and the dashboard Backlinks tab / link-activity card                                                                                 | Backlink graph                                                                       |
| AI visibility: Prompt tracking, Prompt research, Prompt explorer, Brand lookup                                                                                | LLM answer collection through DataForSEO                                             |
| Local SEO (`/local-seo`)                                                                                                                                      | Local pack / Maps collection                                                         |
| Onboarding steps "Explore a competitor" and "Keyword ideas"                                                                                                   | They open the pages above                                                            |
| Rank tracking: volume / KD / CPC columns and filters, "Update keyword stats", keyword suggestions after adding a domain, city-level targeting for new domains | Metrics and city lists come from DataForSEO (SerpApi/OpenSERP target countries only) |
| Search performance: "Save as keywords"                                                                                                                        | Its destination (Saved keywords) is hidden                                           |

| Kept                                                                                 | Served by                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Dashboard (overview, Keywords tab, new queries, Search Console and audit cards)      | Google Search Console, site audit             |
| Rank tracking (positions, history, SERP explorer, SERP features, competitor overlap) | SerpApi (`SERP_PROVIDER=serpapi`) or OpenSERP |
| Search performance                                                                   | Google Search Console (+ Bing Webmaster)      |
| Site audit and Lighthouse                                                            | Own crawler, PageSpeed Insights               |
| Real-user Core Web Vitals                                                            | Chrome UX Report (CrUX)                       |
| Reports, Context, Agent setup, Settings, Integrations                                | No paid data needed                           |

## Bing Webmaster

The Bing key is **per project, stored encrypted in the database** (not a server
env var). Open the project, go to Settings, then Integrations, and use the Bing
Webmaster card. It explains, in Vietnamese: sign in to Bing Webmaster Tools,
verify your site, then Settings, then API access, then API Key, and paste the key
into the card. The site must be verified in the same Bing account or the card
shows "site not verified". Storing a key needs `BETTER_AUTH_SECRET` (at least 32 characters) on the
server: it encrypts the key at rest.

## Chrome UX Report (CrUX)

`CRUX_API_KEY` (or the PageSpeed key, if it has the Chrome UX Report API
enabled). A 404 from Google means "not enough real-user traffic" and is shown as
such. 401/403 is shown as "API not enabled for this key". Network errors and 5xx
are retried twice with backoff; 429 and other 4xx are never retried.
