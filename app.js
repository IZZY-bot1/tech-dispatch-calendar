/* Greenlight Dispatch Portal – Admin + Technician logins on Supabase */
(() => {
const C = window.GL_CONFIG;
const sb = supabase.createClient(C.url, C.key);
const START_H = 7, END_H = 19, HR = 52;
const PALETTE = ["#2f6fd6","#d0601f","#7a4cc2","#14866d","#b8328a","#c79a12","#3c8c2c","#d23a4c","#0f8fb0","#6b5a3e","#2a7a3e"];
const PM = {Paid:"✓", Partial:"◐", Unpaid:"$", Refunded:"↺"};

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sow = d => addDays(d, -d.getDay());
const money = n => "$" + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtT = t => { let [h,m] = t.split(":").map(Number); const ap = h>=12?"p":"a"; h = h%12||12; return m?`${h}:${pad(m)}${ap}`:`${h}${ap}`; };
const endT = j => { const [h,m] = j.start_time.split(":").map(Number); const e = Math.round(h*60+m+j.dur*60); return `${pad(Math.floor(e/60))}:${pad(e%60)}`; };
const longDate = s => parse(s).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const mapUrl = a => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a);
const telDigits = p => String(p||"").replace(/[^\d+]/g,"");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800); }
function showErr(el, e) { el.textContent = e ? (e.message || String(e)) : ""; el.hidden = !e; }

/* ---------- state ---------- */
let me = null, isAdmin = false;
let staff = [], customers = [], jobs = [], items = [];
let adminTab = "dash", view = "month", cur = new Date(), focusTech = "all", payF = "all", custQ = "", techTab = "list";
const hidden = new Set();
try { const p = JSON.parse(localStorage.getItem("gl-portal-prefs")) || {}; view = p.view || view; payF = p.pay || payF; techTab = p.tab || techTab; } catch(e) {}
const savePrefs = () => { try { localStorage.setItem("gl-portal-prefs", JSON.stringify({view, pay:payF, tab:techTab})); } catch(e) {} };

const tech = id => staff.find(t => t.id === id) || {name:"Unassigned", color:"#888"};
const cust = id => customers.find(c => c.id === id) || {name:"", address:"", phone:"", email:""};
const techs = () => staff.filter(s => s.active);
const jobItems = id => items.filter(i => i.job_id === id);
const price = j => jobItems(j.id).reduce((a,i) => a + (+i.qty||0)*(+i.unit_price||0), 0);
const balance = j => Math.max(0, price(j) - (+j.amount_paid||0));

/* ---------- auth ---------- */
let signUpMode = false;
$("#lToggle").onclick = () => {
  signUpMode = !signUpMode;
  $("#lSubmit").textContent = signUpMode ? "Create account" : "Sign in";
  $("#lToggle").textContent = signUpMode ? "Have an account? Sign in" : "First time? Create your account";
  $("#lPass").autocomplete = signUpMode ? "new-password" : "current-password";
  $("#loginMsg").textContent = signUpMode ? "Use the email your admin added for you, and choose a password (6+ characters)." : "Sign in as Admin or Technician.";
};
$("#lForgot").onclick = async () => {
  const email = $("#lEmail").value.trim();
  if (!email) { $("#loginMsg").textContent = "Type your email above, then click Forgot password."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
  $("#loginMsg").textContent = error ? error.message : "Check your email for a password reset link.";
};
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const email = $("#lEmail").value.trim(), password = $("#lPass").value;
  $("#lSubmit").disabled = true;
  const r = signUpMode ? await sb.auth.signUp({ email, password, options:{ emailRedirectTo: location.href.split("#")[0] } })
                       : await sb.auth.signInWithPassword({ email, password });
  $("#lSubmit").disabled = false;
  if (r.error) { $("#loginMsg").textContent = r.error.message; return; }
  if (signUpMode && !r.data.session) { $("#loginMsg").textContent = "Account created. Check your email to confirm it, then sign in."; $("#lToggle").click(); }
};
document.querySelectorAll("[data-signout]").forEach(b => b.onclick = () => sb.auth.signOut());
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === "PASSWORD_RECOVERY") { setTimeout(showRecovery, 0); return; }
  if (ev === "TOKEN_REFRESHED" || ev === "USER_UPDATED") return;
  setTimeout(() => boot(session), 0);
});
function showRecovery() {
  $("#loginView").hidden = false; $("#appView").hidden = true;
  $("#loginMsg").textContent = "Enter a new password below and click Save password.";
  $("#lSubmit").textContent = "Save password";
  $("#loginForm").onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $("#lPass").value }); $("#loginMsg").textContent = error ? error.message : "Password saved. Reloading…"; if (!error) setTimeout(() => location.reload(), 900); };
}

async function boot(session) {
  if (!session) { me = null; $("#loginView").hidden = false; $("#appView").hidden = true; $("#noAccess").hidden = true; return; }
  const { data, error } = await sb.rpc("gl_claim_staff");
  if (error || !data || !data.id || !data.active) { $("#loginView").hidden = true; $("#appView").hidden = true; $("#noAccess").hidden = false; return; }
  me = data; isAdmin = me.role === "admin";
  document.body.classList.toggle("is-admin", isAdmin);
  $("#loginView").hidden = true; $("#noAccess").hidden = true; $("#appView").hidden = false;
  $("#appTitle").textContent = isAdmin ? "Tech Dispatch Calendar" : "My Schedule";
  $("#whoami").textContent = `${C.business} · ${me.name} (${isAdmin ? "Admin" : "Technician"})`; $("#whoami2").textContent = me.name + (isAdmin ? " · Admin" : " · Technician");
  await loadAll(); subscribe(); startPresence();
}

/* ---------- data ---------- */
async function loadAll() {
  const [s, c, j, i] = await Promise.all([
    sb.from("gl_staff").select("*").order("created_at"),
    sb.from("gl_customers").select("*").order("name"),
    sb.from("gl_jobs").select("*").order("date"),
    sb.from("gl_invoice_items").select("*").order("created_at")
  ]);
  const err = s.error || c.error || j.error || i.error; if (err) toast("Couldn't load data: " + err.message);
  staff = s.data || []; customers = c.data || []; jobs = j.data || []; items = i.data || [];
  fillSelects(); render();
  if (isAdmin) loadRecentMsgs();
}
let chan = null, reloadT = null;
function subscribe() {
  if (chan) return;
  chan = sb.channel("gl-live");
  ["gl_jobs","gl_invoice_items","gl_customers","gl_staff"].forEach(t => chan.on("postgres_changes", {event:"*", schema:"public", table:t}, () => { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 400); }));
  chan.subscribe();
}

/* ---------- controls ---------- */
$("#fSvc").innerHTML = C.services.map(s => `<option>${esc(s)}</option>`).join("");
function fillSelects() {
  const at = techs().filter(t => t.role === "tech" || t.role === "admin");
  $("#techSel").innerHTML = `<option value="all">All technicians</option>` + at.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  if (focusTech !== "all" && !at.find(t => t.id === focusTech)) focusTech = "all";
  $("#techSel").value = focusTech;
  $("#fTech").innerHTML = `<option value="">Unassigned</option>` + at.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  $("#dTech").innerHTML = `<option value="all">All techs (separate section per tech)</option>` + staff.map(t => `<option value="${t.id}">${esc(t.name)}${t.active?"":" (inactive)"}</option>`).join("");
  $("#custList").innerHTML = customers.map(c => `<option value="${esc(c.name)}">${esc(c.address)}</option>`).join("");
  $("#payF").value = payF;
}
function chips() {
  $("#chips").innerHTML = techs().map(t => {
    const on = focusTech === "all" ? !hidden.has(t.id) : focusTech === t.id;
    return `<button class="chip" data-t="${t.id}" aria-pressed="${on}" style="--c:${esc(t.color)}"><span class="dot"></span>${esc(t.name)}</button>`;
  }).join("");
}
$("#chips").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; const id = b.dataset.t;
  if (focusTech !== "all") { focusTech = id; $("#techSel").value = id; } else hidden.has(id) ? hidden.delete(id) : hidden.add(id); render(); };
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { techTab = b.dataset.tab; render(); });
document.querySelectorAll("[data-atab]").forEach(b => b.onclick = () => { adminTab = b.dataset.atab; render(); });

