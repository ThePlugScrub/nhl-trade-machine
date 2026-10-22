# NHL Trade Machine 2026-27

Build trades between any two NHL clubs and check them against the 2026-27 salary cap ($104M), with salary retention, draft picks, jersey previews and an AI "Scout's Take" that grades each side.

- `public/index.html` is the whole trade machine (cap data from CapWages, Oct 21, 2026).
- `src/index.js` is the Cloudflare Worker that serves the page and the `/api/scout` AI endpoint.
- `wrangler.jsonc` tells Cloudflare to serve `public/` and turn on Workers AI.

AI runs on Cloudflare Workers AI (Llama 3.3 70B). The free plan includes 10,000 neurons per day (about 100 scouting reports) and resets at midnight UTC. On the free plan there is no billing; requests past the limit fail until the reset.
