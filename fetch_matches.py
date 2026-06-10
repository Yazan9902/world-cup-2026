#!/usr/bin/env python3
"""
WC26 — live data fetcher
========================
Pulls the FIFA World Cup 2026 fixtures + live scores from football-data.org
and writes them to `matches.json` in the shape the frontend expects.

The website reads matches.json — it NEVER talks to the API directly
(the API only allows browser calls from localhost, and we don't want the
token exposed to friends). This script is the only thing that holds the token.

USAGE
-----
    export FOOTBALL_DATA_TOKEN=your_token_here
    python3 fetch_matches.py

    # or pass inline:
    FOOTBALL_DATA_TOKEN=xxxx python3 fetch_matches.py

To keep scores "live" on match days, run it on a schedule (cron / GitHub
Action) every minute or two. Free tier allows ~10 requests/minute.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

API_URL = "https://api.football-data.org/v4/competitions/WC/matches"
OUT_FILE = os.path.join(os.path.dirname(__file__), "matches.json")

# football-data status -> our simple status
STATUS_MAP = {
    "SCHEDULED": "upcoming",
    "TIMED": "upcoming",
    "IN_PLAY": "live",
    "PAUSED": "live",
    "FINISHED": "finished",
    "AWARDED": "finished",
    "SUSPENDED": "upcoming",
    "POSTPONED": "upcoming",
    "CANCELLED": "upcoming",
}

# Map team 3-letter codes (TLA) to flag emoji. Falls back to 🏳️ for
# placeholder slots ("Winners Group A", play-off spots, etc.).
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

# Pretty stage labels
STAGE_LABELS = {
    "GROUP_STAGE": None,          # use the group name instead, e.g. "Group A"
    "LAST_32": "Round of 32",
    "LAST_16": "Round of 16",
    "QUARTER_FINALS": "Quarter-final",
    "SEMI_FINALS": "Semi-final",
    "THIRD_PLACE": "3rd-place play-off",
    "FINAL": "Final",
}


def stage_label(m):
    stage = m.get("stage")
    if stage == "GROUP_STAGE" and m.get("group"):
        # "GROUP_A" -> "Group A"
        return m["group"].replace("GROUP_", "Group ").title().replace("Group ", "Group ")
    return STAGE_LABELS.get(stage) or (stage or "").replace("_", " ").title()


def team(obj):
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
    """Approximate live minute from kickoff if the API doesn't give one."""
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


def transform(m):
    ft = (m.get("score") or {}).get("fullTime") or {}
    return {
        "id": m.get("id"),
        "utc": m.get("utcDate"),               # ISO UTC; frontend converts to local
        "stage": stage_label(m),
        "matchday": m.get("matchday"),
        "home": team(m.get("homeTeam")),
        "away": team(m.get("awayTeam")),
        "status": STATUS_MAP.get(m.get("status"), "upcoming"),
        "score": {"home": ft.get("home"), "away": ft.get("away")},
        "minute": live_minute(m),
    }


def main():
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    if not token:
        sys.exit("ERROR: set FOOTBALL_DATA_TOKEN env var with your football-data.org token.")

    req = urllib.request.Request(API_URL, headers={"X-Auth-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR: API returned {e.code} — {e.read().decode()[:200]}")
    except Exception as e:
        sys.exit(f"ERROR: request failed — {e}")

    matches = [transform(m) for m in data.get("matches", [])]
    matches.sort(key=lambda x: x["utc"] or "")

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "competition": "FIFA World Cup 2026",
        "count": len(matches),
        "matches": matches,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    live = sum(1 for m in matches if m["status"] == "live")
    print(f"✓ Wrote {len(matches)} matches to {OUT_FILE}  (live now: {live})")


if __name__ == "__main__":
    main()
