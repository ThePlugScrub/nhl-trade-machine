# Trade Machine

Free, fan-made trade machines for the NHL and NBA (2026-27 season). Build a trade between two teams, check it against the league's cap rules, and get an AI "Scout's Take" on who won.

- `/` league picker
- `/nhl/` NHL: cap hits, retained salary, trade clauses, picks
- `/nba/` NBA: salary matching, tax line, both aprons, hard caps, picks with protections

## How it runs

A Cloudflare Worker (`src/index.js`) serves the static pages in `public/` and one API route, `POST /api/scout`, which calls Cloudflare Workers AI (free tier, 10,000 neurons a day, resets at 00:00 UTC; no billing on the free plan). The endpoint only accepts prompts built by these pages, only from this site's own origin, and limits each visitor to 6 reports a minute and 40 an hour.

Static pages never touch the Worker, so page views are free and unlimited. Security headers for pages live in `public/_headers`. Unknown URLs get `public/404.html`.

Pushes to `main` redeploy automatically through Workers Builds (`npx wrangler deploy`).

## Data

- NHL contracts: CapWages, as of Oct 21, 2026
- NBA contracts, options, picks and trade-restriction dates: Spotrac, as of Oct 22, 2026; jersey numbers from ESPN

Unofficial. Not affiliated with the NHL, NBA or any team.
