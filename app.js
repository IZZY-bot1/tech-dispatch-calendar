/* Tech Dispatch Calendar – Greenlight Lawn Care
   Single-page app; all data saved in localStorage (key "gl-dispatch-v2"). */
(() => {
const KEY = "gl-dispatch-v2", PKEY = KEY + "-prefs";
const START_H = 7, END_H = 19, HR = 52;
const PALETTE = ["#2f6fd6","#d0601f","#7a4cc2","#14866d","#b8328a","#c79a12","#3c8c2c","#d23a4c","#0f8fb0","#6b5a3e"];
const SERVICES = ["Mow & edge","Hedge trim","Sprinkler repair","Leaf cleanup","Fertilize","Aeration","Mulch install","Pressure wash","Other"];

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sow = d => addDays(d, -d.getDay());
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const money = n => "$" + (Number(n)||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtT = t => { let [h,m] = t.split(":").map(Number); const ap = h>=12?"p":"a"; h = h%12||12; return m?`${h}:${pad(m)}${ap}`:`${h}${ap}`; };
const endT = j => { const [h,m] = j.start.split(":").map(Number); const e = Math.round(h*60+m+j.dur*60); return `${pad(Math.floor(e/60))}:${pad(e%60)}`; };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PM = {Paid:"✓", Partial:"◐", Unpaid:"$", Refunded:"↺"};

/* ---------- state ---------- */
let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch(e) {}
if (!db || !Array.isArray(db.jobs)) db = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e) {} };
let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch(e) {}
let view = prefs.view || "month", focusTech = prefs.tech || "all", payF = prefs.pay || "all", role = "admin";
let cur = new Date(), custQ = "";
const hidden = new Set();
const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify({view, tech:focusTech, pay:payF})); } catch(e) {} };

const tech = id => db.techs.find(t => t.id === id) || {name:"(removed)", color:"#888"};
const cust = id => db.customers.find(c => c.id === id) || {name:"", address:""};
const activeTechs = () => db.techs.filter(t => t.active);
const balance = j => Math.max(0, (+j.price||0) - (+j.paid||0));

function seed() {
  const techs = ["Tech 1","Tech 2","Tech 3","Tech 4","Tech 5"].map((n,i) => ({id:"t"+(i+1), name:n, phone:"", email:"", color:PALETTE[i], active:true}));
  const people = ["Garcia","Johnson","Martinez","Nguyen","Williams","Hernandez","Brown","Lopez","Davis","Rodriguez","Miller","Flores","Wilson","Torres","Moore"];
  const streets = ["Bandera Rd","Culebra Rd","Blanco Rd","Wurzbach Rd","Bulverde Rd","Babcock Rd"];
  const customers = people.map((p,i) => ({id:"c"+(i+1), name:`${p} Residence (example)`, address:`${1200+i*83} ${streets[i%streets.length]}, San Antonio, TX`, phone:`(210) 555-${pad(10+i)}${pad(i*7%100)}`, email:"", sample:true}));
  const prices = {"Mow & edge":55,"Hedge trim":85,"Sprinkler repair":140,"Leaf cleanup":120,"Fertilize":75,"Aeration":150,"Mulch install":250,"Pressure wash":180,"Other":95};
  const jobs = []; const base = sow(new Date()); const today = iso(new Date()); let k = 0;
  for (let w=-2; w<4; w++) for (let d=1; d<=6; d++) techs.forEach((t,i) => {
    const n = ((w+3)*7 + d + i*3) % 3;
    for (let j=0; j<n; j++) {
      k++; const date = iso(addDays(base, w*7+d)); const svc = SERVICES[(k+i)%8]; const price = prices[svc];
      const past = date < today; let payS = "Unpaid", paid = 0;
      if (past) { if (k%7===0) payS="Unpaid"; else if (k%5===0) { payS="Partial"; paid=Math.round(price/2); } else { payS="Paid"; paid=price; } }
      jobs.push({id:"s"+k, cust:"c"+((k%15)+1), svc, notes:"", tech:t.id, date, start:`${pad(8+((i*2+j*3+d)%8))}:${j%2?"30":"00"}`, dur:[1,1.5,2,1][k%4],
        status: past ? "Completed" : (k%9===0 ? "Pending approval" : "Scheduled"), price, payS, paid,
        method: paid ? ["Cash","Card","Zelle","Check"][k%4] : "", payDate: paid ? date : "", rcpt: paid ? "GL-"+(1000+k) : "", sample:true});
    }
  });
  return {techs, customers, jobs};
}