function visibleJobs() {
  const q = custQ.trim().toLowerCase();
  return jobs.filter(j => {
    if (isAdmin) { if (focusTech !== "all" ? j.tech_id !== focusTech : hidden.has(j.tech_id)) return false; }
    else if (j.tech_id !== me.id) return false;
    if (payF !== "all" && j.pay_status !== payF) return false;
    if (q) { const c = cust(j.customer_id); if (!(c.name+" "+c.address).toLowerCase().includes(q)) return false; }
    return true;
  });
}
function columnsTechs() {
  if (!isAdmin) return [me];
  if (focusTech !== "all") return [tech(focusTech)];
  return techs().filter(t => !hidden.has(t.id));
}

/* ---------- render ---------- */
const jobLabel = j => `${cust(j.customer_id).name.replace(" (example)","")} – ${j.svc}`;
const pmark = j => `<span class="pm ${j.pay_status}" title="${j.pay_status}">${PM[j.pay_status]||""}</span>`;
const acceptMark = j => j.accept_status === "Pending" ? "⏳ " : j.accept_status === "Declined" ? "✕ " : "";

function render() {
  savePrefs();
  document.querySelectorAll(".seg [data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === view));
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === techTab));
  const showMsg = !isAdmin && techTab === "msg";
  $("#techMsgView").hidden = !showMsg;
  if (showMsg) { $("#listView").hidden = true; $("#calWrap").hidden = true; $("#summary").hidden = true; renderTechChat(); return; }
  const showList = !isAdmin && techTab === "list", showDash = isAdmin && adminTab === "dash";
  document.querySelectorAll("[data-atab]").forEach(b => b.setAttribute("aria-pressed", b.dataset.atab === adminTab));
  $("#listView").hidden = !showList; $("#dashView").hidden = !showDash; $("#calWrap").hidden = showList || showDash;
  $("#summary").hidden = false;
  if (showDash) return renderDash();
  if (isAdmin) chips();
  if (!isAdmin) { const p = jobs.filter(j => j.tech_id === me.id && j.accept_status === "Pending").length; $("#pendingNote").textContent = p ? `${p} job${p>1?"s":""} waiting for you to accept` : ""; }
  if (showList) return renderList();
  const list = visibleJobs(), today = iso(new Date()), v = $("#view");
  if (view === "month") {
    const m = cur.getMonth(), first = new Date(cur.getFullYear(), m, 1), s = sow(first);
    $("#range").textContent = first.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    let h = `<div class="month">` + ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="dow">${d}</div>`).join("");
    for (let i=0; i<42; i++) {
      const d = addDays(s,i), k = iso(d);
      const ev = list.filter(j => j.date === k).sort((a,b) => a.start_time.localeCompare(b.start_time));
      const rev = ev.filter(j => j.status !== "Canceled").reduce((a,j) => a + price(j), 0);
      h += `<div class="cell${d.getMonth()!==m?" out":""}${k===today?" today":""}" data-d="${k}"><div class="ctop"><span class="dnum">${d.getDate()}</span>${ev.length ? `<span>${ev.length} · ${money(rev).replace(".00","")}</span>` : ""}</div>` +
        ev.slice(0,3).map(j => `<div class="ev${j.status==="Canceled"?" cx":""}" data-id="${j.id}" style="--c:${esc(tech(j.tech_id).color)}" title="${esc(tech(j.tech_id).name+" · "+jobLabel(j))}">${pmark(j)}<b>${fmtT(j.start_time)}</b> ${acceptMark(j)}${esc(jobLabel(j))}</div>`).join("") +
        (ev.length > 3 ? `<span class="more">+${ev.length-3} more</span>` : "") + `</div>`;
    }
    v.innerHTML = h + `</div>`;
    summary(list.filter(j => parse(j.date).getMonth() === m && parse(j.date).getFullYear() === cur.getFullYear()), "This month");
  } else {
    let cols;
    if (view === "week") {
      const s = sow(cur), e = addDays(s,6);
      cols = [...Array(7)].map((_,i) => { const d = addDays(s,i), k = iso(d); return {date:k, label:d.toLocaleDateString(undefined,{weekday:"short"}), big:d.getDate(), f:j => j.date === k}; });
      $("#range").textContent = `${s.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${e.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
      summary(list.filter(j => j.date >= iso(s) && j.date <= iso(e)), "This week");
    } else {
      const k = iso(cur);
      $("#range").textContent = cur.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
      cols = columnsTechs().map(t => ({date:k, tech:t.id, color:t.color, label:"", big:t.name, f:j => j.date === k && j.tech_id === t.id}));
      if (!cols.length) cols = [{date:k, label:"", big:"No technicians selected", f:() => false}];
      summary(list.filter(j => j.date === k), "Today");
    }
    let h = `<div class="tg" style="grid-template-columns:52px repeat(${cols.length},minmax(${view==="day"?130:88}px,1fr))"><div class="head"></div>`;
    h += cols.map(c => `<div class="head${c.date===today&&view==="week"?" today":""}">${c.label}<span class="big"${c.color?` style="color:${esc(c.color)}"`:""}>${esc(c.big)}</span></div>`).join("");
    h += `<div class="hours">` + [...Array(END_H-START_H)].map((_,i) => `<div class="hr">${i?fmtT(`${START_H+i}:00`):""}</div>`).join("") + `</div>`;
    h += cols.map(c => `<div class="col${c.date===today&&view==="week"?" today":""}" data-d="${c.date}"${c.tech?` data-t="${c.tech}"`:""} style="height:${(END_H-START_H)*HR}px">` +
      list.filter(c.f).map(j => {
        const [hh,mm] = j.start_time.split(":").map(Number), top = Math.max(0,(hh+mm/60-START_H)*HR), ht = Math.max(22, j.dur*HR-2);
        return `<div class="blk${j.status==="Canceled"?" cx":""}" data-id="${j.id}" style="--c:${esc(tech(j.tech_id).color)};top:${top}px;height:${ht}px"><div class="t">${pmark(j)}${fmtT(j.start_time)}–${fmtT(endT(j))}${view==="week"&&isAdmin?" · "+esc(tech(j.tech_id).name):""}</div><div class="n">${acceptMark(j)}${esc(jobLabel(j))}</div>${ht>60?`<div class="t">${esc(cust(j.customer_id).address)}</div><span class="pill">${esc(j.status)}</span>`:""}</div>`;
      }).join("") + `</div>`).join("");
    v.innerHTML = h + `</div>`;
  }
}
function renderList() {
  const today = iso(new Date());
  const mine = visibleJobs().filter(j => j.date >= iso(addDays(new Date(), -7)) && j.status !== "Canceled").sort((a,b) => (a.date+a.start_time).localeCompare(b.date+b.start_time));
  const up = mine.filter(j => j.date >= today), past = mine.filter(j => j.date < today).reverse();
  const card = j => { const c = cust(j.customer_id);
    return `<div class="jcard" data-id="${j.id}" style="--c:${esc(me.color)}"><div class="top"><span class="n"><b>${esc(j.svc)}</b> · ${esc(c.name)}</span><span><span class="tag ${j.accept_status}">${j.accept_status}</span> <span class="pill">${esc(j.status)}</span></span></div>
      <div class="when">${longDate(j.date)} · ${fmtT(j.start_time)}–${fmtT(endT(j))}</div><div class="addr">📍 ${esc(c.address)}</div><div class="when">${pmark(j)} ${j.pay_status} · ${money(price(j))}</div></div>`; };
  let h = "", last = "";
  up.forEach(j => { if (j.date !== last) { h += `<div class="daylbl">${j.date === today ? "Today · " : ""}${longDate(j.date)}</div>`; last = j.date; } h += card(j); });
  if (!up.length) h += `<p class="note">No upcoming jobs assigned to you.</p>`;
  if (past.length) h += `<div class="daylbl">Last 7 days</div>` + past.map(card).join("");
  $("#listView").innerHTML = h;
  summary(up, "Upcoming");
}
$("#listView").onclick = e => { const c = e.target.closest("[data-id]"); if (c) openDetail(c.dataset.id); };
function totals(list) {
  const live = list.filter(j => j.status !== "Canceled");
  return {n:list.length, done:list.filter(j => j.status === "Completed").length, billed:live.reduce((a,j) => a+price(j),0), paid:live.reduce((a,j) => a+(+j.amount_paid||0),0), due:live.reduce((a,j) => a+balance(j),0)};
}
function summary(list, lbl) { const t = totals(list);
  $("#summary").innerHTML = `<span>${lbl}:</span><span>Jobs <b>${t.n}</b></span><span>Completed <b>${t.done}</b></span><span>Billed <b>${money(t.billed)}</b></span><span>Paid <b>${money(t.paid)}</b></span><span>Balance due <b>${money(t.due)}</b></span>`; }


