# Cloudflare Free Tier for Sketch Racer

checked on 2026-10-20

Source of truth for limits is the Cloudflare pages listed at the bottom. Values marked "not verified" were not stated on the pages read. Re-check before each release.

## Current bindings

`worker/wrangler.toml` binds one service: `RACE_ROOM` (Durable Object, SQLite-backed, no storage written yet). No D1, R2, KV, Queues, Turnstile, or Workers AI bindings exist.

## Free allocations and expected usage

| Service | Purpose in Sketch Racer | Current free allocation | Expected usage | What happens at the limit |
|---|---|---|---|---|
| Workers | Entry point (`src/index.ts`). Checks origin, routes `/ws` upgrades to the room Durable Object. | 100,000 requests/day. CPU 10 ms per HTTP request. 50 subrequests per invocation. 100 Workers per account. | About 1 request per room join. | Error 1027 for requests over the daily cap. Route fails open or closed depending on config. |
| Durable Objects | One `RaceRoom` per room code (`src/room.ts`). Holds WebSocket connections and relays messages. | 100,000 requests/day. 13,000 GB-s duration/day. 5 GB stored (total). | 1 request per socket connect. Incoming WebSocket messages count at a 20:1 ratio (about 2,000,000 incoming messages/day to reach 100,000 requests). Outgoing messages are free. Storage: 0 today. | Further operations of that type fail with an error. Daily limits reset at 00:00 UTC. |
| D1 | Not used. | 5 million rows read/day. 100,000 rows written/day. 5 GB stored (total across all databases). | 0 | Not verified |
| R2 | Not used. | 10 GB-month storage (Standard class only). 1 million Class A ops/month. 10 million Class B ops/month. Egress free. | 0 | Not verified |
| Turnstile | Not used. | Unlimited challenges (traffic or verification requests). Up to 20 widgets per account. 10 hostnames per widget. 7-day analytics lookback. | 0 | Not verified (no request cap is listed) |
| Queues | Not used. | 10,000 operations/day. 24-hour message retention (non-configurable). | 0 | Not verified |
| Workers KV | Not used. | 100,000 reads/day. 1,000 writes/day. 1,000 deletes/day. 1,000 list requests/day. 1 GB stored. | 0 | Operations beyond a limit fail with an error. Resets at 00:00 UTC. |
| Workers AI | Not used. | 10,000 Neurons/day, free on Workers Free. | 0 | Operations past the limit fail with an error (Free plan is not billed). Resets at midnight UTC. |

## Honest expected usage

- Durable Objects carry the real load: one socket per player or controller, and their incoming messages count toward requests at 20:1. This is the first limit to watch if a room sends frequent input messages.
- Workers adds about one request per room join. Its daily cap is far above a small game's join count.
- No D1, R2, KV, Queues, Turnstile, or Workers AI usage exists. The rows above for those services describe the free tier, not current traffic.
- Storage is 0 because `RaceRoom` keeps no state today.

## Sources

- Workers limits (page dated Oct 12, 2026): https://developers.cloudflare.com/workers/platform/limits/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Turnstile plans: https://developers.cloudflare.com/turnstile/plans/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Workers KV pricing: https://developers.cloudflare.com/kv/platform/pricing/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Developer Platform plans page (checked, lists no free-plan numbers): https://www.cloudflare.com/plans/developer-platform/

## Re-check

Re-check this file against the sources above before each release.