/* ---------- filters ---------- */
function visibleJobs() {
  const q = custQ.trim().toLowerCase();
  return db.jobs.filter(j => {
    if (role !== "admin") { if (j.tech !== role) return false; }
    else if (focusTech !== "all") { if (j.tech !== focusTech) return false; }
    else if (hidden.has(j.tech)) return false;
    if (payF !== "all" && j.payS !== payF) return false;
    if (q) { const c = cust(j.cust); if (!(c.name+" "+c.address).toLowerCase().includes(q)) return false; }
    return true;
  });
}
function columnsTechs() {
  if (role !== "admin") return [tech(role)];
  if (focusTech !== "all") return [tech(focusTech)];
  return activeTechs().filter(t => !hidden.has(t.id));
}

/* ---------- top controls ---------- */
function fillSelects() {
  const at = activeTechs();
  $("#techSel").innerHTML = `<option value="all">All technicians</option>` + at.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  if (focusTech !== "all" && !at.find(t => t.id === focusTech)) focusTech = "all";
  $("#techSel").value = focusTech;
  $("#fTech").innerHTML = at.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  $("#dTech").innerHTML = `<option value="all">All techs (separate section per tech)</option>` + db.techs.map(t => `<option value="${t.id}">${esc(t.name)}${t.active?"":" (inactive)"}</option>`).join("");
  const r = $("#roleSel"), rv = r.value || "admin";
  r.innerHTML = `<option value="admin">Admin</option>` + at.map(t => `<option value="${t.id}">Tech: ${esc(t.name)}</option>`).join("");
  r.value = [...r.options].some(o => o.value === rv) ? rv : "admin";
  $("#custList").innerHTML = db.customers.map(c => `<option value="${esc(c.name)}">${esc(c.address)}</option>`).join("");
}
$("#fSvc").innerHTML = SERVICES.map(s => `<option>${s}</option>`).join("");

function chips() {
  const ts = role !== "admin" ? [tech(role)] : activeTechs();
  $("#chips").innerHTML = ts.map(t => {
    const on = role !== "admin" ? true : focusTech === "all" ? !hidden.has(t.id) : focusTech === t.id;
    return `<button class="chip" data-t="${t.id}" aria-pressed="${on}" style="--c:${t.color}"><span class="dot"></span>${esc(t.name)}</button>`;
  }).join("");
}
$("#chips").onclick = e => {
  const b = e.target.closest(".chip"); if (!b || role !== "admin") return;
  const id = b.dataset.t;
  if (focusTech !== "all") { focusTech = id; $("#techSel").value = id; }
  else hidden.has(id) ? hidden.delete(id) : hidden.add(id);
  render();
};

/* ---------- render ---------- */
function jobLabel(j) { const c = cust(j.cust); return `${c.name.replace(" (example)","")} – ${j.svc}`; }
function pmark(j) { return role === "admin" ? `<span class="pm ${j.payS}" title="${j.payS}">${PM[j.payS]||""}</span>` : ""; }