/* ---------- admin dashboard ---------- */
let recentMsgs = [];
async function loadRecentMsgs() {
  const { data } = await sb.from("gl_messages").select("*").order("created_at", {ascending:false}).limit(8);
  recentMsgs = data || []; if (isAdmin && adminTab === "dash") renderDash();
}
function presence(st) {
  if (!st) return {cls:"off", label:"Never signed in", color:"var(--gray)"};
  const mins = (Date.now() - new Date(st.last_seen)) / 60000;
  if (mins < 2) return {cls:"on", label:"Online", color:"var(--ok)"};
  if (mins < 15) return {cls:"away", label:"Away", color:"var(--warn)"};
  return {cls:"off", label:"Offline", color:"var(--gray)"};
}
const ago = t => { if (!t) return "never"; const m = Math.round((Date.now() - new Date(t)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m/60)} hr ago` : new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric"}); };
const initials = n => n.replace(/\(.*?\)/g,"").trim().split(/\s+/).map(w => w[0]).join("").slice(0,2).toUpperCase();
function renderDash() {
  const today = iso(new Date());
  const live = jobs.filter(j => j.status !== "Canceled");
  const tj = live.filter(j => j.date === today), T = totals(tj);
  const pending = live.filter(j => j.accept_status === "Pending" && j.date >= today && j.tech_id);
  const declined = live.filter(j => j.accept_status === "Declined" && j.date >= today);
  const unassigned = live.filter(j => !j.tech_id && j.date >= today);
  const unpaid = live.filter(j => j.date < today && j.status === "Completed" && balance(j) > 0);
  const due = unpaid.reduce((a,j) => a + balance(j), 0);
  const team = techs().filter(t => t.id !== me.id);
  const online = team.filter(t => presence(statusOf(t.id)).cls === "on").length;
  const kpi = (l,v,d,cls="") => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v">${v}</span>${d?`<span class="d">${d}</span>`:""}</div>`;

  let h = `<div class="kpis">
    ${kpi("Team online", `${online}/${team.length}`, `${team.filter(t => statusOf(t.id)?.sharing_location).length} sharing location`, online ? "" : "warn")}
    ${kpi("Jobs today", T.n, `${T.done} done · ${tj.filter(j=>j.status==="In progress").length} in progress`)}
    ${kpi("Awaiting acceptance", pending.length, "upcoming jobs", pending.length ? "warn" : "")}
    ${kpi("Unpaid", money(due), `${unpaid.length} completed jobs`, due > 0 ? "bad" : "")}
  </div>
  <div class="teamgrid">
    <div class="panel"><h3>Team <small>live status</small></h3><div class="team">` +
    (team.map(t => { const st = statusOf(t.id), p = presence(st), unread = unreadFrom(t.id), jt = tj.filter(j => j.tech_id === t.id);
      const cur = jt.find(j => j.status === "In progress");
      return `<div class="mate"><span class="av" style="--c:${esc(t.color)};--s:${p.color}">${esc(initials(t.name))}</span>
        <div><div class="nm">${esc(t.name)} <span class="st ${p.cls}">${p.label}</span>${unread ? `<span class="badge">${unread}</span>` : ""}</div>
        <div class="meta">${p.cls === "on" ? "Active now" : "Last seen " + ago(st?.last_seen)} · ${jt.length} job${jt.length===1?"":"s"} today${cur ? ` · On job: ${esc(cust(cur.customer_id).name)}` : ""}</div>
        <div class="meta">${st?.sharing_location && st.lat ? `📍 Location ${ago(st.loc_at)}` : "📍 Location not shared"}</div></div>
        <div class="btnrow"><button class="btn sm primary" data-chat="${t.id}">Message</button>${st?.sharing_location && st.lat ? `<button class="btn sm" data-locate="${t.id}">Locate</button>` : ""}</div></div>`; }).join("") || `<p class="note">No technicians yet. Add them in Manage technicians.</p>`) +
    `</div></div>
    <div class="panel"><h3>Technician locations <small>${team.filter(t => statusOf(t.id)?.sharing_location && statusOf(t.id)?.lat).length} on map</small></h3><div id="map"></div>
      <p class="note">Technicians appear here while they have the portal open with “Share my location” turned on.</p></div>
  </div>
  <div class="panel"><h3>Needs attention <small>${declined.length+unassigned.length+pending.length+unpaid.length} items</small></h3><div class="alist">` +
    ([...declined.map(j => alertRow(j, "<b style='color:var(--bad)'>Declined</b>")), ...unassigned.map(j => alertRow(j, "<b style='color:var(--bad)'>Unassigned</b>")),
      ...pending.slice(0,6).map(j => alertRow(j, `<b style='color:var(--warn)'>Not accepted</b> (${esc(tech(j.tech_id).name)})`)),
      ...unpaid.slice(0,6).map(j => alertRow(j, `<b style='color:var(--bad)'>Unpaid ${money(balance(j))}</b>`))].join("") || `<p class="note">All clear. Nothing needs attention.</p>`) +
  `</div></div>`;
  $("#dashView").innerHTML = h;
  $("#summary").hidden = true;
  drawMap(team);
}
function alertRow(j, label) { const c = cust(j.customer_id);
  return `<button data-open="${j.id}"><span class="dot" style="--c:${esc(tech(j.tech_id).color)}"></span><span>${label} · ${esc(c.name)} – ${esc(j.svc)}</span><span class="when">${longDate(j.date)}</span></button>`; }
