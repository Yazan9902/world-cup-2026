/* ============================================================
   WC26 · Yazan's WC Tracker — app logic (vanilla JS, no build)
   Features: Matches view, Group Tables view, Team filter
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

// ── State ──────────────────────────────────────────────────
let MATCH_DATA  = [];   // normalised match objects
let STANDINGS   = [];   // [{ group, table: [...] }]
let lastUpdated = null;
let selectedDate = todayStr();
let userPickedDate = false;
let activeTab   = "matches";       // "matches" | "tables"
let teamFilter  = null;            // { name, tla, flag, crest } | null

// ── Date helpers ───────────────────────────────────────────
function todayStr() { return localDateStr(new Date()); }
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseLocal(dateStr, timeStr = "00:00") {
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);
  return new Date(y, m-1, d, hh, mm);
}
function localTime(d) {
  return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", hour12:false });
}
function fmtDayHeading(dateStr) {
  const date = parseLocal(dateStr);
  const t = todayStr();
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  const yes = new Date(); yes.setDate(yes.getDate()-1);
  if (dateStr === t) return "Today";
  if (dateStr === localDateStr(tom)) return "Tomorrow";
  if (dateStr === localDateStr(yes)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
}

// ── Normalise a raw match (from JSON or demo data.js) ──────
function normalize(m) {
  const when = m.utc ? new Date(m.utc) : parseLocal(m.date, m.time);
  return {
    id: m.id, when, dateStr: localDateStr(when), time: localTime(when),
    stage: m.stage, venue: m.venue||null, city: m.city||null,
    home: m.home, away: m.away,
    status: m.status||"upcoming",
    score: m.score||{ home:null, away:null },
    minute: m.minute??null,
  };
}

// ── Tabs ───────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
}
function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("tab--active", active);
    btn.setAttribute("aria-selected", active);
  });
  const isMatches = tab === "matches";
  $("#datestrip").hidden    = !isMatches;
  $("#matches").hidden      = !isMatches;
  $("#filterChip").hidden   = !isMatches || !teamFilter;
  $("#standingsWrap").hidden = isMatches;

  if (!isMatches) renderStandings();
}

// ── Team filter ────────────────────────────────────────────
function setTeamFilter(t) {
  teamFilter = t;
  if (activeTab !== "matches") setTab("matches");
  updateFilterChip();
  buildDateStrip();
  renderMatches();
}
function clearTeamFilter() {
  teamFilter = null;
  updateFilterChip();
  userPickedDate = false;
  pickInitialDate();
  buildDateStrip();
  renderMatches();
}
function updateFilterChip() {
  const chip = $("#filterChip");
  if (!teamFilter) { chip.hidden = true; return; }
  chip.hidden = (activeTab !== "matches");
  const inner = $("#filterChipTeam");
  const crestHtml = teamFilter.crest
    ? `<img src="${teamFilter.crest}" alt="" width="22" height="16" loading="lazy">`
    : `<span>${teamFilter.flag||"🏳️"}</span>`;
  inner.innerHTML = `${crestHtml} ${teamFilter.name}`;
}

// ── Hype line ──────────────────────────────────────────────
function setHype() {
  const lines = (typeof HYPE_LINES!=="undefined" && HYPE_LINES.length) ? HYPE_LINES : [""];
  $("#hypeLine").textContent = lines[Math.floor(Math.random()*lines.length)];
}

// ── Date strip ─────────────────────────────────────────────
function buildDateStrip() {
  const strip = $("#datestrip");
  strip.innerHTML = "";
  const datesWithMatches = new Set(MATCH_DATA.map(m => m.dateStr));
  let days = [];

  if (teamFilter) {
    // show only dates this team plays
    days = [...new Set(
      MATCH_DATA
        .filter(m => m.home.tla===teamFilter.tla||m.away.tla===teamFilter.tla)
        .map(m => m.dateStr)
    )].sort();
    if (!days.includes(selectedDate) && days.length) selectedDate = days[0];
  } else {
    for (let i=-1; i<=7; i++) {
      const d = new Date(); d.setDate(d.getDate()+i);
      days.push(localDateStr(d));
    }
    datesWithMatches.forEach(d => { if (!days.includes(d)) days.push(d); });
    days.sort();
  }

  days.forEach(dateStr => {
    const date = parseLocal(dateStr);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "daypill";
    if (dateStr===todayStr()) pill.classList.add("daypill--today");
    if (dateStr===selectedDate) { pill.classList.add("daypill--active"); pill.setAttribute("aria-current","date"); }
    if (datesWithMatches.has(dateStr)) pill.classList.add("daypill--has");
    const n = datesWithMatches.has(dateStr) ? " (has matches)" : "";
    pill.setAttribute("aria-label", date.toLocaleDateString(undefined,{ weekday:"long", month:"long", day:"numeric" })+n);
    pill.innerHTML = `
      <div class="daypill__dow">${date.toLocaleDateString(undefined,{ weekday:"short" })}</div>
      <div class="daypill__num">${date.getDate()}</div>
      <div class="daypill__dot"></div>`;
    pill.addEventListener("click", () => {
      selectedDate = dateStr; userPickedDate = true;
      buildDateStrip(); renderMatches();
    });
    strip.appendChild(pill);
  });
  const active = strip.querySelector(".daypill--active");
  if (active) active.scrollIntoView({ inline:"center", block:"nearest" });
}

// ── Match card markup ───────────────────────────────────────
function flagMarkup(team) {
  if (team.crest) {
    return `<img class="team__crest" src="${team.crest}" alt="${team.name}" loading="lazy"
              onerror="this.outerHTML='<span class=\\'team__flag\\'>${team.flag||"🏳️"}</span>'">`;
  }
  return `<span class="team__flag">${team.flag||"🏳️"}</span>`;
}
function statusBadge(m) {
  if (m.status==="live")
    return `<span class="status status--live"><span class="dot"></span>LIVE${m.minute?" "+m.minute+"'":""}</span>`;
  if (m.status==="finished") return `<span class="status status--finished">FULL TIME</span>`;
  return `<span class="status status--upcoming">${m.time}</span>`;
}
function middleBlock(m) {
  if (m.status==="upcoming") return `<div class="mid"><div class="kick">${m.time}</div><div class="mid__sub">kickoff</div></div>`;
  const live = m.status==="live";
  return `<div class="mid">
    <div class="score ${live?"score--live":""}">${m.score.home??0}<span class="score__sep">:</span>${m.score.away??0}</div>
    <div class="mid__sub ${live?"mid__sub--live":""}">${live?(m.minute?m.minute+"' playing":"live"):"final"}</div>
  </div>`;
}
const ICON_PIN   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;
function cardFoot(m) {
  if (m.venue) return `${ICON_PIN}<span>${m.venue}${m.city?" · "+m.city:""}</span>`;
  const d = m.when.toLocaleDateString(undefined,{ weekday:"short", month:"short", day:"numeric" });
  return `${ICON_CLOCK}<span>${d} · ${m.time} your time</span>`;
}
function matchCard(m, idx) {
  const el = document.createElement("article");
  el.className = "card"+(m.status==="live"?" card--live":"");
  el.style.animationDelay = `${Math.min(idx*60,360)}ms`;
  el.innerHTML = `
    <div class="card__top"><span class="stage">${m.stage}</span>${statusBadge(m)}</div>
    <div class="teams">
      <div class="team ${m.home.tla===teamFilter?.tla?"team--watching":""}"
           role="button" tabindex="0" aria-label="Filter by ${m.home.name}"
           data-tla="${m.home.tla}" data-name="${m.home.name}" data-flag="${m.home.flag||""}" data-crest="${m.home.crest||""}">
        ${flagMarkup(m.home)}<span class="team__name">${m.home.name}</span>
      </div>
      ${middleBlock(m)}
      <div class="team ${m.away.tla===teamFilter?.tla?"team--watching":""}"
           role="button" tabindex="0" aria-label="Filter by ${m.away.name}"
           data-tla="${m.away.tla}" data-name="${m.away.name}" data-flag="${m.away.flag||""}" data-crest="${m.away.crest||""}">
        ${flagMarkup(m.away)}<span class="team__name">${m.away.name}</span>
      </div>
    </div>
    <div class="card__foot">${cardFoot(m)}</div>`;

  // team click → filter
  el.querySelectorAll(".team[data-tla]").forEach(t => {
    const action = () => {
      const tla = t.dataset.tla;
      if (!tla) return;
      if (teamFilter?.tla === tla) { clearTeamFilter(); return; }
      setTeamFilter({ tla, name:t.dataset.name, flag:t.dataset.flag, crest:t.dataset.crest });
    };
    t.addEventListener("click", action);
    t.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); action(); } });
  });
  return el;
}

// ── Render matches ─────────────────────────────────────────
function renderMatches() {
  const wrap = $("#matches");
  wrap.innerHTML = "";

  if (teamFilter) { renderTeamMatches(wrap); return; }

  const rank = { live:0, upcoming:1, finished:2 };
  const todays = MATCH_DATA
    .filter(m => m.dateStr===selectedDate)
    .sort((a,b) => (rank[a.status]-rank[b.status])||(a.when-b.when));

  const liveCount = todays.filter(m => m.status==="live").length;
  const h = document.createElement("h2");
  h.className = "day-heading";
  h.innerHTML = `<span>${fmtDayHeading(selectedDate)} · ${todays.length} match${todays.length===1?"":"es"}</span>`
    + (liveCount?`<span class="live-tally"><span class="dot"></span>${liveCount} LIVE</span>`:"");
  wrap.appendChild(h);

  if (!todays.length) {
    wrap.innerHTML += `<div class="empty">
      <svg class="empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2"/><path d="M12 7.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8L12 7.2Z" fill="currentColor" stroke="none"/>
      </svg>
      <div class="empty__title">No matches this day</div>
      <p>Tap a different day in the strip, or pick a team to track.</p></div>`;
    return;
  }
  todays.forEach((m,i) => wrap.appendChild(matchCard(m,i)));
}

function renderTeamMatches(wrap) {
  const tla = teamFilter.tla;
  const rank = { live:0, upcoming:1, finished:2 };
  const all = MATCH_DATA
    .filter(m => m.home.tla===tla||m.away.tla===tla)
    .sort((a,b) => (rank[a.status]-rank[b.status])||(a.when-b.when));

  if (!all.length) {
    wrap.innerHTML = `<div class="empty">
      <div class="empty__title">No matches found</div><p>No fixtures for this team yet.</p></div>`;
    return;
  }

  // Group by date, live/upcoming first, then past
  const upcoming = all.filter(m => m.status!=="finished");
  const past = all.filter(m => m.status==="finished");

  let idx = 0;
  const addSection = (matches, label) => {
    if (!matches.length) return;
    // group by date within section
    const byDate = {};
    matches.forEach(m => { (byDate[m.dateStr]||=[]).push(m); });
    Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).forEach(([date, ms]) => {
      const h = document.createElement("h2");
      h.className = "day-heading";
      h.innerHTML = `<span>${fmtDayHeading(date)}</span>`;
      wrap.appendChild(h);
      ms.forEach(m => { wrap.appendChild(matchCard(m, idx++)); });
    });
  };

  const liveNow = all.filter(m=>m.status==="live");
  if (liveNow.length) {
    const h = document.createElement("h2");
    h.className = "day-heading";
    h.innerHTML = `<span>Playing now</span><span class="live-tally"><span class="dot"></span>${liveNow.length} LIVE</span>`;
    wrap.appendChild(h);
    liveNow.forEach(m => { wrap.appendChild(matchCard(m, idx++)); });
  }

  const upcomingOnly = upcoming.filter(m=>m.status!=="live");
  if (upcomingOnly.length) {
    const byDate = {};
    upcomingOnly.forEach(m => { (byDate[m.dateStr]||=[]).push(m); });
    Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).forEach(([date, ms]) => {
      const h = document.createElement("h2"); h.className = "day-heading";
      h.innerHTML = `<span>${fmtDayHeading(date)}</span>`; wrap.appendChild(h);
      ms.forEach(m => wrap.appendChild(matchCard(m, idx++)));
    });
  }

  if (past.length) {
    const div = document.createElement("h2"); div.className = "day-heading";
    div.innerHTML = `<span style="opacity:.6">Past matches</span>`; wrap.appendChild(div);
    [...past].sort((a,b)=>b.when-a.when).forEach(m => wrap.appendChild(matchCard(m, idx++)));
  }
}

// ── Render standings ───────────────────────────────────────
function renderStandings() {
  const wrap = $("#standingsWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!STANDINGS.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty__title">Tables coming soon</div>
      <p>Standings will appear once matches begin.</p></div>`;
    return;
  }

  STANDINGS.forEach((group, gi) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.style.animationDelay = `${gi*45}ms`;

    const played = group.table.reduce((s,r)=>s+r.played,0);
    card.innerHTML = `
      <div class="group-card__head">
        <span class="group-card__name">${group.group}</span>
        <span class="group-card__played">${played} match${played===1?"":"es"} played</span>
      </div>
      <div class="st-head">
        <div class="st-head-cell">#</div>
        <div class="st-head-cell"></div>
        <div class="st-head-cell" style="text-align:left">Team</div>
        <div class="st-head-cell">P</div>
        <div class="st-head-cell">W</div>
        <div class="st-head-cell">D</div>
        <div class="st-head-cell">L</div>
        <div class="st-head-cell">GD</div>
        <div class="st-head-cell" style="color:var(--lime)">PTS</div>
      </div>`;

    group.table.forEach((row, ri) => {
      const qualify = ri < 2; // top 2 advance
      const rowEl = document.createElement("div");
      rowEl.className = "st-row" + (qualify?" st-row--qualify":"");
      rowEl.setAttribute("role","button");
      rowEl.setAttribute("tabindex","0");
      rowEl.setAttribute("aria-label",`${row.team.name} — ${row.pts} points. Filter matches.`);

      const crestHtml = row.team.crest
        ? `<img class="st-crest" src="${row.team.crest}" alt="" loading="lazy">`
        : `<span class="st-flag">${row.team.flag||"🏳️"}</span>`;
      const gdStr = row.gd>0?"+"+row.gd:String(row.gd);

      rowEl.innerHTML = `
        <span class="st-pos">${row.position}</span>
        ${crestHtml}
        <span class="st-name">${row.team.name}</span>
        <span class="st-num">${row.played}</span>
        <span class="st-num">${row.won}</span>
        <span class="st-num">${row.draw}</span>
        <span class="st-num">${row.lost}</span>
        <span class="st-gd">${gdStr}</span>
        <span class="st-pts">${row.pts}</span>`;

      // click → switch to matches tab filtered for this team
      const filter = () => {
        setTeamFilter({ tla:row.team.tla, name:row.team.name, flag:row.team.flag, crest:row.team.crest });
      };
      rowEl.addEventListener("click", filter);
      rowEl.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); filter(); } });
      card.appendChild(rowEl);
    });

    wrap.appendChild(card);
  });
}

// ── Countdown ──────────────────────────────────────────────
let countdownTimer = null;
function startCountdown() {
  const elBox=$("#countdown"), elTime=$("#countdownTime"), elMatch=$("#countdownMatch");
  function tick() {
    const now = new Date();
    const next = MATCH_DATA
      .filter(m=>m.status==="upcoming"&&m.when>now)
      .sort((a,b)=>a.when-b.when)[0];
    if (!next) { elBox.hidden=true; return; }
    elBox.hidden=false;
    elMatch.textContent=`${next.home.flag||""} ${next.home.name} v ${next.away.name} ${next.away.flag||""}`;
    let diff=Math.max(0,next.when-now);
    const d=Math.floor(diff/8.64e7); diff-=d*8.64e7;
    const h=Math.floor(diff/3.6e6); diff-=h*3.6e6;
    const mn=Math.floor(diff/6e4); diff-=mn*6e4;
    const s=Math.floor(diff/1e3);
    const p=n=>String(n).padStart(2,"0");
    elTime.textContent=d>0?`${d}d ${p(h)}:${p(mn)}:${p(s)}`:`${p(h)}:${p(mn)}:${p(s)}`;
  }
  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer=setInterval(tick,1000);
}

// ── Footer updated line ────────────────────────────────────
function setUpdatedLine() {
  $("#matchCount").textContent = MATCH_DATA.length;
  const upd=$("#updated");
  if (lastUpdated&&upd) {
    const mins=Math.round((Date.now()-new Date(lastUpdated))/60000);
    upd.textContent=mins<1?"just now":mins<60?`${mins} min ago`:`${Math.round(mins/60)}h ago`;
  }
}

// ── Load data ──────────────────────────────────────────────
async function loadData() {
  try {
    const res=await fetch("matches.json",{ cache:"no-store" });
    if (!res.ok) throw new Error("no json");
    const json=await res.json();
    if (!Array.isArray(json.matches)||!json.matches.length) throw new Error("empty");
    MATCH_DATA=json.matches.map(normalize);
    STANDINGS=json.standings||[];
    lastUpdated=json.updatedAt||null;
    return "live";
  } catch {
    if (typeof MATCHES!=="undefined"&&Array.isArray(MATCHES)) {
      MATCH_DATA=MATCHES.map(normalize); STANDINGS=[]; lastUpdated=null; return "demo";
    }
    MATCH_DATA=[]; return "none";
  }
}

// ── Initial date picker ────────────────────────────────────
function pickInitialDate() {
  if (userPickedDate) return;
  const t=todayStr();
  const dates=[...new Set(MATCH_DATA.map(m=>m.dateStr))].sort();
  if (dates.includes(t)) { selectedDate=t; return; }
  selectedDate=dates.find(d=>d>=t)||dates[dates.length-1]||t;
}

// ── Skeleton placeholders ──────────────────────────────────
function showSkeletons(n=3) {
  $("#matches").innerHTML=
    `<div class="day-heading"><span style="opacity:.6">Loading today…</span></div>`+
    Array.from({length:n},()=>`<div class="skeleton" aria-hidden="true"></div>`).join("");
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  setHype();
  showSkeletons();
  initTabs();

  // filter chip clear button
  $("#filterChipClear")?.addEventListener("click", clearTeamFilter);

  const mode=await loadData();
  if (mode==="none") {
    $("#matches").innerHTML=`<div class="empty">
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

  // auto-refresh every 45s
  setInterval(async () => {
    await loadData();
    if (activeTab==="matches") { buildDateStrip(); renderMatches(); }
    else renderStandings();
    setUpdatedLine();
  }, 45000);
}

document.addEventListener("DOMContentLoaded", init);
