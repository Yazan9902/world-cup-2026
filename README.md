# WC26 ⚽ — World Cup 2026 match tracker

A fun, phone-friendly web app that shows the day's World Cup 2026 matches.
Built to share with friends. Vanilla HTML/CSS/JS — no build step.

## How live data works

The browser **cannot** call football-data.org directly (their API only allows
requests from `localhost`, and the token must stay private). So instead:

```
football-data.org  ──fetch_matches.py──►  matches.json  ──►  the website reads it
        (holds the token, runs on your machine or CI)        (static, no token)
```

`matches.json` is a plain snapshot. The site reads it and falls back to the demo
fixtures in `data.js` if it's missing.

## Run locally

```bash
# 1. serve the site
python3 -m http.server 4126        # then open http://localhost:4126

# 2. refresh the data once
export FOOTBALL_DATA_TOKEN=your_token_here
python3 fetch_matches.py

# ...or keep it live during a match (refreshes every 60s):
echo "FOOTBALL_DATA_TOKEN=your_token_here" > .env
./live.sh
```

The page auto-reloads `matches.json` every 45s, so live scores update on their own.

## Share with friends (free hosting)

Push this folder to a GitHub repo, then either:

- **GitHub Pages** — Settings → Pages → deploy from branch. The included
  GitHub Action (`.github/workflows/update-matches.yml`) refreshes `matches.json`
  every ~5 min. Add your token as a repo secret named `FOOTBALL_DATA_TOKEN`.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop or connect the repo.
  Run the Action (or a scheduled function) to keep `matches.json` fresh.

> Want true second-by-second live scores? Swap the snapshot for a tiny serverless
> proxy (Cloudflare Worker / Vercel function) that fetches the API on request and
> keeps the token server-side. Ask and I'll wire it up.

## Updating fixtures by hand

No token? You can still edit `data.js` (the `MATCHES` array) manually — it's the
fallback the site uses when `matches.json` isn't there.

## Files

| file | what it is |
|------|------------|
| `index.html` / `styles.css` / `app.js` | the website |
| `fetch_matches.py` | pulls live data → writes `matches.json` |
| `matches.json` | the live snapshot the site reads |
| `data.js` | demo fixtures (offline fallback) |
| `live.sh` | local "refresh every 60s" loop |
| `.github/workflows/update-matches.yml` | auto-refresh on GitHub |