let map = null, markers = {};
function drawMap(team) {
  const el = $("#map"); if (!el || !window.L) return;
  if (map) { map.remove(); map = null; markers = {}; }
  map = L.map(el, {scrollWheelZoom:false}).setView([29.4241, -98.4936], 10); // San Antonio
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"&copy; OpenStreetMap"}).addTo(map);
  const pts = [];
  team.forEach(t => { const st = statusOf(t.id); if (!st?.sharing_location || st.lat == null) return;
    const icon = L.divIcon({className:"", html:`<span class="maptag" style="--c:${esc(t.color)}">${esc(t.name.replace(/\(.*?\)/g,"").trim())}</span>`, iconAnchor:[10,10]});
    markers[t.id] = L.marker([st.lat, st.lng], {icon}).addTo(map).bindPopup(`<b>${esc(t.name)}</b><br>Updated ${ago(st.loc_at)}<br><a href="https://www.google.com/maps?q=${st.lat},${st.lng}" target="_blank" rel="noopener">Open in Google Maps</a>`);
    pts.push([st.lat, st.lng]); });
  if (pts.length === 1) map.setView(pts[0], 13); else if (pts.length > 1) map.fitBounds(pts, {padding:[30,30]});
}
$("#dashView").onclick = e => {
  const b = e.target.closest("[data-open]"); if (b) return openDetail(b.dataset.open);
  const c = e.target.closest("[data-chat]"); if (c) return openChat(c.dataset.chat);
  const l = e.target.closest("[data-locate]"); if (l && markers[l.dataset.locate]) { map.setView(markers[l.dataset.locate].getLatLng(), 15); markers[l.dataset.locate].openPopup(); $("#map").scrollIntoView({behavior:"smooth", block:"center"}); }
};

/* ---------- navigation ---------- */
document.querySelectorAll(".seg [data-v]").forEach(b => b.onclick = () => { view = b.dataset.v; render(); });
$("#techSel").onchange = e => { focusTech = e.target.value; render(); };
$("#payF").onchange = e => { payF = e.target.value; render(); };
$("#custQ").oninput = e => { custQ = e.target.value; render(); };
const step = dir => { if (view === "month") cur = new Date(cur.getFullYear(), cur.getMonth()+dir, 1); else cur = addDays(cur, dir*(view==="week"?7:1)); render(); };
$("#prev").onclick = () => step(-1); $("#next").onclick = () => step(1);
$("#todayBtn").onclick = () => { cur = new Date(); render(); };
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
$("#view").onclick = e => {
  const ev = e.target.closest("[data-id]"); if (ev) return openDetail(ev.dataset.id);
  if (!isAdmin) return;
  const cell = e.target.closest("[data-d]"); if (!cell) return;
  let start = "09:00";
  if (cell.classList.contains("col")) { const y = e.clientY - cell.getBoundingClientRect().top; const m = Math.min((END_H-1)*60, Math.round((START_H*60 + y/HR*60)/30)*30); start = `${pad(Math.floor(m/60))}:${pad(m%60)}`; }
  openJob(null, cell.dataset.d, start, cell.dataset.t);
};

/* ---------- admin: create / edit job ---------- */
const jobDlg = $("#jobDlg"); let editing = null;
const F = id => $("#"+id);
function openJob(j, date, start, t) {
  editing = j; F("jobTitle").textContent = j ? "Edit job" : "New job";
  F("delBtn").hidden = !j; F("delConfirm").hidden = true; F("fPriceL").hidden = !!j; showErr(F("jobErr"));
  const c = j ? cust(j.customer_id) : {};
  F("fCust").value = c.name||""; F("fAddr").value = c.address||""; F("fPhone").value = c.phone||""; F("fEmail").value = c.email||"";
  F("fSvc").value = j?.svc || C.services[0]; F("fNotes").value = j?.notes || "";
  F("fTech").value = j?.tech_id || t || (focusTech !== "all" ? focusTech : (techs().find(x => x.role === "tech")?.id || ""));
  F("fStatus").value = j?.status || "Scheduled"; F("fDate").value = j?.date || date || iso(cur);
  F("fStart").value = j?.start_time || start || "09:00"; F("fDur").value = j?.dur || 1.5; F("fPrice").value = "";
  jobDlg.showModal(); F("fCust").focus();
}
F("fCust").oninput = e => { const c = customers.find(x => x.name === e.target.value); if (c) { F("fAddr").value = c.address; F("fPhone").value = c.phone||""; F("fEmail").value = c.email||""; } };
$("#jobForm").onsubmit = async e => {
  e.preventDefault(); showErr(F("jobErr"));
  const name = F("fCust").value.trim(), addr = F("fAddr").value.trim();
  let c = customers.find(x => x.name.toLowerCase() === name.toLowerCase() && x.address.toLowerCase() === addr.toLowerCase());
  const cdata = {name, address:addr, phone:F("fPhone").value.trim(), email:F("fEmail").value.trim()};
  const cr = c ? await sb.from("gl_customers").update(cdata).eq("id", c.id).select().single() : await sb.from("gl_customers").insert(cdata).select().single();
  if (cr.error) return showErr(F("jobErr"), cr.error);
  const prevTech = editing?.tech_id;
  const data = {customer_id:cr.data.id, svc:F("fSvc").value, notes:F("fNotes").value.trim(), tech_id:F("fTech").value || null, status:F("fStatus").value,
    date:F("fDate").value, start_time:F("fStart").value, dur:Math.max(.25, +F("fDur").value||1)};
  if (editing && prevTech !== data.tech_id) data.accept_status = "Pending";
  const jr = editing ? await sb.from("gl_jobs").update(data).eq("id", editing.id).select().single() : await sb.from("gl_jobs").insert(data).select().single();
  if (jr.error) return showErr(F("jobErr"), jr.error);
  if (!editing && F("fPrice").value !== "") await sb.from("gl_invoice_items").insert({job_id:jr.data.id, description:data.svc, qty:1, unit_price:+F("fPrice").value, added_by:me.id});
  jobDlg.close(); toast(editing ? "Job updated" : "Job created"); loadAll();
};
F("delBtn").onclick = () => F("delConfirm").hidden = false;
F("delNo").onclick = () => F("delConfirm").hidden = true;
F("delYes").onclick = async () => { const { error } = await sb.from("gl_jobs").delete().eq("id", editing.id); if (error) return showErr(F("jobErr"), error); jobDlg.close(); toast("Job deleted"); loadAll(); };
$("#addBtn").onclick = () => openJob(null);

