#!/usr/bin/env python3
"""
WC26 — live data fetcher
========================
Pulls FIFA World Cup 2026 fixtures + live scores + group standings
from football-data.org and writes them to `matches.json`.

The website reads matches.json — it NEVER talks to the API directly
(CORS only allows localhost, and we don't want the token exposed).

USAGE
-----
    export FOOTBALL_DATA_TOKEN=your_token_here
    python3 fetch_matches.py

    # or inline:
    FOOTBALL_DATA_TOKEN=xxxx python3 fetch_matches.py

Free tier: ~10 requests/minute. This script uses 2 requests per run.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

MATCHES_URL  = "https://api.football-data.org/v4/competitions/WC/matches"
STANDINGS_URL = "https://api.football-data.org/v4/competitions/WC/standings"
OUT_FILE = os.path.join(os.path.dirname(__file__), "matches.json")

STATUS_MAP = {
    "SCHEDULED": "upcoming", "TIMED": "upcoming",
    "IN_PLAY": "live", "PAUSED": "live",
    "FINISHED": "finished", "AWARDED": "finished",
    "SUSPENDED": "upcoming", "POSTPONED": "upcoming", "CANCELLED": "upcoming",
}

TLA_TO_FLAG = {
    "MEX": "🇲🇽", "CAN": "🇨🇦", "USA": "🇺🇸", "ARG": "🇦🇷", "BRA": "🇧🇷",
    "FRA": "🇫🇷", "ESP": "🇪🇸", "GER": "🇩🇪", "POR": "🇵🇹", "NED": "🇳🇱",
    "BEL": "🇧🇪", "ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "CRO": "🇭🇷", "ITA": "🇮🇹", "URU": "🇺🇾",
    "COL": "🇨🇴", "JPN": "🇯🇵", "KOR": "🇰🇷", "AUS": "🇦🇺", "MAR": "🇲🇦",
    "SEN": "🇸🇳", "NGA": "🇳🇬", "GHA": "🇬🇭", "EGY": "🇪🇬", "CMR": "🇨🇲",
    "TUN": "🇹🇳", "ALG": "🇩🇿", "CIV": "🇨🇮", "RSA": "🇿🇦", "QAT": "🇶🇦",
    "KSA": "🇸🇦", "IRN": "🇮🇷", "JOR": "🇯🇴", "UZB": "🇺🇿", "SUI": "🇨🇭",
    "POL": "🇵🇱", "DEN": "🇩🇰", "SWE": "🇸🇪", "NOR": "🇳🇴", "AUT": "🇦🇹",
    "SRB": "🇷🇸", "SCO": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "WAL": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "TUR": "🇹🇷", "UKR": "🇺🇦",
    "CZE": "🇨🇿", "GRE": "🇬🇷", "ECU": "🇪🇨", "PER": "🇵🇪", "PAR": "🇵🇾",
    "CHI": "🇨🇱", "PAN": "🇵🇦", "CRC": "🇨🇷", "BIH": "🇧🇦", "NZL": "🇳🇿",
    "CPV": "🇨🇻", "CUW": "🇨🇼", "HAI": "🇭🇹", "JAM": "🇯🇲",
}

STAGE_LABELS = {
    "GROUP_STAGE": None,
    "LAST_32": "Round of 32", "LAST_16": "Round of 16",
    "QUARTER_FINALS": "Quarter-final", "SEMI_FINALS": "Semi-final",
    "THIRD_PLACE": "3rd-place play-off", "FINAL": "Final",
}


def fetch(url, token):
    req = urllib.request.Request(url, headers={"X-Auth-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR: API {url} returned {e.code} — {e.read().decode()[:200]}")
    except Exception as e:
        sys.exit(f"ERROR: request failed — {e}")


def stage_label(m):
    stage = m.get("stage")
    if stage == "GROUP_STAGE" and m.get("group"):
        return m["group"].replace("GROUP_", "Group ").title().replace("Group ", "Group ")
    return STAGE_LABELS.get(stage) or (stage or "").replace("_", " ").title()


def make_team(obj):
    if not obj:
        return {"name": "TBD", "tla": "", "crest": "", "flag": "🏳️"}
    tla = obj.get("tla") or ""
    return {
        "name": obj.get("name") or obj.get("shortName") or "TBD",
        "tla": tla,
        "crest": obj.get("crest") or "",
        "flag": TLA_TO_FLAG.get(tla, "🏳️"),
    }


def live_minute(m):
    if STATUS_MAP.get(m.get("status")) != "live":
        return None
    minute = (m.get("score") or {}).get("minute")
    if minute:
        return minute
    try:
        ko = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
        mins = int((datetime.now(timezone.utc) - ko).total_seconds() // 60)
        return max(1, min(mins, 120))
    except Exception:
        return None


def transform_match(m):
    ft = (m.get("score") or {}).get("fullTime") or {}
    return {
        "id": m.get("id"),
        "utc": m.get("utcDate"),
        "stage": stage_label(m),
        "matchday": m.get("matchday"),
        "home": make_team(m.get("homeTeam")),
        "away": make_team(m.get("awayTeam")),
        "status": STATUS_MAP.get(m.get("status"), "upcoming"),
        "score": {"home": ft.get("home"), "away": ft.get("away")},
        "minute": live_minute(m),
    }


def transform_standings(raw):
    result = []
    for group in raw:
        group_name = (group.get("group") or "").replace("GROUP_", "Group ").strip()
        if not group_name:
            continue
        rows = []
        for row in group.get("table", []):
            t = row.get("team") or {}
            tla = t.get("tla") or ""
            rows.append({
                "position": row.get("position", 0),
                "team": {
                    "name": t.get("name") or t.get("shortName") or "TBD",
                    "tla": tla,
                    "crest": t.get("crest") or "",
                    "flag": TLA_TO_FLAG.get(tla, "🏳️"),
                },
                "played": row.get("playedGames", 0),
                "won":    row.get("won", 0),
                "draw":   row.get("draw", 0),
                "lost":   row.get("lost", 0),
                "gf":     row.get("goalsFor", 0),
                "ga":     row.get("goalsAgainst", 0),
                "gd":     row.get("goalDifference", 0),
                "pts":    row.get("points", 0),
            })
        result.append({"group": group_name, "table": rows})
    return result


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    if not token:
        sys.exit("ERROR: set FOOTBALL_DATA_TOKEN env var with your football-data.org token.")

    print("Fetching matches…")
    matches_data = fetch(MATCHES_URL, token)
    matches = [transform_match(m) for m in matches_data.get("matches", [])]
    matches.sort(key=lambda x: x["utc"] or "")

    print("Fetching standings…")
    standings_data = fetch(STANDINGS_URL, token)
    standings = transform_standings(standings_data.get("standings", []))

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "competition": "FIFA World Cup 2026",
        "count": len(matches),
        "matches": matches,
        "standings": standings,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    live = sum(1 for m in matches if m["status"] == "live")
    print(f"✓ Wrote {len(matches)} matches + {len(standings)} groups to {OUT_FILE}  (live: {live})")


if __name__ == "__main__":
    main()
