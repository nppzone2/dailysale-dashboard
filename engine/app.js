/* ===== App: render dashboard từ STATE ===== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GROUPS = ['Group AA', 'Group BB', 'Khác'];
    const TABS = [['target', 'Target tháng'], ['progress', 'MTD Sale In - Out'], ['alloc', 'Allocation'], ['history', 'YTD as of M-1']];

  let STATE = null; const ENC = window.ENC || { blobs: {} };
  let PUBLISHED = STATE; let previewing = false;
  const ui = { tab: 'progress', scope: 'all', area: 'all', npp: 'all', brand: 'all', bgf: 'all', unit: 'case', tMonth: '', open: new Set(), allocSku: 'all' };
  try { const s = JSON.parse(localStorage.getItem('npp-ui') || '{}'); if (s.tab) ui.tab = s.tab; if (s.unit) ui.unit = s.unit; if (s.brand) ui.brand = s.brand; } catch (e) {}
  const saveUi = () => { try { localStorage.setItem('npp-ui', JSON.stringify({ tab: ui.tab, unit: ui.unit, scope: ui.scope, brand: ui.brand })); } catch (e) {} };

  /* ---------- user & quyền xem ---------- */
  let ROLE = null;
  const areaCode = a => String(a || '').replace(/\s+/g, '').toUpperCase();
  const b64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
  /* Dữ liệu từng tài khoản được mã hoá AES-GCM, khoá PBKDF2-SHA256 từ mật khẩu: chỉ mở được gói của chính mình. */
  async function unlock(user, pass) {
    const blob = ENC.blobs[String(user || '').replace(/\s+/g, '').toLowerCase()]; if (!blob) return null;
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pass || '').trim()), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(blob.salt), iterations: ENC.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct));
      return JSON.parse(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    } catch (e) { return null; }
  }
  function applyRole() {
    if (!ROLE) return;
    if (ROLE.type === 'npp') { ui.area = ROLE.area; ui.npp = ROLE.id; }
    if (ROLE.type === 'asm') { ui.area = ROLE.area; if (ui.npp !== 'all' && (STATE.npps[ui.npp] || {}).area !== ROLE.area) ui.npp = 'all'; }
    if (ui.npp !== 'all' && !STATE.npps[ui.npp]) ui.npp = 'all';
    ui.scope = ui.npp !== 'all' ? ui.npp : ui.area !== 'all' ? 'A:' + ui.area : 'all';
  }
  function enter(role) { ROLE = role; const h = (location.hash || '').slice(1); if (h && STATE.npps[h] && role.type !== 'npp') { ui.npp = h; ui.area = STATE.npps[h].area; } applyRole(); shell(); render(); }
  function logout() { ROLE = null; STATE = null; loginView(); }
  async function tryLogin(u, pw) {
    if (!Object.keys(ENC.blobs).length) return 'Dashboard chưa có dữ liệu.';
    const D = await unlock(u, pw); if (!D) return 'Sai tên đăng nhập hoặc mật khẩu.';
    STATE = D.state; PUBLISHED = STATE; ui.area = 'all'; ui.npp = 'all'; ui.tMonth = ''; ui.open.clear(); enter(D.role); return true;
  }
  function loginView(msg) {
    app.innerHTML = `<div class="login"><form class="login-card" id="login-form" autocomplete="on">
      <img class="logo lg" src="${LOGO}" alt="EverGreen" width="84" height="84">
      <div><div class="brand-t">Daily Sale by Distributor</div><div class="brand-s"><b>RTC - Future Fit</b> · HCM Zone 2</div></div>
      <label for="lg-u">Tên đăng nhập</label><input id="lg-u" autocomplete="username" placeholder="UserName" required>
      <label for="lg-p">Mật khẩu</label><div class="pwbox"><input id="lg-p" type="password" autocomplete="current-password" required><button type="button" id="lg-eye" class="eye" aria-label="Hiện mật khẩu" aria-pressed="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3l18 18"/></svg></button></div>
      <div class="lg-err" id="lg-err">${esc(msg || '')}</div>
      <button class="btn primary" type="submit">Đăng nhập</button>
      <p class="note" style="margin:0;text-align:center">Cập nhật ${esc(ENC.built || '—')}</p></form></div>`;
    $('#lg-eye').onclick = () => { const i = $('#lg-p'), b = $('#lg-eye'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); i.focus(); };
    $('#login-form').addEventListener('submit', async e => { e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang mở dữ liệu…'; $('#lg-err').textContent = '';
      const res = await tryLogin($('#lg-u').value, $('#lg-p').value); if (res !== true) { btn.disabled = false; btn.textContent = 'Đăng nhập'; $('#lg-err').textContent = res; } });
  }

  /* ---------- helpers ---------- */
  const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmt = v => ui.unit === 'hl' ? nf1.format(v || 0) : nf0.format(Math.round(v || 0));
  const fmtC = v => nf0.format(Math.round(v || 0));
  const pct = v => isFinite(v) ? nf1.format(v * 100) + '%' : '—';
  const U = () => ui.unit === 'hl' ? 'HL' : 'Case';
  const item = sc => STATE.items[sc] || { b: '', bg: '', g: '', hl: null };
  const brandOf = sc => item(sc).b || 'Khác';
  const inBrand = sc => (ui.brand === 'all' || brandOf(sc) === ui.brand) && (ui.bgf === 'all' || grp(sc) === ui.bgf);
  const bchip = sc => item(sc).b ? `<span class="chip">${esc(item(sc).b)}</span>` : '';
  const grp = sc => item(sc).bg || 'Khác';
  const conv = (c, sc) => ui.unit === 'hl' ? c * (item(sc).hl || 0) : c;
  const inScope = c => ui.scope === 'all' ? true : ui.scope.startsWith('A:') ? (STATE.npps[c] || {}).area === ui.scope.slice(2) : c === ui.scope;
  const nppLabel = c => c;
  const scopeLabel = () => (ui.scope === 'all' ? 'Tất cả NPP' : ui.scope.startsWith('A:') ? 'Khu vực ' + ui.scope.slice(2) : nppLabel(ui.scope)) + (ui.bgf !== 'all' ? ' · ' + ui.bgf : '') + (ui.brand !== 'all' ? ' · ' + ui.brand : '');
  const fM = m => m ? 'T' + (+m.slice(4, 6)) + '/' + m.slice(0, 4) : '—';
  const fD = d => d ? d.slice(6, 8) + '/' + d.slice(4, 6) : '—';
  const nextMonth = m => { const y = +m.slice(0, 4), mo = +m.slice(4, 6); return mo === 12 ? (y + 1) + '01' : y + String(mo + 1).padStart(2, '0'); };
  const dim = m => new Date(+m.slice(0, 4), +m.slice(4, 6), 0).getDate();
  const fTs = t => { if (!t) return '—'; const d = new Date(new Date(t).getTime() + 7 * 3600e3); if (isNaN(d)) return '—'; const p = n => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; };
  const status = (ach, tg) => {
    if (!isFinite(ach)) return '<span class="pill info">Chưa có target</span>';
    const r = tg > 0 ? ach / tg : 1;
    if (r >= 1) return '<span class="pill good">Đúng tiến độ</span>';
    if (r >= 0.9) return '<span class="pill warn">Sát tiến độ</span>';
    return '<span class="pill bad">Chậm tiến độ</span>';
  };
  const npAll = () => Object.keys(STATE.npps).sort((a, b) => ((STATE.npps[a].area || '') + a).localeCompare((STATE.npps[b].area || '') + b, 'vi', { numeric: true }));
  const missingHl = new Set();

  /* ---------- current month model ---------- */
  function curModel() {
    const cur = STATE.cur || {}; const m = cur.month;
    const siDays = Object.keys(cur.si || {}).sort(); const soDays = Object.keys(cur.so || {}).sort();
    const lastSi = siDays[siDays.length - 1] || ''; const lastSo = soDays[soDays.length - 1] || '';
    const D = m ? dim(m) : 30;
    const dSi = lastSi ? +lastSi.slice(6) : 0; const dSo = lastSo ? +lastSo.slice(6) : 0;
    const rows = {};
    const R = (c, sc) => rows[c + '|' + sc] || (rows[c + '|' + sc] = { c, sc, t: 0, si: 0, so: 0 });
    (cur.target || []).forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).t += v; });
    siDays.forEach(d => cur.si[d].forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).si += v; }));
    if (lastSo) cur.so[lastSo].rows.forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).so += v; });
    const list = Object.values(rows);
    list.forEach(r => { if ((r.t || r.si || r.so) && item(r.sc).hl == null) missingHl.add(r.sc); });
    return { m, D, siDays, soDays, lastSi, lastSo, dSi, dSo, tgSi: dSi / D, tgSo: dSo / D, list };
  }
  const sumBy = (list, f) => list.reduce((s, r) => s + f(r), 0);
  function aggregate(list, keyF) {
    const out = {};
    list.forEach(r => { const k = keyF(r); const o = out[k] || (out[k] = { k, t: 0, si: 0, so: 0, rows: [] });
      o.t += conv(r.t, r.sc); o.si += conv(r.si, r.sc); o.so += conv(r.so, r.sc); o.rows.push(r); });
    return out;
  }

  /* ---------- charts ---------- */
  let chartId = 0;
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  /* cfg: {labels[], bars:[{name,color,values[]}], lines:[{name,color,values[],dash}], points, height, fmtY} */
  let CHARTS = [];
  function chart(cfg) { const id = 'ch' + (++chartId); CHARTS.push({ id, cfg }); return `<div class="chart" id="${id}" style="height:${cfg.height || 240}px"></div>`; }
  function drawCharts() { CHARTS.forEach(({ id, cfg }) => { const el = document.getElementById(id); if (el) drawChart(el, id, cfg, Math.max(280, el.clientWidth)); }); }
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(drawCharts, 150); });
  function drawChart(el, id, cfg, W) {
    const H = cfg.height || 240, L = 64, Rm = 12, T = 12, B = 26;
    const n = cfg.labels.length; const pw = W - L - Rm, ph = H - T - B; const step = pw / n;
    const all = []; (cfg.bars || []).forEach(s => s.values.forEach(v => v != null && all.push(v))); (cfg.lines || []).forEach(s => s.values.forEach(v => v != null && all.push(v)));
    const max = niceMax(Math.max(0, ...all) * 1.05); const y = v => T + ph - (v / max) * ph; const x = i => L + step * i + step / 2;
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = max * k / 4; g += `<line class="gl" x1="${L}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${cfg.fmtY ? cfg.fmtY(v) : fmt(v)}</text>`; }
    const every = Math.max(1, Math.ceil(n / Math.floor(pw / 34)));
    cfg.labels.forEach((lb, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`; });
    const nb = (cfg.bars || []).length; const bw = Math.max(3, Math.min(28, step * 0.62 / Math.max(1, nb)));
    (cfg.bars || []).forEach((s, si) => s.values.forEach((v, i) => { if (!v) return; const bx = x(i) - (nb * bw + (nb - 1) * 2) / 2 + si * (bw + 2); const top = y(v), hgt = T + ph - top; const r = Math.min(4, bw / 2, hgt);
      g += `<path d="M${bx},${T + ph}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + bw - r}Q${bx + bw},${top} ${bx + bw},${top + r}V${T + ph}Z" fill="${s.color}"/>`; }));
    (cfg.lines || []).forEach(s => { let d = ''; let pen = false; s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i) + ',' + y(v); pen = true; });
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.dots !== false) { const pts = s.values.map((v, i) => v == null ? null : i).filter(i => i != null); const showAll = pts.length <= 14;
        pts.forEach((i, k) => { if (showAll || k === pts.length - 1) g += `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`; }); } });
    g += `<line class="gl" x1="${L}" x2="${W - Rm}" y1="${T + ph}" y2="${T + ph}" style="stroke:var(--muted)"/>`;
    g += `<line id="${id}-x" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--ink-2)" stroke-width="1" opacity="0"/>`;
    cfg.labels.forEach((lb, i) => { g += `<rect data-i="${i}" x="${L + step * i}" y="${T}" width="${step}" height="${ph}" fill="transparent"/>`; });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.aria || '')}">${g}</svg><div class="tip" hidden></div>`;
    {
      const root = el; const tip = root.querySelector('.tip'); const cross = document.getElementById(id + '-x');
      root.querySelectorAll('rect[data-i]').forEach(r => {
        r.addEventListener('mouseenter', () => { const i = +r.dataset.i; const rows = [];
          (cfg.bars || []).forEach(s => rows.push([s.name, s.color, s.values[i]])); (cfg.lines || []).forEach(s => rows.push([s.name, s.color, s.values[i]]));
          tip.innerHTML = `<b>${esc(cfg.tipTitle ? cfg.tipTitle(i) : cfg.labels[i])}</b>` + rows.map(([nm, c, v]) => `<div><span><i style="background:${c}"></i>${esc(nm)}</span><span class="num">${v == null ? '—' : (cfg.fmtTip || fmt)(v)}</span></div>`).join('');
          tip.hidden = false; const box = root.getBoundingClientRect(); const px = (x(i) / W) * box.width;
          tip.style.left = Math.min(Math.max(0, px + 12), box.width - 170) + 'px'; tip.style.top = '6px';
          cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', '.35'); });
        r.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('opacity', '0'); });
      });
    }
  }
  const legend = items => `<div class="legend">${items.map(([n, c, t]) => `<span><i class="${t || ''}" style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------- shell ---------- */
  const app = document.getElementById('app');
  const LOGO = (document.getElementById('logo-src') || {}).textContent || '';
  function shell() {
    const npps = npAll(); const areas = [...new Set(npps.map(c => STATE.npps[c].area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const cur = STATE.cur || {}; const siD = Object.keys(cur.si || {}).sort().pop(); const soD = Object.keys(cur.so || {}).sort().pop();
    const wk = [...new Set((cur.alloc || []).map(r => r[0]))].sort().pop();
    const used = new Set([...(cur.target || []).map(r => r[1]), ...Object.values(cur.si || {}).flat().map(r => r[1]), ...Object.values(STATE.months || {}).flatMap(x => x.rows.map(r => r[1]))]);
    const bOrder = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss'];
    const brands = [...new Set([...used].map(brandOf))].filter(b => b !== 'Khác').sort((a, b) => ((bOrder.indexOf(a) + 1) || 99) - ((bOrder.indexOf(b) + 1) || 99) || a.localeCompare(b));
    app.innerHTML = `
    ${previewing ? '<div class="preview-bar">Đang xem trước dữ liệu mới, chưa phát hành cho NPP</div>' : ''}
    <header class="band"><div class="band-in">
      <div class="brandrow">
        <div class="brand"><img class="logo" src="${LOGO}" alt="EverGreen" width="52" height="52">
          <div><div class="brand-t">Daily Sale by Distributor</div><div class="brand-s"><b>RTC - Future Fit</b> · HCM Zone 2 · ${esc(fM(cur.month))}</div></div></div>
        <div class="fresh"><span>Sale In <b>${fD(siD)}</b></span><span>Sale Out <b>${fD(soD)}</b></span><span>Allocation <b>${esc(wk || '—')}</b></span><span class="who">${esc(ROLE.type === 'npp' ? ROLE.id : ROLE.label)}<button id="logout" class="linkbtn">Đăng xuất</button></span></div>
      </div>
      <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join('')}</nav>
    </div></header>
    <div class="filters"><div class="filters-in">
      <div class="fld"><label for="area">Khu vực</label><select id="area" ${ROLE.type !== 'admin' ? 'disabled' : ''}>
        ${ROLE.type === 'admin' ? '<option value="all">Tất cả khu vực</option>' : ''}${areas.filter(a => ROLE.type === 'admin' || a === ROLE.area).map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
      </select></div>
      <div class="fld"><label for="npp">Mã NPP</label><select id="npp" ${ROLE.type === 'npp' ? 'disabled' : ''}>
        ${ROLE.type !== 'npp' ? '<option value="all">Tất cả NPP</option>' : ''}${npps.filter(c => (ui.area === 'all' || STATE.npps[c].area === ui.area) && (ROLE.type !== 'npp' || c === ROLE.id)).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select></div>
      <div class="fld"><label for="bgf">BrandGroup</label><select id="bgf"><option value="all">Tất cả</option>${GROUPS.filter(g => g !== 'Khác').map(g => `<option value="${g}">${g}</option>`).join('')}</select></div>
      <div class="fld"><label for="brand">Brand</label><select id="brand"><option value="all">Tất cả brand</option>${brands.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}</select></div>
      <div class="fld"><label>Đơn vị</label><div class="seg"><button data-unit="case" aria-pressed="${ui.unit === 'case'}">Case</button><button data-unit="hl" aria-pressed="${ui.unit === 'hl'}">HL</button></div></div>
      <div class="spacer"></div>
      <button class="btn" id="admin-btn" hidden>Cập nhật dữ liệu</button>
    </div></div>
    <main id="view"></main>
    <div id="drawer-host"></div>`;
    const bs = $('#brand'); bs.value = ui.brand; if (bs.value !== ui.brand) { ui.brand = 'all'; bs.value = 'all'; }
    bs.onchange = () => { ui.brand = bs.value; ui.open.clear(); saveUi(); render(); };
    const gf = $('#bgf'); gf.value = ui.bgf; gf.onchange = () => { ui.bgf = gf.value; ui.open.clear(); render(); };
    const ar = $('#area'), np = $('#npp'); ar.value = ui.area; np.value = ui.npp;
    ar.onchange = () => { ui.area = ar.value; ui.npp = 'all'; applyRole(); ui.open.clear(); shell(); render(); };
    np.onchange = () => { ui.npp = np.value; applyRole(); ui.open.clear(); render(); };
    $('#logout').onclick = logout;
    app.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => { ui.unit = b.dataset.unit; saveUi(); app.querySelectorAll('[data-unit]').forEach(x => x.setAttribute('aria-pressed', x.dataset.unit === ui.unit)); render(); });
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; saveUi(); app.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === ui.tab)); render(); });
    if (ADMIN.ok && ROLE && ROLE.type === 'admin') { const b = $('#admin-btn'); b.hidden = false; b.onclick = openDrawer; }
  }

  function render() { missingHl.clear(); const v = $('#view'); chartId = 0; CHARTS = [];
    v.innerHTML = ({ target: viewTarget, progress: viewProgress, alloc: viewAlloc, history: viewHistory })[ui.tab]();
    bindView(); drawCharts(); }

  const conclusion = pts => `<section class="concl"><svg class="star" width="18" height="18" viewBox="0 0 30 30" aria-hidden="true"><path d="M15 2l3.9 8.4 9.1 1-6.8 6.2 1.9 9-8.1-4.6-8.1 4.6 1.9-9L2 11.4l9.1-1z" fill="currentColor"/></svg><div><div class="eyebrow">Kết luận nhanh</div><ul>${pts.filter(Boolean).map(p => `<li>${p}</li>`).join('')}</ul></div></section>`;
  const hlNote = () => missingHl.size && ui.unit === 'hl' ? `<div class="warnbox">Chưa có hệ số HL trong Item Master cho: <b>${[...missingHl].sort().join(', ')}</b>. Các mã này tính 0 HL; xem theo Case để thấy đủ sản lượng.</div>` : '';

  /* ---------- TAB 1: Target ---------- */
  function targetMonths() { const s = new Set(Object.keys(STATE.months || {})); if ((STATE.cur.target || []).length) s.add(STATE.cur.month); return [...s].sort().reverse(); }
  function targetRows(m) {
    if (m === STATE.cur.month && (STATE.cur.target || []).length) return STATE.cur.target.filter(r => inScope(r[0]) && inBrand(r[1])).map(([c, sc, t]) => ({ c, sc, tc: t, th: t * (item(sc).hl || 0) }));
    return ((STATE.months[m] || {}).rows || []).filter(r => inScope(r[0]) && inBrand(r[1])).map(r => ({ c: r[0], sc: r[1], tc: r[2], th: r[3] }));
  }
  function viewTarget() {
    const months = targetMonths(); if (!ui.tMonth || !months.includes(ui.tMonth)) ui.tMonth = months[0];
    const m = ui.tMonth; const rows = targetRows(m).filter(r => r.tc);
    rows.forEach(r => { if (item(r.sc).hl == null && m === STATE.cur.month) missingHl.add(r.sc); });
    const tv = r => ui.unit === 'hl' ? r.th : r.tc;
    const npps = [...new Set(rows.map(r => r.c))].sort((a, b) => npAll().indexOf(a) - npAll().indexOf(b));
    const multi = npps.length > 1;
    const byG = {}; rows.forEach(r => { const g = grp(r.sc); (byG[g] = byG[g] || {})[r.sc] = (byG[g][r.sc] || {}); byG[g][r.sc][r.c] = (byG[g][r.sc][r.c] || 0) + tv(r); });
    const total = sumBy(rows, tv); const gTot = g => sumBy(rows.filter(r => grp(r.sc) === g), tv);
    const head = multi ? `<tr><th>BrandGroup / BrandName</th><th>SKU</th>${npps.map(c => `<th>${esc(c)}</th>`).join('')}<th>Tổng</th><th>Tỷ trọng</th></tr>` : `<tr><th>BrandGroup / BrandName</th><th>SKU</th><th>Target (Case)</th><th>Target (HL)</th><th>Tỷ trọng</th></tr>`;
    let body = '';
    GROUPS.filter(g => byG[g]).forEach(g => {
      const bo = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss']; const bi = sc => (bo.indexOf(brandOf(sc)) + 1) || 99;
      const skus = Object.keys(byG[g]).sort((a, b) => bi(a) - bi(b) || sumBy(Object.values(byG[g][b]), x => x) - sumBy(Object.values(byG[g][a]), x => x));
      const gv = gTot(g);
      if (multi) {
        body += `<tr class="grp"><td colspan="2">${esc(g)}</td>${npps.map(c => `<td>${fmt(sumBy(skus, sc => byG[g][sc][c] || 0))}</td>`).join('')}<td>${fmt(gv)}</td><td>${pct(gv / total)}</td></tr>`;
        skus.forEach(sc => { const tt = sumBy(npps, c => byG[g][sc][c] || 0); body += `<tr class="sku"><td>${esc(item(sc).b || '—')}</td><td class="skuc">${esc(sc)}</td>${npps.map(c => `<td>${byG[g][sc][c] ? fmt(byG[g][sc][c]) : '<span class="note">–</span>'}</td>`).join('')}<td>${fmt(tt)}</td><td>${pct(tt / total)}</td></tr>`; });
      } else {
        const gc = sumBy(rows.filter(r => grp(r.sc) === g), r => r.tc), gh = sumBy(rows.filter(r => grp(r.sc) === g), r => r.th);
        body += `<tr class="grp"><td colspan="2">${esc(g)}</td><td>${fmtC(gc)}</td><td>${nf1.format(gh)}</td><td>${pct(gv / total)}</td></tr>`;
        skus.forEach(sc => { const rr = rows.filter(r => r.sc === sc); const c = sumBy(rr, r => r.tc), hh = sumBy(rr, r => r.th); body += `<tr class="sku"><td>${esc(item(sc).b || '—')}</td><td class="skuc">${esc(sc)}</td><td>${fmtC(c)}</td><td>${nf1.format(hh)}</td><td>${pct(tv({ tc: c, th: hh }) / total)}</td></tr>`; });
      }
    });
    const tc = sumBy(rows, r => r.tc), th = sumBy(rows, r => r.th);
    body += multi ? `<tr class="tot"><td colspan="2">Tổng</td>${npps.map(c => `<td>${fmt(sumBy(rows.filter(r => r.c === c), tv))}</td>`).join('')}<td>${fmt(total)}</td><td>100%</td></tr>` : `<tr class="tot"><td colspan="2">Tổng</td><td>${fmtC(tc)}</td><td>${nf1.format(th)}</td><td>100%</td></tr>`;
    const gs = GROUPS.filter(g => byG[g]).map(g => [g, gTot(g)]).sort((a, b) => b[1] - a[1]);
    const prev = months[months.indexOf(m) + 1]; let prevNote = '';
    if (prev) { const pr = targetRows(prev); const pv = sumBy(pr, tv); if (pv) { const d = total / pv - 1; prevNote = `So với ${fM(prev)}: <b>${d >= 0 ? '+' : ''}${pct(d)}</b>.`; } }
    let bgNote = [], brNote = '';
    if (prev) { const pr = targetRows(prev);
      const ch = GROUPS.filter(g => g !== 'Khác').map(g => { const a = gTot(g), b = sumBy(pr.filter(r => grp(r.sc) === g), tv); return { g, a, b, d: a - b, p: b ? a / b - 1 : NaN }; }).filter(x => x.a || x.b);
      bgNote = ch.map(x => `<b>${esc(x.g)}</b>: ${fmt(x.a)} ${U()}, ${x.d >= 0 ? 'tăng' : 'giảm'} <b>${isFinite(x.p) ? pct(Math.abs(x.p)) : '—'}</b> so với ${fM(prev)} (${x.d >= 0 ? '+' : '−'}${fmt(Math.abs(x.d))} ${U()}), tỷ trọng ${pct(x.a / total)}.`);
      const bm = {}; rows.forEach(r => { const k = brandOf(r.sc); bm[k] = bm[k] || { a: 0, b: 0 }; bm[k].a += tv(r); }); pr.forEach(r => { const k = brandOf(r.sc); bm[k] = bm[k] || { a: 0, b: 0 }; bm[k].b += tv(r); });
      const bl = Object.entries(bm).filter(([k, v]) => k !== 'Khác' && v.b > 0).map(([k, v]) => ({ k, d: v.a - v.b, p: v.a / v.b - 1 })).sort((x, y) => y.d - x.d);
      if (bl.length > 1) { const up = bl[0], dn = bl[bl.length - 1]; brNote = `Brand tăng mạnh nhất: <b>${esc(up.k)}</b> (${up.d >= 0 ? '+' : '−'}${fmt(Math.abs(up.d))} ${U()}, ${pct(up.p)})` + (dn.d < 0 ? `; giảm nhiều nhất: <b>${esc(dn.k)}</b> (−${fmt(-dn.d)} ${U()}, ${pct(dn.p)}).` : '.'); } }
    const topN = multi ? npps.map(c => [c, sumBy(rows.filter(r => r.c === c), tv)]).sort((a, b) => b[1] - a[1])[0] : null;
    return `
    <section class="lead"><div><div class="eyebrow">Target tháng</div><h1>Target ${fM(m)} · ${esc(scopeLabel())}</h1>
</div>
      <div class="fld"><label for="tmonth">Tháng</label><select id="tmonth">${months.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${fM(x)}${x === STATE.cur.month ? ' (Current)' : ''}</option>`).join('')}</select>
      <button class="btn primary" id="xl-target">Tải Excel</button></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Tổng target</div><div class="kpi-v">${fmt(total)}<small>${U()}</small></div><div class="kpi-f">${ui.unit === 'hl' ? fmtC(tc) + ' case' : nf1.format(th) + ' HL'}</div></div>
      ${gs.slice(0, 3).map(([g, v]) => `<div class="card c3 kpi"><div class="kpi-l">${esc(g)}</div><div class="kpi-v">${fmt(v)}<small>${U()}</small></div><div class="kpi-f">${pct(v / total)} tổng target</div></div>`).join('')}
      <div class="card c12"><div class="card-h"><div><h2>Target theo BrandGroup / SKU</h2><p class="sub">Đơn vị: ${U()}${multi ? ' · cột theo NPP' : ''}</p></div></div>
        ${hlNote()}<div class="tw"><table class="sticky1 tgt"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>
    </div>
    ${conclusion([
      `Target ${fM(m)}: <b>${fmt(total)} ${U()}</b>. ${prevNote}`,
      ...(bgNote.length ? bgNote : gs.filter(x => x[0] !== 'Khác').map(([g, v]) => `<b>${esc(g)}</b>: ${fmt(v)} ${U()}, tỷ trọng ${pct(v / total)}.`)),
      brNote,
      topN ? `NPP có target lớn nhất: <b>${esc(nppLabel(topN[0]))}</b> (${pct(topN[1] / total)}).` : ''
    ])}`;
  }

  /* ---------- TAB 2: Progress ---------- */
  function viewProgress() {
    const M = curModel(); const L = M.list;
    if (!M.m) return '<div class="card empty">Chưa có dữ liệu tháng hiện hành.</div>';
    const T = sumBy(L, r => conv(r.t, r.sc)), SI = sumBy(L, r => conv(r.si, r.sc)), SO = sumBy(L, r => conv(r.so, r.sc));
    const aSi = SI / T, aSo = SO / T; const remSi = Math.max(0, T - SI), remSo = Math.max(0, T - SO);
    const groups = aggregate(L, r => grp(r.sc));
    const cSi = css('--si'), cSo = css('--so'), cT = css('--target');
    let body = '';
    GROUPS.filter(g => groups[g] && (groups[g].t || groups[g].si || groups[g].so)).forEach(g => {
      const o = groups[g]; const isOpen = ui.open.has(g);
      body += rowHtml(`<span class="caret">▸</span> ${esc(g)}`, o, 'grp click' + (isOpen ? ' open' : ''), `data-g="${esc(g)}"`);
      if (isOpen) { const sk = aggregate(o.rows, r => r.sc); Object.values(sk).sort((a, b) => b.t - a.t).forEach(s => { body += rowHtml(esc(s.k) + bchip(s.k), s, 'sku'); }); }
    });
    body += rowHtml('Tổng', { t: T, si: SI, so: SO }, 'tot');
    function rowHtml(label, o, cls, attr = '') {
      const a1 = o.t ? o.si / o.t : NaN, a2 = o.t ? o.so / o.t : NaN; const r1 = o.t - o.si, r2 = o.t - o.so;
      const bar = (a, c) => `<span class="mini"><i style="width:${Math.min(100, (a || 0) * 100)}%;background:${c}"></i></span>`;
      const remCell = r => r > 0 ? `<span class="rem">${fmt(r)}</span>` : `<span class="neg">Vượt ${fmt(-r)}</span>`;
      return `<tr class="${cls}" ${attr}><td>${label}</td><td>${fmt(o.t)}</td><td>${fmt(o.si)}</td><td>${pct(a1)}${bar(a1, cSi)}</td><td>${remCell(r1)}</td><td>${fmt(o.so)}</td><td>${pct(a2)}${bar(a2, cSo)}</td><td>${remCell(r2)}</td></tr>`;
    }
    const labels = Array.from({ length: M.D }, (_, i) => String(i + 1));
    const daily = Array(M.D).fill(null); M.siDays.forEach(d => { daily[+d.slice(6) - 1] = sumBy(STATE.cur.si[d].filter(r => inScope(r[0]) && inBrand(r[1])), r => conv(r[2], r[1])); });
    let acc = 0; const cum = daily.map((v, i) => i < M.dSi ? (acc += v || 0) : null);
    const soCum = Array(M.D).fill(null); M.soDays.forEach(d => { soCum[+d.slice(6) - 1] = sumBy(STATE.cur.so[d].rows.filter(r => inScope(r[0]) && inBrand(r[1])), r => conv(r[2], r[1])); });
    const pace = labels.map((_, i) => T * (i + 1) / M.D);
    const soLine = soCum.some(v => v != null);
    let board = '';
    const npps = [...new Set(L.map(r => r.c))];
    if (npps.length > 1) {
      const byN = aggregate(L, r => r.c);
      const rowsN = Object.values(byN).filter(o => o.t).sort((a, b) => (b.si / b.t) - (a.si / a.t));
      board = `<div class="card c12"><div class="card-h"><div><h2>Xếp hạng NPP theo % đạt Sale In</h2><p class="sub">Bấm vào NPP để xem chi tiết · time gone ${pct(M.tgSi)} · đơn vị ${U()}</p></div></div>
      <div class="tw"><table><thead><tr><th>NPP</th><th>Khu vực</th><th>Target</th><th>Sale In</th><th>% đạt SI</th><th>Còn lại SI</th><th>Sale Out</th><th>% đạt SO</th><th>Còn lại SO</th><th>Trạng thái SI</th></tr></thead><tbody>
      ${rowsN.map(o => `<tr class="click" data-npp="${esc(o.k)}"><td><b>${esc(o.k)}</b></td><td>${esc((STATE.npps[o.k] || {}).area || '')}</td><td>${fmt(o.t)}</td><td>${fmt(o.si)}</td><td>${pct(o.si / o.t)}</td><td class="rem">${fmt(Math.max(0, o.t - o.si))}</td><td>${fmt(o.so)}</td><td>${pct(o.so / o.t)}</td><td class="rem">${fmt(Math.max(0, o.t - o.so))}</td><td>${status(o.si / o.t, M.tgSi)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    }
    let cover = '';
    if (M.lastSo) {
      const snap = STATE.cur.so[M.lastSo];
      const useB = ui.brand !== 'all' && snap.segB;
      const outlets = useB ? sumBy(snap.outB.filter(r => inScope(r[0]) && r[1] === ui.brand), r => r[2]) : sumBy(snap.out.filter(r => inScope(r[0])), r => r[1]);
      const seg = {}; (useB ? snap.segB.filter(r => inScope(r[0]) && r[2] === ui.brand).map(r => [r[0], r[1], r[3], r[4]]) : snap.seg.filter(r => inScope(r[0]))).forEach(([c, s, o, v]) => { seg[s] = seg[s] || { o: 0, v: 0 }; seg[s].o += o; seg[s].v += v; });
      const segs = Object.entries(seg).sort((a, b) => b[1].v - a[1].v); const segMax = Math.max(1, ...segs.map(s => s[1].v)); const soCase = sumBy(L, r => r.so);
      cover = `<div class="card c5"><h2>Độ phủ Sale Out</h2><p class="sub">Lũy kế đến ${fD(M.lastSo)} · đơn vị Case</p>
        <div class="grid" style="gap:10px;margin-bottom:14px"><div class="c6 kpi"><div class="kpi-l">Outlet có mua</div><div class="kpi-v">${nf0.format(outlets)}</div></div>
        <div class="c6 kpi"><div class="kpi-l">Case / outlet</div><div class="kpi-v">${nf1.format(outlets ? soCase / outlets : 0)}</div></div></div>
        <div class="hb">${segs.slice(0, 8).map(([s, o]) => `<div class="lbl" title="${esc(s)}">${esc(s)}</div><div><div class="t" style="width:${o.v / segMax * 100}%"></div></div><div class="v">${fmtC(o.v)} · ${nf0.format(o.o)} OL</div>`).join('')}</div></div>`;
    }
    const gl = Object.values(groups).filter(o => o.t > 0 && o.k !== 'Khác').map(o => ({ g: o.k, gap: o.t * M.tgSi - o.si, rem: o.t - o.si, a: o.si / o.t })).sort((a, b) => b.gap - a.gap);
    const behind = gl.filter(x => x.gap > 0).slice(0, 2);
    const soGap = SI - SO;
    return `
    <section class="lead"><div><div class="eyebrow">MTD Sale In - Out · ${fM(M.m)} · cập nhật đến ${fD(M.lastSi)}</div><h1>${esc(scopeLabel())}</h1>
      <p>Đã qua ${M.dSi}/${M.D} ngày (time gone ${pct(M.tgSi)}). Sale In và Sale Out MTD so với target tháng, kèm sản lượng còn lại theo BrandGroup.</p></div>
      <div class="btns"><button class="btn" id="xl-invoice">Tải SO Invoice</button><button class="btn" id="xl-progress">Tải Excel tiến độ</button></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Target tháng</div><div class="kpi-v">${fmt(T)}<small>${U()}</small></div><div class="kpi-f">Time gone <b>${pct(M.tgSi)}</b></div><div class="bar"><i style="width:${M.tgSi * 100}%;background:var(--target)"></i></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale In MTD</div><div class="srcnote">${M.siDays.length ? 'Số liệu ' + fD(M.siDays[0]) + ' → ' + fD(M.lastSi) : 'Chưa có số liệu'}</div><div class="kpi-v">${fmt(SI)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(aSi)}</b> target ${status(aSi, M.tgSi)}</div><div class="bar"><i style="width:${Math.min(100, aSi * 100)}%;background:var(--si)"></i><span class="tg" style="left:${M.tgSi * 100}%" title="Time gone"></span></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale Out MTD</div><div class="srcnote">${M.lastSo ? 'Số liệu 01/' + M.m.slice(4, 6) + ' → ' + fD(M.lastSo) : 'Chưa có số liệu'}</div><div class="kpi-v">${fmt(SO)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(aSo)}</b> target ${status(aSo, M.tgSo)}</div><div class="bar"><i style="width:${Math.min(100, aSo * 100)}%;background:var(--so)"></i><span class="tg" style="left:${M.tgSo * 100}%" title="Time gone"></span></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Còn lại đến cuối tháng</div>
        <div class="remrow"><span class="dot" style="background:var(--si)"></span><span>Sale In</span><b class="num">${fmt(remSi)}</b><small>${U()}</small></div>
        <div class="remrow"><span class="dot" style="background:var(--so)"></span><span>Sale Out</span><b class="num">${fmt(remSo)}</b><small>${U()}</small></div></div>

      <div class="card c12"><div class="card-h"><div><h2>Còn lại theo BrandGroup</h2><p class="sub">Target − thực đạt lũy kế · bấm vào BrandGroup để xem từng SKU · đơn vị ${U()}</p></div></div>
        ${hlNote()}<div class="tw"><table class="sticky1"><thead><tr><th>BrandGroup</th><th>Target</th><th>Sale In</th><th>% SI</th><th>Còn lại SI</th><th>Sale Out</th><th>% SO</th><th>Còn lại SO</th></tr></thead><tbody>${body}</tbody></table></div></div>

      <div class="card ${cover ? 'c7' : 'c12'}"><div class="card-h"><div><h2>Lũy kế MTD vs. tiến độ</h2><p class="sub">${U()} · tiến độ = target tháng chia đều theo ngày</p></div>
        ${legend([['Sale In', cSi], ...(soLine ? [['Sale Out', cSo]] : []), ['Tiến độ', cT, 'dash']])}</div>
        ${chart({ labels, lines: [{ name: 'Tiến độ', color: cT, values: pace, dash: true, dots: false }, { name: 'Sale In lũy kế', color: cSi, values: cum }, ...(soLine ? [{ name: 'Sale Out lũy kế', color: cSo, values: soCum }] : [])], tipTitle: i => 'Ngày ' + (i + 1) + '/' + M.m.slice(4, 6), aria: 'Sale In lũy kế theo ngày so với tiến độ' })}
        <div style="margin-top:14px"><div class="card-h"><h2 style="font-size:13px">Sale In theo ngày</h2>${legend([['Sale In ngày', cSi, 'sq']])}</div>
        ${chart({ labels, bars: [{ name: 'Sale In ngày', color: cSi, values: daily }], height: 150, tipTitle: i => 'Ngày ' + (i + 1) + '/' + M.m.slice(4, 6), aria: 'Sale In theo ngày' })}</div>
        ${M.soDays.length < 2 ? '<p class="note" style="margin:8px 0 0">Sale Out lấy số lũy kế tại ngày cập nhật; xu hướng theo ngày hiển thị từ lần cập nhật thứ hai.</p>' : ''}
      </div>
      ${cover}
      ${board}
    </div>
    ${conclusion([
      `Sale In đạt <b>${pct(aSi)}</b> target so với time gone <b>${pct(M.tgSi)}</b> (${aSi >= M.tgSi ? 'đi trước tiến độ' : 'chậm hơn tiến độ'}); còn <b>${fmt(remSi)} ${U()}</b> để đạt target.`,
      `Sale Out đạt <b>${pct(aSo)}</b>, còn <b>${fmt(remSo)} ${U()}</b>. ${soGap > 0 ? `Sale In cao hơn Sale Out <b>${fmt(soGap)} ${U()}</b>, tồn kho NPP đang tăng.` : `Sale Out cao hơn Sale In <b>${fmt(-soGap)} ${U()}</b>, cần đặt hàng bổ sung.`}`,
      behind.length ? `BrandGroup cần ưu tiên: ${behind.map(b => `<b>${esc(b.g)}</b> (đạt ${pct(b.a)}, còn ${fmt(b.rem)} ${U()})`).join(', ')}.` : 'Các BrandGroup đều đúng hoặc vượt tiến độ.'
    ])}`;
  }

  /* ---------- TAB 3: Allocation ---------- */
  function viewAlloc() {
    const M = curModel(); const A = (STATE.cur.alloc || []).filter(r => inScope(r[1]) && inBrand(r[2]));
    if (!A.length) return '<div class="card empty">Chưa có dữ liệu Allocation cho phạm vi này.</div>';
    const weeks = [...new Set(A.map(r => r[0]))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const wk = weeks[weeks.length - 1], pw = weeks[weeks.length - 2];
    const siMap = {}; M.list.forEach(r => { siMap[r.c + '|' + r.sc] = (siMap[r.c + '|' + r.sc] || 0) + r.si; });
    const aSum = f => sumBy(A.filter(f), r => conv(r[3], r[2]));
    const skus = [...new Set(A.map(r => r[2]))].map(sc => ({ sc, al: aSum(r => r[2] === sc) })).sort((a, b) => b.al - a.al).map(x => x.sc);
    const npps = [...new Set(A.map(r => r[1]))].sort((a, b) => npAll().indexOf(a) - npAll().indexOf(b));
    const siOf = (c, sc) => conv(siMap[c + '|' + sc] || 0, sc);
    const bySku = skus.map(sc => { const w = {}; weeks.forEach(k => w[k] = aSum(r => r[2] === sc && r[0] === k));
      const al = sumBy(Object.values(w), x => x); const si = sumBy([...new Set(A.filter(r => r[2] === sc).map(r => r[1]))], c => siOf(c, sc));
      return { sc, w, al, si }; });
    const usedBar = (si, al) => { const p = al ? si / al : 0; const c = p > 1 ? 'var(--bad)' : 'var(--si)'; return `${al ? pct(p) : '—'}<span class="mini"><i style="width:${Math.min(100, p * 100)}%;background:${c}"></i></span>`; };
    const remTd = (al, si) => { const r = al - si; return `<td class="rem">${r >= 0 ? fmt(r) : '<span style="color:var(--bad)">Vượt ' + fmt(-r) + '</span>'}</td>`; };
    const delta = (a, b) => { if (b == null) return '<span class="note">–</span>'; const d = a - b; const p = b ? d / b : NaN; const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      return `<span class="dl ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${fmt(Math.abs(d))}${isFinite(p) ? ' · ' + pct(Math.abs(p)) : ''}</span>`; };
    // 1) latest week
    const wkTot = sumBy(bySku, s => s.w[wk]); const pwTot = pw ? sumBy(bySku, s => s.w[pw]) : null;
    const latest = `<div class="card c12 wk-card"><div class="card-h"><div><div class="eyebrow">Current Week</div><h2 style="font-size:18px">${esc(wk)}<span class="note" style="font-weight:500;margin-left:8px">${pw ? 'so với ' + esc(pw) : ''}</span></h2></div>
        <div class="wk-total"><span class="kpi-l">Tổng allocation ${esc(wk)}</span><b>${fmt(wkTot)}</b><small>${U()}</small> ${delta(wkTot, pwTot)}</div></div>
      <div class="wk-grid">${bySku.map(s => `<div class="wk-item"><div class="wk-sku">${esc(s.sc)}</div><div class="wk-v num">${fmt(s.w[wk])}</div><div>${delta(s.w[wk], pw ? s.w[pw] : null)}</div><div class="wk-share"><i style="width:${wkTot ? s.w[wk] / wkTot * 100 : 0}%"></i></div></div>`).join('')}</div></div>`;
    // 2) cumulative by SKU
    const totAl = sumBy(bySku, s => s.al), totSi = sumBy(bySku, s => s.si);
    const cum = `<div class="card c12"><h2>Lũy kế tháng theo SKU</h2><p class="sub">Allocation các tuần đã chốt vs. Sale In MTD · đơn vị ${U()}</p><div class="tw"><table class="sticky1"><thead><tr><th>SKU</th>${weeks.map(w => `<th>${esc(w)}</th>`).join('')}<th>Tổng allocation</th><th>Sale In MTD</th><th>% sử dụng</th><th>Còn lại</th></tr></thead><tbody>
      ${bySku.map(s => `<tr><td><b>${esc(s.sc)}</b></td>${weeks.map(w => `<td>${fmt(s.w[w])}</td>`).join('')}<td>${fmt(s.al)}</td><td>${fmt(s.si)}</td><td>${usedBar(s.si, s.al)}</td>${remTd(s.al, s.si)}</tr>`).join('')}
      ${bySku.length > 1 ? `<tr class="tot"><td>Tổng</td>${weeks.map(w => `<td>${fmt(sumBy(bySku, s => s.w[w]))}</td>`).join('')}<td>${fmt(totAl)}</td><td>${fmt(totSi)}</td><td>${usedBar(totSi, totAl)}</td>${remTd(totAl, totSi)}</tr>` : ''}
    </tbody></table></div></div>`;
    // 3) by NPP: SKU switch keeps the table narrow however many SKUs exist
    let byNpp = '';
    if (npps.length > 1) {
      if (ui.allocSku !== 'all' && !skus.includes(ui.allocSku)) ui.allocSku = 'all';
      const chips = `<div class="chips" role="group" aria-label="Chọn SKU">${['all', ...skus].map(k => `<button data-asku="${esc(k)}" aria-pressed="${ui.allocSku === k}">${k === 'all' ? 'Tất cả SKU' : esc(k)}</button>`).join('')}</div>`;
      let table;
      if (ui.allocSku === 'all') {
        table = `<table class="sticky1"><thead><tr><th>NPP</th>${skus.map(sc => `<th>${esc(sc)}</th>`).join('')}<th>Tổng còn lại</th></tr></thead><tbody>
          ${npps.map(c => { let tr = 0; const cells = skus.map(sc => { const al = aSum(r => r[1] === c && r[2] === sc), si = siOf(c, sc); tr += al - si; const p = al ? si / al : 0;
            return al || si ? `<td><div class="mx"><b class="${al - si < 0 ? 'over' : ''}">${al - si < 0 ? '−' + fmt(si - al) : fmt(al - si)}</b><span class="mini"><i style="width:${Math.min(100, p * 100)}%;background:${p > 1 ? 'var(--bad)' : 'var(--si)'}"></i></span></div></td>` : '<td><span class="note">–</span></td>'; }).join('');
            return `<tr class="click" data-npp="${esc(c)}"><td><b>${esc(c)}</b></td>${cells}<td class="rem">${fmt(tr)}</td></tr>`; }).join('')}</tbody></table>
          <p class="note" style="margin:8px 0 0">Mỗi ô: allocation còn lại; thanh nhỏ là % đã sử dụng. Số âm (đỏ) là đã vượt allocation.</p>`;
      } else {
        const sc = ui.allocSku;
        table = `<table class="sticky1"><thead><tr><th>NPP</th>${weeks.map(w => `<th>${esc(w)}</th>`).join('')}<th>Tổng allocation</th><th>Sale In MTD</th><th>% sử dụng</th><th>Còn lại</th></tr></thead><tbody>
          ${npps.map(c => { const w = weeks.map(k => aSum(r => r[1] === c && r[2] === sc && r[0] === k)); const al = sumBy(w, x => x), si = siOf(c, sc);
            return `<tr class="click" data-npp="${esc(c)}"><td><b>${esc(c)}</b></td>${w.map(v => `<td>${fmt(v)}</td>`).join('')}<td>${fmt(al)}</td><td>${fmt(si)}</td><td>${usedBar(si, al)}</td>${remTd(al, si)}</tr>`; }).join('')}</tbody></table>`;
      }
      byNpp = `<div class="card c12"><div class="card-h"><div><h2>Theo NPP</h2><p class="sub">Đơn vị ${U()} · chọn SKU để xem chi tiết theo tuần</p></div>${chips}</div><div class="tw">${table}</div></div>`;
    }
    const over = bySku.filter(s => s.si > s.al);
    const main = bySku[0];
    return `
    <section class="lead"><div><div class="eyebrow">Allocation · cập nhật hàng tuần</div><h1>${esc(scopeLabel())}</h1>
      <p>Allocation Current Week và lũy kế các tuần đã chốt (${weeks.join(', ')}), so với Sale In MTD của cùng SKU.</p></div></section>
    <div class="grid">${latest}${cum}${byNpp}</div>
    ${conclusion([
      `Tuần <b>${esc(wk)}</b>: tổng allocation <b>${fmt(wkTot)} ${U()}</b>${pwTot != null ? `, ${wkTot >= pwTot ? 'tăng' : 'giảm'} ${pct(Math.abs(pwTot ? wkTot / pwTot - 1 : 0))} so với ${esc(pw)}` : ''}.`,
      main ? `<b>${esc(main.sc)}</b> đã sử dụng ${pct(main.al ? main.si / main.al : 0)} allocation lũy kế, còn <b>${fmt(Math.max(0, main.al - main.si))} ${U()}</b>.` : '',
      over.length ? `Đã vượt allocation: <b>${over.map(s => s.sc).join(', ')}</b>.` : ''
    ])}`;
  }

  /* ---------- TAB 4: History ---------- */
  function viewHistory() {
    const ms = Object.keys(STATE.months || {}).sort().filter(m => m.slice(0, 4) === (STATE.cur.month || m).slice(0, 4) && m < (STATE.cur.month || '999999'));
    const data = ms.map(m => { const rows = STATE.months[m].rows.filter(r => inScope(r[0]) && inBrand(r[1]));
      const pick = (ci, hi) => sumBy(rows, r => ui.unit === 'hl' ? r[hi] : r[ci]);
      return { m, t: pick(2, 3), si: pick(4, 5), so: pick(6, 7), mtd: false, rows }; });
    const asOf = ms.filter(m => m < (STATE.cur.month || '999999')).pop() || ms[ms.length - 1];
    const cSi = css('--si'), cSo = css('--so'), cT = css('--target');
    const full = data.filter(d => !d.mtd && d.t);
    const tT = sumBy(full, d => d.t), tSi = sumBy(full, d => d.si), tSo = sumBy(full, d => d.so);
    const best = [...full].sort((a, b) => b.si / b.t - a.si / a.t);
    // group mix for completed months
    const gm = {}; full.forEach(d => d.rows.forEach(r => { const g = grp(r[1]); gm[g] = gm[g] || { t: 0, si: 0, so: 0 }; gm[g].t += ui.unit === 'hl' ? r[3] : r[2]; gm[g].si += ui.unit === 'hl' ? r[5] : r[4]; gm[g].so += ui.unit === 'hl' ? r[7] : r[6]; }));
    return `
    <section class="lead"><div><div class="eyebrow">YTD as of ${fM(asOf)}</div><h1>${esc(scopeLabel())}</h1>
      <p>Lũy kế từ T1 đến ${fM(asOf)} (tháng đã chốt gần nhất): target, Sale In, Sale Out và tỷ lệ đạt từng tháng.</p></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Target YTD</div><div class="kpi-v">${fmt(tT)}<small>${U()}</small></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale In YTD</div><div class="kpi-v">${fmt(tSi)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(tSi / tT)}</b> target</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale Out YTD</div><div class="kpi-v">${fmt(tSo)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(tSo / tT)}</b> target</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Tháng đạt cao nhất</div><div class="kpi-v">${best[0] ? fM(best[0].m) : '—'}</div><div class="kpi-f">${best[0] ? 'Sale In ' + pct(best[0].si / best[0].t) : ''}</div></div>
      <div class="card c12"><div class="card-h"><div><h2>Target, Sale In, Sale Out theo tháng</h2><p class="sub">Đơn vị ${U()}</p></div>${legend([['Target', cT, 'sq'], ['Sale In', cSi], ['Sale Out', cSo]])}</div>
        ${chart({ labels: data.map(d => fM(d.m).replace(/\/\d{4}$/, '')), bars: [{ name: 'Target', color: cT, values: data.map(d => d.t) }], lines: [{ name: 'Sale In', color: cSi, values: data.map(d => d.si) }, { name: 'Sale Out', color: cSo, values: data.map(d => d.so) }], height: 230, tipTitle: i => fM(data[i].m), aria: 'Target, Sale In và Sale Out theo tháng' })}</div>
      <div class="card c7"><h2>Chi tiết theo tháng</h2><p class="sub">Đơn vị ${U()}</p><div class="tw"><table><thead><tr><th>Tháng</th><th>Target</th><th>Sale In</th><th>% SI</th><th>Sale Out</th><th>% SO</th><th>SI − SO</th></tr></thead><tbody>
        ${data.map(d => `<tr><td><b>${fM(d.m)}</b>${d.mtd ? ' <span class="pill info">MTD</span>' : ''}</td><td>${fmt(d.t)}</td><td>${fmt(d.si)}</td><td>${pct(d.si / d.t)}</td><td>${fmt(d.so)}</td><td>${pct(d.so / d.t)}</td><td>${fmt(d.si - d.so)}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card c5"><h2>Theo BrandGroup · YTD</h2><p class="sub">Tỷ lệ đạt lũy kế</p><div class="tw"><table><thead><tr><th>BrandGroup</th><th>Target</th><th>% SI</th><th>% SO</th></tr></thead><tbody>
        ${GROUPS.filter(g => gm[g] && gm[g].t).map(g => `<tr><td>${esc(g)}</td><td>${fmt(gm[g].t)}</td><td>${pct(gm[g].si / gm[g].t)}</td><td>${pct(gm[g].so / gm[g].t)}</td></tr>`).join('')}
      </tbody></table></div></div>
    </div>
    ${conclusion([
      `YTD as of ${fM(asOf)}: Sale In đạt <b>${pct(tSi / tT)}</b>, Sale Out đạt <b>${pct(tSo / tT)}</b> tổng target.`,
      best.length > 1 ? `Cao nhất <b>${fM(best[0].m)}</b> (${pct(best[0].si / best[0].t)}), thấp nhất <b>${fM(best[best.length - 1].m)}</b> (${pct(best[best.length - 1].si / best[best.length - 1].t)}).` : '',
      (() => { const w = GROUPS.filter(g => g !== 'Khác' && gm[g] && gm[g].t > 0).map(g => [g, gm[g].si / gm[g].t]).sort((a, b) => a[1] - b[1])[0]; return w ? `BrandGroup đạt thấp nhất: <b>${esc(w[0])}</b> (${pct(w[1])}), cần ưu tiên cải thiện.` : ''; })()
    ])}`;
  }

  /* ---------- bindings ---------- */
  function bindView() {
    const v = $('#view');
    v.querySelectorAll('tr[data-g]').forEach(tr => tr.onclick = () => { const g = tr.dataset.g; ui.open.has(g) ? ui.open.delete(g) : ui.open.add(g); render(); });
    v.querySelectorAll('tr[data-npp]').forEach(tr => tr.onclick = () => { ui.scope = tr.dataset.npp; $('#scope').value = ui.scope; saveUi(); window.scrollTo({ top: 0, behavior: 'smooth' }); render(); });
    const tm = $('#tmonth'); if (tm) tm.onchange = () => { ui.tMonth = tm.value; render(); };
    v.querySelectorAll('[data-asku]').forEach(b => b.onclick = () => { ui.allocSku = b.dataset.asku; render(); });
    const xt = $('#xl-target'); if (xt) xt.onclick = exportTarget;
    const xp = $('#xl-progress'); if (xp) xp.onclick = exportProgress;
    const xi = $('#xl-invoice'); if (xi) xi.onclick = exportInvoice;
  }

  /* ---------- Excel export ---------- */
  async function saveXlsx(filename, sheets, btn) {
    if (!window.XLSX) { toastBtn(btn, 'Chưa tải được thư viện Excel'); return; }
    const wb = XLSX.utils.book_new();
    sheets.forEach(([name, aoa, widths]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); });
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const inHost = !!(window.claude && window.claude.use);
    if (!inHost) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); toastBtn(btn, 'Đã tải'); return; }
    const dl = await window.claude.use('downloads');
    if (!dl) { copyFallback(sheets); return; }
    try { await dl.save({ filename, data: blob }); toastBtn(btn, 'Đã tải'); }
    catch (e) { const c = e && e.code; if (c === 'declined') toastBtn(btn, 'Đã huỷ'); else if (c === 'rate_limited') toastBtn(btn, 'Thử lại sau giây lát'); else copyFallback(sheets); }
  }
  function copyFallback(sheets) {
    const host = $('#drawer-host'); const tsv = aoa => aoa.map(r => r.map(v => v == null ? '' : String(v).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    host.innerHTML = `<div class="drawer modal" id="cp-wrap"><div class="cp-card" role="dialog" aria-label="Sao chép dữ liệu">
      <h2 style="margin:0;font-size:17px">Thiết bị này chưa tải được file</h2>
      <p class="note" style="margin:0">Trình xem trên điện thoại đang chặn tải file. Bạn sao chép dữ liệu rồi dán vào Excel, Google Sheets hoặc Zalo.</p>
      ${sheets.map(([n, aoa], i) => `<button class="btn primary cp-btn" data-i="${i}">Sao chép “${esc(n)}” · ${aoa.length - 1} dòng</button>`).join('')}
      <textarea id="cp-ta" readonly aria-label="Dữ liệu" hidden></textarea>
      <div class="note" id="cp-msg"></div><button class="btn" id="cp-close">Đóng</button></div></div>`;
    $('#cp-close').onclick = () => host.innerHTML = '';
    $('#cp-wrap').addEventListener('click', e => { if (e.target.id === 'cp-wrap') host.innerHTML = ''; });
    host.querySelectorAll('.cp-btn').forEach(b => b.onclick = () => { const text = tsv(sheets[+b.dataset.i][1]); const ta = $('#cp-ta');
      const done = () => { $('#cp-msg').textContent = 'Đã sao chép. Mở Excel hoặc Google Sheets và dán vào ô A1.'; };
      const manual = () => { ta.hidden = false; ta.value = text; ta.focus(); ta.select(); try { document.execCommand('copy') ? done() : ($('#cp-msg').textContent = 'Giữ vào ô dữ liệu, chọn Sao chép.'); } catch (e) { $('#cp-msg').textContent = 'Giữ vào ô dữ liệu, chọn Sao chép.'; } };
      try { navigator.clipboard.writeText(text).then(done, manual); } catch (e) { manual(); } });
  }
  function toastBtn(btn, msg) { if (!btn) return; const t = btn.textContent; btn.textContent = msg; btn.disabled = true; setTimeout(() => { btn.textContent = t; btn.disabled = false; }, 2200); }
  const scopeTag = () => ui.scope === 'all' ? 'HCMZ2' : ui.scope.replace('A:', '').replace(/\s+/g, '');
  function exportTarget(ev) {
    const m = ui.tMonth; const rows = targetRows(m).filter(r => r.tc);
    const long = [['Tháng', 'Khu vực', 'Mã NPP', 'ShortCode', 'BrandName', 'BrandGroup', 'Target (Case)', 'Target (HL)']];
    rows.sort((a, b) => (a.c + GROUPS.indexOf(grp(a.sc)) + a.sc).localeCompare(b.c + GROUPS.indexOf(grp(b.sc)) + b.sc)).forEach(r => long.push([fM(m), (STATE.npps[r.c] || {}).area || '', r.c, r.sc, item(r.sc).b || '', grp(r.sc), Math.round(r.tc), Math.round(r.th * 100) / 100]));
    const npps = [...new Set(rows.map(r => r.c))];
    const piv = [['BrandGroup', ...npps.flatMap(c => [c + ' (Case)', c + ' (HL)']), 'Tổng (Case)', 'Tổng (HL)']];
    GROUPS.forEach(g => { const rr = rows.filter(r => grp(r.sc) === g); if (!rr.length) return;
      piv.push([g, ...npps.flatMap(c => { const x = rr.filter(r => r.c === c); return [Math.round(sumBy(x, r => r.tc)), Math.round(sumBy(x, r => r.th) * 10) / 10]; }), Math.round(sumBy(rr, r => r.tc)), Math.round(sumBy(rr, r => r.th) * 10) / 10]); });
    saveXlsx(`Target_${m}_${scopeTag()}.xlsx`, [['Target chi tiết', long, [10, 10, 9, 10, 12, 13, 12]], ['Theo BrandGroup', piv, [16]]], ev.currentTarget);
  }
  function exportInvoice(ev) {
    const cur = STATE.cur || {}; const ship = cur.ship || {};
    const rows = [['Ngày', 'Khu vực', 'Mã NPP', 'Số hoá đơn', 'Loại chứng từ', 'Mã ShipTo', 'Tên ShipTo', 'BrandName', 'BrandGroup', 'ShortCode', 'Số lượng (Case)', 'Sản lượng (HL)']];
    (cur.lines || []).filter(l => inScope(l[1]) && inBrand(l[5])).forEach(([d, c, inv, dt, st, sc, q]) => rows.push([d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4), (STATE.npps[c] || {}).area || '', c, inv, dt, st, ship[st] || '', item(sc).b || '', grp(sc), sc, q, Math.round(q * (item(sc).hl || 0) * 100) / 100]));
    if (rows.length === 1) { toastBtn(ev.currentTarget, 'Không có hoá đơn trong phạm vi này'); return; }
    const days = Object.keys(cur.si || {}).sort();
    saveXlsx(`SO_Invoice_${cur.month}_${days[days.length - 1] || ''}_${scopeTag()}.xlsx`, [['SO Invoice', rows, [11, 9, 9, 12, 15, 11, 36, 11, 11, 10, 14, 13]]], ev.currentTarget);
  }
  function exportProgress(ev) {
    const M = curModel(); const left = M.D - M.dSi;
    const rows = [['Tháng', 'Đến ngày', 'Mã NPP', 'ShortCode', 'BrandName', 'BrandGroup', 'Target (Case)', 'Sale In (Case)', '% SI', 'Còn lại SI (Case)', 'Sale Out (Case)', '% SO', 'Còn lại SO (Case)', 'hl/case', 'Target (HL)', 'Sale In (HL)', 'Sale Out (HL)']];
    M.list.filter(r => r.t || r.si || r.so).sort((a, b) => (a.c + GROUPS.indexOf(grp(a.sc)) + a.sc).localeCompare(b.c + GROUPS.indexOf(grp(b.sc)) + b.sc)).forEach(r => { const hl = item(r.sc).hl || 0; const rem = Math.max(0, r.t - r.si);
      rows.push([fM(M.m), fD(M.lastSi), r.c, r.sc, item(r.sc).b || '', grp(r.sc), r.t, r.si, r.t ? Math.round(r.si / r.t * 1000) / 10 : null, rem, r.so, r.t ? Math.round(r.so / r.t * 1000) / 10 : null, Math.max(0, r.t - r.so), hl, Math.round(r.t * hl * 100) / 100, Math.round(r.si * hl * 100) / 100, Math.round(r.so * hl * 100) / 100]); });
    const g = aggregate(M.list, r => grp(r.sc)); const sum = [['BrandGroup', 'Target', 'Sale In', '% SI', 'Còn lại SI', 'Sale Out', '% SO', 'Còn lại SO', 'Đơn vị']];
    GROUPS.filter(k => g[k]).forEach(k => { const o = g[k]; sum.push([k, round(o.t), round(o.si), o.t ? Math.round(o.si / o.t * 1000) / 10 : null, round(Math.max(0, o.t - o.si)), round(o.so), o.t ? Math.round(o.so / o.t * 1000) / 10 : null, round(Math.max(0, o.t - o.so)), U()]); });
    function round(v) { return ui.unit === 'hl' ? Math.round(v * 10) / 10 : Math.round(v); }
    saveXlsx(`TienDo_${M.m}_${M.lastSi}_${scopeTag()}.xlsx`, [['Còn lại theo BrandGroup', sum, [16]], ['Chi tiết SKU', rows, [9, 9, 9, 10, 12]]], ev.currentTarget);
  }

  /* ---------- Admin: cập nhật dữ liệu & phát hành ---------- */
  const ADMIN = { ok: false, art: null, pending: [], draft: null };
  function openDrawer() {
    const host = $('#drawer-host');
    host.innerHTML = `<div class="drawer" id="drawer"><div class="drawer-p" role="dialog" aria-label="Cập nhật dữ liệu">
      <div class="card-h"><div><div class="eyebrow">Quản trị</div><h2 style="font-size:18px;margin:0">Cập nhật dữ liệu</h2></div><button class="btn" id="dr-close">Đóng</button></div>
      <p class="note" style="margin:0">Kéo thả một hoặc nhiều file Excel. Dashboard tự nhận diện: SO Invoice, SaleOut by Seller, Allocation, Target Current Month, Target Total, Item Master.</p>
      <label class="drop" id="drop" for="files"><b>Chọn hoặc kéo file vào đây</b><br><span class="note">.xlsx · có thể chọn nhiều file</span></label>
      <input type="file" id="files" accept=".xlsx,.xls,.csv" multiple hidden>
      <div class="grid" style="gap:10px">
        <div class="c6"><label class="kpi-l" for="opt-month">Tháng hiện hành</label><input type="month" id="opt-month" value="${STATE.cur.month ? STATE.cur.month.slice(0, 4) + '-' + STATE.cur.month.slice(4) : ''}" style="width:100%"></div>
        <div class="c6"><label class="kpi-l" for="opt-sodate">Ngày chốt Sale Out</label><input type="date" id="opt-sodate" style="width:100%"><div class="note">Để trống = ngày Sale In mới nhất</div></div>
      </div>
      <div class="flist" id="flist"></div>
      <details class="pw"><summary>Tài khoản &amp; mật khẩu</summary>
        <p class="note">NPP đăng nhập bằng DisCode, ASM bằng mã khu vực (HCM3, HCM4, HCM5, HCM11), Admin bằng chữ ADMIN. Để trống ô nào thì giữ nguyên mật khẩu đó.</p>
        <div class="grid" style="gap:10px"><div class="c4"><label class="kpi-l" for="pw-npp">Mật khẩu NPP mới</label><input id="pw-npp" class="pwin" style="width:100%"></div>
        <div class="c4"><label class="kpi-l" for="pw-asm">Mật khẩu ASM mới</label><input id="pw-asm" class="pwin" style="width:100%"></div>
        <div class="c4"><label class="kpi-l" for="pw-admin">Mật khẩu Admin mới</label><input id="pw-admin" class="pwin" style="width:100%"></div></div></details>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="dr-preview" disabled>Xem trước</button><button class="btn primary" id="dr-publish" disabled>Phát hành cho NPP</button>${previewing ? '<button class="btn" id="dr-discard">Bỏ bản xem trước</button>' : ''}</div>
      <div class="note" id="dr-msg"></div>
      <div class="guide"><b>Hằng ngày</b><span>SO Invoice + SaleOut by Seller</span><b>Hằng tuần</b><span>Allocation Current Month</span>
        <b>Chốt tháng</b><span>Thả cùng lúc: <em>Target_Total_2026MM</em> của tháng vừa kết thúc + <em>Target Current Month</em> tháng mới (+ Allocation nếu có). Tháng cũ được chốt vào YTD, dashboard tự chuyển sang tháng mới; từ ngày 1 cập nhật Sale In/Sale Out như bình thường.</span></div>
    </div></div>`;
    $('#dr-close').onclick = () => host.innerHTML = '';
    $('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') host.innerHTML = ''; });
    const inp = $('#files'), drop = $('#drop');
    inp.onchange = () => readFiles([...inp.files]);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFiles([...e.dataTransfer.files]); });
    $('#dr-preview').onclick = () => { buildDraft(); if (ADMIN.draft) { STATE = ADMIN.draft; previewing = true; shell(); render(); openDrawer(); listFiles(); } };
    $('#dr-publish').onclick = publish;
    app.querySelectorAll('.pwin').forEach(i => i.oninput = () => { $('#dr-publish').disabled = !(ADMIN.pending.some(x => x.p) || previewing || [...app.querySelectorAll('.pwin')].some(x => x.value.trim())); });
    const dd = $('#dr-discard'); if (dd) dd.onclick = () => { STATE = PUBLISHED; previewing = false; ADMIN.pending = []; ADMIN.draft = null; shell(); render(); };
    listFiles();
  }
  async function readFiles(files) {
    const msg = $('#dr-msg');
    if (!window.XLSX) { msg.textContent = 'Không tải được thư viện đọc Excel. Kiểm tra kết nối mạng rồi mở lại trang.'; return; }
    for (const f of files) {
      try { const buf = await f.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }); const p = detect(aoa);
        ADMIN.pending = ADMIN.pending.filter(x => x.name !== f.name); ADMIN.pending.push({ name: f.name, p, err: p ? '' : 'Không nhận diện được loại file (thiếu cột tiêu đề chuẩn)' });
      } catch (e) { ADMIN.pending.push({ name: f.name, p: null, err: 'Không đọc được file' }); }
    }
    listFiles();
  }
  function listFiles() {
    const el = $('#flist'); if (!el) return;
    el.innerHTML = ADMIN.pending.map(x => `<div class="fitem ${x.err ? 'err' : ''}"><div><div class="k">${esc(x.name)}</div><div class="n">${x.err ? esc(x.err) : esc(KINDS[x.p.kind].label) + ' · ' + x.p.rows.length + ' dòng' + (x.note ? ' · ' + esc(x.note) : '')}</div></div>${x.err ? '' : '<span class="pill good">OK</span>'}</div>`).join('');
    const ok = ADMIN.pending.some(x => x.p); $('#dr-preview').disabled = !ok; $('#dr-publish').disabled = !ok && !previewing;
  }
  function buildDraft() {
    const draft = JSON.parse(JSON.stringify(PUBLISHED)); const mv = ($('#opt-month') || {}).value || ''; const sd = ($('#opt-sodate') || {}).value || '';
    const opts = { month: mv.replace('-', ''), soDate: sd.replace(/-/g, ''), now: new Date().toISOString() };
    const list = ADMIN.pending.filter(x => x.p).sort((a, b) => KIND_ORDER.indexOf(a.p.kind) - KIND_ORDER.indexOf(b.p.kind));
    const curM = PUBLISHED.cur.month; let rolled = false;
    list.forEach(x => {
      // Chốt tháng: khi tháng hiện hành đã có file Target Total, Target/Allocation mới tự gán sang tháng kế tiếp
      if ((x.p.kind === 'target' || x.p.kind === 'alloc') && curM && (!opts.month || opts.month === curM) && draft.months[curM]) { opts.month = nextMonth(curM); rolled = true; }
      const r = applyParsed(draft, x.p, opts); x.note = r.note; });
    ADMIN.draft = draft;
    const m = $('#dr-msg'); if (m) m.innerHTML = draft.cur.month !== curM ? `Tháng hiện hành: <b>${fM(curM)} → ${fM(draft.cur.month)}</b>${rolled ? ` (${fM(curM)} đã chốt vào YTD)` : ''}.` : '';
  }
  async function publish() {
    const msg = $('#dr-msg'); const btn = $('#dr-publish');
    if (ADMIN.pending.some(x => x.p) || !ADMIN.draft) buildDraft();
    const next = ADMIN.draft || JSON.parse(JSON.stringify(PUBLISHED)); next.auth = Object.assign({}, PUBLISHED.auth || {}, next.auth || {});
    for (const k of ['npp', 'asm', 'admin']) { const el = $('#pw-' + k); const v = el ? el.value.trim() : ''; if (v) next.auth[k] = await sha(v); } btn.disabled = true; msg.textContent = 'Đang phát hành…';
    try { await ADMIN.art.publish(buildDocument(next)); msg.textContent = 'Đã phát hành. Trang sẽ tải lại với dữ liệu mới.'; }
    catch (e) { btn.disabled = false; msg.textContent = e && e.code === 'conflict' ? 'Có người vừa phát hành phiên bản khác; trang sẽ tải lại, hãy thao tác lại.' : 'Không phát hành được' + (e && e.code ? ' (' + e.code + ')' : '') + '.'; }
  }
  function buildDocument(state) {
    const json = JSON.stringify(state).replace(/</g, '\\u003c');
    const title = document.querySelector('title') ? document.querySelector('title').textContent : 'Daily Sale by Distributor';
    const cssText = document.getElementById('page-css').textContent;
    const logoTag = `<script id="logo-src" type="text/plain">${LOGO}</scr` + `ipt>`;
    const scripts = ['engine', 'main'].map(id => `<script id="${id}">${document.getElementById(id).textContent}</scr` + `ipt>`).join('');
    return window.__SKELETON_HEAD + `<title>${esc(title)}</title><style id="page-css">${cssText}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"><div id="app"></div><script id="state" type="application/json">${json}</scr` + `ipt><script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></scr` + `ipt>` + logoTag + scripts + '</body></html>';
  }

  loginView();
})();