function render() {
  document.body.classList.toggle("tech", role !== "admin");
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === view));
  $("#techSel").disabled = role !== "admin";
  chips(); savePrefs();
  const list = visibleJobs(), today = iso(new Date()), v = $("#view");

  if (view === "month") {
    const m = cur.getMonth(), first = new Date(cur.getFullYear(), m, 1), s = sow(first);
    $("#range").textContent = first.toLocaleDateString(undefined, {month:"long", year:"numeric"});
    let h = `<div class="month">` + ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="dow">${d}</div>`).join("");
    for (let i=0; i<42; i++) {
      const d = addDays(s, i), k = iso(d);
      const ev = list.filter(j => j.date === k).sort((a,b) => a.start.localeCompare(b.start));
      const rev = ev.filter(j => j.status !== "Canceled").reduce((a,j) => a + (+j.price||0), 0);
      h += `<div class="cell${d.getMonth()!==m?" out":""}${k===today?" today":""}" data-d="${k}"><div class="ctop"><span class="dnum">${d.getDate()}</span>${ev.length && role==="admin" ? `<span>${ev.length} · ${money(rev).replace(".00","")}</span>` : ""}</div>` +
        ev.slice(0,3).map(j => `<div class="ev${j.status==="Canceled"?" cx":""}" data-id="${j.id}" style="--c:${tech(j.tech).color}" title="${esc(tech(j.tech).name+" · "+jobLabel(j)+" · "+j.payS)}">${pmark(j)}<b>${fmtT(j.start)}</b> ${esc(jobLabel(j))}</div>`).join("") +
        (ev.length > 3 ? `<span class="more">+${ev.length-3} more</span>` : "") + `</div>`;
    }
    v.innerHTML = h + `</div>`;
    summary(list.filter(j => parse(j.date).getMonth() === m && parse(j.date).getFullYear() === cur.getFullYear()), "This month");
  } else {
    let cols;
    if (view === "week") {
      const s = sow(cur), e = addDays(s, 6);
      cols = [...Array(7)].map((_,i) => { const d = addDays(s,i), k = iso(d); return {date:k, label:d.toLocaleDateString(undefined,{weekday:"short"}), big:d.getDate(), f:j => j.date === k}; });
      $("#range").textContent = `${s.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${e.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
      summary(list.filter(j => j.date >= iso(s) && j.date <= iso(e)), "This week");
    } else {
      const k = iso(cur);
      $("#range").textContent = cur.toLocaleDateString(undefined, {weekday:"long", month:"long", day:"numeric"});
      cols = columnsTechs().map(t => ({date:k, tech:t.id, color:t.color, label:"", big:t.name, f:j => j.date === k && j.tech === t.id}));
      if (!cols.length) cols = [{date:k, label:"", big:"No technicians selected", f:() => false}];
      summary(list.filter(j => j.date === k), "Today");
    }
    let h = `<div class="tg" style="grid-template-columns:52px repeat(${cols.length},minmax(${view==="day"?130:88}px,1fr))"><div class="head"></div>`;
    h += cols.map(c => `<div class="head${c.date===today&&view==="week"?" today":""}">${c.label}<span class="big"${c.color?` style="color:${c.color}"`:""}>${esc(c.big)}</span></div>`).join("");
    h += `<div class="hours">` + [...Array(END_H-START_H)].map((_,i) => `<div class="hr">${i?fmtT(`${START_H+i}:00`):""}</div>`).join("") + `</div>`;
    h += cols.map(c => `<div class="col${c.date===today&&view==="week"?" today":""}" data-d="${c.date}"${c.tech?` data-t="${c.tech}"`:""} style="height:${(END_H-START_H)*HR}px">` +
      list.filter(c.f).map(j => {
        const [hh,mm] = j.start.split(":").map(Number), top = Math.max(0,(hh+mm/60-START_H)*HR), ht = Math.max(22, j.dur*HR-2);
        return `<div class="blk${j.status==="Canceled"?" cx":""}" data-id="${j.id}" style="--c:${tech(j.tech).color};top:${top}px;height:${ht}px"><div class="t">${pmark(j)}${fmtT(j.start)}–${fmtT(endT(j))}${view==="week"?" · "+esc(tech(j.tech).name):""}</div><div class="n">${esc(jobLabel(j))}</div>${ht>60?`<div class="t">${esc(cust(j.cust).address)}</div><span class="pill">${esc(j.status)}</span>`:""}</div>`;
      }).join("") + `</div>`).join("");
    v.innerHTML = h + `</div>`;
  }
}
function totals(list) {
  const live = list.filter(j => j.status !== "Canceled");
  const billed = live.reduce((a,j) => a + (+j.price||0), 0), paid = live.reduce((a,j) => a + (+j.paid||0), 0);
  return {n:list.length, done:list.filter(j => j.status==="Completed").length, billed, paid, due:live.reduce((a,j) => a + balance(j), 0)};
}
function summary(list, lbl) {
  const t = totals(list);
  $("#summary").innerHTML = `<span>${lbl}:</span><span>Jobs <b>${t.n}</b></span><span>Completed <b>${t.done}</b></span><span>Billed <b>${money(t.billed)}</b></span><span>Paid <b>${money(t.paid)}</b></span><span>Balance due <b>${money(t.due)}</b></span>`;
}

