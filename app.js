(() => {
'use strict';
const L = window.Logic;
const api = window.api;
let db = L.newDb();

/* ---------- costanti ---------- */
const MSHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const MLONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const SOURCES = {
  trade:   { name:'Trade Republic', color:'#A78BFA', file:true, notes:[
    'Gli acquisti ETF sono contati come investimenti, non come spese.',
    'Le categorie delle spese con carta arrivano dai codici esercente.',
    'Bonifici verso altri tuoi conti riconosciuti come giroconti.'] },
  revolut: { name:'Revolut', color:'#818CF8', file:true, notes:[
    'Leggo solo la parte "Riepilogo delle transazioni" del file: dati del conto e IBAN vengono ignorati.',
    'Ricariche e trasferimenti a te stesso sono giroconti.'] },
  paypal:  { name:'PayPal', color:'#E879C9', file:true, notes:[
    'Importo solo le righe completate: blocchi, storni e movimenti in sospeso vengono ignorati.',
    'I versamenti da carta sono giroconti: la spesa resta sul conto da cui parte.',
    'Le conversioni in euro dei pagamenti in sterline sono contate come spesa.'] },
  satispay:{ name:'Satispay', color:'#F0ABFC', file:false, notes:['Nessun export disponibile: i movimenti si inseriscono a mano.'] },
  buddy:   { name:'Buddybank', color:'#FB7185', file:true, notes:[
    'Importa l’estratto conto PDF Buddybank. Il rimborso della carta Flexia viene escluso dalle spese, che sono registrate dalla carta.',
    'Bonifici verso il tuo nome vengono riconosciuti come giroconti.'] },
  flexia:  { name:'Buddybank Flexia', color:'#F97386', file:true, notes:[
    'Importa l’estratto PDF della carta Flexia: uso la data dell’acquisto e registro le spese una sola volta.',
    'Le rate addebitate sul conto Buddybank sono giroconti e non duplicano gli acquisti.'] },
};
const KIND_LABEL = { trade:'Trade Republic', paypal:'PayPal', revolut:'Revolut', buddy:'Buddybank – conto', flexia:'Buddybank – carta Flexia', payslip:'Busta paga', unknown:'Non riconosciuto' };
const CATS = ['Casa','Spesa','Ristoranti','Trasporti','Shopping','Abbonamenti','Svago','Salute','Contanti','Altro','Stipendio','Rimborsi','Interessi','Investimenti','Altre entrate'];
const CAT_COLOR = { Casa:'#A78BFA', Spesa:'#818CF8', Ristoranti:'#E879C9', Trasporti:'#F0ABFC', Shopping:'#FB7185', Abbonamenti:'#C4B5FD', Svago:'#F9A8D4', Salute:'#93C5FD', Contanti:'#A5B4FC', Altro:'#8B82A0' };

/* ---------- utilità ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const eur = (c) => (c / 100).toLocaleString('it-IT', { style:'currency', currency:'EUR' });
const eur0 = (c) => (c / 100).toLocaleString('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:0 });
const eurSigned = (c) => (c > 0 ? '+' : '') + eur(c);
const pct = (x) => (x > 0 ? '+' : '') + x.toLocaleString('it-IT', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%';
const fmtDate = (iso) => { const [, m, d] = iso.split('-'); return parseInt(d, 10) + ' ' + MSHORT[parseInt(m, 10) - 1]; };
const fmtDateY = (iso) => fmtDate(iso) + ' ' + iso.slice(0, 4);
const mLong = (ym) => MLONG[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
const todayIso = () => new Date().toISOString().slice(0, 10);
const nowYm = () => todayIso().slice(0, 7);
const centsOf = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const euroInput = (c) => (c == null ? '' : (c / 100).toFixed(2));
function payDate(ym) { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0') + '-10'; }

const state = { view:'riepilogo', ym:null, filter:'tutti', q:'', slip:-1, year:'tutti', yv:null, iy:'tutti', gq:'', gf:'tutti', info:null };
const ICONS = {
  home:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  event:'<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 15 2 2 4-4"/>',
  repeat:'<polyline points="17 2 21 6 17 10"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><polyline points="7 22 3 18 7 14"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  bars:'<line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="11" width="3" height="7"/><rect x="10.5" y="6" width="3" height="12"/><rect x="16" y="9" width="3" height="9"/>',
  search:'<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16"/>',
  trend:'<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  refresh:'<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><polyline points="3 21 3 16 8 16"/><polyline points="21 3 21 8 16 8"/>',
  wallet:'<path d="M20 7H5a2 2 0 0 1 0-4h13v4z"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16.5" cy="14" r="1"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/>',
  credit:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
  bank:'<path d="M3 10l9-6 9 6"/><line x1="5" y1="10" x2="5" y2="18"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/><line x1="19" y1="10" x2="19" y2="18"/><line x1="3" y1="21" x2="21" y2="21"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  sliders:'<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.2"/>',
};
const SRC_ICON = { trade:'trend', revolut:'refresh', paypal:'wallet', satispay:'phone', buddy:'bank', flexia:'credit' };
const ico = (n) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
const ACCENTS = {
  violet: { n:'Viola',     d:'167,139,250', l:'124,92,224', c:'#A78BFA' },
  pink:   { n:'Rosa',      d:'244,114,182', l:'214,64,159', c:'#F472B6' },
  blue:   { n:'Azzurro',   d:'96,165,250',  l:'37,99,235',  c:'#60A5FA' },
  green:  { n:'Verde',     d:'52,211,153',  l:'5,150,105',  c:'#34D399' },
  orange: { n:'Arancione', d:'251,146,60',  l:'234,106,18', c:'#FB923C' },
};
function applyTheme() {
  const th = db.settings.theme === 'light' ? 'light' : 'dark';
  const a = ACCENTS[db.settings.accent] || ACCENTS.violet;
  const root = document.documentElement;
  root.dataset.theme = th;
  root.style.setProperty('--accent-rgb', th === 'light' ? a.l : a.d);
  if (api.setTheme) api.setTheme(th).catch(() => {});
}
let pendingSlips = [];
let quickCandidates = [];

function months() {
  const s = new Set(db.txs.map((t) => t.date.slice(0, 7)));
  if (!s.size) s.add(nowYm());
  return [...s].sort();
}
function periodYears() {
  const years = new Set(months().map((m) => m.slice(0, 4)));
  const currentYear = Number(nowYm().slice(0, 4));
  years.add(String(currentYear));
  years.add(String(currentYear + 1));
  return [...years].sort();
}
function ensureMonth() { if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(state.ym || '')) state.ym = months().slice(-1)[0]; }
const monthTx = (ym, src) => db.txs.filter((t) => t.date.startsWith(ym) && (!src || t.src === src));
const sortDesc = (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id));

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { api.save(db).catch(() => toast('Non sono riuscito a salvare i dati')); }, 250);
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}
function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function statementRows() {
  const sources = Object.entries(SOURCES).filter(([, source]) => source.file).map(([key, source]) => ({ key, name:source.name }));
  return L.statementReminders(sources, db.imports, db.settings.statementReminderDays, localToday(), db.settings.statementSnoozed || {});
}
function statementReminderPanel() {
  if (db.settings.statementReminders === false) return '';
  const rows = statementRows();
  const relevant = rows.filter((r) => r.status === 'due' || r.status === 'never' || r.status === 'snoozed');
  const dueCount = rows.filter((r) => r.status === 'due').length;
  const heading = dueCount ? 'È ora di controllare gli estratti' : 'Controllo estratti';
  const statusLabel = (r) => r.status === 'never' ? 'Nessun import ancora'
    : r.status === 'due' ? 'Da aggiornare · ultimo import ' + fmtDateY(r.last)
    : 'Promemoria posticipato · ultimo import ' + fmtDateY(r.last);
  const list = relevant.map((r) => '<div class="statement-row"><div class="statement-info"><span class="statement-dot ' + r.status + '"></span><div><b>' + esc(r.name) + '</b><span>' + esc(statusLabel(r)) + '</span></div></div>' +
    '<div class="statement-actions"><button class="btn small" data-action="import-statement" data-src="' + esc(r.key) + '">Importa</button>' +
    (r.status === 'due' ? '<button class="btn small" data-action="snooze-statement" data-src="' + esc(r.key) + '">Ricorda tra 7 giorni</button>' : '') + '</div></div>').join('');
  const summary = dueCount ? dueCount + ' estratt' + (dueCount === 1 ? 'o è' : 'i sono') + ' da aggiornare.'
    : relevant.length ? 'Tieni aggiornati gli estratti dei tuoi conti.'
      : 'Gli estratti importati sono aggiornati.';
  return '<section class="panel mt statement-panel"><div class="statement-heading"><div><h2>' + heading + '</h2><p class="sub">' + summary + '</p></div>' +
    '<button class="btn small" data-view="impostazioni">Impostazioni</button></div>' +
    (list || '<p class="statement-ok">Nessun estratto da controllare ora.</p>') + '</section>';
}

/* ---------- navigazione ---------- */
function navBtn(v, icon, color, label, extra) {
  return '<button data-view="' + v + '" title="' + esc(label) + '" class="' + (state.view === v ? 'on' : '') + '"><span style="color:' + color + ';display:flex">' + ico(icon) + '</span><span class="lbl">' + esc(label) + '</span>' + (extra || '') + '</button>';
}
function renderNav() {
  const sugg = db.txs.filter((t) => t.suggest && t.amt < 0 && t.date.startsWith(state.ym)).length;
  let h = navBtn('riepilogo', 'home', 'var(--muted)', 'Riepilogo', sugg ? '<span class="alert">' + sugg + '</span>' : '');
  h += navBtn('anno', 'calendar', 'var(--muted)', 'Anno') + navBtn('abbonamenti', 'repeat', 'var(--muted)', 'Abbonamenti') +
       navBtn('calendario', 'event', 'var(--muted)', 'Calendario spese') +
       navBtn('investimenti', 'bars', 'var(--muted)', 'Investimenti') + navBtn('cerca', 'search', 'var(--muted)', 'Cerca');
  h += '<div class="nav-group">Servizi</div>';
  Object.keys(SOURCES).forEach((k) => { h += navBtn(k, SRC_ICON[k], SOURCES[k].color, SOURCES[k].name, '<span class="count">' + monthTx(state.ym, k).length + '</span>'); });
  h += '<div class="nav-group">Lavoro</div>' + navBtn('buste', 'file', '#6EE7B7', 'Buste paga');
  h += '<div class="nav-group">Altro</div>' + navBtn('impostazioni', 'sliders', 'var(--muted)', 'Impostazioni');
  $('nav').innerHTML = h;
}

const emptyPanel = (t, s, btn) => '<div class="panel"><div class="empty"><b>' + esc(t) + '</b>' + esc(s) + (btn || '') + '</div></div>';

/* ciambella delle spese per categoria + elenco cliccabile */
function expenseCats(list) {
  const cat = {};
  list.forEach((x) => { if (!x.transfer && !x.invest && x.amt < 0) cat[x.cat] = (cat[x.cat] || 0) - x.amt; });
  return Object.entries(cat).sort((a, b) => b[1] - a[1]);
}
function catPanel(cats, scope) {
  const total = cats.reduce((a, c) => a + c[1], 0);
  if (!total) return '<div class="empty">Nessuna spesa in questo periodo.</div>';
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = cats.map(([k, v]) => {
    const len = v / total * C, vis = Math.max(0, len - (cats.length > 1 ? 1.5 : 0));
    const c = '<circle class="seg" cx="95" cy="95" r="' + R + '" stroke="' + (CAT_COLOR[k] || '#8B82A0') + '" stroke-dasharray="' + vis.toFixed(2) + ' ' + (C - vis).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" data-action="cat" data-cat="' + esc(k) + '" data-scope="' + esc(scope) + '" data-tip="' + esc(k + ': ' + eur(v) + ' (' + Math.round(v / total * 100) + '%)') + '"/>';
    off += len; return c;
  }).join('');
  const rows = cats.map(([k, v]) => '<button class="catrow" data-action="cat" data-cat="' + esc(k) + '" data-scope="' + esc(scope) + '"><i style="background:' + (CAT_COLOR[k] || '#8B82A0') + '"></i><span>' + esc(k) + '</span><span class="a">' + eur(v) + '</span><span class="p">' + Math.round(v / total * 100) + '%</span></button>').join('');
  return '<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 190 190" role="img" aria-label="Spese per categoria">' + segs + '</svg><div class="mid"><b>' + esc(eur0(total)) + '</b><span>spese</span></div></div><div class="catlist">' + rows + '</div></div>';
}
function openCategory(cat, scope) {
  const list = db.txs.filter((t) => t.date.startsWith(scope) && t.cat === cat && !t.transfer && !t.invest && t.amt < 0).sort(sortDesc);
  const total = list.reduce((a, t) => a - t.amt, 0);
  const label = scope.length === 7 ? mLong(scope) : 'Anno ' + scope;
  const rows = list.map((t) => '<tr><td class="date">' + fmtDate(t.date) + '</td><td><span class="src-dot" style="background:' + SOURCES[t.src].color + '"></span>' + esc(t.desc) + '</td><td class="r num">' + eur(t.amt) + '</td></tr>').join('');
  openModal('<h2>' + esc(cat) + '</h2><p style="color:var(--muted);margin:0">' + esc(label) + ' · ' + list.length + ' moviment' + (list.length === 1 ? 'o' : 'i') + '</p><div class="cat-total">' + eur(total) + '</div>' +
    '<div style="max-height:52vh;overflow:auto"><table><thead><tr><th>Data</th><th>Descrizione</th><th class="r">Importo</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="actions"><button class="btn primary" data-action="close">Chiudi</button></div>');
}

/* ---------- Riepilogo ---------- */
function viewStart() {
  const hasName = db.settings.ownNames.length > 0;
  if (window.FINANZE_WEB) {
    return '<div class="panel"><h2>Iniziamo</h2><p class="sub">Ripristina la copia esportata dall’app PC per portare qui i tuoi dati. Questa app conserva i dati solo in questo browser.</p><ol class="steps">' +
      '<li><div><b>Trasferisci il backup del PC</b><span>Scegli il file JSON creato da Finanze per Windows. Il ripristino sostituisce i dati già presenti su questo dispositivo.</span></div><button class="btn primary" data-action="restore">Scegli backup</button></li>' +
      '<li><div><b>Inserisci i nuovi movimenti</b><span>Puoi aggiungere i pagamenti dal pulsante “Aggiungi rapido”. Per importare nuovi estratti, usa l’app PC e trasferisci di nuovo il backup.</span></div><button class="btn" data-action="quickadd">Aggiungi rapido</button></li>' +
      '</ol></div>';
  }
  return '<div class="panel"><h2>Iniziamo</h2><p class="sub">Tre passi, poi vedi subito il quadro dei tuoi soldi.</p><ol class="steps">' +
    '<li class="' + (hasName ? 'done' : '') + '"><div><b>Scrivi il tuo nome</b><span>Serve a riconoscere i bonifici verso i tuoi conti, che non sono spese.</span></div><button class="btn" data-view="impostazioni">' + (hasName ? 'Modifica' : 'Imposta il nome') + '</button></li>' +
    '<li><div><b>Importa i file dei tuoi conti</b><span>CSV di Trade Republic, PayPal e Revolut; PDF del conto Buddybank e della carta Flexia. Puoi anche trascinarli nella finestra.</span></div><button class="btn primary" data-action="import">Importa file</button></li>' +
    '<li><div><b>Carica le buste paga</b><span>PDF, anche vecchi: servono per RAL e andamento dello stipendio.</span></div><button class="btn" data-action="import">Carica PDF</button></li>' +
    '</ol></div>';
}

function viewRiepilogo() {
  if (!db.txs.length && !db.slips.length) return viewStart();
  const m = state.ym, list = monthTx(m), t = L.totals(list);
  const total = Math.max(t.entrate, t.uscite + t.investito, 1);
  const wS = t.uscite / total * 100, wI = Math.max(0, t.investito) / total * 100, wR = Math.max(0, t.rimasto) / total * 100;
  const mname = MLONG[+m.slice(5) - 1].toLowerCase();

  const srcRows = Object.keys(SOURCES).map((k) => {
    const x = L.totals(monthTx(m, k));
    return '<tr><td><span class="src-dot" style="background:' + SOURCES[k].color + '"></span>' + esc(SOURCES[k].name) + '</td><td class="r num pos">' + (x.entrate ? eur(x.entrate) : '–') + '</td><td class="r num">' + ((x.uscite + x.investito) ? eur(x.uscite + x.investito) : '–') + '</td></tr>';
  }).join('');

  const ms = months().slice(-6);
  const trendData = ms.map((mm) => Object.assign({ mm }, L.totals(monthTx(mm))));
  const maxT = Math.max(...trendData.map((d) => Math.max(d.entrate, d.uscite + d.investito)), 1);
  const trendHtml = trendData.map((d) =>
    '<div class="col" data-tip="' + esc(mLong(d.mm) + ': entrate ' + eur(d.entrate) + ', uscite ' + eur(d.uscite + d.investito)) + '"><div class="pair"><i style="height:' + (d.entrate / maxT * 100) + '%;background:var(--mint)"></i><i style="height:' + ((d.uscite + d.investito) / maxT * 100) + '%;background:var(--violet)"></i></div><span class="lab">' + MSHORT[+d.mm.slice(5) - 1] + '</span></div>').join('');

  const sug = list.filter((x) => x.suggest && x.amt < 0);
  let reviewHtml = '';
  if (sug.length) {
    reviewHtml = '<div class="panel mt"><h2>Da rivedere</h2><p class="sub">Movimenti che sembrano giroconti tra i tuoi conti. Se confermi, non contano né come spesa né come entrata.</p>' +
      sug.map((a) => {
        const b = db.txs.find((x) => x.id === a.suggest); if (!b) return '';
        return '<div class="review"><div><p>' + esc(SOURCES[a.src].name) + ' ' + eur(a.amt) + ' il ' + fmtDate(a.date) + ' e ' + esc(SOURCES[b.src].name) + ' ' + eurSigned(b.amt) + ' il ' + fmtDate(b.date) + '</p><p class="m">Stesso importo a pochi giorni di distanza.</p></div><div style="display:flex;gap:8px"><button class="btn small" data-action="dismiss" data-id="' + esc(a.id) + '">Sono due movimenti diversi</button><button class="btn small primary" data-action="confirm" data-id="' + esc(a.id) + '">È un giroconto</button></div></div>';
      }).join('') + '</div>';
  }
  const banner = db.settings.ownNames.length ? '' :
    '<div class="banner"><p>Scrivi il tuo nome per riconoscere i bonifici verso i tuoi conti: oggi potrebbero contare come spese o entrate.</p><button class="btn small primary" data-view="impostazioni">Imposta il nome</button></div>';

  return banner + statementReminderPanel() +
  '<div class="panel hero"><p class="lead">Rimasto a ' + mname + '</p><div class="big num" data-count="' + t.rimasto + '">' + eur(t.rimasto) + '</div>' +
    '<div class="flow" role="img" aria-label="Come si divide l\'entrata del mese"><i style="width:' + wS + '%;background:var(--violet)"></i><i style="width:' + wI + '%;background:var(--lilac)"></i><i style="width:' + wR + '%;background:var(--mint)"></i></div>' +
    '<div class="legend">' +
      '<div><span class="k">Entrate</span><span class="v pos">' + eur(t.entrate) + '</span></div>' +
      '<div><span class="k"><span class="dot" style="background:var(--violet)"></span>Spese</span><span class="v">' + eur(t.uscite) + '</span></div>' +
      '<div><span class="k"><span class="dot" style="background:var(--lilac)"></span>Investito</span><span class="v">' + eur(t.investito) + '</span></div>' +
      '<div><span class="k"><span class="dot" style="background:var(--mint)"></span>Rimasto</span><span class="v">' + eur(t.rimasto) + '</span></div>' +
    '</div>' +
    '<p class="hint">Esclusi ' + t.nGiro + ' giroconti tra i tuoi conti, per ' + eur(t.giroconti) + ' in totale.</p></div>' +
  reviewHtml +
  '<div class="riep-grid mt">' +
    '<div class="panel"><h2>Spese per categoria</h2><p class="sub">Clicca una categoria per vedere i movimenti. Giroconti e investimenti esclusi.</p>' + catPanel(expenseCats(list), m) + '</div>' +
    '<div class="panel"><h2>Per servizio</h2><p class="sub">Giroconti esclusi</p><table><thead><tr><th>Servizio</th><th class="r">Entrate</th><th class="r">Uscite</th></tr></thead><tbody>' + srcRows + '</tbody></table></div>' +
  '<div class="panel wide"><h2>Andamento</h2><p class="sub">Entrate e uscite degli ultimi mesi</p><div class="trend">' + trendHtml + '</div><div class="keys"><span><span class="dot" style="background:var(--mint)"></span>Entrate</span><span><span class="dot" style="background:var(--violet)"></span>Uscite, investimenti inclusi</span></div></div>' +
  '</div>' +
  '<div class="panel mt"><h2>Tutti i movimenti</h2><p class="sub">Di tutti i servizi, in ordine di data</p>' + txTable(list.slice().sort(sortDesc), true) + '</div>';
}

/* ---------- tabella movimenti ---------- */
function txTable(list, showSrc) {
  const q = state.q;
  const toolbar = '<div class="toolbar"><div class="chips">' +
    [['tutti', 'Tutti'], ['spese', 'Spese'], ['entrate', 'Entrate'], ['giroconti', 'Giroconti']].map(([k, l]) => '<button class="chip ' + (state.filter === k ? 'on' : '') + '" data-filter="' + k + '">' + l + '</button>').join('') +
    '</div><input type="search" id="q" placeholder="Cerca nei movimenti" value="' + esc(q) + '" aria-label="Cerca nei movimenti"></div>';
  let rows = list.filter((t) => {
    if (state.filter === 'spese') return !t.transfer && !t.invest && t.amt < 0;
    if (state.filter === 'entrate') return !t.transfer && t.amt > 0;
    if (state.filter === 'giroconti') return t.transfer;
    return true;
  });
  if (q) rows = rows.filter((t) => (t.desc + ' ' + t.cat + ' ' + SOURCES[t.src].name).toLowerCase().includes(q.toLowerCase()));
  if (!rows.length) return toolbar + '<div class="empty"><b>Nessun movimento</b>Cambia filtro o mese, oppure importa un file.</div>';
  const body = rows.map((t) => {
    const tags = (t.transfer ? '<span class="tag t-transfer">Giroconto</span> ' : '') + (t.invest ? '<span class="tag t-invest">Investimento</span> ' : '') + (t.manual ? '<span class="tag t-manual">A mano</span> ' : '') + (t.payslip ? '<span class="tag">Da busta paga</span> ' : '');
    const id = esc(t.id);
    return '<tr><td class="date">' + fmtDate(t.date) + '</td>' +
      '<td><span class="d">' + (showSrc ? '<span class="src-dot" style="background:' + SOURCES[t.src].color + '" title="' + esc(SOURCES[t.src].name) + '"></span>' : '') + esc(t.desc) + '</span>' + (tags ? '<span class="meta">' + tags + '</span>' : '') + '</td>' +
      '<td><select class="cat" data-id="' + id + '" aria-label="Categoria">' + CATS.map((c) => '<option' + (c === t.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></td>' +
      '<td class="r num ' + (t.amt > 0 && !t.transfer ? 'pos' : '') + '">' + eurSigned(t.amt) + '</td>' +
      '<td class="r" style="white-space:nowrap"><button class="toggle ' + (t.transfer ? 'on' : '') + '" data-action="toggle" data-id="' + id + '" title="Segna o togli come giroconto">Giroconto</button>' +
      (t.manual ? ' <button class="toggle" data-action="del" data-id="' + id + '" title="Elimina questo movimento" aria-label="Elimina movimento">✕</button>' : '') + '</td></tr>';
  }).join('');
  return toolbar + '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="r">Importo</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
}

/* ---------- servizio ---------- */
function viewSource(k) {
  const S = SOURCES[k], m = state.ym, list = monthTx(m, k).sort(sortDesc), t = L.totals(list);
  const last = db.imports[k];
  const sub = S.file ? (last ? 'Ultimo import: ' + fmtDateY(last) : 'Nessun file importato ancora') : 'Movimenti inseriti a mano';
  const stats = '<div class="grid g3"><div class="panel stat"><div class="l">Entrate</div><div class="v pos">' + eur(t.entrate) + '</div></div><div class="panel stat"><div class="l">Spese</div><div class="v">' + eur(t.uscite) + '</div></div><div class="panel stat"><div class="l">' + (t.investito ? 'Investito' : 'Giroconti') + '</div><div class="v">' + eur(t.investito || t.giroconti) + '</div></div></div>';
  const head = '<div class="panel"><div class="toolbar" style="margin:0"><div><h2>' + esc(S.name) + '</h2><p class="sub" style="margin:0">' + esc(sub) + '</p></div><div style="display:flex;gap:8px">' +
    (S.file && !window.FINANZE_WEB ? '<button class="btn" data-action="import">Importa file</button>' : '') +
    '<button class="btn primary" data-action="addtx" data-src="' + k + '">Aggiungi movimento</button></div></div></div>';
  const notes = '<div class="panel mt"><h2>Come leggo questo servizio</h2><ul class="notes">' + S.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>';
  const body = list.length ? txTable(list, false) : '<div class="empty"><b>Nessun movimento in ' + esc(MLONG[+m.slice(5) - 1].toLowerCase()) + '</b>' + (S.file && !window.FINANZE_WEB ? 'Importa un file oppure aggiungi un movimento a mano.' : 'Aggiungi un movimento a mano.') + '</div>';
  return head + '<div class="mt">' + stats + '</div>' + notes + '<div class="panel mt"><h2>Movimenti</h2><p class="sub">' + esc(mLong(m)) + '</p>' + body + '</div>';
}

/* ---------- buste paga ---------- */
const extraLabel = (x) => (x.extra >= 0.8 * x.fisso ? (x.ym.slice(5) === '12' ? '13ª' : '14ª') : 'Extra');
const ralOf = (x) => x.fisso * db.settings.mens;

function viewBuste() {
  const SL = db.slips;
  if (!SL.length) {
    return '<div class="panel"><h2>Nessuna busta paga ancora</h2><p class="sub">Carica i PDF delle tue buste paga, anche quelle vecchie: leggo lordo, trattenute e netto, e ti mostro RAL, andamento e aumenti.</p><button class="btn primary" data-action="import">Carica buste paga</button></div>';
  }
  const years = [...new Set(SL.map((x) => x.ym.slice(0, 4)))];
  if (state.year !== 'tutti' && !years.includes(state.year)) state.year = 'tutti';
  const YR = state.year;
  const shown = SL.filter((x) => YR === 'tutti' || x.ym.startsWith(YR));
  const last = shown[shown.length - 1], first = shown[0];
  if (state.slip < 0 || state.slip >= SL.length || !shown.includes(SL[state.slip])) state.slip = SL.indexOf(last);
  const yL = YR === 'tutti' ? last.ym.slice(0, 4) : YR, yP = String(+yL - 1), mLast = last.ym.slice(5);
  const slipsOf = (y) => SL.filter((x) => x.ym.startsWith(y));
  const sumNet = (arr) => arr.reduce((acc, x) => acc + x.netto, 0);
  const avgNet = (arr) => (arr.length ? Math.round(sumNet(arr) / arr.length) : 0);
  const monthName = MLONG[+mLast - 1].toLowerCase();
  /* RAL: con un anno scelto il confronto parte dall'ultima busta dell'anno prima */
  const prevYearLast = slipsOf(yP).slice(-1)[0];
  const base = YR === 'tutti' ? first : (prevYearLast || first);
  const hasGrowth = base.ym !== last.ym;
  const ralGrowth = (last.fisso / base.fisso - 1) * 100;
  const ytdNow = YR === 'tutti' ? sumNet(slipsOf(yL)) : sumNet(shown);
  const ytdPrev = sumNet(slipsOf(yP).filter((x) => x.ym.slice(5) <= mLast));
  const dYtd = ytdNow - ytdPrev, pYtd = ytdPrev ? (ytdNow / ytdPrev - 1) * 100 : 0;
  let ordNow = YR === 'tutti' ? [[...SL].reverse().find((x) => !x.extra) || last] : shown.filter((x) => !x.extra);
  if (!ordNow.length) ordNow = [last];
  const ordPrev = YR === 'tutti' ? SL.filter((x) => x.ym === yP + '-' + ordNow[0].ym.slice(5) && !x.extra) : slipsOf(yP).filter((x) => !x.extra);
  const dOrd = ordPrev.length ? avgNet(ordNow) - avgNet(ordPrev) : null;

  const toolbar = '<div class="toolbar"><div class="chips">' + ['tutti'].concat(years).map((y) => '<button class="chip ' + (state.year === y ? 'on' : '') + '" data-year="' + y + '">' + (y === 'tutti' ? 'Tutti gli anni' : y) + '</button>').join('') + '</div>' +
    '<div style="display:flex;gap:10px;align-items:center"><label style="color:var(--muted);display:flex;gap:8px;align-items:center">Mensilità<select id="mens"><option value="13"' + (db.settings.mens === 13 ? ' selected' : '') + '>13</option><option value="14"' + (db.settings.mens === 14 ? ' selected' : '') + '>14</option></select></label>' +
    '<button class="btn primary" data-action="import">Carica buste paga</button></div></div>';

  const cls = (v) => (v >= 0 ? 'pos' : 'warn');
  const stats = '<div class="grid g4">' +
    '<div class="panel stat"><div class="l">' + (YR === 'tutti' ? 'RAL stimata' : 'RAL (' + monthName + ' ' + last.ym.slice(0, 4) + ')') + '</div><div class="v">' + eur0(ralOf(last)) + '</div><div class="s">Retribuzione fissa mensile × ' + db.settings.mens + ' mensilità</div></div>' +
    '<div class="panel stat"><div class="l">' + (YR === 'tutti' ? 'Crescita della RAL' : 'Crescita della RAL nel ' + YR) + '</div><div class="v ' + (hasGrowth && ralGrowth > 0 ? 'pos' : '') + '">' + (hasGrowth ? pct(ralGrowth) : '–') + '</div><div class="s">' +
      (hasGrowth ? 'Da ' + mLong(base.ym).toLowerCase() + (YR === 'tutti' || !prevYearLast ? ', quando era ' : ' · ') + eur0(ralOf(base)) : 'Servono almeno due buste paga') + '</div></div>' +
    '<div class="panel stat"><div class="l">' + (YR === 'tutti' ? 'Netto da inizio ' + yL : 'Netto ' + YR) + '</div><div class="v">' + eur(ytdNow) + '</div><div class="s">' +
      (ytdPrev ? '<span class="' + cls(dYtd) + '">' + eurSigned(dYtd) + ' (' + pct(pYtd) + ')</span> su gennaio–' + monthName + ' ' + yP : 'Nessuna busta paga del ' + yP + ' per confrontare') + '</div></div>' +
    '<div class="panel stat"><div class="l">' + (YR === 'tutti' ? 'Netto di un mese normale' : 'Netto medio di un mese normale') + '</div><div class="v">' + eur(avgNet(ordNow)) + '</div><div class="s">' +
      (dOrd === null ? '' : '<span class="' + cls(dOrd) + '">' + eurSigned(dOrd) + '</span> ' + (YR === 'tutti' ? 'su ' + mLong(ordPrev[0].ym).toLowerCase() : 'sulla media del ' + yP)) + '</div></div></div>';

  const maxN = Math.max(...shown.map((x) => x.netto), 1);
  const bars = shown.map((x) => '<div class="col" data-tip="' + esc(mLong(x.ym) + ': ' + eur(x.netto)) + '"><div class="pair"><i style="height:' + (x.netto / maxN * 100) + '%;background:' + (x.extra ? 'var(--pink)' : 'var(--mint)') + '"></i></div><span class="lab">' + MSHORT[+x.ym.slice(5) - 1] + (x.ym.slice(5) === '01' ? '<br>' + x.ym.slice(0, 4) : '') + '</span></div>').join('');

  const lv = shown.map(ralOf), mn = Math.min(...lv), mx = Math.max(...lv), span = Math.max(mx - mn, 1);
  const den = Math.max(1, shown.length - 1);
  const X = (i) => 12 + i / den * 596, Y = (v) => 112 - (v - mn) / span * 70;
  const path = 'M' + X(0) + ',' + Y(lv[0]) + lv.slice(1).map((v, i) => ' H' + X(i + 1) + ' V' + Y(v)).join('');
  const changes = shown.map((x, i) => ({ x, i })).filter((o) => o.i === 0 || o.x.fisso !== shown[o.i - 1].fisso);
  const svg = '<svg viewBox="0 0 620 150" role="img" aria-label="RAL stimata nel tempo" style="width:100%;height:auto"><path d="' + path + '" fill="none" style="stroke:var(--mint)" stroke-width="2.5" stroke-linejoin="round"/>' +
    changes.map((o) => { const xx = X(o.i), yy = Y(lv[o.i]); const anchor = xx > 540 ? 'end' : (o.i === 0 ? 'start' : 'middle');
      return '<circle cx="' + xx + '" cy="' + yy + '" r="4" style="fill:var(--mint)"/><text x="' + xx + '" y="' + (yy - 10) + '" text-anchor="' + anchor + '" style="fill:var(--text)" font-size="12" font-family="JetBrains Mono, monospace">' + esc(eur0(lv[o.i])) + '</text>'; }).join('') +
    '<text x="12" y="144" style="fill:var(--muted)" font-size="11">' + esc(mLong(first.ym)) + '</text><text x="608" y="144" text-anchor="end" style="fill:var(--muted)" font-size="11">' + esc(mLong(last.ym)) + '</text></svg>';
  const changeList = '<div class="break" style="margin-top:8px">' + changes.map((o) => o.i === 0
    ? '<div class="r1"><span>' + mLong(o.x.ym) + '</span><span class="num">' + eur0(ralOf(o.x)) + ' <span style="color:var(--muted)">' + (YR === 'tutti' ? 'prima busta caricata' : 'prima busta del ' + YR) + '</span></span></div>'
    : '<div class="r1"><span>' + mLong(o.x.ym) + '</span><span class="num">' + eur0(ralOf(shown[o.i - 1])) + ' → ' + eur0(ralOf(o.x)) + ' <b class="' + (o.x.fisso >= shown[o.i - 1].fisso ? 'pos' : 'warn') + '">' + pct((o.x.fisso / shown[o.i - 1].fisso - 1) * 100) + '</b></span></div>').join('') + '</div>';

  let yoyRows = '', sumA = 0, sumB = 0, nYoy = 0;
  for (let mo = 1; mo <= (YR === 'tutti' ? +mLast : 12); mo++) {
    const mm = String(mo).padStart(2, '0'), A = SL.find((x) => x.ym === yP + '-' + mm), B = SL.find((x) => x.ym === yL + '-' + mm);
    if (!A || !B) continue;
    nYoy++; sumA += A.netto; sumB += B.netto; const d = B.netto - A.netto;
    yoyRows += '<tr><td>' + MLONG[mo - 1] + (A.extra || B.extra ? ' <span class="tag t-invest">' + extraLabel(B.extra ? B : A) + '</span>' : '') + '</td><td class="r num">' + eur(A.netto) + '</td><td class="r num">' + eur(B.netto) + '</td><td class="r num ' + (d >= 0 ? 'pos' : 'warn') + '">' + eurSigned(d) + '</td></tr>';
  }
  yoyRows += '<tr><td><b>Totale</b></td><td class="r num"><b>' + eur(sumA) + '</b></td><td class="r num"><b>' + eur(sumB) + '</b></td><td class="r num ' + (sumB >= sumA ? 'pos' : 'warn') + '"><b>' + eurSigned(sumB - sumA) + '</b></td></tr>';
  const yoy = nYoy
    ? '<table><thead><tr><th>Mese</th><th class="r">' + yP + '</th><th class="r">' + yL + '</th><th class="r">Differenza</th></tr></thead><tbody>' + yoyRows + '</tbody></table>'
    : '<div class="empty"><b>Servono anche le buste paga del ' + yP + '</b>Caricale per vedere quanto guadagni in più.</div>';

  const listRows = shown.slice().reverse().map((x) => {
    const i = SL.indexOf(x);
    return '<tr class="pick ' + (i === state.slip ? 'on' : '') + '" data-slip="' + i + '"><td>' + mLong(x.ym) + (x.extra ? ' <span class="tag t-invest">' + extraLabel(x) + '</span>' : '') + '</td><td class="r num">' + eur(x.lordo) + '</td><td class="r num">' + eur(x.trattenute) + '</td><td class="r num pos">' + eur(x.netto) + '</td><td class="date">' + (x.valuta ? fmtDateY(x.valuta) : '–') + '</td></tr>';
  }).join('');
  const sl = SL[state.slip];
  const hit = sl.valuta ? db.txs.find((t) => t.payslip && t.amt === sl.netto && Math.abs(L.toDay(t.date) - L.toDay(sl.valuta)) <= 3) : null;
  const matchHtml = hit
    ? '<div class="match"><span class="dot" style="background:var(--mint);margin-top:7px"></span><div><b>Accredito registrato</b><div class="num" style="color:var(--muted)">' + eur(hit.amt) + ' il ' + fmtDate(hit.date) + ' su ' + esc(SOURCES[hit.src].name) + (hit.slipYm ? ' (inserito dalla busta paga)' : '') + '</div></div></div>'
    : '<div class="match" style="background:rgba(255,255,255,.04);border-color:var(--line)"><span class="dot" style="background:var(--faint);margin-top:7px"></span><div><b>Accredito previsto' + (sl.valuta ? ' il ' + fmtDateY(sl.valuta) : '') + '</b><div style="color:var(--muted)">Non ho trovato un movimento con questo importo.</div></div></div>';
  const detail = '<div class="break">' +
    '<div class="r1"><span>Retribuzione fissa</span><span class="num">' + eur(sl.fisso) + '</span></div>' +
    (sl.extra ? '<div class="r1"><span>Mensilità aggiuntive o extra</span><span class="num">' + eur(sl.extra) + '</span></div>' : '') +
    '<div class="r1 tot"><span>Lordo del mese</span><span class="num">' + eur(sl.lordo) + '</span></div>' +
    '<div class="r1"><span style="color:var(--muted)">Contributi INPS e cassa sanitaria</span><span class="num">−' + eur(sl.inps) + '</span></div>' +
    '<div class="r1"><span style="color:var(--muted)">IRPEF</span><span class="num">−' + eur(sl.irpef) + '</span></div>' +
    '<div class="r1"><span style="color:var(--muted)">Addizionali regionale e comunale</span><span class="num">−' + eur(sl.addiz) + '</span></div>' +
    '<div class="r1"><span style="color:var(--muted)">Altre trattenute</span><span class="num">−' + eur(sl.altro) + '</span></div>' +
    '<div class="r1 tot"><span>Netto in busta</span><span class="num pos">' + eur(sl.netto) + '</span></div></div>' +
    (sl.ticketN ? '<p class="hint">Buoni pasto: ' + sl.ticketN + ' da ' + eur(sl.ticketUnit) + ', in tutto ' + eur(sl.ticketN * sl.ticketUnit) + '. Non sono inclusi nel netto.</p>' : '') + matchHtml +
    '<div style="margin-top:14px"><button class="btn small danger" data-action="delslip" data-ym="' + esc(sl.ym) + '">Elimina questa busta paga</button></div>';

  return toolbar + stats +
    '<p class="hint">Il netto cambia anche per tasse e detrazioni, non solo per la RAL: per questo li tengo separati.</p>' +
    '<div class="grid g2 mt">' +
      '<div class="panel"><h2>Netto mese per mese</h2><p class="sub">' + (state.year === 'tutti' ? 'Tutte le buste paga caricate' : 'Anno ' + esc(state.year)) + '</p><div class="trend dense">' + bars + '</div><div class="keys"><span><span class="dot" style="background:var(--mint)"></span>Mese normale</span><span><span class="dot" style="background:var(--pink)"></span>Con 13ª, 14ª o extra</span></div></div>' +
      '<div class="panel"><h2>RAL nel tempo</h2><p class="sub">La RAL non è scritta nella busta paga: la ricavo dalla retribuzione fissa × mensilità. Se non torna, cambia il numero di mensilità qui sopra.</p>' + svg + changeList + '</div>' +
    '</div>' +
    '<div class="panel mt"><h2>Quanto guadagni in più rispetto a un anno fa</h2><p class="sub">Netto in busta, mese per mese, ' + yP + ' contro ' + yL + '</p>' + yoy + '</div>' +
    '<div class="grid g2 mt">' +
      '<div class="panel"><h2>Le tue buste paga</h2><p class="sub">Seleziona un mese per vedere il dettaglio</p><div class="scroll"><table><thead><tr><th>Periodo</th><th class="r">Lordo</th><th class="r">Trattenute</th><th class="r">Netto</th><th>Accredito</th></tr></thead><tbody>' + listRows + '</tbody></table></div></div>' +
      '<div class="panel"><h2>' + mLong(sl.ym) + '</h2><p class="sub">Dettaglio della busta paga</p>' + detail + '</div>' +
    '</div>';
}

/* ---------- vista annuale ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
function viewAnno() {
  const years = [...new Set(db.txs.map((t) => t.date.slice(0, 4)))].sort();
  if (!years.length) return emptyPanel('Nessun movimento ancora', 'Importa i file dei tuoi conti per vedere l\'andamento dell\'anno.');
  if (!years.includes(state.yv)) state.yv = years[years.length - 1];
  const y = state.yv, list = db.txs.filter((t) => t.date.startsWith(y)), T = L.totals(list);
  const data = [];
  for (let mo = 1; mo <= 12; mo++) { const ym = y + '-' + pad2(mo), ml = list.filter((t) => t.date.startsWith(ym)); data.push(Object.assign({ ym, mo, has: ml.length > 0 }, L.totals(ml))); }
  const maxT = Math.max(...data.map((d) => Math.max(d.entrate, d.uscite + d.investito)), 1);
  const trend = data.map((d) => '<div class="col" data-tip="' + esc(MLONG[d.mo - 1] + ': entrate ' + eur(d.entrate) + ', uscite ' + eur(d.uscite + d.investito)) + '"><div class="pair"><i style="height:' + (d.entrate / maxT * 100) + '%;background:var(--mint)"></i><i style="height:' + ((d.uscite + d.investito) / maxT * 100) + '%;background:var(--violet)"></i></div><span class="lab">' + MSHORT[d.mo - 1] + '</span></div>').join('');
  const rows = data.filter((d) => d.has).map((d) => '<tr class="pick" data-gomonth="' + d.ym + '"><td>' + MLONG[d.mo - 1] + '</td><td class="r num pos">' + eur(d.entrate) + '</td><td class="r num">' + eur(d.uscite) + '</td><td class="r num">' + eur(d.investito) + '</td><td class="r num ' + (d.rimasto < 0 ? 'warn' : '') + '">' + eur(d.rimasto) + '</td></tr>').join('');
  const nM = data.filter((d) => d.has).length;
  const chips = '<div class="toolbar"><div class="chips">' + years.map((yy) => '<button class="chip ' + (yy === y ? 'on' : '') + '" data-yv="' + yy + '">' + yy + '</button>').join('') + '</div></div>';
  const stat = (l, v, cls, sub) => '<div class="panel stat"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '" data-count="' + v + '" data-fmt="0">' + eur0(v) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  return chips + '<div class="grid g4">' + stat('Entrate', T.entrate, 'pos', nM + ' mesi con dati') + stat('Spese', T.uscite) + stat('Investito', T.investito) + stat('Rimasto', T.rimasto, T.rimasto < 0 ? 'warn' : '') + '</div>' +
    '<div class="panel mt"><h2>Mese per mese</h2><p class="sub">Entrate e uscite del ' + esc(y) + '</p><div class="trend dense">' + trend + '</div><div class="keys"><span><span class="dot" style="background:var(--mint)"></span>Entrate</span><span><span class="dot" style="background:var(--violet)"></span>Uscite, investimenti inclusi</span></div></div>' +
    '<div class="grid g2 mt"><div class="panel"><h2>Spese per categoria</h2><p class="sub">Tutto l\'anno ' + esc(y) + '</p>' + catPanel(expenseCats(list), y) + '</div>' +
    '<div class="panel"><h2>I mesi</h2><p class="sub">Clicca un mese per aprirlo</p><table><thead><tr><th>Mese</th><th class="r">Entrate</th><th class="r">Spese</th><th class="r">Investito</th><th class="r">Rimasto</th></tr></thead><tbody>' + rows +
    '<tr><td><b>Totale</b></td><td class="r num"><b>' + eur(T.entrate) + '</b></td><td class="r num"><b>' + eur(T.uscite) + '</b></td><td class="r num"><b>' + eur(T.investito) + '</b></td><td class="r num"><b>' + eur(T.rimasto) + '</b></td></tr></tbody></table></div></div>';
}

/* ---------- abbonamenti ---------- */
function viewSubs() {
  const hidden = new Set(db.settings.hiddenSubs || []);
  const all = L.detectRecurring(db.txs).filter((x) => !hidden.has(x.key));
  const showBtn = hidden.size ? '<div style="margin-top:14px"><button class="btn small" data-action="showsubs">Mostra di nuovo ' + hidden.size + ' nascost' + (hidden.size === 1 ? 'o' : 'i') + '</button></div>' : '';
  if (!all.length) return emptyPanel('Nessun abbonamento trovato', 'Cerco le spese che tornano ogni mese con un importo simile, per almeno 3 mesi. Importa più mesi di movimenti per vederle.', showBtn);
  const act = all.filter((x) => x.active), off = all.filter((x) => !x.active);
  const monthly = act.reduce((a, x) => a + x.amt, 0);
  const row = (x, withHide) => '<tr><td><span class="src-dot" style="background:' + SOURCES[x.src].color + '"></span>' + esc(x.name) + '</td><td>' + esc(x.cat) + '</td><td class="r num">' + eur(x.amt) + '</td><td class="r num">' + eur(x.annual) + '</td><td class="date">' + fmtDateY(x.last) + '</td><td class="r num">' + x.count + '</td><td class="r"><button class="toggle" data-action="hidesub" data-key="' + esc(x.key) + '" title="Non è un abbonamento">Nascondi</button></td></tr>';
  const head = '<thead><tr><th>Servizio</th><th>Categoria</th><th class="r">Importo</th><th class="r">Per anno</th><th>Ultimo addebito</th><th class="r">Mesi</th><th></th></tr></thead>';
  const stat = (l, v, fmt) => '<div class="panel stat"><div class="l">' + l + '</div><div class="v" data-count="' + v + '" data-fmt="' + fmt + '">' + (fmt === 'n' ? v : eur(v)) + '</div></div>';
  return '<div class="grid g3">' + stat('Abbonamenti attivi', act.length, 'n') + stat('Costo al mese', monthly, '2') + stat('Costo all\'anno', monthly * 12, '0') + '</div>' +
    '<div class="panel mt"><h2>Attivi</h2><p class="sub">Spese che tornano ogni mese. Se una non è un abbonamento, nascondila.</p>' + (act.length ? '<div style="overflow-x:auto"><table>' + head + '<tbody>' + act.map((x) => row(x)).join('') + '</tbody></table></div>' : '<div class="empty">Nessun abbonamento attivo.</div>') + '</div>' +
    (off.length ? '<div class="panel mt"><h2>Non più addebitati</h2><p class="sub">Ultimo addebito più di un mese e mezzo fa</p><div style="overflow-x:auto"><table>' + head + '<tbody>' + off.map((x) => row(x)).join('') + '</tbody></table></div></div>' : '') + showBtn;
}

/* ---------- calendario delle spese ricorrenti ---------- */
function viewCalendar() {
  const [year, month] = state.ym.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const events = L.recurringCalendar(db.txs, state.ym, db.settings.hiddenSubs || []);
  const byDay = new Map();
  events.forEach((event) => {
    const day = Number(event.date.slice(8, 10));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(event);
  });
  const weekdays = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((day) => '<div class="calendar-weekday">' + day + '</div>').join('');
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="calendar-day outside" aria-hidden="true"></div>');
  for (let day = 1; day <= days; day++) {
    const entries = byDay.get(day) || [];
    const date = state.ym + '-' + pad2(day);
    const details = entries.map((event) => '<span class="calendar-event ' + (event.paid ? 'paid' : 'forecast') + '" title="' + esc(event.name + ' · ' + eur(event.amt) + (event.paid ? ' · Registrata' : ' · Previsione')) + '">' + esc(event.name) + '</span>').join('');
    cells.push('<div class="calendar-day ' + (entries.length ? 'has-events' : '') + (date === localToday() ? ' today' : '') + '">' +
      '<span class="calendar-number">' + day + '</span>' + (entries.length ? '<span class="calendar-count">' + entries.length + '</span>' : '') +
      '<div class="calendar-day-events">' + details + '</div></div>');
  }
  while (cells.length % 7) cells.push('<div class="calendar-day outside" aria-hidden="true"></div>');
  const paid = events.filter((event) => event.paid);
  const forecast = events.filter((event) => !event.paid);
  const total = (items) => items.reduce((sum, event) => sum + event.amt, 0);
  const agenda = events.length ? '<div class="calendar-agenda">' + events.map((event) => {
    const day = Number(event.date.slice(8, 10));
    const badge = event.paid ? 'Registrata' : 'Prevista';
    return '<div class="calendar-agenda-row"><div class="calendar-agenda-date"><b>' + day + '</b><span>' + MSHORT[month - 1] + '</span></div>' +
      '<span class="src-dot" style="background:' + SOURCES[event.src].color + '"></span><div class="calendar-agenda-copy"><b>' + esc(event.name) + '</b><span>' + esc(event.cat) + ' · ' + badge + '</span></div>' +
      '<span class="calendar-agenda-amount num">' + eur(event.amt) + '</span></div>';
  }).join('') + '</div>' : '<div class="empty"><b>Nessuna ricorrenza in questo mese</b>Le previsioni si basano sugli abbonamenti riconosciuti dai movimenti importati.</div>';
  return '<div class="grid g3 calendar-stats"><div class="panel stat"><div class="l">Da pagare (stima)</div><div class="v" data-count="' + total(forecast) + '">' + eur(total(forecast)) + '</div><div class="s">' + forecast.length + ' addebit' + (forecast.length === 1 ? 'o previsto' : 'i previsti') + '</div></div>' +
    '<div class="panel stat"><div class="l">Già registrato</div><div class="v" data-count="' + total(paid) + '">' + eur(total(paid)) + '</div><div class="s">' + paid.length + ' ricorrenz' + (paid.length === 1 ? 'a' : 'e') + ' trovate negli estratti</div></div>' +
    '<div class="panel stat"><div class="l">Totale ricorrente</div><div class="v" data-count="' + total(events) + '">' + eur(total(events)) + '</div><div class="s">Registrato + previsto, senza aggiungere movimenti</div></div></div>' +
    '<div class="panel mt"><div class="calendar-panel-heading"><div><h2>' + esc(mLong(state.ym)) + '</h2><p class="sub">Addebiti ricorrenti registrati e prossime date stimate</p></div>' +
      '<span class="calendar-legend"><i class="paid"></i>Registrata <i class="forecast"></i>Prevista</span></div>' +
      '<div class="calendar-grid">' + weekdays + cells.join('') + '</div>' +
      '<p class="calendar-disclaimer">Le date e gli importi previsti sono stime basate sugli addebiti passati. Non vengono creati pagamenti né movimenti automatici.</p></div>' +
    '<div class="panel mt"><h2>Dettaglio del mese</h2><p class="sub">Spese individuate dagli estratti già importati</p>' + agenda + '</div>' +
    '<div class="panel mt calendar-manual"><h2>Vuoi aggiungere una spesa ricorrente?</h2><p class="sub">Aggiungi il pagamento dai movimenti oppure importa un estratto aggiornato: il calendario riconosce le ricorrenze dai dati reali.</p><button class="btn primary" data-action="quickadd">Aggiungi movimento</button></div>';
}

/* ---------- investimenti ---------- */
function nextMonth(ym) { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + pad2(m); }
function viewInvest() {
  const allOps = db.txs.filter((t) => t.invest).sort((a, b) => a.date.localeCompare(b.date));
  if (!allOps.length) return emptyPanel('Nessun investimento ancora', 'Gli acquisti di Trade Republic (ETF, piani di accumulo) compaiono qui dopo l\'importazione.');
  const iyears = [...new Set(allOps.map((t) => t.date.slice(0, 4)))];
  if (state.iy !== 'tutti' && !iyears.includes(state.iy)) state.iy = 'tutti';
  const ops = allOps.filter((t) => state.iy === 'tutti' || t.date.startsWith(state.iy));
  const ichips = '<div class="toolbar"><div class="chips">' + ['tutti'].concat(iyears).map((y) => '<button class="chip ' + (state.iy === y ? 'on' : '') + '" data-iy="' + y + '">' + (y === 'tutti' ? 'Tutti gli anni' : y) + '</button>').join('') + '</div></div>';
  const net = ops.reduce((a, t) => a - t.amt, 0);
  const byM = new Map(); ops.forEach((t) => { const m = t.date.slice(0, 7); byM.set(m, (byM.get(m) || 0) - t.amt); });
  const first = state.iy === 'tutti' ? ops[0].date.slice(0, 7) : state.iy + '-01', last = ops[ops.length - 1].date.slice(0, 7);
  const mlist = []; for (let m = first; m <= last; m = nextMonth(m)) mlist.push(m);
  const avg = Math.round(net / mlist.length);
  const maxV = Math.max(...mlist.map((m) => Math.abs(byM.get(m) || 0)), 1);
  const bars = mlist.map((m) => '<div class="col" data-tip="' + esc(mLong(m) + ': ' + eur(byM.get(m) || 0)) + '"><div class="pair"><i style="height:' + (Math.max(0, byM.get(m) || 0) / maxV * 100) + '%;background:var(--lilac)"></i></div><span class="lab">' + MSHORT[+m.slice(5) - 1] + (m.slice(5) === '01' || m === first ? '<br>' + m.slice(0, 4) : '') + '</span></div>').join('');
  const byT = new Map();
  ops.forEach((t) => { const k = t.desc.replace(/^(Acquisto|Vendita) /, ''); const o = byT.get(k) || { n: 0, tot: 0, last: '' }; o.n++; o.tot -= t.amt; if (t.date > o.last) o.last = t.date; byT.set(k, o); });
  const rows = [...byT.entries()].sort((a, b) => b[1].tot - a[1].tot).map(([k, o]) => '<tr><td>' + esc(k) + '</td><td class="r num">' + o.n + '</td><td class="r num">' + eur(o.tot) + '</td><td class="date">' + fmtDateY(o.last) + '</td></tr>').join('');
  const lastOp = ops[ops.length - 1];
  const stat = (l, v, fmt, sub) => '<div class="panel stat"><div class="l">' + l + '</div><div class="v" data-count="' + v + '" data-fmt="' + fmt + '">' + (fmt === 'n' ? v : fmt === '0' ? eur0(v) : eur(v)) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  return ichips + '<div class="grid g4">' + stat('Totale investito', net, '2', 'Acquisti meno vendite') + stat('Operazioni', ops.length, 'n') + stat('Media al mese', avg, '2', 'Su ' + mlist.length + ' mesi') + stat('Ultima operazione', Math.abs(lastOp.amt), '2', fmtDateY(lastOp.date)) + '</div>' +
    '<div class="panel mt"><h2>Quanto hai investito ogni mese</h2><p class="sub">Acquisti meno vendite</p><div class="trend dense">' + bars + '</div></div>' +
    '<div class="panel mt"><h2>Per titolo</h2><p class="sub">Dove sono andati i tuoi soldi</p><div style="overflow-x:auto"><table><thead><tr><th>Titolo</th><th class="r">Operazioni</th><th class="r">Investito</th><th>Ultima</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

/* ---------- cerca in tutti i mesi ---------- */
function viewSearch() {
  const q = state.gq.trim().toLowerCase();
  const chips = '<div class="chips" style="margin-top:12px">' + [['tutti', 'Tutti'], ['spese', 'Spese'], ['entrate', 'Entrate'], ['giroconti', 'Giroconti']].map(([k, l]) => '<button class="chip ' + (state.gf === k ? 'on' : '') + '" data-gf="' + k + '">' + l + '</button>').join('') + '</div>';
  const box = '<div class="panel"><input type="search" id="gq" class="bigsearch" placeholder="Cerca per nome, categoria, servizio o importo (per esempio: sky, 12,50, ristoranti)" value="' + esc(state.gq) + '" aria-label="Cerca in tutti i mesi">' + chips + '</div>';
  if (!q) return box + '<div class="panel mt"><div class="empty"><b>Cerca in tutti i mesi</b>Scrivi qualcosa: guardo tutti i movimenti di tutti i servizi.</div></div>';
  const norm = (t) => (t.desc + ' ' + t.cat + ' ' + SOURCES[t.src].name + ' ' + t.date + ' ' + (Math.abs(t.amt) / 100).toFixed(2).replace('.', ',') + ' ' + (Math.abs(t.amt) / 100).toFixed(2)).toLowerCase();
  const hits = db.txs.filter((t) => {
    if (state.gf === 'spese' && (t.transfer || t.invest || t.amt >= 0)) return false;
    if (state.gf === 'entrate' && (t.transfer || t.amt <= 0)) return false;
    if (state.gf === 'giroconti' && !t.transfer) return false;
    return norm(t).includes(q);
  }).sort(sortDesc);
  const T = L.totals(hits), cap = 300;
  const rows = hits.slice(0, cap).map((t) => '<tr><td class="date">' + fmtDateY(t.date) + '</td><td><span class="src-dot" style="background:' + SOURCES[t.src].color + '" title="' + esc(SOURCES[t.src].name) + '"></span>' + esc(t.desc) + (t.transfer ? ' <span class="tag t-transfer">Giroconto</span>' : '') + '</td><td>' + esc(t.cat) + '</td><td class="r num ' + (t.amt > 0 && !t.transfer ? 'pos' : '') + '">' + eurSigned(t.amt) + '</td></tr>').join('');
  return box + '<div class="panel mt"><h2>' + hits.length + ' risultat' + (hits.length === 1 ? 'o' : 'i') + '</h2><p class="sub">Entrate ' + eur(T.entrate) + ', spese ' + eur(T.uscite) + (hits.length > cap ? '. Mostro i primi ' + cap + '.' : '') + '</p>' +
    (hits.length ? '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="r">Importo</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">Nessun movimento corrisponde.</div>') + '</div>';
}

/* ---------- impostazioni ---------- */
function viewSettings() {
  const names = db.settings.ownNames;
  const nameRows = names.length ? names.map((n, i) => '<div class="row"><span>' + esc(n) + '</span><button class="btn small" data-action="delname" data-i="' + i + '">Togli</button></div>').join('')
    : '<p class="kv" style="margin:0">Nessun nome ancora.</p>';
  const srcOpts = Object.keys(SOURCES).map((k) => '<option value="' + k + '"' + (db.settings.salarySrc === k ? ' selected' : '') + '>' + esc(SOURCES[k].name) + '</option>').join('');
  const rules = db.rules.length ? db.rules.map((r, i) => '<div class="row"><span>«' + esc(r.match) + '» <span class="kv">va in</span> ' + esc(r.cat) + '</span><button class="btn small" data-action="delrule" data-i="' + i + '">Togli</button></div>').join('')
    : '<p class="kv" style="margin:0">Nessuna regola. Quando cambi la categoria di un movimento, la ricordo e la applico ai prossimi con la stessa descrizione.</p>';
  const th = db.settings.theme === 'light' ? 'light' : 'dark', ac = db.settings.accent || 'violet';
  const swatches = Object.keys(ACCENTS).map((k) => '<button class="swatch ' + (k === ac ? 'on' : '') + '" data-accent="' + k + '" style="background:' + ACCENTS[k].c + '" title="' + ACCENTS[k].n + '" aria-label="' + ACCENTS[k].n + '"></button>').join('');
  const info = state.info ? '<p class="kv" style="margin:14px 0 0">Versione ' + esc(state.info.version) + '<br>' + esc(state.info.dataPath) + '</p>' : '';
  const remindersEnabled = db.settings.statementReminders !== false;
  return '<div class="grid g2">' +
    '<div class="panel"><h2>Il tuo nome</h2><p class="sub">Come compare sui bonifici, in qualunque ordine. Serve a riconoscere i bonifici tra i tuoi conti, che non sono spese né entrate.</p>' + nameRows +
      '<div class="inline-form"><input type="text" id="newName" maxlength="80" placeholder="Nome e cognome" aria-label="Nome e cognome"><button class="btn primary" data-action="addname">Aggiungi</button></div></div>' +
    '<div class="panel"><h2>Dove arriva lo stipendio</h2><p class="sub">Quando carichi una busta paga, inserisco il netto come entrata su questo conto, alla data di accredito. Se poi importi il file del conto, non lo conto due volte.</p>' +
      '<select id="salarySrc" aria-label="Conto di accredito dello stipendio">' + srcOpts + '</select></div>' +
    '</div>' +
    '<div class="panel mt"><h2>Promemoria estratti</h2><p class="sub">Quando Finanze è aperto, ti ricorda nella schermata Riepilogo quali estratti non importi da un po’. Nessuna notifica esterna e nessun collegamento alla banca.</p>' +
      '<div class="row"><div><b>Controlla gli estratti ogni</b><div class="kv">Il promemoria si aggiorna quando importi un nuovo file.</div></div>' +
      '<select id="statementReminderDays" aria-label="Intervallo promemoria estratti">' +
      [14,30,60,90].map((n) => '<option value="' + n + '"' + (Number(db.settings.statementReminderDays || 30) === n ? ' selected' : '') + '>' + n + ' giorni</option>').join('') +
      '</select></div><div class="row"><span class="kv">Promemoria attivi</span><button class="toggle ' + (remindersEnabled ? 'on' : '') + '" data-action="toggle-reminders" aria-pressed="' + remindersEnabled + '">' + (remindersEnabled ? 'Attivi' : 'Disattivati') + '</button></div></div>' +
    '<div class="panel mt"><h2>Aspetto</h2><p class="sub">Tema e colore principale</p>' +
      '<div class="seg2" role="group" aria-label="Tema"><button data-set-theme="dark" class="' + (th === 'dark' ? 'on' : '') + '">Scuro</button><button data-set-theme="light" class="' + (th === 'light' ? 'on' : '') + '">Chiaro</button></div>' +
      '<div class="swatches" style="margin-top:14px">' + swatches + '</div></div>' +
    '<div class="panel mt"><h2>Regole di categoria</h2><p class="sub">Le categorie che hai scelto tu</p>' + rules + '</div>' +
    '<div class="panel mt"><h2>I tuoi dati</h2><p class="sub">' + (window.FINANZE_WEB ? 'I dati restano in questo browser e su questo dispositivo: non vengono sincronizzati né caricati online. Per trasferirli, salva una copia JSON, spostala manualmente sull’altro dispositivo e usa “Ripristina da una copia”. Il ripristino sostituisce i dati locali.' : 'Sono salvati solo su questo PC, con una copia di sicurezza al giorno. L\'app non si collega a internet.') + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-action="backup">Salva una copia dei dati</button><button class="btn" data-action="restore">Ripristina da una copia</button><button class="btn" data-action="export-tx">Esporta i movimenti (Excel)</button><button class="btn" data-action="export-slips">Esporta le buste paga (Excel)</button>' + (window.FINANZE_WEB ? '' : '<button class="btn" data-action="folder">Apri la cartella dei dati</button>') + '<button class="btn danger" data-action="wipe">Cancella tutti i dati</button></div>' + info + '</div>';
}

/* ---------- esportazione in CSV (si apre con Excel) ---------- */
const csvCell = (v) => { const t = String(v); return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csvNum = (c) => (c / 100).toFixed(2).replace('.', ',');
function csvTx() {
  const head = ['Data', 'Servizio', 'Descrizione', 'Categoria', 'Importo', 'Tipo'];
  const rows = db.txs.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, SOURCES[t.src].name, t.desc, t.cat, csvNum(t.amt), t.transfer ? 'Giroconto' : t.invest ? 'Investimento' : t.amt > 0 ? 'Entrata' : 'Spesa']);
  return [head].concat(rows).map((r) => r.map(csvCell).join(';')).join('\r\n');
}
function csvSlips() {
  const head = ['Mese', 'Retribuzione fissa', 'Lordo', 'INPS', 'IRPEF', 'Addizionali', 'Altre trattenute', 'Netto', 'Data accredito'];
  const rows = db.slips.map((x) => [x.ym, csvNum(x.fisso), csvNum(x.lordo), csvNum(x.inps), csvNum(x.irpef), csvNum(x.addiz), csvNum(x.altro), csvNum(x.netto), x.valuta || '']);
  return [head].concat(rows).map((r) => r.map(csvCell).join(';')).join('\r\n');
}
async function exportCsv(kind) {
  if (kind === 'slips' && !db.slips.length) { toast('Non ci sono ancora buste paga'); return; }
  if (kind === 'tx' && !db.txs.length) { toast('Non ci sono ancora movimenti'); return; }
  const r = await api.exportFile(kind === 'tx' ? 'finanze-movimenti.csv' : 'finanze-buste-paga.csv', kind === 'tx' ? csvTx() : csvSlips());
  toast(r.ok ? 'File salvato' : r.reason);
}

/* ---------- ripristino da una copia ---------- */
let pendingRestore = null;
function normalizeDb(data) {
  const base = L.newDb();
  const d = Object.assign(base, data);
  d.settings = Object.assign(base.settings, data.settings || {});
  d.rules = data.rules || []; d.slips = data.slips || []; d.imports = data.imports || {}; d.txs = data.txs || [];
  return d;
}
function handleRestoreText(text) {
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* non è un file valido */ }
  if (!data || !Array.isArray(data.txs)) { toast('Questo file non sembra una copia di Finanze'); return; }
  pendingRestore = data;
  openModal('<h2>Ripristinare questa copia?</h2><p style="color:var(--muted)">La copia contiene ' + data.txs.length + ' movimenti e ' + ((data.slips || []).length) + ' buste paga. Sostituisce i dati che hai ora (' + db.txs.length + ' movimenti). Prima salvo una copia di sicurezza di quelli attuali.</p><div class="actions"><button class="btn" data-action="close">Annulla</button><button class="btn primary" data-action="restoreok">Ripristina</button></div>');
}
async function doRestore() {
  if (!pendingRestore) return;
  try { await api.snapshot('prima-ripristino'); } catch (e) {
    if (window.FINANZE_WEB) { toast('Non riesco a creare una copia locale: ripristino annullato per proteggere i dati attuali'); return; }
  }
  db = normalizeDb(pendingRestore); pendingRestore = null;
  state.ym = null; state.slip = -1; applyTheme(); persist(); closeModal(); pickStartMonth(); render(); toast('Copia ripristinata');
}

/* ---------- render ---------- */
function pickStartMonth() {
  const ml = months(), rich = ml.filter((x) => monthTx(x).length >= 8);
  state.ym = rich.length ? rich[rich.length - 1] : ml[ml.length - 1];
}
let lastAnimKey = '';
function animateNumbers() {
  const els = [...document.querySelectorAll('[data-count]')];
  const key = state.view + '|' + state.ym + '|' + state.yv;
  const go = key !== lastAnimKey && !window.__noAnim && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  lastAnimKey = key;
  if (!go || !els.length) return;
  const f = { '0': eur0, '2': eur, n: (v) => String(v) };
  els.forEach((el) => { el._to = +el.dataset.count; el._f = f[el.dataset.fmt || '2'] || eur; });
  const t0 = performance.now(), D = 650;
  (function step(now) {
    const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
    els.forEach((el) => { el.textContent = el._f(Math.round(el._to * e)); });
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function render() {
  ensureMonth();
  const titles = { riepilogo:'Riepilogo', anno:'Anno', abbonamenti:'Abbonamenti', calendario:'Calendario delle spese', investimenti:'Investimenti', cerca:'Cerca', buste:'Buste paga', impostazioni:'Impostazioni' };
  $('title').textContent = titles[state.view] || SOURCES[state.view].name;
  const strip = $('mstrip'), show = state.view === 'riepilogo' || state.view === 'calendario' || !!SOURCES[state.view];
  $('periodPicker').style.display = show ? 'grid' : 'none';
  if (show) {
    const years = periodYears();
    $('periodYear').innerHTML = years.map((year) => '<option value="' + year + '"' + (year === state.ym.slice(0, 4) ? ' selected' : '') + '>' + year + '</option>').join('');
    strip.innerHTML = MLONG.map((month, i) => {
      const ym = state.ym.slice(0, 4) + '-' + String(i + 1).padStart(2, '0');
      return '<button data-month="' + ym + '" class="' + (ym === state.ym ? 'on' : '') + '" role="button" aria-pressed="' + (ym === state.ym) + '">' + month + '</button>';
    }).join('');
  }
  renderNav();
  const v = state.view;
  $('view').innerHTML = v === 'riepilogo' ? viewRiepilogo() : v === 'anno' ? viewAnno() : v === 'abbonamenti' ? viewSubs() : v === 'calendario' ? viewCalendar() : v === 'investimenti' ? viewInvest() :
    v === 'cerca' ? viewSearch() : v === 'buste' ? viewBuste() : v === 'impostazioni' ? viewSettings() : viewSource(v);
  document.querySelectorAll('.trend.dense').forEach((t) => t.classList.toggle('many', t.children.length > 14));
  animateNumbers();
  const tp = $('tip'); if (tp) tp.classList.remove('on');
}

/* ---------- finestre ---------- */
const modal = $('modal'), sheet = $('sheet');
function openModal(html) { sheet.innerHTML = html; modal.classList.add('open'); const f = sheet.querySelector('input,select,button'); if (f) f.focus(); }
function closeModal() { modal.classList.remove('open'); pendingSlips = []; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openAdd(src, quick) {
  const opts = Object.keys(SOURCES).map((k) => '<option value="' + k + '"' + (k === src ? ' selected' : '') + '>' + esc(SOURCES[k].name) + '</option>').join('');
  const day = quick || state.ym === nowYm() ? localToday() : state.ym + '-15';
  const seen = new Set();
  quickCandidates = db.txs.slice().sort(sortDesc).filter((t) => {
    if (t.transfer || t.invest || t.payslip || !SOURCES[t.src]) return false;
    const key = L.merchantKey(t.desc) + '|' + t.cat + '|' + t.src;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 5);
  const presets = quickCandidates.length
    ? '<div class="quick-presets"><span>Ripeti un movimento recente</span><div class="chips">' + quickCandidates.map((t, i) =>
      '<button type="button" class="chip quick-chip" data-quick="' + i + '">' + esc(t.desc) + ' · ' + eur(Math.abs(t.amt)) + '</button>').join('') + '</div></div>'
    : '<p class="kv quick-empty">Dopo aver registrato dei movimenti potrai ripeterli da qui con un tocco.</p>';
  openModal('<h2>Aggiungi movimento</h2><div class="form" id="addForm">' +
    presets +
    '<label>Descrizione<input type="text" name="desc" maxlength="80" placeholder="Per esempio: Caffè"></label>' +
    '<div class="two"><label>Importo in euro<input type="number" name="amt" min="0.01" step="0.01" placeholder="0,00"></label>' +
    '<label>Tipo<select name="kind"><option value="out">Spesa</option><option value="in">Entrata</option></select></label></div>' +
    '<div class="two"><label>Categoria<select name="cat">' + CATS.map((c) => '<option>' + c + '</option>').join('') + '</select></label>' +
    '<label>Data<input type="date" name="date" value="' + day + '"></label></div>' +
    '<label>Servizio<select name="src">' + opts + '</select></label>' +
    '<div class="actions"><button class="btn" data-action="close">Annulla</button><button class="btn primary" data-action="saveadd">Salva movimento</button></div></div>');
}
function applyQuickPreset(index) {
  const tx = quickCandidates[index], form = $('addForm');
  if (!tx || !form) return;
  form.querySelector('[name=desc]').value = tx.desc;
  form.querySelector('[name=amt]').value = (Math.abs(tx.amt) / 100).toFixed(2);
  form.querySelector('[name=kind]').value = tx.amt > 0 ? 'in' : 'out';
  form.querySelector('[name=cat]').value = tx.cat;
  form.querySelector('[name=date]').value = localToday();
  form.querySelector('[name=src]').value = tx.src;
  toast('Movimento recente pronto da registrare');
}
function saveAdd() {
  const f = $('addForm'), v = (n) => f.querySelector('[name=' + n + ']').value;
  const desc = v('desc').trim(), cents = centsOf(v('amt')), date = v('date');
  if (!desc || cents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Compila descrizione, importo e data'); return; }
  const id = 'man:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.txs.push({ id, key:id, src:v('src'), date, desc, cat:v('cat'), amt:v('kind') === 'out' ? -cents : cents, transfer:false, manual:true, catLocked:true });
  state.ym = date.slice(0, 7);
  persist(); closeModal(); render(); toast('Movimento salvato');
}

function slipForm(p, i) {
  const s = p.slip;
  const inp = (label, name, val, extra) => '<label>' + label + '<input ' + (extra || 'type="number" step="0.01"') + ' name="' + name + '" value="' + esc(val) + '"></label>';
  return '<div class="slipform" data-i="' + i + '"><h3>' + esc(p.name) + '</h3>' + p.warnings.map((w) => '<p class="warnline">' + esc(w) + '</p>').join('') +
    (db.slips.some((x) => x.ym === s.ym) ? '<p class="warnline">Esiste già una busta paga di questo mese: verrà sostituita.</p>' : '') +
    '<div class="grid2">' +
    inp('Mese', 'ym', s.ym || '', 'type="month"') + inp('Data di accredito', 'valuta', s.valuta || '', 'type="date"') + inp('Netto in busta (€)', 'netto', euroInput(s.netto)) +
    inp('Retribuzione fissa (€)', 'fisso', euroInput(s.fisso)) + inp('Lordo del mese (€)', 'lordo', euroInput(s.lordo)) + inp('Contributi INPS (€)', 'inps', euroInput(s.inps)) +
    inp('IRPEF (€)', 'irpef', euroInput(s.irpef)) + inp('Addizionali (€)', 'addiz', euroInput(s.addiz)) + '</div></div>';
}

function openImportResult(lines, nAuto) {
  const rows = lines.map((l) => '<div class="row" style="align-items:flex-start"><div><b>' + esc(l.name) + '</b><div class="m">' + esc(KIND_LABEL[l.kind] || '') + '</div>' +
    (l.info || []).map((x) => '<div class="m">' + esc(x) + '</div>').join('') + (l.warnings || []).map((x) => '<div class="warnline">' + esc(x) + '</div>').join('') + '</div>' +
    '<div class="m" style="text-align:right">' + (l.bad ? '' : l.added + ' nuovi' + (l.dup ? '<br>' + l.dup + ' già presenti' : '')) + '</div></div>').join('');
  const extra = (nAuto ? '<p class="okline">Riconosciuti ' + nAuto + ' giroconti tra i tuoi conti.</p>' : '') +
    (!db.settings.ownNames.length && lines.some((l) => l.added) ? '<p class="warnline">Scrivi il tuo nome in Impostazioni per riconoscere anche i bonifici a te stesso.</p>' : '');
  const forms = pendingSlips.length
    ? '<h2 style="margin-top:16px">Controlla le buste paga</h2><p style="color:var(--muted);margin:0">Ho letto questi valori dai PDF. Correggi se qualcosa non torna, poi salva. Codice fiscale, indirizzo e IBAN non vengono salvati.</p>' + pendingSlips.map(slipForm).join('')
    : '';
  openModal('<h2>' + (lines.length ? 'Importazione completata' : 'Importa buste paga') + '</h2>' + rows + extra + forms +
    '<div class="actions">' + (pendingSlips.length
      ? '<button class="btn" data-action="close">Annulla</button><button class="btn primary" data-action="saveslips">Salva buste paga</button>'
      : '<button class="btn primary" data-action="close">Chiudi</button>') + '</div>');
}

function saveSlips() {
  const forms = [...sheet.querySelectorAll('.slipform')];
  const built = [];
  for (const f of forms) {
    const v = (n) => f.querySelector('[name=' + n + ']').value;
    const orig = pendingSlips[+f.dataset.i].slip;
    const ym = v('ym'), netto = centsOf(v('netto')), lordo = centsOf(v('lordo')), fisso = centsOf(v('fisso')) || lordo;
    if (!/^\d{4}-\d{2}$/.test(ym) || netto <= 0 || lordo <= 0) { toast('Controlla mese, netto e lordo di ogni busta paga'); return; }
    const inps = centsOf(v('inps')), irpef = centsOf(v('irpef')), addiz = centsOf(v('addiz'));
    built.push({ ym, fisso, lordo, extra:Math.max(0, lordo - fisso), inps, irpef, addiz, trattenute:lordo - netto,
      altro:Math.max(0, lordo - netto - inps - irpef - addiz), netto, valuta:v('valuta') || payDate(ym),
      ticketN:orig.ticketN || 0, ticketUnit:orig.ticketUnit || 0, fileName:orig.fileName || '' });
  }
  built.forEach((s) => L.saveSlip(db, s));
  L.applyTransfers(db);
  const lastYm = built.map((s) => s.ym).sort().pop();
  state.view = 'buste'; state.year = 'tutti'; state.slip = db.slips.findIndex((s) => s.ym === lastYm);
  pendingSlips = [];
  persist(); closeModal(); render(); toast(built.length === 1 ? 'Busta paga salvata' : built.length + ' buste paga salvate');
}

/* ---------- importazione file ---------- */
async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => /\.(csv|pdf)$/i.test(f.name));
  if (!files.length) { toast('Scegli file CSV o PDF'); return; }
  toast('Leggo i file…');
  let results;
  try {
    const payload = [];
    for (const f of files) payload.push({ name:f.name, data:new Uint8Array(await f.arrayBuffer()) });
    results = await api.parse(payload);
  } catch (e) { toast('Non sono riuscito a leggere i file'); return; }
  const lines = []; pendingSlips = [];
  for (const r of results) {
    if (r.slips.length) { r.slips.forEach((s) => pendingSlips.push({ slip:s, name:r.name, warnings:r.warnings })); continue; }
    if (['trade', 'paypal', 'revolut', 'buddy', 'flexia'].includes(r.kind)) {
      const m = L.mergeTxs(db, r.txs); db.imports[r.kind] = todayIso();
      if (db.settings.statementSnoozed) delete db.settings.statementSnoozed[r.kind];
      lines.push({ name:r.name, kind:r.kind, added:m.added, dup:m.dup, info:r.info, warnings:r.warnings });
    } else lines.push({ name:r.name, kind:r.kind, added:0, dup:0, info:r.info, warnings:r.warnings, bad:true });
  }
  const nAuto = L.applyTransfers(db);
  L.linkSalary(db);
  const m = months(), rich = m.filter((x) => monthTx(x).length >= 8);
  state.ym = rich.length ? rich[rich.length - 1] : m[m.length - 1];
  persist(); render(); openImportResult(lines, nAuto);
}

/* ---------- eventi ---------- */
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-action],[data-view],[data-filter],[data-slip],[data-year],[data-month],[data-gomonth],[data-yv],[data-iy],[data-gf],[data-set-theme],[data-accent],[data-quick]');
  if (!a) return;
  const d = a.dataset;
  if (d.quick != null) { applyQuickPreset(parseInt(d.quick, 10)); return; }
  if (d.view) { state.view = d.view; state.filter = 'tutti'; state.q = ''; render(); window.scrollTo(0, 0); return; }
  if (d.filter) { state.filter = d.filter; render(); return; }
  if (d.year) { state.year = d.year; render(); return; }
  if (d.slip) { state.slip = parseInt(d.slip, 10); render(); return; }
  if (d.month) { state.ym = d.month; render(); return; }
  if (d.gomonth) { state.ym = d.gomonth; state.view = 'riepilogo'; render(); window.scrollTo(0, 0); return; }
  if (d.yv) { state.yv = d.yv; render(); return; }
  if (d.iy) { state.iy = d.iy; render(); return; }
  if (d.gf) { state.gf = d.gf; render(); const q = $('gq'); if (q) q.focus(); return; }
  if (d.setTheme) { db.settings.theme = d.setTheme; applyTheme(); persist(); render(); return; }
  if (d.accent) { db.settings.accent = d.accent; applyTheme(); persist(); render(); return; }
  const act = d.action, id = d.id;
  const tx = id ? db.txs.find((x) => x.id === id) : null;
  if (act === 'import') $('filePick').click();
  else if (act === 'addtx') openAdd(d.src);
  else if (act === 'quickadd') openAdd(null, true);
  else if (act === 'import-statement') $('filePick').click();
  else if (act === 'snooze-statement') {
    const [year, month, day] = localToday().split('-').map(Number);
    db.settings.statementSnoozed = db.settings.statementSnoozed || {};
    db.settings.statementSnoozed[d.src] = new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
    persist(); render(); toast('Promemoria posticipato di 7 giorni');
  }
  else if (act === 'toggle-reminders') {
    db.settings.statementReminders = db.settings.statementReminders === false;
    persist(); render(); toast(db.settings.statementReminders ? 'Promemoria attivati' : 'Promemoria disattivati');
  }
  else if (act === 'saveadd') saveAdd();
  else if (act === 'saveslips') saveSlips();
  else if (act === 'close') closeModal();
  else if (act === 'cat') openCategory(d.cat, d.scope);
  else if (act === 'toggle' && tx) { tx.transfer = !tx.transfer; tx.locked = true; tx.auto = false; delete tx.suggest; persist(); render(); }
  else if (act === 'del' && tx) { db.txs.splice(db.txs.indexOf(tx), 1); persist(); render(); toast('Movimento eliminato'); }
  else if (act === 'confirm' && tx) {
    const b = db.txs.find((x) => x.id === tx.suggest);
    [tx, b].filter(Boolean).forEach((x) => { x.transfer = true; x.auto = true; delete x.suggest; });
    persist(); render(); toast('Segnati come giroconto');
  } else if (act === 'dismiss' && tx) {
    const b = db.txs.find((x) => x.id === tx.suggest);
    [tx, b].filter(Boolean).forEach((x) => { x.noSuggest = true; delete x.suggest; });
    persist(); render();
  } else if (act === 'hidesub') { db.settings.hiddenSubs = (db.settings.hiddenSubs || []).concat(d.key); persist(); render(); toast('Nascosto dagli abbonamenti'); }
  else if (act === 'showsubs') { db.settings.hiddenSubs = []; persist(); render(); }
  else if (act === 'delslip') {
    openModal('<h2>Eliminare la busta paga?</h2><p style="color:var(--muted)">Togli la busta di ' + esc(mLong(d.ym)) + ' e l\'entrata dello stipendio che avevo inserito per lei.</p><div class="actions"><button class="btn" data-action="close">Annulla</button><button class="btn danger" data-action="delslipok" data-ym="' + esc(d.ym) + '">Elimina</button></div>');
  } else if (act === 'delslipok') {
    db.slips = db.slips.filter((s) => s.ym !== d.ym); L.linkSalary(db); state.slip = -1;
    persist(); closeModal(); render(); toast('Busta paga eliminata');
  } else if (act === 'addname') addName();
  else if (act === 'delname') { db.settings.ownNames.splice(+d.i, 1); persist(); render(); }
  else if (act === 'delrule') { db.rules.splice(+d.i, 1); persist(); render(); }
  else if (act === 'backup') {
    persist();
    api.save(db).then(() => api.exportBackup())
      .then((r) => toast(r.ok ? (window.FINANZE_WEB ? 'Backup scaricato' : 'Copia salvata') : r.reason))
      .catch(() => toast('Non sono riuscito a creare la copia dei dati'));
  }
  else if (act === 'restore') $('restorePick').click();
  else if (act === 'restoreok') await doRestore();
  else if (act === 'export-tx') exportCsv('tx');
  else if (act === 'export-slips') exportCsv('slips');
  else if (act === 'folder') api.openFolder();
  else if (act === 'wipe') {
    openModal('<h2>Cancellare tutti i dati?</h2><p style="color:var(--muted)">' + (window.FINANZE_WEB ? 'Spariranno movimenti, buste paga e regole salvati in questo browser. Prima creo una copia locale di sicurezza.' : 'Spariscono movimenti, buste paga e regole da questo PC. Prima salvo una copia di sicurezza nella cartella dei dati, così puoi recuperarli se serve.') + '</p><div class="actions"><button class="btn" data-action="close">Annulla</button><button class="btn danger" data-action="wipeok">Cancella tutto</button></div>');
  } else if (act === 'wipeok') {
    try { await api.snapshot('prima-cancellazione'); } catch (er) {
      if (window.FINANZE_WEB) { toast('Non riesco a creare una copia locale: cancellazione annullata per proteggere i dati'); return; }
    }
    db = L.newDb(); state.ym = null; state.slip = -1; applyTheme(); persist(); closeModal(); render(); toast('Dati cancellati');
  }
});

function addName() {
  const input = $('newName'), v = input.value.trim();
  if (v.split(/\s+/).length < 2) { toast('Scrivi nome e cognome'); return; }
  if (!db.settings.ownNames.includes(v)) db.settings.ownNames.push(v);
  const n = L.applyTransfers(db);
  persist(); render(); toast(n ? 'Riconosciuti ' + n + ' giroconti in più' : 'Nome aggiunto');
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'periodYear') { state.ym = el.value + '-' + state.ym.slice(5); render(); return; }
  if (el.id === 'filePick') { const fl = [...el.files]; el.value = ''; if (fl.length) handleFiles(fl); return; }
  if (el.id === 'restorePick') { const f = el.files[0]; el.value = ''; if (f) f.text().then(handleRestoreText); return; }
  if (el.id === 'mens') { db.settings.mens = +el.value; persist(); render(); return; }
  if (el.id === 'statementReminderDays') { db.settings.statementReminderDays = +el.value; persist(); render(); return; }
  if (el.id === 'salarySrc') { db.settings.salarySrc = el.value; L.linkSalary(db); persist(); render(); toast('Stipendio spostato su ' + SOURCES[el.value].name); return; }
  if (el.matches('select.cat')) {
    const t = db.txs.find((x) => x.id === el.dataset.id);
    if (t) { t.cat = el.value; L.setRule(db, t.desc, el.value); persist(); render(); toast('Da ora «' + t.desc + '» va in ' + el.value); }
  }
});
function keepFocus(id, key) {
  return (e) => {
    if (e.target.id !== id) return;
    state[key] = e.target.value; const pos = e.target.selectionStart; render();
    const q = $(id); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  };
}
document.addEventListener('input', (e) => { keepFocus('q', 'q')(e); keepFocus('gq', 'gq')(e); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'newName') { e.preventDefault(); addName(); } });

/* suggerimenti al passaggio del mouse (grafici) e evidenza della categoria */
const tip = $('tip');
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && tip) { tip.textContent = t.dataset.tip; tip.classList.add('on'); }
  const c = e.target.closest && e.target.closest('[data-cat]');
  document.querySelectorAll('.catrow.hot').forEach((r) => r.classList.remove('hot'));
  if (c) document.querySelectorAll('.catrow').forEach((r) => { if (r.dataset.cat === c.dataset.cat) r.classList.add('hot'); });
});
document.addEventListener('mousemove', (e) => {
  if (!tip || !tip.classList.contains('on')) return;
  if (!(e.target.closest && e.target.closest('[data-tip]'))) { tip.classList.remove('on'); return; }
  tip.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8)) + 'px';
  tip.style.top = (e.clientY + 18) + 'px';
});
document.addEventListener('mouseout', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && tip) tip.classList.remove('on');
  if (e.target.closest && e.target.closest('[data-cat]')) document.querySelectorAll('.catrow.hot').forEach((r) => r.classList.remove('hot'));
});

/* trascina i file nella finestra */
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('dropveil').classList.add('on'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropveil').classList.remove('on'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('dropveil').classList.remove('on'); if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ---------- avvio ---------- */
async function init() {
  try {
    const r = await api.load();
    if (r && r.data) {
      db = normalizeDb(r.data);
      if (r.recovered) toast('Ho ripristinato i dati dall\'ultimo backup');
    }
  } catch (e) { toast('Non sono riuscito a leggere i dati salvati'); }
  try { state.info = await api.info(); } catch (e) { /* non essenziale */ }
  applyTheme();
  pickStartMonth(); ensureMonth(); render();
  if (api.ready) api.ready(); /* a questo punto la schermata di caricamento può chiudersi */
}
window.__finanze = { get db() { return db; }, state, render, handleFiles, csvTx, csvSlips, handleRestoreText, applyTheme };
init();
})();
