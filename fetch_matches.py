#!/usr/bin/env python3
"""
WC26 — live data fetcher
========================
Pulls FIFA World Cup 2026 fixtures + live scores + top scorers
from football-data.org and writes them to `matches.json`.

Note: per-match goalscorers & game statistics are NOT included in the
free tier (goals/statistics come back null) — we ship what the free
tier gives: HT score, extra time / penalty shootout detail, winner,
and the tournament Golden Boot race.

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

MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches"
SCORERS_URL = "https://api.football-data.org/v4/competitions/WC/scorers?limit=20"
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


def pair(obj):
    """{home, away} score pair, or None if both missing."""
    if not obj or (obj.get("home") is None and obj.get("away") is None):
        return None
    return {"home": obj.get("home"), "away": obj.get("away")}


def transform_match(m):
    sc = m.get("score") or {}
    duration = sc.get("duration") or "REGULAR"
    ft = pair(sc.get("fullTime")) or {"home": None, "away": None}
    reg, ext = pair(sc.get("regularTime")), pair(sc.get("extraTime"))
    pens = pair(sc.get("penalties")) if duration == "PENALTY_SHOOTOUT" else None

    # For shootouts, API fullTime INCLUDES penalty goals — show the
    # 120-minute aggregate instead, with pens carried separately.
    display = ft
    if pens and reg:
        display = {
            "home": (reg["home"] or 0) + ((ext or {}).get("home") or 0),
            "away": (reg["away"] or 0) + ((ext or {}).get("away") or 0),
        }

    return {
        "id": m.get("id"),
        "utc": m.get("utcDate"),
        "stage": stage_label(m),
        "knockout": m.get("stage") != "GROUP_STAGE",
        "stageKey": m.get("stage"),
        "matchday": m.get("matchday"),
        "home": make_team(m.get("homeTeam")),
        "away": make_team(m.get("awayTeam")),
        "status": STATUS_MAP.get(m.get("status"), "upcoming"),
        "score": display,
        "ht": pair(sc.get("halfTime")),
        "pens": pens,
        "aet": duration == "EXTRA_TIME",
        "winner": sc.get("winner"),  # HOME_TEAM | AWAY_TEAM | DRAW | None
        "minute": live_minute(m),
    }


def transform_scorers(raw):
    out = []
    for s in raw:
        p, t = s.get("player") or {}, s.get("team") or {}
        tla = t.get("tla") or ""
        out.append({
            "name": p.get("name") or "—",
            "team": {
                "name": t.get("shortName") or t.get("name") or "",
                "tla": tla,
                "crest": t.get("crest") or "",
                "flag": TLA_TO_FLAG.get(tla, "🏳️"),
            },
            "goals": s.get("goals") or 0,
            "assists": s.get("assists") or 0,
            "penalties": s.get("penalties") or 0,
        })
    return out


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    if not token:
        sys.exit("ERROR: set FOOTBALL_DATA_TOKEN env var with your football-data.org token.")

    print("Fetching matches…")
    matches_data = fetch(MATCHES_URL, token)
    matches = [transform_match(m) for m in matches_data.get("matches", [])]
    matches.sort(key=lambda x: x["utc"] or "")

    print("Fetching top scorers…")
    scorers_data = fetch(SCORERS_URL, token)
    scorers = transform_scorers(scorers_data.get("scorers", []))

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "competition": "FIFA World Cup 2026",
        "count": len(matches),
        "matches": matches,
        "scorers": scorers,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    live = sum(1 for m in matches if m["status"] == "live")
    print(f"✓ Wrote {len(matches)} matches + {len(scorers)} scorers to {OUT_FILE}  (live: {live})")


if __name__ == "__main__":
    main()