/* ---------- navigation ---------- */
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { view = b.dataset.v; render(); });
$("#techSel").onchange = e => { focusTech = e.target.value; render(); };
$("#payF").onchange = e => { payF = e.target.value; render(); };
$("#custQ").oninput = e => { custQ = e.target.value; render(); };
$("#roleSel").onchange = e => { role = e.target.value; render(); };
const step = dir => { if (view === "month") cur = new Date(cur.getFullYear(), cur.getMonth()+dir, 1); else cur = addDays(cur, dir*(view==="week"?7:1)); render(); };
$("#prev").onclick = () => step(-1); $("#next").onclick = () => step(1);
$("#todayBtn").onclick = () => { cur = new Date(); render(); };
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());

$("#view").onclick = e => {
  const ev = e.target.closest("[data-id]"); if (ev) return openJob(db.jobs.find(j => j.id === ev.dataset.id));
  if (role !== "admin") return;
  const cell = e.target.closest("[data-d]"); if (!cell) return;
  let start = "09:00";
  if (cell.classList.contains("col")) { const y = e.clientY - cell.getBoundingClientRect().top; const m = Math.min((END_H-1)*60, Math.round((START_H*60 + y/HR*60)/30)*30); start = `${pad(Math.floor(m/60))}:${pad(m%60)}`; }
  openJob(null, cell.dataset.d, start, cell.dataset.t);
};

/* ---------- job form ---------- */
const jobDlg = $("#jobDlg"); let editing = null;
const F = id => $("#"+id);
function openJob(j, date, start, t) {
  editing = j; F("jobTitle").textContent = j ? "Edit job" : "New job";
  F("delBtn").hidden = !j; F("delConfirm").hidden = true;
  const c = j ? cust(j.cust) : {};
  F("fCust").value = c.name||""; F("fAddr").value = c.address||""; F("fPhone").value = c.phone||""; F("fEmail").value = c.email||"";
  F("fSvc").value = j?.svc || SERVICES[0]; F("fNotes").value = j?.notes || "";
  F("fTech").value = j?.tech || t || (focusTech !== "all" ? focusTech : activeTechs()[0]?.id);
  if (j && !activeTechs().find(x => x.id === j.tech)) F("fTech").insertAdjacentHTML("beforeend", `<option value="${j.tech}">${esc(tech(j.tech).name)} (inactive)</option>`), F("fTech").value = j.tech;
  F("fStatus").value = j?.status || "Scheduled"; F("fDate").value = j?.date || date || iso(cur);
  F("fStart").value = j?.start || start || "09:00"; F("fDur").value = j?.dur || 1.5;
  F("fPrice").value = j?.price ?? ""; F("fPayS").value = j?.payS || "Unpaid"; F("fPaid").value = j?.paid ?? "";
  F("fMethod").value = j?.method || ""; F("fPayD").value = j?.payDate || ""; F("fRcpt").value = j?.rcpt || "";
  // technicians can only change status
  const lock = role !== "admin";
  jobDlg.querySelectorAll("input,select").forEach(el => { if (el.id !== "fStatus") el.disabled = lock; });
  calcBal(); jobDlg.showModal(); (lock ? F("fStatus") : F("fCust")).focus();
}
function calcBal() {
  const b = Math.max(0, (+F("fPrice").value||0) - (+F("fPaid").value||0));
  F("fBal").value = money(b); F("fBal").classList.toggle("due", b > 0);
}
F("fPrice").oninput = calcBal; F("fPaid").oninput = calcBal;
F("fPayS").onchange = e => {
  if (e.target.value === "Paid") { F("fPaid").value = F("fPrice").value || 0; if (!F("fPayD").value) F("fPayD").value = iso(new Date()); }
  if (e.target.value === "Unpaid") F("fPaid").value = 0;
  calcBal();
};
F("fCust").oninput = e => {
  const c = db.customers.find(x => x.name === e.target.value);
  if (c) { F("fAddr").value = c.address; F("fPhone").value = c.phone||""; F("fEmail").value = c.email||""; }
};
$("#jobForm").onsubmit = e => {
  e.preventDefault();
  if (role !== "admin") { editing.status = F("fStatus").value; save(); jobDlg.close(); return render(); }
  const name = F("fCust").value.trim(), addr = F("fAddr").value.trim();
  let c = db.customers.find(x => x.name.toLowerCase() === name.toLowerCase() && x.address.toLowerCase() === addr.toLowerCase());
  if (!c) { c = {id:uid("c"), name, address:addr}; db.customers.push(c); }
  c.phone = F("fPhone").value.trim(); c.email = F("fEmail").value.trim();
  const data = {cust:c.id, svc:F("fSvc").value, notes:F("fNotes").value.trim(), tech:F("fTech").value, status:F("fStatus").value,
    date:F("fDate").value, start:F("fStart").value, dur:Math.max(.25, +F("fDur").value||1),
    price:+F("fPrice").value||0, payS:F("fPayS").value, paid:+F("fPaid").value||0, method:F("fMethod").value, payDate:F("fPayD").value, rcpt:F("fRcpt").value.trim()};
  if (editing) Object.assign(editing, data, {sample:false}); else db.jobs.push({id:uid("j"), ...data});
  save(); fillSelects(); jobDlg.close(); render();
};
F("delBtn").onclick = () => F("delConfirm").hidden = false;
F("delNo").onclick = () => F("delConfirm").hidden = true;
F("delYes").onclick = () => { db.jobs = db.jobs.filter(j => j !== editing); save(); jobDlg.close(); render(); };
$("#addBtn").onclick = () => openJob(null);

