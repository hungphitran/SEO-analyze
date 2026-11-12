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

## PageSpeed Insights setup

1. In Google Cloud, enable the **PageSpeed Insights API** for the same project you use for Search Console, or a separate project.
2. Create an API key and restrict it to that API.
3. Set `PAGESPEED_API_KEY` in `.env.selfhost`. The app sends the key as the `X-goog-api-key` header and never returns it to the browser.
4. Refresh owned-site data from the project's Integrations page, or run a site audit. The refresh uses the project's saved website domain only. It will not guess a domain from the OpenSEO worker URL.

Google's public API documentation does not publish a guaranteed daily quota. Keyless requests are not a usable fallback. Check the real limits under **APIs & Services → PageSpeed Insights API → Quotas** in Google Cloud Console. This app does not run PageSpeed on a cron, so a background job cannot spend that quota by itself.

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
| Built-in site crawl / on-page audit                         | Already in OpenSEO; Lighthouse uses PageSpeed in free mode |
| Market search volume, keyword difficulty                    | Not available without a paid dataset                       |
| Competitor keyword or backlink graphs                       | Not available without a paid dataset                       |

## Deploy notes

This work does not deploy itself. After review:

1. Apply the SQLite (and, if you use Postgres, Postgres) migrations in `drizzle/`.
2. Set `FREE_SOURCES_ONLY`, `PAGESPEED_API_KEY`, and keep existing secrets in `.env.selfhost`.
3. Confirm you have already created the first admin account on the live instance before opening sign-up more widely.
4. OAuth and site verification still require operator / site-owner action listed above. Do not paste API keys or OAuth secrets into chat.

The Alchemy `DATAFORSEO_API_KEY` binding is intentionally left required so a later deploy cannot silently wipe a production secret. A brand-new install that never had a DataForSEO key still needs that variable present in the env file for the current deploy path.
