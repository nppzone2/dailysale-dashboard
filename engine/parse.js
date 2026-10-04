/* ===== Data engine: nhận diện file, chuẩn hoá & gộp vào STATE ===== */
const KINDS = {
  items:   { label: 'Item Master',              need: ['ShortCode', 'BrandGroup', 'hl'] },
  hist:    { label: 'Target Total (lịch sử)',   need: ['Target (Case)', 'calendar_month', 'Distributor_Name'] },
  target:  { label: 'Target Current Month',     need: ['Ref', 'Alpha_Name', 'Unit'] },
  si:      { label: 'SO Invoice (Sale In)',     need: ['InvoiceNumber', 'UOM_Invoice', 'Date_ID'] },
  so:      { label: 'SaleOut by Seller',        need: ['Seller_Name', 'Outlet_ID', 'UOM'] },
  alloc:   { label: 'Allocation Current Month', need: ['WEEK', 'Alpha_Name', 'Allocation'] },
  allocdates: { label: 'Allocation · Upload Date', need: ['WEEK', 'WEEK No'] },
  orders:  { label: 'Online Order (SO chờ giao)', need: ['Order Number', 'Status', 'ShortCode', 'Sum of Case'] }
};
const KIND_ORDER = ['items', 'hist', 'si', 'so', 'orders', 'alloc', 'allocdates', 'target'];

function cleanStr(v) { return v == null ? '' : String(v).trim(); }
function num(v) { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; }
function nppCode(name) { return cleanStr(name).split('-')[0].trim(); }
function nppFull(name) { const s = cleanStr(name); const i = s.indexOf('-'); return i < 0 ? s : s.slice(i + 1).trim(); }

/* Tìm dòng tiêu đề trong 15 dòng đầu, trả về {kind, header, rows} */
function detect(aoa) {
  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const row = (aoa[r] || []).map(cleanStr);
    for (const k of Object.keys(KINDS)) {
      if (KINDS[k].need.every(n => row.includes(n))) {
        const idx = {}; row.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
        const rows = aoa.slice(r + 1).filter(x => x && x.some(v => v != null && v !== ''));
        return { kind: k, idx, rows };
      }
    }
  }
  return null;
}

function emptyState() {
  return { v: 1, updatedAt: {}, items: {}, npps: {}, months: {}, cur: { month: '', target: [], si: {}, so: {}, alloc: [] } };
}

function touchNpp(state, rawName, area, dis) {
  const c = nppCode(rawName); if (!c) return c;
  const n = state.npps[c] || (state.npps[c] = { name: '', area: '' });
  const full = nppFull(rawName); if (full && full !== c) n.name = full;
  if (area) n.area = cleanStr(area);
  if (dis != null && cleanStr(dis)) n.dis = cleanStr(dis).replace(/\.0+$/, '');
  return c;
}

function resetCur(state, month) {
  state.cur = { month, target: [], si: {}, so: {}, alloc: [] };
}