/* ---------- technicians ---------- */
const techDlg = $("#techDlg"); let tEdit = null, tColor = null;
function techTable() {
  const m = cur.getMonth(), y = cur.getFullYear();
  $("#techTbl").innerHTML = `<tr><th></th><th>Name</th><th>Phone</th><th>Email</th><th>Status</th><th>Jobs this month</th><th></th></tr>` +
    db.techs.map(t => {
      const n = db.jobs.filter(j => j.tech === t.id && parse(j.date).getMonth() === m && parse(j.date).getFullYear() === y).length;
      return `<tr class="${t.active?"":"inactive"}"><td><span class="dot" style="--c:${t.color}"></span></td><td>${esc(t.name)}</td><td>${esc(t.phone)}</td><td>${esc(t.email)}</td><td>${t.active?"Active":"Inactive"}</td><td>${n}</td>
      <td><button class="btn sm" data-edit="${t.id}">Edit</button> <button class="btn sm" data-act="${t.id}">${t.active?"Deactivate":"Reactivate"}</button></td></tr>`;
    }).join("");
}
function swatches() {
  const used = new Set(db.techs.filter(t => t !== tEdit).map(t => t.color));
  if (!tColor || used.has(tColor)) tColor = PALETTE.find(c => !used.has(c)) || PALETTE[0];
  $("#tColors").innerHTML = PALETTE.map(c => `<button type="button" class="sw" role="radio" aria-label="${c}" aria-checked="${c===tColor}" style="--c:${c}" data-c="${c}" ${used.has(c)?"disabled":""}></button>`).join("");
}
$("#tColors").onclick = e => { const b = e.target.closest(".sw"); if (!b || b.disabled) return; tColor = b.dataset.c; swatches(); };
function resetTechForm() { tEdit = null; tColor = null; $("#techForm").reset(); $("#techFormTitle").textContent = "+ Add technician"; $("#tSave").textContent = "Add technician"; $("#deactBox").hidden = true; swatches(); }
$("#tReset").onclick = resetTechForm;
$("#techBtn").onclick = () => { resetTechForm(); techTable(); techDlg.showModal(); };
$("#techTbl").onclick = e => {
  const ed = e.target.closest("[data-edit]"), ac = e.target.closest("[data-act]");
  if (ed) { tEdit = tech(ed.dataset.edit); tColor = tEdit.color; $("#tName").value = tEdit.name; $("#tPhone").value = tEdit.phone; $("#tEmail").value = tEdit.email;
    $("#techFormTitle").textContent = "Edit " + tEdit.name; $("#tSave").textContent = "Save changes"; swatches(); $("#tName").focus(); }
  if (ac) {
    const t = tech(ac.dataset.act);
    if (!t.active) { t.active = true; save(); fillSelects(); techTable(); render(); return; }
    const up = db.jobs.filter(j => j.tech === t.id && j.date >= iso(new Date()) && j.status !== "Completed" && j.status !== "Canceled");
    const others = activeTechs().filter(x => x !== t);
    const box = $("#deactBox"); box.hidden = false;
    box.innerHTML = up.length
      ? `Deactivate ${esc(t.name)}? This tech has ${up.length} upcoming jobs. Reassign them to: <select id="reTo">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select> <button type="button" class="btn danger" id="deYes">Reassign & deactivate</button> <button type="button" class="btn" id="deNo">Cancel</button>`
      : `Deactivate ${esc(t.name)}? Their past jobs stay in reports. <button type="button" class="btn danger" id="deYes">Deactivate</button> <button type="button" class="btn" id="deNo">Cancel</button>`;
    if (up.length && !others.length) { box.innerHTML = `Add another active technician first so ${esc(t.name)}'s ${up.length} upcoming jobs can be reassigned. <button type="button" class="btn" id="deNo">OK</button>`; }
    $("#deNo").onclick = () => box.hidden = true;
    const y = $("#deYes"); if (y) y.onclick = () => { const to = $("#reTo")?.value; up.forEach(j => j.tech = to); t.active = false; if (focusTech === t.id) focusTech = "all"; save(); box.hidden = true; fillSelects(); techTable(); render(); };
  }
};
$("#techForm").onsubmit = e => {
  e.preventDefault();
  const d = {name:$("#tName").value.trim(), phone:$("#tPhone").value.trim(), email:$("#tEmail").value.trim(), color:tColor};
  if (!d.name) return;
  if (tEdit) Object.assign(tEdit, d); else db.techs.push({id:uid("t"), active:true, ...d});
  save(); fillSelects(); resetTechForm(); techTable(); render();
};

