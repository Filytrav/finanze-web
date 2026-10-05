/*
 * Logica dei dati (funziona nella finestra dell'app e nei test).
 * Nessuna chiamata di rete: lavora solo sui dati che hai già sul PC.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const toDay = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);

  const normText = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nameTokens = (s) => normText(s).replace(/[^a-zà-ù' ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');

  /* Il nome è tuo se le parole coincidono con uno dei tuoi nomi, in qualunque ordine
     (anche se manca il secondo nome: "Filippo Travaglia" = "Filippo Emanuele Travaglia"). */
  function isOwnName(name, ownNames) {
    if (!name || !ownNames || !ownNames.length) return false;
    const a = nameTokens(name).split(' ').filter(Boolean);
    if (a.length < 2) return false;
    return ownNames.some((n) => {
      const b = nameTokens(n).split(' ').filter(Boolean);
      if (b.length < 2) return false;
      const [small, big] = a.length <= b.length ? [a, b] : [b, a];
      return small.every((w) => big.includes(w));
    });
  }

  function newDb() {
    return {
      version: 1,
      txs: [],
      slips: [],
      rules: [],
      settings: { ownNames: [], salarySrc: 'buddy', mens: 14, firstRunDone: false, theme: 'dark', accent: 'violet',
        statementReminders: true, statementReminderDays: 30, statementSnoozed: {} },
      imports: {},
    };
  }

  /* Regole di categoria scelte da te (descrizione uguale -> categoria). */
  function applyRules(db, onlyTxs) {
    const map = new Map(db.rules.map((r) => [r.match, r.cat]));
    (onlyTxs || db.txs).forEach((t) => {
      if (t.catLocked) return;
      const c = map.get(normText(t.desc));
      if (c) t.cat = c;
    });
  }
  function setRule(db, desc, cat) {
    const m = normText(desc);
    const r = db.rules.find((x) => x.match === m);
    if (r) r.cat = cat; else db.rules.push({ match: m, cat });
    db.txs.forEach((t) => { if (!t.catLocked && normText(t.desc) === m) t.cat = cat; });
  }

  /* Aggiunge i movimenti nuovi, senza duplicati (stessa chiave = stesso movimento). */
  function mergeTxs(db, txs) {
    const have = new Set(db.txs.map((t) => t.key || t.id));
    let added = 0, dup = 0;
    const fresh = [];
    txs.forEach((t) => {
      if (have.has(t.key)) { dup++; return; }
      have.add(t.key);
      const n = Object.assign({ id: t.key, transfer: false }, t);
      db.txs.push(n); fresh.push(n); added++;
    });
    applyRules(db, fresh);
    return { added, dup };
  }

  /*
   * Giroconti: spostamenti di soldi tra i tuoi conti, che non sono spese né entrate.
   * 1) segnali sicuri: versamenti/prelievi tra conti, bonifici a te stesso
   * 2) coppie con importo opposto in conti diversi a pochi giorni di distanza
   * 3) coppie meno sicure -> "da rivedere"
   */
  function applyTransfers(db) {
    const own = db.settings.ownNames;
    let nAuto = 0;
    const mark = (t) => { if (!t.transfer) { t.transfer = true; t.auto = true; nAuto++; } };
    const free = (t) => !t.locked && !t.transfer;

    db.txs.forEach((t) => {
      if (t.locked) return;
      if (t.hint === 'funding' || t.hint === 'withdraw' || t.hint === 'walletIn') mark(t);
      else if (t.party && isOwnName(t.party, own)) mark(t);
    });

    const cand = db.txs.filter(free);
    const used = new Set();
    for (const a of cand) {
      if (a.amt >= 0 || used.has(a.id)) continue;
      let best = null;
      for (const b of db.txs) {
        if (b === a || b.src === a.src || b.amt !== -a.amt || b.locked) continue;
        if (used.has(b.id)) continue;
        const d = Math.abs(toDay(a.date) - toDay(b.date));
        if (d > 3) continue;
        const aHint = a.hint === 'walletOut' || (a.party && isOwnName(a.party, own));
        const bHint = b.transfer || b.hint === 'walletIn' || b.hint === 'funding';
        const strong = aHint || (bHint && (a.kind === 'transfer' || a.hint));
        const weakOk = a.kind === 'transfer' && (b.kind === 'transfer' || b.transfer) && d <= 1 && Math.abs(a.amt) >= 2000;
        if (!strong && !weakOk) continue;
        if (!strong && (a.noSuggest || b.noSuggest)) continue;
        if (!best || d < best.d) best = { b, d, strong };
      }
      if (!best) continue;
      used.add(a.id); used.add(best.b.id);
      if (best.strong) { mark(a); mark(best.b); }
      else { a.suggest = best.b.id; best.b.suggest = a.id; }
    }
    return nAuto;
  }

  /* Stipendio: ogni busta paga genera l'entrata del netto sul conto di accredito,
     a meno che nei movimenti importati ci sia già quell'accredito. */
  function linkSalary(db) {
    const gen = new Map(db.txs.filter((t) => t.slipYm).map((t) => [t.slipYm, t]));
    db.slips.forEach((s) => {
      if (!s.valuta || !s.netto) return;
      const real = db.txs.find((t) => !t.slipYm && t.amt === s.netto && !t.transfer &&
        Math.abs(toDay(t.date) - toDay(s.valuta)) <= 3);
      const g = gen.get(s.ym);
      if (real) {
        real.cat = 'Stipendio'; real.payslip = true; real.catLocked = true;
        if (g) db.txs.splice(db.txs.indexOf(g), 1);
        return;
      }
      const tx = {
        id: 'slip:' + s.ym, key: 'slip:' + s.ym, slipYm: s.ym, src: db.settings.salarySrc || 'buddy',
        date: s.valuta, desc: 'Stipendio', cat: 'Stipendio', amt: s.netto, transfer: false, payslip: true, auto: true,
      };
      if (g) Object.assign(g, tx, { transfer: g.transfer, locked: g.locked }); else db.txs.push(tx);
    });
    /* busta paga eliminata -> via anche l'accredito generato */
    const yms = new Set(db.slips.map((s) => s.ym));
    db.txs = db.txs.filter((t) => !t.slipYm || yms.has(t.slipYm));
  }

  function saveSlip(db, slip) {
    const i = db.slips.findIndex((s) => s.ym === slip.ym);
    if (i >= 0) db.slips[i] = slip; else db.slips.push(slip);
    db.slips.sort((a, b) => a.ym.localeCompare(b.ym));
    linkSalary(db);
  }

  function totals(list) {
    let entrate = 0, uscite = 0, investito = 0, giroconti = 0, nGiro = 0;
    list.forEach((t) => {
      if (t.transfer) { giroconti += Math.abs(t.amt); nGiro++; return; }
      if (t.invest) { investito += -t.amt; return; }
      if (t.amt > 0) entrate += t.amt; else uscite += -t.amt;
    });
    return { entrate, uscite, investito, rimasto: entrate - uscite - investito, giroconti, nGiro };
  }

  /* Abbonamenti: spese che tornano ogni mese, con importo simile, per almeno 3 mesi. */
  const merchantKey = (d) => normText(d).replace(/[0-9*#._\/\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  function detectRecurring(txs) {
    const groups = new Map();
    let ref = '0000-00-00';
    txs.forEach((t) => {
      if (t.date > ref) ref = t.date;
      if (t.transfer || t.invest || t.amt >= 0) return;
      const k = merchantKey(t.desc);
      if (k.length < 3) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    });
    const out = [];
    groups.forEach((arr, k) => {
      const perMonth = new Map();
      arr.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => { const m = t.date.slice(0, 7); if (!perMonth.has(m)) perMonth.set(m, t); });
      const list = [...perMonth.values()];
      if (list.length < 3) return;
      const gaps = list.slice(1).map((t, i) => toDay(t.date) - toDay(list[i].date));
      const okGaps = gaps.filter((g) => g >= 24 && g <= 38).length;
      if (okGaps / gaps.length < 0.6) return;
      const amts = list.map((t) => -t.amt), med = median(amts);
      const stable = amts.filter((a) => Math.abs(a - med) <= med * 0.25).length / amts.length >= 0.6;
      if (!stable && !list.some((t) => t.cat === 'Abbonamenti')) return;
      const last = list[list.length - 1];
      out.push({ key: k, name: last.desc, cat: last.cat, src: last.src, amt: -last.amt, count: list.length,
        first: list[0].date, last: last.date, annual: -last.amt * 12,
        active: toDay(ref) - toDay(last.date) <= 50 });
    });
    return out.sort((a, b) => (b.active - a.active) || (b.amt - a.amt));
  }

  function recurringCalendar(txs, ym, hidden) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(ym || '')) return [];
    const ignored = new Set(hidden || []);
    const groups = new Map();
    txs.forEach((t) => {
      if (t.transfer || t.invest || t.amt >= 0) return;
      const key = merchantKey(t.desc);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    const detected = detectRecurring(txs).filter((r) => r.active && !ignored.has(r.key));
    const daysInMonth = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5), 10), 0)).getUTCDate();
    const events = [];
    detected.forEach((recurring) => {
      const transactions = groups.get(recurring.key) || [];
      const actual = transactions.filter((t) => t.date.slice(0, 7) === ym).sort((a, b) => a.date.localeCompare(b.date));
      if (actual.length) {
        events.push({ key:recurring.key, name:recurring.name, cat:recurring.cat, src:recurring.src,
          date:actual[0].date, amt:-actual[0].amt, paid:true });
        return;
      }
      if (ym <= recurring.last.slice(0, 7)) return;
      const day = Math.min(Number(recurring.last.slice(8, 10)), daysInMonth);
      events.push({ key:recurring.key, name:recurring.name, cat:recurring.cat, src:recurring.src,
        date:ym + '-' + String(day).padStart(2, '0'), amt:recurring.amt, paid:false });
    });
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }

  function statementReminders(sources, imports, interval, today, snoozed) {
    const current = toDay(today);
    const every = Number.isFinite(Number(interval)) ? Math.max(1, Number(interval)) : 30;
    return sources.map((source) => {
      const last = imports[source.key];
      if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return { ...source, last:null, status:'never', days:null };
      const days = current - toDay(last);
      const snooze = snoozed && snoozed[source.key];
      const muted = snooze && /^\d{4}-\d{2}-\d{2}$/.test(snooze) && toDay(snooze) > current;
      return { ...source, last, days, status:muted ? 'snoozed' : days >= every ? 'due' : 'ok' };
    });
  }

  const api = { detectRecurring, recurringCalendar, statementReminders, merchantKey, normText, nameTokens, isOwnName, newDb, applyRules, setRule, mergeTxs, applyTransfers, linkSalary, saveSlip, totals, toDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