/* ---------- job detail: accept, status, address, message, invoice ---------- */
const detDlg = $("#detDlg"); let detId = null;
async function openDetail(id) { detId = id; renderDetail(); if (!detDlg.open) detDlg.showModal(); loadMessages(id); }
function invoiceText(j) {
  const c = cust(j.customer_id), its = jobItems(j.id);
  return `${C.business} – Invoice\nCustomer: ${c.name}\nService address: ${c.address}\nDate of service: ${longDate(j.date)}\n\n` +
    its.map(i => `${i.description}  ${i.qty} x ${money(i.unit_price)} = ${money(i.qty*i.unit_price)}`).join("\n") +
    `\n\nTotal: ${money(price(j))}\nPaid: ${money(j.amount_paid)}\nBalance due: ${money(balance(j))}\n\nThank you for choosing ${C.business}!` + (C.businessPhone ? `\nQuestions? Call ${C.businessPhone}` : "");
}
function renderDetail() {
  const j = jobs.find(x => x.id === detId); if (!j) { detDlg.close(); return; }
  const c = cust(j.customer_id), t = tech(j.tech_id), its = jobItems(j.id), mine = j.tech_id === me.id;
  const canWork = isAdmin || mine;
  $("#detBody").innerHTML = `
    <div class="det-h"><div><h2>${esc(j.svc)} · ${esc(c.name)}</h2><p class="sub">${longDate(j.date)} · ${fmtT(j.start_time)}–${fmtT(endT(j))} · <span style="color:${esc(t.color)}">${esc(t.name)}</span></p></div>
      <div class="btnrow">${isAdmin ? `<button class="btn" id="dEdit">Edit job</button>` : ""}<button class="btn" data-close>Close</button></div></div>

    <fieldset><legend>Job</legend>
      <div class="btnrow"><span class="tag ${j.accept_status}">${j.accept_status}</span> <span class="pill">${esc(j.status)}</span></div>
      ${canWork && j.accept_status !== "Accepted" ? `<div class="btnrow"><button class="btn primary" data-acc="Accepted">Accept job</button><button class="btn danger" data-acc="Declined">Decline</button></div>` : ""}
      ${j.accept_status === "Declined" && j.decline_reason ? `<p class="note">Decline reason: ${esc(j.decline_reason)}</p>` : ""}
      ${canWork && j.accept_status === "Accepted" ? `<div class="btnrow">${["In progress","Completed"].map(s => `<button class="btn${j.status===s?" primary":""}" data-st="${s}">${s === "In progress" ? "Start job" : "Mark completed"}</button>`).join("")}</div>` : ""}
      <label>Job notes<input id="dNotes" value="${esc(j.notes)}" ${canWork?"":"disabled"}></label>
    </fieldset>

    <fieldset><legend>Customer & location</legend>
      <dl class="kv"><dt>Name</dt><dd>${esc(c.name)}</dd>
        <dt>Address</dt><dd>${esc(c.address)} <a class="btn sm" href="${mapUrl(c.address)}" target="_blank" rel="noopener">Open in Maps</a></dd>
        <dt>Phone</dt><dd class="copyable">${esc(c.phone)||"–"}</dd><dt>Email</dt><dd class="copyable">${esc(c.email)||"–"}</dd></dl>
      <div class="btnrow">
        ${c.phone ? `<a class="btn sm" href="tel:${telDigits(c.phone)}">Call</a>` : ""}
      </div>
    </fieldset>

    <fieldset><legend>Message customer</legend>
      <div class="msgbox">
        <div class="btnrow">
          <button class="btn sm" data-tpl="otw">On my way</button><button class="btn sm" data-tpl="arrived">Arrived</button><button class="btn sm" data-tpl="done">Job done</button><button class="btn sm" data-tpl="resched">Reschedule</button>
        </div>
        <textarea id="dMsg" placeholder="Type a message to ${esc(c.name)}…"></textarea>
        <div class="btnrow">
          <button class="btn primary" data-send="sms" ${c.phone?"":"disabled"}>Send text</button>
          <button class="btn" data-send="email" ${c.email?"":"disabled"}>Send email</button>
          <span class="note">Opens your phone's Messages/Email app with the text filled in.</span>
        </div>
        <div class="msglog" id="msgLog"></div>
      </div>
    </fieldset>

    <fieldset><legend>Invoice</legend>
      <div class="scroll"><table class="inv"><thead><tr><th>Service</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th><th></th></tr></thead>
        <tbody>${its.map(i => `<tr><td>${esc(i.description)}</td><td class="n">${i.qty}</td><td class="n">${money(i.unit_price)}</td><td class="n">${money(i.qty*i.unit_price)}</td><td>${canWork ? `<button class="btn sm" data-rmi="${i.id}" aria-label="Remove">✕</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="note">No services on this invoice yet.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="n">${money(price(j))}</td><td></td></tr><tr><td colspan="3">Paid</td><td class="n">${money(j.amount_paid)}</td><td></td></tr><tr><td colspan="3">Balance due</td><td class="n" style="color:${balance(j)>0?"var(--bad)":"var(--ok)"}">${money(balance(j))}</td><td></td></tr></tfoot></table></div>
      ${canWork ? `<form class="additem" id="addItem"><select id="iSvc">${C.services.map(s => `<option>${esc(s)}</option>`).join("")}<option value="__custom">Custom…</option></select><input id="iQty" type="number" min="0.25" step="0.25" value="1" aria-label="Quantity"><input id="iPrice" type="number" min="0" step="0.01" placeholder="Price" required aria-label="Price"><button class="btn" type="submit">+ Add service</button></form>
      <input id="iCustom" placeholder="Custom service description" hidden style="background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:7px 9px">` : ""}
      ${canWork ? `<div class="paygrid">
        <label>Payment status<select id="pStatus">${["Unpaid","Partial","Paid","Refunded"].map(s => `<option${j.pay_status===s?" selected":""}>${s}</option>`).join("")}</select></label>
        <label>Amount paid ($)<input id="pPaid" type="number" min="0" step="0.01" value="${+j.amount_paid||0}"></label>
        <label>Method<select id="pMethod">${["","Cash","Card","Check","Zelle","Venmo","Invoice","Other"].map(s => `<option${j.pay_method===s?" selected":""}>${s}</option>`).join("")}</select></label>
        <label>Payment date<input id="pDate" type="date" value="${j.pay_date||""}"></label>
        <label>Receipt / invoice #<input id="pRcpt" value="${esc(j.receipt)}"></label>
        <label>&nbsp;<button class="btn" id="pSave" type="button">Save payment</button></label>
      </div>` : ""}
      <div class="btnrow">
        <button class="btn primary" data-inv="sms" ${c.phone && its.length && j.status==="Completed"?"":"disabled"}>Text invoice</button>
        <button class="btn" data-inv="email" ${c.email && its.length && j.status==="Completed"?"":"disabled"}>Email invoice</button>
        <button class="btn" id="invCopy" ${its.length?"":"disabled"}>Copy invoice</button>
        <button class="btn" id="invPrint" ${its.length?"":"disabled"}>Print / PDF</button>
      </div>
      <p class="note">${j.status!=="Completed" ? "Invoices can be sent once the job is marked Completed." : (j.invoice_sent_at ? "Invoice last sent " + new Date(j.invoice_sent_at).toLocaleString() : "Invoice not sent yet.")}</p>
    </fieldset>`;
  wireDetail(j, c);
}
function wireDetail(j, c) {
  const body = $("#detBody");
  body.querySelectorAll("[data-close]").forEach(b => b.onclick = () => detDlg.close());
  const ed = $("#dEdit"); if (ed) ed.onclick = () => { detDlg.close(); openJob(j); };
  const upd = async (patch, msg) => { const { error } = await sb.from("gl_jobs").update(patch).eq("id", j.id); if (error) return toast(error.message); Object.assign(j, patch); toast(msg); renderDetail(); render(); };
  body.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => {
    const v = b.dataset.acc;
    if (v === "Declined") { const r = body.querySelector("#dNotes"); upd({accept_status:"Declined", decline_reason:r.value.trim()}, "Job declined – admin will see it"); }
    else upd({accept_status:"Accepted", status: j.status === "Pending approval" ? "Scheduled" : j.status}, "Job accepted");
  });
  body.querySelectorAll("[data-st]").forEach(b => b.onclick = () => upd({status:b.dataset.st}, "Status: " + b.dataset.st));
  const notes = $("#dNotes"); if (notes && !notes.disabled) notes.onchange = () => upd({notes:notes.value.trim()}, "Notes saved");
  const first = (c.name||"").replace(" (example)","").split(" ")[0];
  const tpl = { otw:`Hi ${first}, this is ${me.name} from ${C.business}. I'm on my way to ${c.address} and should arrive shortly.`,
    arrived:`Hi ${first}, ${me.name} from ${C.business} here – I've arrived at ${c.address} to start your ${j.svc}.`,
    done:`Hi ${first}, your ${j.svc} at ${c.address} is complete. Thank you for choosing ${C.business}!`,
    resched:`Hi ${first}, this is ${C.business}. We need to reschedule your ${j.svc} on ${longDate(j.date)}. What day works best for you?` };
  body.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => $("#dMsg").value = tpl[b.dataset.tpl]);
  const send = async (channel, text, isInvoice) => {
    if (!text.trim()) return toast("Type a message first");
    const href = channel === "sms" ? `sms:${telDigits(c.phone)}?&body=${encodeURIComponent(text)}` : `mailto:${c.email}?subject=${encodeURIComponent(isInvoice ? `${C.business} invoice – ${longDate(j.date)}` : C.business)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    await sb.from("gl_messages").insert({job_id:j.id, customer_id:c.id, sender_id:me.id, channel, body:text});
    if (isInvoice) { await sb.from("gl_jobs").update({invoice_sent_at:new Date().toISOString()}).eq("id", j.id); j.invoice_sent_at = new Date().toISOString(); renderDetail(); }
    loadMessages(j.id);
  };
  body.querySelectorAll("[data-send]").forEach(b => b.onclick = () => send(b.dataset.send, $("#dMsg").value, false));
  body.querySelectorAll("[data-inv]").forEach(b => b.onclick = () => { if (j.status !== "Completed") return toast("Invoices can be sent once the job is Completed"); send(b.dataset.inv, invoiceText(j), true); });
  const cp = $("#invCopy"); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(invoiceText(j)); toast("Invoice copied"); } catch(e) { toast("Copy blocked – use Print instead"); } };
  const pr = $("#invPrint"); if (pr) pr.onclick = () => printInvoice(j);
  const sel = $("#iSvc"); if (sel) sel.onchange = () => $("#iCustom").hidden = sel.value !== "__custom";
  const ai = $("#addItem"); if (ai) ai.onsubmit = async e => {
    e.preventDefault();
    const desc = sel.value === "__custom" ? $("#iCustom").value.trim() : sel.value; if (!desc) return toast("Enter a service description");
    const { error } = await sb.from("gl_invoice_items").insert({job_id:j.id, description:desc, qty:+$("#iQty").value||1, unit_price:+$("#iPrice").value||0, added_by:me.id});
    if (error) return toast(error.message); toast("Service added to invoice"); await loadAll(); renderDetail();
  };
  body.querySelectorAll("[data-rmi]").forEach(b => b.onclick = async () => { const { error } = await sb.from("gl_invoice_items").delete().eq("id", b.dataset.rmi); if (error) return toast(error.message); toast("Removed"); await loadAll(); renderDetail(); });
  const ps = $("#pStatus"); if (ps) ps.onchange = () => { if (ps.value === "Paid") { $("#pPaid").value = price(j).toFixed(2); if (!$("#pDate").value) $("#pDate").value = iso(new Date()); } if (ps.value === "Unpaid") $("#pPaid").value = 0; };
  const sv = $("#pSave"); if (sv) sv.onclick = () => upd({pay_status:$("#pStatus").value, amount_paid:+$("#pPaid").value||0, pay_method:$("#pMethod").value, pay_date:$("#pDate").value||null, receipt:$("#pRcpt").value.trim()}, "Payment saved");
}
async function loadMessages(id) {
  const { data } = await sb.from("gl_messages").select("*").eq("job_id", id).order("created_at", {ascending:false}).limit(20);
  const el = $("#msgLog"); if (!el) return;
  el.innerHTML = (data||[]).map(m => `<div>${new Date(m.created_at).toLocaleString()} · ${m.channel.toUpperCase()} by ${esc(tech(m.sender_id).name)}: ${esc(m.body.split("\n")[0])}${m.body.includes("\n")?"…":""}</div>`).join("") || `<div>No messages sent yet.</div>`;
}
function printInvoice(j) {
  const c = cust(j.customer_id), its = jobItems(j.id);
  $("#printArea").innerHTML = `<h1>${esc(C.business)} – Invoice</h1><p>Invoice # ${esc(j.receipt || j.id.slice(0,8).toUpperCase())}<br>Date of service: ${longDate(j.date)}<br>Technician: ${esc(tech(j.tech_id).name)}</p>
    <p><b>Bill to:</b> ${esc(c.name)}<br>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}</p>
    <table><tr><th>Service</th><th>Qty</th><th>Price</th><th>Amount</th></tr>${its.map(i => `<tr><td>${esc(i.description)}</td><td>${i.qty}</td><td>${money(i.unit_price)}</td><td>${money(i.qty*i.unit_price)}</td></tr>`).join("")}
    <tr><td colspan="3"><b>Total</b></td><td><b>${money(price(j))}</b></td></tr><tr><td colspan="3">Paid</td><td>${money(j.amount_paid)}</td></tr><tr><td colspan="3"><b>Balance due</b></td><td><b>${money(balance(j))}</b></td></tr></table><p>Thank you for your business!</p>`;
  window.print();
}

/* ---------- admin: technicians ---------- */
const techDlg = $("#techDlg"); let tEdit = null, tColor = null;
function techTable() {
  const m = cur.getMonth(), y = cur.getFullYear();
  $("#techTbl").innerHTML = `<tr><th></th><th>Name</th><th>Login email</th><th>Phone</th><th>Role</th><th>Login</th><th>Status</th><th>Jobs this month</th><th></th></tr>` +
    staff.map(t => { const n = jobs.filter(j => j.tech_id === t.id && parse(j.date).getMonth() === m && parse(j.date).getFullYear() === y).length;
      return `<tr class="${t.active?"":"inactive"}"><td><span class="dot" style="--c:${esc(t.color)}"></span></td><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.phone)}</td><td>${t.role === "admin" ? "Admin" : "Tech"}</td><td>${t.user_id ? "Account created" : "Not signed up yet"}</td><td>${t.active?"Active":"Inactive"}</td><td>${n}</td>
      <td>${t.id === me.id ? "You" : `<button class="btn sm" data-edit="${t.id}">Edit</button> <button class="btn sm" data-act="${t.id}">${t.active?"Deactivate":"Reactivate"}</button>`}</td></tr>`; }).join("");
}
function swatches() {
  const used = new Set(staff.filter(t => t !== tEdit && t.active).map(t => t.color));
  if (!tColor || used.has(tColor)) tColor = PALETTE.find(c => !used.has(c)) || PALETTE[0];
  $("#tColors").innerHTML = PALETTE.map(c => `<button type="button" class="sw" role="radio" aria-label="${c}" aria-checked="${c===tColor}" style="--c:${c}" data-c="${c}" ${used.has(c)?"disabled":""}></button>`).join("");
}
$("#tColors").onclick = e => { const b = e.target.closest(".sw"); if (!b || b.disabled) return; tColor = b.dataset.c; swatches(); };
function resetTechForm() { tEdit = null; tColor = null; $("#techForm").reset(); $("#tEmail").disabled = false; $("#techFormTitle").textContent = "+ Add technician"; $("#tSave").textContent = "Add technician"; $("#deactBox").hidden = true; showErr($("#techErr")); swatches(); }
$("#tReset").onclick = resetTechForm;
$("#techBtn").onclick = () => { resetTechForm(); techTable(); techDlg.showModal(); };
$("#techTbl").onclick = async e => {
  const ed = e.target.closest("[data-edit]"), ac = e.target.closest("[data-act]");
  if (ed) { tEdit = tech(ed.dataset.edit); tColor = tEdit.color; $("#tName").value = tEdit.name; $("#tEmail").value = tEdit.email; $("#tEmail").disabled = !!tEdit.user_id; $("#tPhone").value = tEdit.phone; $("#tRole").value = tEdit.role;
    $("#techFormTitle").textContent = "Edit " + tEdit.name; $("#tSave").textContent = "Save changes"; swatches(); $("#tName").focus(); }
  if (ac) {
    const t = tech(ac.dataset.act);
    if (!t.active) { await sb.from("gl_staff").update({active:true}).eq("id", t.id); await loadAll(); techTable(); return; }
    const up = jobs.filter(j => j.tech_id === t.id && j.date >= iso(new Date()) && !["Completed","Canceled"].includes(j.status));
    const others = techs().filter(x => x.id !== t.id);
    const box = $("#deactBox"); box.hidden = false;
    box.innerHTML = up.length
      ? `Deactivate ${esc(t.name)}? They have ${up.length} upcoming jobs. Reassign them to: <select id="reTo">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select> <button type="button" class="btn danger" id="deYes">Reassign & deactivate</button> <button type="button" class="btn" id="deNo">Cancel</button>`
      : `Deactivate ${esc(t.name)}? They will no longer be able to sign in; past jobs stay in reports. <button type="button" class="btn danger" id="deYes">Deactivate</button> <button type="button" class="btn" id="deNo">Cancel</button>`;
    $("#deNo").onclick = () => box.hidden = true;
    $("#deYes").onclick = async () => {
      if (up.length) { const to = $("#reTo").value; const { error } = await sb.from("gl_jobs").update({tech_id:to, accept_status:"Pending"}).in("id", up.map(j => j.id)); if (error) return showErr($("#techErr"), error); }
      const { error } = await sb.from("gl_staff").update({active:false}).eq("id", t.id); if (error) return showErr($("#techErr"), error);
      if (focusTech === t.id) focusTech = "all"; box.hidden = true; await loadAll(); techTable(); toast(t.name + " deactivated");
    };
  }
};
$("#techForm").onsubmit = async e => {
  e.preventDefault(); showErr($("#techErr"));
  const d = {name:$("#tName").value.trim(), email:$("#tEmail").value.trim().toLowerCase(), phone:$("#tPhone").value.trim(), role:$("#tRole").value, color:tColor};
  if (tEdit && tEdit.user_id) delete d.email;
  const r = tEdit ? await sb.from("gl_staff").update(d).eq("id", tEdit.id) : await sb.from("gl_staff").insert(d);
  if (r.error) return showErr($("#techErr"), r.error.code === "23505" ? "That email is already used by another technician." : r.error);
  toast(tEdit ? "Technician updated" : `${d.name} added – they can now create their login with ${d.email}`);
  resetTechForm(); await loadAll(); techTable();
};

/* ---------- admin: download ---------- */
const dlDlg = $("#dlDlg");
function dlRange() {
  const p = $("#dPeriod").value;
  if (p === "daily") { const d = $("#dDate").value; return [d,d]; }
  if (p === "weekly") { const s = sow(parse($("#dDate").value)); return [iso(s), iso(addDays(s,6))]; }
  if (p === "monthly") { const [y,m] = $("#dMonth").value.split("-").map(Number); return [iso(new Date(y,m-1,1)), iso(new Date(y,m,0))]; }
  return [$("#dStart").value, $("#dEnd").value];
}
function dlData() {
  const [s,e] = dlRange(), g = $("#dGroup").value, pay = $("#dPay").value, q = $("#dCust").value.trim().toLowerCase();
  let list = jobs.filter(j => s && e && j.date >= s && j.date <= e && (pay === "all" || j.pay_status === pay));
  if (g === "tech" && $("#dTech").value !== "all") list = list.filter(j => j.tech_id === $("#dTech").value);
  if (g === "cust" && q) list = list.filter(j => { const c = cust(j.customer_id); return (c.name+" "+c.address).toLowerCase().includes(q); });
  list.sort((a,b) => (a.date+a.start_time).localeCompare(b.date+b.start_time));
  let groups = [["All jobs", list]];
  if (g === "tech") groups = [...new Set(list.map(j => j.tech_id))].map(id => [tech(id).name, list.filter(j => j.tech_id === id)]);
  if (g === "cust") groups = [...new Set(list.map(j => j.customer_id))].map(id => [`${cust(id).name} – ${cust(id).address}`, list.filter(j => j.customer_id === id)]);
  return {s, e, g, list, groups};
}
function dlUI() {
  const p = $("#dPeriod").value, g = $("#dGroup").value;
  $("#dDateL").hidden = !(p === "daily" || p === "weekly"); $("#dMonthRow").hidden = p !== "monthly"; $("#dRangeRow").hidden = p !== "custom";
  $("#dTechL").hidden = g !== "tech"; $("#dCustL").hidden = g !== "cust";
  const t = totals(dlData().list);
  $("#dPreview").textContent = `${t.n} jobs · ${money(t.billed)} billed · ${money(t.paid)} paid · ${money(t.due)} due`;
}
const COLS = ["Date","Start","End","Duration (hrs)","Technician","Customer name","Service address","Customer phone","Service type","Invoice services","Service notes","Job status","Accepted","Price","Amount paid","Balance due","Payment status","Payment method","Payment date","Receipt/Invoice #","Invoice sent"];
const rowOf = j => { const c = cust(j.customer_id); return [j.date, fmtT(j.start_time), fmtT(endT(j)), j.dur, tech(j.tech_id).name, c.name, c.address, c.phone||"", j.svc,
  jobItems(j.id).map(i => `${i.description} x${i.qty} @ ${(+i.unit_price).toFixed(2)}`).join("; "), j.notes||"", j.status, j.accept_status,
  price(j).toFixed(2), (+j.amount_paid||0).toFixed(2), balance(j).toFixed(2), j.pay_status, j.pay_method||"", j.pay_date||"", j.receipt||"", j.invoice_sent_at ? j.invoice_sent_at.slice(0,10) : ""]; };
const totRow = (lbl,t) => { const r = Array(COLS.length).fill(""); r[0]=lbl; r[1]=`Jobs: ${t.n}`; r[2]=`Completed: ${t.done}`; r[13]=t.billed.toFixed(2); r[14]=t.paid.toFixed(2); r[15]=t.due.toFixed(2); return r; };
function fileName(ext) {
  const {s,e,g} = dlData(); let who = "all";
  if (g === "tech") who = $("#dTech").value === "all" ? "by-tech" : "tech-" + slug(tech($("#dTech").value).name);
  if (g === "cust") who = $("#dCust").value.trim() ? "customer-" + slug($("#dCust").value) : "by-customer";
  return `greenlight-jobs_${$("#dPeriod").value}_${s}_to_${e}_${who}.${ext}`;
}
function downloadCSV() {
  const {list, groups, g} = dlData();
  const q = v => { v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; };
  const rows = [COLS];
  groups.forEach(([n,js]) => { if (g !== "all") rows.push([`== ${n} ==`]); js.forEach(j => rows.push(rowOf(j))); if (g !== "all") { rows.push(totRow(`Subtotal – ${n}`, totals(js))); rows.push([]); } });
  rows.push(totRow("GRAND TOTAL", totals(list)));
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], {type:"text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName("csv"); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadPDF() {
  const {s,e,list,groups,g} = dlData();
  const table = js => `<table><tr>${COLS.map(c => `<th>${c}</th>`).join("")}</tr>${js.map(j => `<tr>${rowOf(j).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>`;
  const sum = x => `<p>Jobs ${x.n} · Completed ${x.done} · Billed ${money(x.billed)} · Paid ${money(x.paid)} · Balance due ${money(x.due)}</p>`;
  $("#printArea").innerHTML = `<h1>${esc(C.business)} – Job Report</h1><p>${s} to ${e}</p>` + groups.map(([n,js]) => (g !== "all" ? `<h2>${esc(n)}</h2>` : "") + table(js) + (g !== "all" ? sum(totals(js)) : "")).join("") + `<h2>Grand total</h2>` + sum(totals(list));
  const old = document.title; document.title = fileName("pdf").replace(".pdf",""); window.print(); document.title = old;
}
$("#dlBtn").onclick = () => { const d = iso(cur); $("#dDate").value = d; $("#dMonth").value = d.slice(0,7); $("#dStart").value = d; $("#dEnd").value = d;
  $("#dPeriod").value = view === "day" ? "daily" : view === "week" ? "weekly" : "monthly"; dlUI(); dlDlg.showModal(); };
$("#dUseView").onclick = () => { const d = iso(cur); $("#dDate").value = d; $("#dMonth").value = d.slice(0,7); $("#dPeriod").value = view === "day" ? "daily" : view === "week" ? "weekly" : "monthly";
  if (focusTech !== "all") { $("#dGroup").value = "tech"; $("#dTech").value = focusTech; } dlUI(); };
$("#dlForm").addEventListener("input", dlUI); $("#dlForm").addEventListener("change", dlUI);
$("#dlForm").onsubmit = e => { e.preventDefault(); const [s,en] = dlRange(); if (!s || !en) return; $("#dFmt").value === "csv" ? downloadCSV() : downloadPDF(); };

/* ---------- presence, location, team chat ---------- */
let statuses = [], chats = [], hbTimer = null, geoWatch = null, lastLocSent = 0;
const statusOf = id => statuses.find(s => s.staff_id === id);
const unreadFrom = id => chats.filter(c => c.from_staff === id && c.to_staff === me.id && !c.read_at).length;
async function loadStatus() { const { data } = await sb.from("gl_staff_status").select("*"); statuses = data || []; if (isAdmin && adminTab === "dash") renderDash(); }
async function loadChat() {
  const { data } = await sb.from("gl_chat").select("*").order("created_at").limit(1000); chats = data || [];
  const n = chats.filter(c => c.to_staff === me.id && !c.read_at).length;
  if (!isAdmin) { $("#techUnread").textContent = n; $("#techUnread").hidden = !n; if (techTab === "msg") renderTechChat(); }
  else if (adminTab === "dash" && !chatOpen) renderDash();
  if (chatOpen) renderChat();
}
async function heartbeat(extra = {}) {
  if (!me) return;
  await sb.from("gl_staff_status").upsert({staff_id:me.id, last_seen:new Date().toISOString(), ...extra}, {onConflict:"staff_id"});
}
function startPresence() {
  clearInterval(hbTimer); heartbeat(); hbTimer = setInterval(() => { heartbeat(); if (isAdmin) loadStatus(); }, 60000);
  loadStatus(); loadChat();
  const ch = sb.channel("gl-team");
  ch.on("postgres_changes", {event:"*", schema:"public", table:"gl_chat"}, loadChat)
    .on("postgres_changes", {event:"*", schema:"public", table:"gl_staff_status"}, () => { if (isAdmin) loadStatus(); }).subscribe();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat(); });
  if (!isAdmin) { let on = false; try { on = localStorage.getItem("gl-share-loc") === "1"; } catch(e) {} if (on) startLocation(); else locUI(false); }
}
function locUI(on, msg) {
  $("#locBar").classList.toggle("on", on);
  $("#locText").textContent = msg || (on ? "Sharing your location with the office while this portal is open." : "Location sharing is off. Turn it on so the office can see where you are while you work.");
  $("#locToggle").textContent = on ? "Stop sharing" : "Share my location";
}
function startLocation() {
  if (!navigator.geolocation) return locUI(false, "This device can't share location.");
  geoWatch = navigator.geolocation.watchPosition(p => {
    locUI(true);
    if (Date.now() - lastLocSent < 30000) return; lastLocSent = Date.now();
    heartbeat({sharing_location:true, lat:p.coords.latitude, lng:p.coords.longitude, accuracy:p.coords.accuracy, loc_at:new Date().toISOString()});
  }, err => { stopLocation(); locUI(false, err.code === 1 ? "Location permission was blocked. Allow location for this site in your browser settings, then try again." : "Couldn't get your location. Try again outdoors."); },
  {enableHighAccuracy:true, maximumAge:30000, timeout:20000});
  try { localStorage.setItem("gl-share-loc","1"); } catch(e) {}
}
function stopLocation() {
  if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch); geoWatch = null; lastLocSent = 0;
  heartbeat({sharing_location:false}); locUI(false);
  try { localStorage.setItem("gl-share-loc","0"); } catch(e) {}
}
$("#locToggle").onclick = () => geoWatch != null ? stopLocation() : startLocation();
window.addEventListener("pagehide", () => { if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch); });