/* ---------- download ---------- */
const dlDlg = $("#dlDlg");
function dlRange() {
  const p = $("#dPeriod").value;
  if (p === "daily") { const d = $("#dDate").value; return [d, d]; }
  if (p === "weekly") { const s = sow(parse($("#dDate").value)); return [iso(s), iso(addDays(s, 6))]; }
  if (p === "monthly") { const [y,m] = $("#dMonth").value.split("-").map(Number); return [iso(new Date(y,m-1,1)), iso(new Date(y,m,0))]; }
  return [$("#dStart").value, $("#dEnd").value];
}
function dlUI() {
  const p = $("#dPeriod").value, g = $("#dGroup").value;
  $("#dDateL").hidden = !(p === "daily" || p === "weekly"); $("#dMonthRow").hidden = p !== "monthly"; $("#dRangeRow").hidden = p !== "custom";
  $("#dTechL").hidden = g !== "tech"; $("#dCustL").hidden = g !== "cust";
  const {list} = dlData(), t = totals(list);
  $("#dPreview").textContent = `${t.n} jobs · ${money(t.billed)} billed · ${money(t.paid)} paid · ${money(t.due)} due`;
}
function dlData() {
  const [s, e] = dlRange(), g = $("#dGroup").value, pay = $("#dPay").value, q = $("#dCust").value.trim().toLowerCase();
  let list = db.jobs.filter(j => s && e && j.date >= s && j.date <= e && (pay === "all" || j.payS === pay));
  if (g === "tech" && $("#dTech").value !== "all") list = list.filter(j => j.tech === $("#dTech").value);
  if (g === "cust" && q) list = list.filter(j => { const c = cust(j.cust); return (c.name+" "+c.address).toLowerCase().includes(q); });
  list.sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start));
  let groups = [["All jobs", list]];
  if (g === "tech") { const ids = [...new Set(list.map(j => j.tech))]; groups = ids.map(id => [tech(id).name, list.filter(j => j.tech === id)]); }
  if (g === "cust") { const ids = [...new Set(list.map(j => j.cust))]; groups = ids.map(id => [`${cust(id).name} – ${cust(id).address}`, list.filter(j => j.cust === id)]); }
  return {s, e, g, list, groups};
}
const COLS = ["Date","Start","End","Duration (hrs)","Technician","Customer name","Service address","Customer phone","Service type","Service notes","Job status","Price","Amount paid","Balance due","Payment status","Payment method","Payment date","Receipt/Invoice #"];
const rowOf = j => { const c = cust(j.cust); return [j.date, fmtT(j.start), fmtT(endT(j)), j.dur, tech(j.tech).name, c.name, c.address, c.phone||"", j.svc, j.notes||"", j.status, (+j.price||0).toFixed(2), (+j.paid||0).toFixed(2), balance(j).toFixed(2), j.payS, j.method||"", j.payDate||"", j.rcpt||""]; };
const totRow = (lbl, t) => [lbl, `Jobs: ${t.n}`, `Completed: ${t.done}`, "", "", "", "", "", "", "", "", t.billed.toFixed(2), t.paid.toFixed(2), t.due.toFixed(2), "", "", "", ""];
function fileName(ext) {
  const {s, e, g} = dlData(); let who = "all";
  if (g === "tech" && $("#dTech").value !== "all") who = "tech-" + slug(tech($("#dTech").value).name);
  if (g === "tech" && $("#dTech").value === "all") who = "by-tech";
  if (g === "cust") who = $("#dCust").value.trim() ? "customer-" + slug($("#dCust").value) : "by-customer";
  return `greenlight-jobs_${$("#dPeriod").value}_${s}_to_${e}_${who}.${ext}`;
}
function downloadCSV() {
  const {list, groups, g} = dlData();
  const q = v => { v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; };
  const rows = [COLS];
  groups.forEach(([name, js]) => {
    if (g !== "all") rows.push([`== ${name} ==`]);
    js.forEach(j => rows.push(rowOf(j)));
    if (g !== "all") rows.push(totRow(`Subtotal – ${name}`, totals(js)));
    if (g !== "all") rows.push([]);
  });
  rows.push(totRow("GRAND TOTAL", totals(list)));
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], {type:"text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName("csv"); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadPDF() {
  const {s, e, list, groups, g} = dlData(), t = totals(list);
  const table = js => `<table><tr>${COLS.map(c => `<th>${c}</th>`).join("")}</tr>${js.map(j => `<tr>${rowOf(j).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>`;
  const sum = x => `<p>Jobs ${x.n} · Completed ${x.done} · Billed ${money(x.billed)} · Paid ${money(x.paid)} · Balance due ${money(x.due)}</p>`;
  $("#printArea").innerHTML = `<h1>Greenlight Lawn Care – Job Report</h1><p>${s} to ${e} · ${fileName("pdf")}</p>` +
    groups.map(([n, js]) => (g !== "all" ? `<h2>${esc(n)}</h2>` : "") + table(js) + (g !== "all" ? sum(totals(js)) : "")).join("") + `<h2>Grand total</h2>` + sum(t);
  const old = document.title; document.title = fileName("pdf").replace(".pdf", "");
  window.print(); document.title = old;
}
$("#dlBtn").onclick = () => {
  const d = iso(cur); $("#dDate").value = d; $("#dMonth").value = d.slice(0,7); $("#dStart").value = d; $("#dEnd").value = d;
  $("#dPeriod").value = view === "day" ? "daily" : view === "week" ? "weekly" : "monthly"; dlUI(); dlDlg.showModal();
};
$("#dUseView").onclick = () => {
  const d = iso(cur); $("#dDate").value = d; $("#dMonth").value = d.slice(0,7);
  $("#dPeriod").value = view === "day" ? "daily" : view === "week" ? "weekly" : "monthly";
  if (focusTech !== "all") { $("#dGroup").value = "tech"; $("#dTech").value = focusTech; }
  dlUI();
};
$("#dlForm").addEventListener("input", dlUI); $("#dlForm").addEventListener("change", dlUI);
$("#dlForm").onsubmit = e => { e.preventDefault(); const [s, en] = dlRange(); if (!s || !en) return; $("#dFmt").value === "csv" ? downloadCSV() : downloadPDF(); };

/* ---------- sample data ---------- */
$("#clearSample").onclick = () => {
  const n = db.jobs.filter(j => j.sample).length;
  const box = $("#summary");
  box.innerHTML = `<span class="confirm">Remove ${n} sample jobs and sample customers? <button class="btn danger" id="csYes">Clear samples</button> <button class="btn" id="csNo">Keep</button></span>`;
  $("#csNo").onclick = render;
  $("#csYes").onclick = () => { db.jobs = db.jobs.filter(j => !j.sample); const used = new Set(db.jobs.map(j => j.cust)); db.customers = db.customers.filter(c => !c.sample || used.has(c.id)); save(); fillSelects(); render(); };
};

$("#payF").value = payF;
fillSelects(); render();
})();
