/* ============================================================
   WC26 · Yazan's WC Tracker — app logic (vanilla JS, no build)
   Features: Matches view, Knockout bracket, Golden Boot, Team filter
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

// ── State ──────────────────────────────────────────────────
let MATCH_DATA  = [];   // normalised match objects
let SCORERS     = [];   // [{ name, team, goals, assists, penalties }]
let lastUpdated = null;
let selectedDate = todayStr();
let userPickedDate = false;
let activeTab   = "matches";       // "matches" | "knockout" | "scorers"
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
    stage: m.stage, stageKey: m.stageKey||null, knockout: !!m.knockout,
    venue: m.venue||null, city: m.city||null,
    home: m.home, away: m.away,
    status: m.status||"upcoming",
    score: m.score||{ home:null, away:null },
    ht: m.ht||null, pens: m.pens||null, aet: !!m.aet, winner: m.winner||null,
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
  $("#datestrip").hidden     = !isMatches;
  $("#matches").hidden       = !isMatches;
  $("#filterChip").hidden    = !isMatches || !teamFilter;
  $("#knockoutWrap").hidden  = tab !== "knockout";
  $("#scorersWrap").hidden   = tab !== "scorers";

  if (tab === "knockout") renderKnockout();
  if (tab === "scorers")  renderScorers();
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
function finishedLabel(m) {
  if (m.pens) return `${m.pens.home}–${m.pens.away} pens`;
  if (m.aet) return "after extra time";
  return "final";
}
function middleBlock(m) {
  if (m.status==="upcoming") return `<div class="mid"><div class="kick">${m.time}</div><div class="mid__sub">kickoff</div></div>`;
  const live = m.status==="live";
  const sub = live ? (m.minute?m.minute+"' playing":"live") : finishedLabel(m);
  const pensCls = (!live && m.pens) ? " mid__sub--pens" : "";
  return `<div class="mid">
    <div class="score ${live?"score--live":""}">${m.score.home??0}<span class="score__sep">:</span>${m.score.away??0}</div>
    <div class="mid__sub ${live?"mid__sub--live":""}${pensCls}">${sub}</div>
  </div>`;
}
const ICON_PIN   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;
function cardFoot(m) {
  const ht = (m.status!=="upcoming" && m.ht) ? ` · HT ${m.ht.home}–${m.ht.away}` : "";
  if (m.venue) return `${ICON_PIN}<span>${m.venue}${m.city?" · "+m.city:""}${ht}</span>`;
  const d = m.when.toLocaleDateString(undefined,{ weekday:"short", month:"short", day:"numeric" });
  return `${ICON_CLOCK}<span>${d} · ${m.time} your time${ht}</span>`;
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
    const e = document.createElement("div");
    e.className = "empty";
    e.innerHTML = `
      <svg class="empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2"/><path d="M12 7.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8L12 7.2Z" fill="currentColor" stroke="none"/>
      </svg>
      <div class="empty__title">No matches this day</div>
      <p>Tap a different day in the strip, or pick a team to track.</p>`;
    wrap.appendChild(e);
    return;
  }
  todays.forEach((m,i) => wrap.appendChild(matchCard(m,i)));
}

function renderTeamMatches(wrap) {
  const tla = teamFilter.tla;
  const all = MATCH_DATA
    .filter(m => m.home.tla===tla || m.away.tla===tla)
    .sort((a,b) => a.when - b.when);

  if (!all.length) {
    wrap.innerHTML = `<div class="empty">
      <div class="empty__title">No matches found</div><p>No fixtures for this team yet.</p></div>`;
    return;
  }

  const liveNow  = all.filter(m => m.status === "live");
  const upcoming = all.filter(m => m.status === "upcoming");
  const past     = all.filter(m => m.status === "finished");

  let idx = 0;
  // Helper: render a group of matches broken into date headings
  const addDateGroup = (matches) => {
    const byDate = {};
    matches.forEach(m => { (byDate[m.dateStr] ||= []).push(m); });
    Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).forEach(([date, ms]) => {
      const h = document.createElement("h2");
      h.className = "day-heading";
      h.innerHTML = `<span>${fmtDayHeading(date)}</span>`;
      wrap.appendChild(h);
      ms.forEach(m => wrap.appendChild(matchCard(m, idx++)));
    });
  };

  if (liveNow.length) {
    const h = document.createElement("h2");
    h.className = "day-heading";
    h.innerHTML = `<span>Playing now</span><span class="live-tally"><span class="dot"></span>${liveNow.length} LIVE</span>`;
    wrap.appendChild(h);
    liveNow.forEach(m => wrap.appendChild(matchCard(m, idx++)));
  }

  if (upcoming.length) addDateGroup(upcoming);

  if (past.length) {
    const h = document.createElement("h2");
    h.className = "day-heading";
    h.innerHTML = `<span style="opacity:.6">Past matches</span>`;
    wrap.appendChild(h);
    [...past].sort((a,b) => b.when - a.when).forEach(m => wrap.appendChild(matchCard(m, idx++)));
  }
}

// ── Render knockout bracket ────────────────────────────────
const KO_ORDER = ["LAST_32","LAST_16","QUARTER_FINALS","SEMI_FINALS","THIRD_PLACE","FINAL"];
const KO_NAMES = {
  LAST_32:"Round of 32", LAST_16:"Round of 16", QUARTER_FINALS:"Quarter-finals",
  SEMI_FINALS:"Semi-finals", THIRD_PLACE:"3rd-place play-off", FINAL:"Final",
};

function koTeamHtml(team, side, m) {
  const won = m.winner === (side==="home"?"HOME_TEAM":"AWAY_TEAM");
  const out = m.status==="finished" && m.winner && !won;
  const crest = team.crest
    ? `<img class="ko-crest" src="${team.crest}" alt="" loading="lazy">`
    : `<span class="ko-flag">${team.flag||"🏳️"}</span>`;
  return `<div class="ko-team ko-team--${side} ${won?"ko-team--won":""} ${out?"ko-team--out":""}"
       ${team.tla?`role="button" tabindex="0" aria-label="Filter by ${team.name}" data-tla="${team.tla}" data-name="${team.name}" data-flag="${team.flag||""}" data-crest="${team.crest||""}"`:""}>
    ${crest}<span class="ko-team__name">${team.name}</span>
  </div>`;
}

function koMidHtml(m) {
  if (m.status==="upcoming") {
    const d = m.when.toLocaleDateString(undefined,{ month:"short", day:"numeric" });
    return `<div class="ko-mid"><span class="ko-score ko-score--tbd">${d}</span><span class="ko-note">${m.time}</span></div>`;
  }
  const live = m.status==="live";
  let note = "";
  if (live) note = `<span class="ko-note ko-note--live">${m.minute?m.minute+"'":"LIVE"}</span>`;
  else if (m.pens) note = `<span class="ko-note ko-note--pens">${m.pens.home}–${m.pens.away} pens</span>`;
  else if (m.aet) note = `<span class="ko-note">AET</span>`;
  return `<div class="ko-mid"><span class="ko-score ${live?"ko-score--live":""}">${m.score.home??0}–${m.score.away??0}</span>${note}</div>`;
}

function renderKnockout() {
  const wrap = $("#knockoutWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const ko = MATCH_DATA.filter(m => m.knockout);
  if (!ko.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty__title">Knockout coming soon</div>
      <p>The bracket appears once the group stage wraps up.</p></div>`;
    return;
  }

  KO_ORDER.forEach((key, si) => {
    const games = ko.filter(m => m.stageKey===key).sort((a,b)=>a.when-b.when);
    if (!games.length) return;

    const card = document.createElement("div");
    card.className = "group-card";
    card.style.animationDelay = `${si*45}ms`;
    const done = games.filter(g=>g.status==="finished").length;
    const liveN = games.filter(g=>g.status==="live").length;
    card.innerHTML = `
      <div class="group-card__head">
        <span class="group-card__name">${KO_NAMES[key]||key}</span>
        <span class="group-card__played">${liveN?`<span class="live-tally"><span class="dot"></span>${liveN} LIVE</span>`:`${done}/${games.length} played`}</span>
      </div>`;

    games.forEach(m => {
      const row = document.createElement("div");
      row.className = "ko-row" + (m.status==="live"?" ko-row--live":"");
      row.innerHTML = koTeamHtml(m.home,"home",m) + koMidHtml(m) + koTeamHtml(m.away,"away",m);
      // tapping a team filters their fixtures (same as match cards)
      row.querySelectorAll(".ko-team[data-tla]").forEach(t => {
        const action = () => setTeamFilter({ tla:t.dataset.tla, name:t.dataset.name, flag:t.dataset.flag, crest:t.dataset.crest });
        t.addEventListener("click", action);
        t.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); action(); } });
      });
      card.appendChild(row);
    });
    wrap.appendChild(card);
  });
}

// ── Render Golden Boot ─────────────────────────────────────
function renderScorers() {
  const wrap = $("#scorersWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!SCORERS.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty__title">No scorers yet</div>
      <p>The Golden Boot race appears once goals start flying in.</p></div>`;
    return;
  }

  const card = document.createElement("div");
  card.className = "group-card";
  card.innerHTML = `
    <div class="group-card__head">
      <span class="group-card__name">Golden Boot race</span>
      <span class="group-card__played">top ${SCORERS.length}</span>
    </div>
    <div class="sc-head">
      <span class="sc-head-cell">#</span><span></span>
      <span class="sc-head-cell" style="text-align:left">Player</span>
      <span class="sc-head-cell">A</span>
      <span class="sc-head-cell" style="color:var(--lime)">G</span>
    </div>`;

  SCORERS.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "sc-row" + (i===0?" sc-row--leader":"");
    row.setAttribute("role","button");
    row.setAttribute("tabindex","0");
    row.setAttribute("aria-label",`${s.name} (${s.team.name}) — ${s.goals} goals. Filter team matches.`);
    const crest = s.team.crest
      ? `<img class="ko-crest" src="${s.team.crest}" alt="" loading="lazy">`
      : `<span class="ko-flag">${s.team.flag||"🏳️"}</span>`;
    row.innerHTML = `
      <span class="sc-pos">${i+1}</span>
      ${crest}
      <span class="sc-player"><span class="sc-name">${s.name}</span><span class="sc-team">${s.team.name}</span></span>
      <span class="sc-num">${s.assists||"–"}</span>
      <span class="sc-goals">${s.goals}</span>`;
    const filter = () => setTeamFilter({ tla:s.team.tla, name:s.team.name, flag:s.team.flag, crest:s.team.crest });
    row.addEventListener("click", filter);
    row.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); filter(); } });
    card.appendChild(row);
  });
  wrap.appendChild(card);
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
    SCORERS=json.scorers||[];
    lastUpdated=json.updatedAt||null;
    return "live";
  } catch {
    if (typeof MATCHES!=="undefined"&&Array.isArray(MATCHES)) {
      MATCH_DATA=MATCHES.map(normalize); SCORERS=[]; lastUpdated=null; return "demo";
    }
    MATCH_DATA=[]; return "none";
  }
}

// ── Manual refresh ─────────────────────────────────────────
let refreshing = false;
async function refreshNow() {
  if (refreshing) return;
  refreshing = true;
  const btn = $("#refreshBtn");
  btn?.classList.remove("is-done");
  btn?.classList.add("is-loading");
  if (btn) btn.disabled = true;

  // re-pull the freshest matches.json; keep spinner visible at least 600ms
  const [mode] = await Promise.all([
    loadData(),
    new Promise(r => setTimeout(r, 600)),
  ]);

  if (mode !== "none") {
    if (activeTab === "matches") { buildDateStrip(); renderMatches(); }
    else if (activeTab === "knockout") renderKnockout();
    else renderScorers();
    setUpdatedLine();
  }

  btn?.classList.remove("is-loading");
  if (btn) btn.disabled = false;
  // brief success checkmark
  btn?.classList.add("is-done");
  setTimeout(() => btn?.classList.remove("is-done"), 1300);
  refreshing = false;
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

  // manual refresh button
  $("#refreshBtn")?.addEventListener("click", refreshNow);

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
    else if (activeTab==="knockout") renderKnockout();
    else renderScorers();
    setUpdatedLine();
  }, 45000);
}

document.addEventListener("DOMContentLoaded", init);