let chatOpen = null; // staff id of the other person
function threadWith(id) { return chats.filter(c => (c.from_staff === me.id && c.to_staff === id) || (c.from_staff === id && c.to_staff === me.id)); }
function threadHTML(id) {
  const msgs = threadWith(id);
  return `<div class="chat"><div class="thread" id="thread">${msgs.map(m => `<div class="bub ${m.from_staff === me.id ? "me" : "them"}">${esc(m.body)}<small>${new Date(m.created_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}${m.from_staff === me.id && m.read_at ? " · Seen" : ""}</small></div>`).join("") || `<p class="note">No messages yet. Say hello.</p>`}</div>
    <form class="chatin" id="chatForm"><textarea id="chatText" placeholder="Write a message…" maxlength="2000" aria-label="Message"></textarea><button class="btn primary" type="submit">Send</button></form></div>`;
}
function wireThread(id) {
  const th = $("#thread"); if (th) th.scrollTop = th.scrollHeight;
  $("#chatForm").onsubmit = async e => { e.preventDefault(); const body = $("#chatText").value.trim(); if (!body) return;
    $("#chatText").value = ""; const { error } = await sb.from("gl_chat").insert({from_staff:me.id, to_staff:id, body}); if (error) { toast(error.message); $("#chatText").value = body; return; } loadChat(); };
  $("#chatText").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); } };
  const now = new Date().toISOString();
  const unread = chats.filter(c => c.from_staff === id && c.to_staff === me.id && !c.read_at);
  if (unread.length) { unread.forEach(c => c.read_at = now); sb.from("gl_chat").update({read_at:now}).in("id", unread.map(c => c.id)).then(() => {});
    if (!isAdmin) { $("#techUnread").hidden = true; } }
}
function openChat(id) { chatOpen = id; renderChat(); if (!$("#chatDlg").open) $("#chatDlg").showModal(); }
function renderChat() {
  const t = tech(chatOpen), p = presence(statusOf(chatOpen));
  $("#chatTitle").innerHTML = `${esc(t.name)} <span class="st ${p.cls}">${p.label}</span>`;
  const keep = $("#chatText")?.value || ""; $("#chatBody").innerHTML = threadHTML(chatOpen); $("#chatText").value = keep; wireThread(chatOpen);
}
$("#chatDlg").addEventListener("close", () => { chatOpen = null; if (isAdmin && adminTab === "dash") renderDash(); });
function renderTechChat() {
  const admins = techs().filter(s => s.role === "admin");
  if (!admins.length) { $("#techMsgView").innerHTML = `<p class="note">No office admin to message yet.</p>`; return; }
  let to = $("#techTo")?.value || admins[0].id;
  const keep = $("#chatText")?.value || "";
  $("#techMsgView").innerHTML = `<h3>Message the office ${admins.length > 1 ? `<select id="techTo">${admins.map(a => `<option value="${a.id}"${a.id===to?" selected":""}>${esc(a.name)}</option>`).join("")}</select>` : `<small>${esc(admins[0].name)}</small>`}</h3>` + threadHTML(to);
  $("#chatText").value = keep; wireThread(to);
  const sel = $("#techTo"); if (sel) sel.onchange = renderTechChat;
}
})();