/* opts: { month: 'YYYYMM' (tháng hiện hành cho Target/Allocation), soDate: 'YYYYMMDD', now: ISO } */
function applyParsed(state, p, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const g = (row, col) => row[p.idx[col]];
  const has = col => col in p.idx;
  const msg = { kind: p.kind, label: KINDS[p.kind].label, rows: p.rows.length, note: '' };

  if (p.kind === 'items') {
    const items = {};
    p.rows.forEach(r => {
      const sc = cleanStr(g(r, 'ShortCode')); if (!sc) return;
      const hl = g(r, 'hl');
      items[sc] = { b: has('BrandFamily') ? cleanStr(g(r, 'BrandFamily')) : has('BrandName') ? cleanStr(g(r, 'BrandName')) : '', bg: cleanStr(g(r, 'BrandGroup')), g: has('Group') ? cleanStr(g(r, 'Group')) : '', hl: hl == null || hl === '' ? null : num(hl) };
    });
    state.items = items; msg.note = Object.keys(items).length + ' mã SKU';
  }

  if (p.kind === 'hist') {
    const by = {};
    p.rows.forEach(r => {
      const m = cleanStr(g(r, 'calendar_month')).slice(0, 6); const sc = cleanStr(g(r, 'ShortCode'));
      if (!/^\d{6}$/.test(m) || !sc) return;
      const c = touchNpp(state, g(r, 'Distributor_Name'), has('Area') ? g(r, 'Area') : '');
      (by[m] = by[m] || []).push([c, sc,
        num(g(r, 'Target (Case)')), num(g(r, 'Target (Htls)')),
        num(g(r, 'Sales In (Case)')), num(g(r, 'Sales In (Htls)')),
        num(g(r, 'Sales Out (Case)')), num(g(r, 'Sales Out (Htls)'))]);
    });
    Object.keys(by).forEach(m => { state.months[m] = { rows: by[m], at: now }; });
    msg.note = 'Tháng ' + Object.keys(by).map(fmtMonth).join(', ');
  }

  if (p.kind === 'si') {
    const si = {}; let maxM = '';
    const inv = {}; const lines = []; const ship = {};
    p.rows.forEach(r => {
      const d = cleanStr(g(r, 'Date_ID')).replace(/\D/g, '').slice(0, 8); const sc = cleanStr(g(r, 'ShortCode'));
      if (d.length !== 8 || !sc) return;
      if (d.slice(0, 6) > maxM) maxM = d.slice(0, 6);
      const c = touchNpp(state, g(r, 'Distributor_Name'), has('Area_Name') ? g(r, 'Area_Name') : '', has('Distributor_ID') ? g(r, 'Distributor_ID') : null);
      const day = si[d] || (si[d] = {});
      day[c + '|' + sc] = (day[c + '|' + sc] || 0) + num(g(r, 'UOM_Invoice'));
      (inv[d + '|' + c] = inv[d + '|' + c] || new Set()).add(cleanStr(g(r, 'InvoiceNumber')));
      const st = has('ShipTo') ? cleanStr(g(r, 'ShipTo')) : ''; if (st && has('ShipTo_Name')) ship[st] = cleanStr(g(r, 'ShipTo_Name'));
      lines.push([d, c, cleanStr(g(r, 'InvoiceNumber')), has('Document Type') ? cleanStr(g(r, 'Document Type')) : '', st, sc, num(g(r, 'UOM_Invoice'))]);
    });
    if (maxM && maxM !== state.cur.month) {
      const keepTarget = opts.month === maxM ? state.cur.target : [];
      const keepAlloc = opts.month === maxM ? state.cur.alloc : [];
      resetCur(state, maxM); state.cur.target = keepTarget; state.cur.alloc = keepAlloc;
    }
    const out = {};
    Object.keys(si).filter(d => d.slice(0, 6) === state.cur.month).forEach(d => {
      out[d] = Object.entries(si[d]).map(([k, v]) => { const [c, sc] = k.split('|'); return [c, sc, v]; });
    });
    const invOut = {};
    Object.entries(inv).forEach(([k, s]) => { if (k.slice(0, 6) === state.cur.month) invOut[k] = s.size; });
    state.cur.si = out; state.cur.inv = invOut;
    state.cur.lines = lines.filter(l => l[0].slice(0, 6) === state.cur.month).sort((a, b) => (a[0] + a[1] + a[2]).localeCompare(b[0] + b[1] + b[2])); state.cur.ship = ship;
    const days = Object.keys(out).sort();
    msg.note = days.length ? ('Ngày ' + fmtDate(days[0]) + ' → ' + fmtDate(days[days.length - 1])) : 'Không có dòng thuộc tháng hiện hành';
  }

  if (p.kind === 'so') {
    const agg = {}, seg = {}, outlets = {}, segOut = {}, segB = {}, segBOut = {}, outB = {};
    const tc = s => s ? s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()) : '';
    let month = '';
    p.rows.forEach(r => {
      const sc = cleanStr(g(r, 'ShortCode')); if (!sc) return;
      if (has('Calendar_Month')) month = cleanStr(g(r, 'Calendar_Month')).slice(0, 6) || month;
      const c = touchNpp(state, g(r, 'Seller_Name'), has('Area_Name') ? g(r, 'Area_Name') : '', has('Seller_ID') ? g(r, 'Seller_ID') : null);
      const q = num(g(r, 'UOM')); const o = cleanStr(g(r, 'Outlet_ID'));
      const s = has('Outlet_Segment') ? cleanStr(g(r, 'Outlet_Segment')) || 'Khác' : 'Khác';
      agg[c + '|' + sc] = (agg[c + '|' + sc] || 0) + q;
      seg[c + '|' + s] = (seg[c + '|' + s] || 0) + q;
      (outlets[c] = outlets[c] || new Set()).add(o);
      (segOut[c + '|' + s] = segOut[c + '|' + s] || new Set()).add(o);
      const b = (state.items[sc] && state.items[sc].b) || (has('Brand_Name') ? tc(cleanStr(g(r, 'Brand_Name'))) : '') || 'Khác';
      segB[c + '|' + s + '|' + b] = (segB[c + '|' + s + '|' + b] || 0) + q;
      (segBOut[c + '|' + s + '|' + b] = segBOut[c + '|' + s + '|' + b] || new Set()).add(o);
      (outB[c + '|' + b] = outB[c + '|' + b] || new Set()).add(o);
    });
    if (month && /^\d{6}$/.test(month) && month !== state.cur.month && month > (state.cur.month || '')) resetCur(state, month);
    const siDays = Object.keys(state.cur.si || {}).sort();
    const date = opts.soDate || siDays[siDays.length - 1] || todayKey();
    state.cur.so[date] = {
      rows: Object.entries(agg).map(([k, v]) => { const [c, sc] = k.split('|'); return [c, sc, v]; }),
      seg: Object.entries(seg).map(([k, v]) => { const [c, s] = k.split('|'); return [c, s, segOut[k].size, v]; }),
      out: Object.entries(outlets).map(([c, s]) => [c, s.size]),
      segB: Object.entries(segB).map(([k, v]) => { const [c, s, b] = k.split('|'); return [c, s, b, segBOut[k].size, v]; }),
      outB: Object.entries(outB).map(([k, s]) => { const [c, b] = k.split('|'); return [c, b, s.size]; }),
      at: now
    };
    msg.note = 'Snapshot MTD ngày ' + fmtDate(date);
  }

  if (p.kind === 'alloc') {
    const m = opts.month || state.cur.month;
    if (m && m !== state.cur.month) resetCur(state, m);
    const batchCols = Object.keys(p.idx).filter(h => /^batch\s*\d+$/i.test(h)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
    state.cur.alloc = p.rows.map(r => {
      const c = cleanStr(g(r, 'Alpha_Name')); const sc = cleanStr(g(r, 'ShortCode'));
      if (!c || !sc) return null;
      const n = state.npps[c] || (state.npps[c] = { name: '', area: '' });
      if (has('AREA') && g(r, 'AREA')) n.area = cleanStr(g(r, 'AREA'));
      return [cleanStr(g(r, 'WEEK')), c, sc, num(g(r, 'Allocation')), batchCols.map(b => { const v = r[p.idx[b]]; return v == null || v === '' ? null : num(v); })];
    }).filter(Boolean);
    state.cur.allocBatches = batchCols;
    const wk = [...new Set(state.cur.alloc.map(x => x[0]))];
    msg.note = 'Tuần ' + wk.join(', ');
  }

  if (p.kind === 'orders') {
    state.cur.orders = p.rows.map(r => {
      const c = cleanStr(has('Distributor') ? g(r, 'Distributor') : '').split('-')[0].trim(); const sc = cleanStr(g(r, 'ShortCode'));
      if (!c || !sc) return null;
      if (!state.npps[c]) state.npps[c] = { name: '', area: '' };
      if (has('Area') && g(r, 'Area') && !state.npps[c].area) state.npps[c].area = cleanStr(g(r, 'Area'));
      return [c, cleanStr(g(r, 'Order Number')), cleanStr(g(r, 'Status')), sc, num(g(r, 'Sum of Case')),
        has('Order Date') ? cleanStr(g(r, 'Order Date')) : '', has('Promised Delivery') ? cleanStr(g(r, 'Promised Delivery')) : '', has('Item B.O') ? cleanStr(g(r, 'Item B.O')) : ''];
    }).filter(Boolean);
    msg.note = new Set(state.cur.orders.map(o => o[1])).size + ' đơn';
  }

  if (p.kind === 'allocdates') {
    const cols = Object.keys(p.idx).filter(h => /^batch\s*\d+$/i.test(h)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
    const dates = {};
    p.rows.forEach(r => { const w = cleanStr(g(r, 'WEEK')); if (w) dates[w] = cols.map(c => dateKey(r[p.idx[c]])); });
    state.cur.allocDates = dates; state.cur.allocDateCols = cols;
    msg.note = Object.keys(dates).length + ' tuần có lịch chia';
  }

  if (p.kind === 'target') {
    const m = opts.month || state.cur.month;
    if (m && m !== state.cur.month) resetCur(state, m);
    state.cur.target = p.rows.map(r => {
      const c = cleanStr(g(r, 'Alpha_Name')); const sc = cleanStr(g(r, 'ShortCode'));
      if (!c || !sc) return null;
      if (!state.npps[c]) state.npps[c] = { name: '', area: '' };
      return [c, sc, num(g(r, 'Unit'))];
    }).filter(Boolean);
    msg.note = 'Gán cho tháng ' + fmtMonth(state.cur.month);
  }

  state.updatedAt[p.kind] = now;
  return msg;
}

/* Ngày dạng 'YYYY-MM-DD…', 'DD/MM/YYYY', số serial Excel hoặc YYYYMMDD -> 'YYYYMMDD' */
function dateKey(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (v > 19000000) return String(Math.round(v)); const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10).replace(/-/g, ''); }
  const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + m[2] + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0');
  return /^\d{8}$/.test(s) ? s : null;
}
function fmtMonth(m) { return m ? m.slice(4, 6) + '/' + m.slice(0, 4) : '—'; }
function fmtDate(d) { return d ? d.slice(6, 8) + '/' + d.slice(4, 6) : '—'; }
function todayKey() {
  const t = new Date(Date.now() + 7 * 3600e3); // Asia/Saigon
  return t.toISOString().slice(0, 10).replace(/-/g, '');
}

if (typeof module !== 'undefined') module.exports = { KINDS, KIND_ORDER, detect, applyParsed, emptyState, fmtMonth, fmtDate };
