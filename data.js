/* ============================================================
   WORLD CUP 2026 — MATCH DATA
   ------------------------------------------------------------
   This is the ONLY file you need to edit when real fixtures
   drop. Just replace the MATCHES array below.

   Each match looks like this:

   {
     id:    1,                         // any unique number
     date:  "2026-06-11",              // YYYY-MM-DD (match day)
     time:  "19:00",                   // kickoff, 24h local time
     stage: "Group A",                 // "Group A".."Group L", "Round of 32", "Final"...
     venue: "Estadio Azteca",          // stadium
     city:  "Mexico City",             // host city
     home:  { name: "Mexico",  flag: "🇲🇽" },
     away:  { name: "Canada",  flag: "🇨🇦" },
     status:"upcoming",                // "upcoming" | "live" | "finished"
     score: { home: null, away: null },// fill in once played
     minute: null                      // live minute, e.g. 67  (only when status === "live")
   }

   Flags: just paste the emoji flag of the country. 🇧🇷 🇦🇷 🇫🇷 🇩🇪 ...
   ============================================================ */

/* ---- Demo helper: makes the sample data land on "today" so
        you can see the UI working before real data exists.
        DELETE this + the offsets below when you paste real fixtures. ---- */
function dayFromNow(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const MATCHES = [
  // ---------- TODAY ----------
  {
    id: 1, date: dayFromNow(0), time: "13:00", stage: "Group A",
    venue: "Estadio Azteca", city: "Mexico City",
    home: { name: "Mexico", flag: "🇲🇽" },
    away: { name: "Croatia", flag: "🇭🇷" },
    status: "finished", score: { home: 2, away: 1 }, minute: null,
  },
  {
    id: 2, date: dayFromNow(0), time: "16:00", stage: "Group B",
    venue: "SoFi Stadium", city: "Los Angeles",
    home: { name: "Argentina", flag: "🇦🇷" },
    away: { name: "Nigeria", flag: "🇳🇬" },
    status: "live", score: { home: 1, away: 1 }, minute: 67,
  },
  {
    id: 3, date: dayFromNow(0), time: "19:00", stage: "Group C",
    venue: "MetLife Stadium", city: "New York",
    home: { name: "France", flag: "🇫🇷" },
    away: { name: "Japan", flag: "🇯🇵" },
    status: "upcoming", score: { home: null, away: null }, minute: null,
  },
  {
    id: 4, date: dayFromNow(0), time: "22:00", stage: "Group D",
    venue: "BC Place", city: "Vancouver",
    home: { name: "Brazil", flag: "🇧🇷" },
    away: { name: "Portugal", flag: "🇵🇹" },
    status: "upcoming", score: { home: null, away: null }, minute: null,
  },

  // ---------- TOMORROW ----------
  {
    id: 5, date: dayFromNow(1), time: "15:00", stage: "Group E",
    venue: "AT&T Stadium", city: "Dallas",
    home: { name: "Spain", flag: "🇪🇸" },
    away: { name: "Morocco", flag: "🇲🇦" },
    status: "upcoming", score: { home: null, away: null }, minute: null,
  },
  {
    id: 6, date: dayFromNow(1), time: "18:00", stage: "Group F",
    venue: "Mercedes-Benz Stadium", city: "Atlanta",
    home: { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    away: { name: "USA", flag: "🇺🇸" },
    status: "upcoming", score: { home: null, away: null }, minute: null,
  },

  // ---------- YESTERDAY ----------
  {
    id: 7, date: dayFromNow(-1), time: "17:00", stage: "Group G",
    venue: "Lincoln Financial Field", city: "Philadelphia",
    home: { name: "Germany", flag: "🇩🇪" },
    away: { name: "Uruguay", flag: "🇺🇾" },
    status: "finished", score: { home: 0, away: 0 }, minute: null,
  },
  {
    id: 8, date: dayFromNow(-1), time: "20:00", stage: "Group H",
    venue: "Hard Rock Stadium", city: "Miami",
    home: { name: "Netherlands", flag: "🇳🇱" },
    away: { name: "Senegal", flag: "🇸🇳" },
    status: "finished", score: { home: 3, away: 2 }, minute: null,
  },

  // ---------- IN 2 DAYS ----------
  {
    id: 9, date: dayFromNow(2), time: "19:00", stage: "Group I",
    venue: "Levi's Stadium", city: "San Francisco",
    home: { name: "Belgium", flag: "🇧🇪" },
    away: { name: "Colombia", flag: "🇨🇴" },
    status: "upcoming", score: { home: null, away: null }, minute: null,
  },
];

// Tournament tagline shuffled in the header — add your own jokes 🎉
const HYPE_LINES = [
  "Where penalties are decided and friendships are tested.",
  "48 teams. 1 trophy. Endless group-chat arguments.",
  "Touch grass? No. Watch grass. Professionally.",
  "Your boss said no day off. Your heart said otherwise.",
  "Offside is a feeling, not a rule.",
  "It's coming home. Allegedly. Somewhere.",
];
