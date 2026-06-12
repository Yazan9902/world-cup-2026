/* ============================================================
   WC26 — app logic (vanilla JS, no build step)
   ------------------------------------------------------------
   Data flow:
     matches.json  (written by fetch_matches.py from football-data.org)
        └─► loaded here.  If it's missing, we fall back to the demo
            MATCHES array in data.js so the page still works.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

// State
let MATCH_DATA = [];      // normalized matches currently in use
let lastUpdated = null;   // ISO string from matches.json
let selectedDate = todayStr();
let userPickedDate = false;

// ---- date helpers (everything shown in the viewer's LOCAL timezone) ----
function todayStr() {
  return localDateStr(new Date());
}
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocal(dateStr, timeStr = "00:00") {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
function localTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDayHeading(dateStr) {
  const date = parseLocal(dateStr);
  const t = todayStr();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (dateStr === t) return "Today";
  if (dateStr === localDateStr(tomorrow)) return "Tomorrow";
  if (dateStr === localDateStr(yest)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// ---- normalize either data shape into one consistent object ----
// json shape: { utc, stage, home:{name,flag,crest}, away:{...}, status, score, minute }
// demo shape: { date, time, stage, venue, city, home:{name,flag}, away:{...}, status, score, minute }
function normalize(m) {
  const when = m.utc ? new Date(m.utc) : parseLocal(m.date, m.time);
  return {
    id: m.id,
    when,
    dateStr: localDateStr(when),
    time: localTime(when),
    stage: m.stage,
    venue: m.venue || null,
    city: m.city || null,
    home: m.home,
    away: m.away,
    status: m.status || "upcoming",
    score: m.score || { home: null, away: null },
    minute: m.minute ?? null,
  };
}

// ---- hype line ----
function setHype() {
  const lines = (typeof HYPE_LINES !== "undefined" && HYPE_LINES.length) ? HYPE_LINES : [""];
  $("#hypeLine").textContent = lines[Math.floor(Math.random() * lines.length)];
}

// ---- date strip ----
function buildDateStrip() {
  const strip = $("#datestrip");
  strip.innerHTML = "";

  const datesWithMatches = new Set(MATCH_DATA.map((m) => m.dateStr));
  const days = [];
  for (let i = -1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    days.push(localDateStr(d));
  }
  datesWithMatches.forEach((d) => { if (!days.includes(d)) days.push(d); });
  days.sort();

  days.forEach((dateStr) => {
    const date = parseLocal(dateStr);
    const pill = document.createElement("button");
    pill.className = "daypill";
    pill.type = "button";
    if (dateStr === todayStr()) pill.classList.add("daypill--today");
    if (dateStr === selectedDate) { pill.classList.add("daypill--active"); pill.setAttribute("aria-current", "date"); }
    if (datesWithMatches.has(dateStr)) pill.classList.add("daypill--has");

    const n = datesWithMatches.has(dateStr) ? " (has matches)" : "";
    pill.setAttribute("aria-label",
      date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + n);
    pill.innerHTML = `
      <div class="daypill__dow">${date.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div class="daypill__num">${date.getDate()}</div>
      <div class="daypill__dot"></div>
    `;
    pill.addEventListener("click", () => {
      selectedDate = dateStr;
      userPickedDate = true;
      buildDateStrip();
      renderMatches();
    });
    strip.appendChild(pill);
  });

  const active = strip.querySelector(".daypill--active");
  if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
}

// ---- match card pieces ----
function flagMarkup(team) {
  if (team.crest) {
    return `<img class="team__crest" src="${team.crest}" alt="${team.name} flag" loading="lazy"
              onerror="this.outerHTML='<span class=\\'team__flag\\'>${team.flag || "🏳️"}</span>'">`;
  }
  return `<span class="team__flag">${team.flag || "🏳️"}</span>`;
}

function statusBadge(m) {
  if (m.status === "live")
    return `<span class="status status--live"><span class="dot"></span>LIVE${m.minute ? " " + m.minute + "'" : ""}</span>`;
  if (m.status === "finished")
    return `<span class="status status--finished">FULL TIME</span>`;
  return `<span class="status status--upcoming">${m.time}</span>`;
}

function middleBlock(m) {
  if (m.status === "upcoming") {
    return `<div class="mid">
      <div class="kick">${m.time}</div>
      <div class="mid__sub">kickoff</div>
    </div>`;
  }
  const live = m.status === "live";
  return `<div class="mid">
    <div class="score ${live ? "score--live" : ""}">${m.score.home ?? 0}<span class="score__sep">:</span>${m.score.away ?? 0}</div>
    <div class="mid__sub ${live ? "mid__sub--live" : ""}">${live ? (m.minute ? m.minute + "' playing" : "live") : "final"}</div>
  </div>`;
}

const ICON_PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;

function cardFoot(m) {
  if (m.venue) return `${ICON_PIN}<span>${m.venue}${m.city ? " · " + m.city : ""}</span>`;
  // API data has no venue — show the local kickoff date instead (handy across timezones)
  const d = m.when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${ICON_CLOCK}<span>${d} · ${m.time} your time</span>`;
}

function matchCard(m, idx) {
  const el = document.createElement("article");
  el.className = "card" + (m.status === "live" ? " card--live" : "");
  el.style.animationDelay = `${Math.min(idx * 60, 360)}ms`;
  el.innerHTML = `
    <div class="card__top">
      <span class="stage">${m.stage}</span>
      ${statusBadge(m)}
    </div>
    <div class="teams">
      <div class="team">
        ${flagMarkup(m.home)}
        <span class="team__name">${m.home.name}</span>
      </div>
      ${middleBlock(m)}
      <div class="team">
        ${flagMarkup(m.away)}
        <span class="team__name">${m.away.name}</span>
      </div>
    </div>
    <div class="card__foot">${cardFoot(m)}</div>
  `;
  return el;
}

// ---- render ----
function renderMatches() {
  const wrap = $("#matches");
  wrap.innerHTML = "";

  const rank = { live: 0, upcoming: 1, finished: 2 };
  const todays = MATCH_DATA
    .filter((m) => m.dateStr === selectedDate)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (a.when - b.when));

  const liveCount = todays.filter((m) => m.status === "live").length;
  const heading = document.createElement("h2");
  heading.className = "day-heading";
  heading.innerHTML =
    `<span>${fmtDayHeading(selectedDate)} · ${todays.length} match${todays.length === 1 ? "" : "es"}</span>` +
    (liveCount ? `<span class="live-tally"><span class="dot"></span>${liveCount} LIVE</span>` : "");
  wrap.appendChild(heading);

  if (todays.length === 0) {
    wrap.innerHTML += `
      <div class="empty">
        <svg class="empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.2"/><path d="M12 7.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8L12 7.2Z" fill="currentColor" stroke="none"/>
        </svg>
        <div class="empty__title">No matches this day</div>
        <p>Time to touch grass — or scroll to a day that has games.</p>
      </div>`;
    return;
  }

  todays.forEach((m, i) => wrap.appendChild(matchCard(m, i)));
}

// ---- countdown to next upcoming match ----
let countdownTimer = null;
function startCountdown() {
  const elBox = $("#countdown");
  const elTime = $("#countdownTime");
  const elMatch = $("#countdownMatch");

  function tick() {
    const now = new Date();
    const upcoming = MATCH_DATA
      .filter((m) => m.status === "upcoming" && m.when > now)
      .sort((a, b) => a.when - b.when)[0];

    if (!upcoming) { elBox.hidden = true; return; }

    elBox.hidden = false;
    elMatch.textContent = `${upcoming.home.flag || ""} ${upcoming.home.name} v ${upcoming.away.name} ${upcoming.away.flag || ""}`;

    let diff = Math.max(0, upcoming.when - now);
    const d = Math.floor(diff / 8.64e7); diff -= d * 8.64e7;
    const h = Math.floor(diff / 3.6e6); diff -= h * 3.6e6;
    const mn = Math.floor(diff / 6e4); diff -= mn * 6e4;
    const s = Math.floor(diff / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    elTime.textContent = d > 0 ? `${d}d ${pad(h)}:${pad(mn)}:${pad(s)}` : `${pad(h)}:${pad(mn)}:${pad(s)}`;
  }
  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
}

// ---- footer "updated" line ----
function setUpdatedLine() {
  const el = $("#matchCount");
  el.textContent = MATCH_DATA.length;
  const upd = $("#updated");
  if (lastUpdated && upd) {
    const mins = Math.round((Date.now() - new Date(lastUpdated)) / 60000);
    upd.textContent = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` :
      `${Math.round(mins / 60)}h ago`;
  }
}

// ---- load data: try matches.json, fall back to demo ----
async function loadData() {
  try {
    const res = await fetch("matches.json", { cache: "no-store" });
    if (!res.ok) throw new Error("no json");
    const json = await res.json();
    if (!Array.isArray(json.matches) || json.matches.length === 0) throw new Error("empty");
    MATCH_DATA = json.matches.map(normalize);
    lastUpdated = json.updatedAt || null;
    return "live";
  } catch (e) {
    // fallback to demo data baked into data.js
    if (typeof MATCHES !== "undefined" && Array.isArray(MATCHES)) {
      MATCH_DATA = MATCHES.map(normalize);
      lastUpdated = null;
      return "demo";
    }
    MATCH_DATA = [];
    return "none";
  }
}

// pick the most relevant day to open on: today if it has games,
// else the next upcoming match day, else the last day with games.
function pickInitialDate() {
  if (userPickedDate) return;
  const t = todayStr();
  const dates = [...new Set(MATCH_DATA.map((m) => m.dateStr))].sort();
  if (dates.includes(t)) { selectedDate = t; return; }
  const future = dates.find((d) => d >= t);
  selectedDate = future || dates[dates.length - 1] || t;
}

// ---- skeleton placeholders while data loads ----
function showSkeletons(n = 3) {
  $("#matches").innerHTML =
    `<div class="day-heading"><span style="opacity:.6">Loading today…</span></div>` +
    Array.from({ length: n }, () => `<div class="skeleton" aria-hidden="true"></div>`).join("");
}

// ---- init + auto-refresh ----
async function init() {
  setHype();
  showSkeletons();
  const mode = await loadData();

  if (mode === "none") {
    $("#matches").innerHTML = `<div class="empty">
      <svg class="empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/></svg>
      <div class="empty__title">No data yet</div>
      <p>Run <code>fetch_matches.py</code> or add fixtures in <code>data.js</code>.</p></div>`;
    return;
  }

  pickInitialDate();
  buildDateStrip();
  renderMatches();
  startCountdown();
  setUpdatedLine();

  setInterval(setHype, 6000);

  // Auto-refresh the snapshot so live scores update without a reload.
  setInterval(async () => {
    await loadData();
    buildDateStrip();
    renderMatches();
    setUpdatedLine();
  }, 45000);
}

document.addEventListener("DOMContentLoaded", init);
