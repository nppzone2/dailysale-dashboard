/* ===== App: render dashboard từ STATE ===== */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GROUPS = ['Group AA', 'Group BB', 'Khác'];
    const TABS = [['target', 'Target tháng'], ['landing', 'Tổng quan'], ['progress', 'Sale In-Out MTD'], ['alloc', 'Allocation'], ['tracking', 'Tracking Allocation'], ['history', 'YTD as of M-1']];

  let STATE = null; const ENC = window.ENC || { blobs: {} };
  let PUBLISHED = STATE; let previewing = false;
  const ui = { trSku: 'all', tab: 'landing', scope: 'all', area: 'all', npp: 'all', brand: 'all', bgf: 'all', unit: 'case', tMonth: '', open: new Set(), allocSku: 'all' };
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
  function logout() { ROLE = null; STATE = null; loginView.admin = false; loginView(); }
  async function tryLogin(u, pw) {
    if (!Object.keys(ENC.blobs).length) return 'Dashboard chưa có dữ liệu.';
    const D = await unlock(u, pw); if (!D) return ENC.maint && String(u || '').trim().toLowerCase() !== 'admin' ? 'Hệ thống đang bảo trì, hiện chỉ tài khoản Admin đăng nhập được.' : 'Sai tên đăng nhập hoặc mật khẩu.';
    STATE = D.state; PUBLISHED = STATE; ui.area = 'all'; ui.npp = 'all'; ui.tMonth = ''; ui.open.clear(); enter(D.role); return true;
  }
  function loginView(msg) {
    const M = ENC.maint;
    if (M && !loginView.admin) {
      app.innerHTML = `<div class="login"><div class="login-card maint">
        <img class="logo lg" src="${LOGO}" alt="EverGreen" width="84" height="84">
        <div><div class="brand-t">Distributor Sales Performance</div><div class="brand-s"><b>RTC - Future Fit</b> · HCM Zone 2</div></div>
        <div class="mt-ic" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/></svg></div>
        <h1 class="mt-t">Dashboard đang bảo trì</h1>
        <p class="mt-m">${esc(M.msg || 'Hệ thống đang được cập nhật số liệu. Vui lòng quay lại sau ít phút.')}</p>
        ${M.since ? `<p class="note" style="margin:0;text-align:center">Bắt đầu bảo trì ${esc(M.since)}</p>` : ''}
        <button class="linkbtn mt-adm" id="mt-adm">Đăng nhập quản trị</button></div></div>`;
      $('#mt-adm').onclick = () => { loginView.admin = true; loginView(); };
      return;
    }
    app.innerHTML = `<div class="login"><form class="login-card" id="login-form" autocomplete="on">
      <img class="logo lg" src="${LOGO}" alt="EverGreen" width="84" height="84">
      <div><div class="brand-t">Distributor Sales Performance</div><div class="brand-s"><b>RTC - Future Fit</b> · HCM Zone 2</div></div>
      <label for="lg-u">Tên đăng nhập</label><input id="lg-u" autocomplete="username" placeholder="UserName" required>
      <label for="lg-p">Mật khẩu</label><div class="pwbox"><input id="lg-p" type="password" autocomplete="current-password" required><button type="button" id="lg-eye" class="eye" aria-label="Hiện mật khẩu" aria-pressed="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3l18 18"/></svg></button></div>
      ${M ? '<div class="mt-note">Đang bảo trì: chỉ tài khoản Admin đăng nhập được.</div>' : ''}<div class="lg-err" id="lg-err">${esc(msg || '')}</div>
      <button class="btn primary" type="submit">Đăng nhập</button>
      <p class="note" style="margin:0;text-align:center">Cập nhật ${esc(ENC.built || '—')}</p></form></div>`;
    $('#lg-eye').onclick = () => { const i = $('#lg-p'), b = $('#lg-eye'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); i.focus(); };
    $('#login-form').addEventListener('submit', async e => { e.preventDefault(); const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang mở dữ liệu…'; $('#lg-err').textContent = '';
      const res = await tryLogin($('#lg-u').value, $('#lg-p').value); if (res !== true) { btn.disabled = false; btn.textContent = 'Đăng nhập'; $('#lg-err').textContent = res; } });
  }

  /* ---------- allocation: tuần hiện tại theo lịch chia (sheet Upload Date) ---------- */
  const todayKey = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const wkSort = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  function currentWeek(weeks) {
    const D = (STATE.cur || {}).allocDates || {}; const t = todayKey();
    const started = weeks.filter(w => (D[w] || []).some(d => d && d <= t));
    return started.length ? started[started.length - 1] : weeks[weeks.length - 1];
  }

  /* ---------- helpers ---------- */
  const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmt = v => ui.unit === 'hl' ? nf1.format(v || 0) : nf0.format(Math.round(v || 0));
  const fmtC = v => nf0.format(Math.round(v || 0));
  const pct = v => isFinite(v) ? nf1.format(v * 100) + '%' : '—';
  const pctT = (v, tg) => !isFinite(v) ? pct(v) : `<span class="${v >= tg ? 'hi' : 'lo'}">${pct(v)}</span>`;
  const pctA = v => !isFinite(v) ? pct(v) : `<span class="${v < 1 ? 'lo' : 'hi'}">${pct(v)}</span>`;
  /* Biểu đồ tiến độ theo BrandFamily: mỗi brand 2 thanh (Sale In, Sale Out) so với mốc (time gone hoặc 100%) */
  function brandProgress(list, mark, markLabel) {
    const rows = list.filter(r => r.t > 0).sort((a, b) => b.t - a.t);
    if (!rows.length) return '<p class="note">Chưa có target theo BrandFamily.</p>';
    const max = Math.max(1.1, mark * 1.1, ...rows.map(r => Math.max(r.si, r.so) / r.t)) ;
    const w = v => Math.max(0, Math.min(100, v / max * 100));
    return `<div class="bp">${rows.map(r => { const a = r.si / r.t, b = r.so / r.t; const ok = a >= mark;
      return `<div class="bp-row"><div class="bp-l"><b>${esc(r.k)}</b><span class="note">${fmt(r.t)} ${U()}</span></div>
        <div class="bp-t" title="${esc(r.k)}"><span class="bp-m" style="left:${w(mark)}%"></span>
          <i class="bp-si" style="width:${w(a)}%"></i><i class="bp-so" style="width:${w(b)}%"></i></div>
        <div class="bp-v"><span class="${ok ? 'hi' : 'lo'}">${pct(a)}</span><span class="note">SO ${pct(b)}</span></div></div>`; }).join('')}
      <div class="bp-row bp-axis"><div></div><div class="bp-t0"><span class="bp-ml" style="left:${w(mark)}%">${esc(markLabel)}</span></div><div></div></div></div>`;
  }
  const U = () => ui.unit === 'hl' ? 'HL' : 'Case';
  const item = sc => STATE.items[sc] || { b: '', bg: '', g: '', hl: null };
  const brandOf = sc => item(sc).b || 'Khác';
  const inBrand = sc => (ui.brand === 'all' || brandOf(sc) === ui.brand) && (ui.bgf === 'all' || grp(sc) === ui.bgf);
  const bchip = sc => item(sc).b ? `<span class="chip">${esc(item(sc).b)}</span>` : '';
  // Phân nhóm: Larue, Bivina luôn thuộc nhóm Khác; Strongbow luôn thuộc Group BB; còn lại theo BrandGroup trong Item Master
  const grp = sc => { const b = String(item(sc).b || '').trim().toLowerCase();
    if (b === 'larue' || b === 'bivina') return 'Khác';
    if (b === 'strongbow') return 'Group BB';
    return item(sc).bg || 'Khác'; };
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
  // Thứ tự cố định: Area HCM 11 → HCM 3 → HCM 4 → HCM 5; NPP HM12 → P444 → P461 → P467 → P449 → P468 → P450 → P69 (mã mới xếp sau)
  const AREA_ORDER = ['HCM11', 'HCM3', 'HCM4', 'HCM5'];
  const NPP_ORDER = ['HM12', 'P444', 'P461', 'P467', 'P449', 'P468', 'P450', 'P69'];
  const rk = (list, k) => { const i = list.indexOf(String(k || '').replace(/\s+/g, '').toUpperCase()); return i < 0 ? 999 : i; };
  const areaCmp = (a, b) => rk(AREA_ORDER, a) - rk(AREA_ORDER, b) || String(a).localeCompare(String(b), 'vi', { numeric: true });
  const areaOf = c => (STATE.npps[c] || {}).area || '—';
  const nppCmp = (a, b) => areaCmp(areaOf(a), areaOf(b)) || rk(NPP_ORDER, a) - rk(NPP_ORDER, b) || String(a).localeCompare(String(b), 'vi', { numeric: true });
  const npAll = () => Object.keys(STATE.npps).sort(nppCmp);
  const byArea = cs => { const m = new Map(); [...cs].sort(nppCmp).forEach(c => { const a = areaOf(c); if (!m.has(a)) m.set(a, []); m.get(a).push(c); }); return [...m.entries()]; };
  const missingHl = new Set();
  ui.flip = new Set(); // các mục đã đổi trạng thái mở/đóng so với mặc định
  const isOpen = (k, def) => def !== ui.flip.has(k);

  /* ---------- current month model ---------- */
  function curModel() {
    const cur = STATE.cur || {}; const m = cur.month;
    const siDays = Object.keys(cur.si || {}).sort(); const soDays = Object.keys(cur.so || {}).sort();
    const lastSi = siDays[siDays.length - 1] || ''; const lastSo = soDays[soDays.length - 1] || '';
    const D = m ? dim(m) : 30;
    const dSi = lastSi ? +lastSi.slice(6) : 0; const dSo = lastSo ? +lastSo.slice(6) : 0;
    const rows = {};
    const R = (c, sc) => rows[c + '|' + sc] || (rows[c + '|' + sc] = { c, sc, t: 0, si: 0, so: 0, st0: 0, dso: 0 });
    (cur.target || []).forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).t += v; });
    siDays.forEach(d => cur.si[d].forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).si += v; }));
    if (lastSo) cur.so[lastSo].rows.forEach(([c, sc, v]) => { if (inScope(c) && inBrand(sc)) R(c, sc).so += v; });
    // Thực đạt Sale In = SO Invoice + đơn Delivery (Online Order) chưa có trong SO Invoice (InvoiceNumber = Order Number)
    const invNo = new Set((cur.lines || []).map(l => String(l[2]))); let delivQ = 0; const delivNo = new Set();
    (cur.orders || []).forEach(o => { if (/deliver/i.test(o[2]) && !invNo.has(String(o[1])) && inScope(o[0]) && inBrand(o[3])) { R(o[0], o[3]).si += o[4]; delivQ += conv(o[4], o[3]); delivNo.add(o[1]); } });
    // Tồn kho đầu tháng (file Stock) + Sale Out bình quân ngày để tính số ngày tồn
    ((cur.stock || {}).rows || []).forEach(([c, sc, st, dso]) => { if (inScope(c) && inBrand(sc)) { const o = R(c, sc); o.st0 += st; o.dso += dso; } });
    const list = Object.values(rows);
    list.forEach(r => { if ((r.t || r.si || r.so) && item(r.sc).hl == null) missingHl.add(r.sc); });
    return { stockDate: (cur.stock || {}).date || '', m, D, siDays, soDays, lastSi, lastSo, dSi, dSo, tgSi: dSi / D, tgSo: dSo / D, list, delivQ, delivN: delivNo.size };
  }
  const sumBy = (list, f) => list.reduce((s, r) => s + f(r), 0);
  function aggregate(list, keyF) {
    const out = {};
    list.forEach(r => { const k = keyF(r); const o = out[k] || (out[k] = { k, t: 0, si: 0, so: 0, st0: 0, dso: 0, rows: [] });
      o.t += conv(r.t, r.sc); o.si += conv(r.si, r.sc); o.so += conv(r.so, r.sc); o.st0 += conv(r.st0 || 0, r.sc); o.dso += conv(r.dso || 0, r.sc); o.rows.push(r); });
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
    const npps = npAll(); const areas = [...new Set(npps.map(c => STATE.npps[c].area).filter(Boolean))].sort(areaCmp);
    const cur = STATE.cur || {}; const siD = Object.keys(cur.si || {}).sort().pop(); const soD = Object.keys(cur.so || {}).sort().pop();
    const wk = currentWeek([...new Set((cur.alloc || []).map(r => r[0]))].sort(wkSort));
    const used = new Set([...(cur.target || []).map(r => r[1]), ...Object.values(cur.si || {}).flat().map(r => r[1]), ...Object.values(STATE.months || {}).flatMap(x => x.rows.map(r => r[1]))]);
    const bOrder = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss'];
    const brands = [...new Set([...used].map(brandOf))].filter(b => b !== 'Khác').sort((a, b) => ((bOrder.indexOf(a) + 1) || 99) - ((bOrder.indexOf(b) + 1) || 99) || a.localeCompare(b));
    app.innerHTML = `
    ${previewing ? '<div class="preview-bar">Đang xem trước dữ liệu mới, chưa phát hành cho NPP</div>' : ''}
    ${ENC.maint && ROLE.type === 'admin' ? '<div class="preview-bar maint-bar">Đang bật chế độ bảo trì · NPP và ASM chưa xem được dashboard</div>' : ''}
    ${reportBox()}
    <header class="band"><div class="band-in">
      <div class="brandrow">
        <div class="brand"><img class="logo" src="${LOGO}" alt="EverGreen" width="52" height="52">
          <div><div class="brand-t">Distributor Sales Performance</div><div class="brand-s"><b>RTC - Future Fit</b> · HCM Zone 2 · ${esc(fM(cur.month))}</div></div></div>
        <div class="fresh"><span>Sale In <b>${fD(siD)}</b></span><span>Sale Out <b>${fD(soD)}</b></span><span>Allocation <b>${esc(wk || '—')}</b></span><span class="who">${esc(ROLE.type === 'npp' ? ROLE.id : ROLE.label)}<button id="logout" class="linkbtn">Đăng xuất</button></span></div>
      </div>
      <nav class="tabs" role="tablist">${TABS.concat(ROLE && ROLE.type === 'admin' ? [['ref', 'Tham chiếu xe']] : []).map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${ui.tab === k || (ui.tab === 'pending' && k === 'progress')}">${l}</button>`).join('')}</nav>
    </div></header>
    <div class="filters"><div class="filters-in">
      <div class="fld"><label for="area">Khu vực</label><select id="area" ${ROLE.type !== 'admin' ? 'disabled' : ''}>
        ${ROLE.type === 'admin' ? '<option value="all">Tất cả khu vực</option>' : ''}${areas.filter(a => ROLE.type === 'admin' || a === ROLE.area).map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
      </select></div>
      <div class="fld"><label for="npp">Mã NPP</label><select id="npp" ${ROLE.type === 'npp' ? 'disabled' : ''}>
        ${ROLE.type !== 'npp' ? '<option value="all">Tất cả NPP</option>' : ''}${npps.filter(c => (ui.area === 'all' || STATE.npps[c].area === ui.area) && (ROLE.type !== 'npp' || c === ROLE.id)).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select></div>
      <div class="fld"><label for="bgf">BrandGroup</label><select id="bgf"><option value="all">Tất cả</option>${GROUPS.filter(g => g !== 'Khác').map(g => `<option value="${g}">${g}</option>`).join('')}</select></div>
      <div class="fld"><label for="brand">BrandFamily</label><select id="brand"><option value="all">Tất cả</option>${brands.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}</select></div>
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
    const rx = $('#rep-x'); if (rx) rx.onclick = () => { ui.repHide = STATE.lastReport.at; shell(); render(); };
    app.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => { ui.unit = b.dataset.unit; saveUi(); app.querySelectorAll('[data-unit]').forEach(x => x.setAttribute('aria-pressed', x.dataset.unit === ui.unit)); render(); });
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; saveUi(); app.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === ui.tab)); render(); });
    if (ADMIN.ok && ROLE && ROLE.type === 'admin') { const b = $('#admin-btn'); b.hidden = false; b.onclick = openDrawer; }
  }

  /* Cảnh báo dữ liệu nguồn của lần tải gần nhất (chỉ Admin thấy) */
  function reportBox() {
    const R = STATE && STATE.lastReport; if (!R || ROLE.type !== 'admin' || ui.repHide === R.at) return '';
    const items = [...(R.rejects || []).map(r => ({ lv: 'error', t: `<b>${esc(r.file)}</b>: ${esc(r.reason)}` })), ...(R.warns || []).map(w => ({ lv: w.level, t: esc(w.msg) }))];
    if (!items.length) return '';
    const bad = items.some(x => x.lv === 'error');
    return `<div class="repbox ${bad ? 'bad' : ''}"><div class="repbox-in"><div><b>${bad ? 'Cảnh báo dữ liệu nguồn' : 'Lưu ý dữ liệu'}</b> · lần tải ${esc(fTs(R.at))}<ul>${items.map(x => `<li class="${x.lv}">${x.t}</li>`).join('')}</ul></div><button class="linkbtn" id="rep-x">Đã xem</button></div></div>`;
  }
  function render() { missingHl.clear(); const v = $('#view'); chartId = 0; CHARTS = [];
    if (ui.tab === 'ref' && ROLE.type !== 'admin') ui.tab = 'landing';
    v.innerHTML = ({ landing: viewLanding, ref: viewRef, target: viewTarget, progress: viewProgress, alloc: viewAlloc, tracking: viewTracking, pending: viewPending, history: viewHistory }[ui.tab] || viewProgress)();
    bindView(); drawCharts(); }

  const conclusion = pts => `<section class="concl"><svg class="star" width="18" height="18" viewBox="0 0 30 30" aria-hidden="true"><path d="M15 2l3.9 8.4 9.1 1-6.8 6.2 1.9 9-8.1-4.6-8.1 4.6 1.9-9L2 11.4l9.1-1z" fill="currentColor"/></svg><div><div class="eyebrow">Kết luận nhanh</div><ul>${pts.filter(Boolean).map(p => `<li>${p}</li>`).join('')}</ul></div></section>`;
  const hlNote = () => missingHl.size && ui.unit === 'hl' ? `<div class="warnbox">Chưa có hệ số HL trong Item Master cho: <b>${[...missingHl].sort().join(', ')}</b>. Các mã này tính 0 HL; xem theo Case để thấy đủ sản lượng.</div>` : '';

  /* ---------- TAB: Tổng quan (landing) · Còn lại Target − Sale In − Pending, quy đổi số xe ---------- */
  const LG = ['Group AA', 'Group BB', 'Tổng'];
  const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  function refMap() { const m = {}; ((STATE.ref || {}).rows || []).forEach(([c, aa, bb, hx]) => { if (typeof aa === 'string') return; m[c] = { aa: +aa || 0, bb: +bb || 0, hx: +hx || 0 }; }); return m; }
  function landingModel() {
    const M = curModel(); const P = pendingOrders(); const by = {};
    const R = (c, g) => { const n = by[c] || (by[c] = {}); return n[g] || (n[g] = { t: 0, si: 0, pd: 0, th: 0, sih: 0, pdh: 0 }); };
    M.list.forEach(r => { const h = item(r.sc).hl || 0; [grp(r.sc), 'Tổng'].forEach(g => { const o = R(r.c, g); o.t += r.t; o.si += r.si; o.th += r.t * h; o.sih += r.si * h; }); });
    P.forEach(o => { const h = item(o[3]).hl || 0; [grp(o[3]), 'Tổng'].forEach(g => { const x = R(o[0], g); x.pd += o[4]; x.pdh += o[4] * h; }); });
    const RF = refMap(); const zero = { t: 0, si: 0, pd: 0, th: 0, sih: 0, pdh: 0 };
    const row = (c, g) => { const o = (by[c] || {})[g] || zero; const rc = o.t - o.si - o.pd, rh = o.th - o.sih - o.pdh;
      const rf = RF[c]; const on = !rf ? 0 : g === 'Group AA' ? rf.aa : g === 'Group BB' ? rf.bb : rf.aa + rf.bb;
      const xe = rf && rf.hx ? Math.ceil((Math.max(0, rh) + on) / rf.hx - 1e-9) : null; // số xe làm tròn lên số nguyên
      return { ...o, rc, rh, on, xe, hasRef: !!(rf && rf.hx) }; };
    const npps = Object.keys(by).filter(c => by[c]['Tổng'] && (by[c]['Tổng'].t || by[c]['Tổng'].si || by[c]['Tổng'].pd)).sort(nppCmp);
    const add = rows => { const o = { t: 0, si: 0, pd: 0, th: 0, sih: 0, pdh: 0, rc: 0, rh: 0, on: 0, xe: null };
      rows.forEach(x => { ['t', 'si', 'pd', 'th', 'sih', 'pdh', 'rc', 'rh', 'on'].forEach(k => o[k] += x[k]); if (x.xe != null) o.xe = (o.xe || 0) + x.xe; }); return o; };
    return { M, npps, row, add };
  }
  function viewLanding() {
    const L = landingModel(); const { M, npps, row, add } = L;
    if (!M.m) return '<div class="card empty">Chưa có dữ liệu tháng hiện hành.</div>';
    const remC = v => v >= 0 ? fmtC(v) : `<span class="ov">Vượt ${fmtC(-v)}</span>`;
    const remH = v => v >= 0 ? nf2.format(v) : `<span class="ov">Vượt ${nf2.format(-v)}</span>`;
    const xeF = v => v == null ? '<span class="note">Chưa có</span>' : `<b>${fmtC(v)}</b>`;
    const cells = o => `<td class="gs">${fmtC(o.t)}</td><td>${fmtC(o.si)}</td><td>${fmtC(o.pd)}</td><td>${o.t ? pctT((o.si + o.pd) / o.t, M.tgSi) : '—'}</td><td class="rem">${remC(o.rc)}</td><td class="gs">${remH(o.rh)}</td><td>${o.on ? nf2.format(o.on) : '<span class="note">–</span>'}</td><td class="xe">${xeF(o.xe)}</td>`;
    let body = ''; const totN = [];
    byArea(npps).forEach(([a, cs]) => { const ak = 'ld:a:' + a, op = isOpen(ak, true);
      const at = add(cs.map(c => row(c, 'Tổng')));
      body += `<tr class="grp area click${op ? ' open' : ''}" data-fold="${esc(ak)}"><td><span class="caret">▸</span> ${esc(a)}</td><td>${cs.length} NPP</td><td>Tổng</td>${cells(at)}</tr>`;
      cs.forEach(c => { totN.push([c, row(c, 'Tổng')]); if (!op) return; const nk = 'ld:n:' + c, nOp = isOpen(nk, true);
        const nm = `<span class="caret fold${nOp ? ' on' : ''}" data-fold="${esc(nk)}" role="button" aria-label="Mở/thu gọn ${esc(c)}">▸</span> <span class="click-npp" data-npp="${esc(c)}">${esc(c)}</span>`;
        (nOp ? LG : ['Tổng']).forEach((g, i) => { const o = row(c, g);
          body += `<tr class="${g === 'Tổng' ? 'ltot' : 'lsub'}${i === 0 ? ' first' : ''}"><td></td><td>${i === 0 ? nm : ''}</td><td>${g === 'Tổng' ? '<b>Tổng</b>' : esc(g.replace('Group ', ''))}</td>${cells(o)}</tr>`; }); }); });
    const T = add(totN.map(x => x[1]));
    body += `<tr class="tot"><td>Tổng</td><td></td><td></td>${cells(T)}</tr>`;
    const gT = g => add(npps.map(c => row(c, g)));
    const AA = gT('Group AA'), BB = gT('Group BB');
    const missing = npps.filter(c => !row(c, 'Tổng').hasRef);
    const topXe = totN.filter(([, o]) => o.xe != null).sort((a, b) => b[1].xe - a[1].xe)[0];
    const sk = !ROLE || ROLE.type !== 'admin' ? '' : `<button class="btn" data-go="ref">Tham chiếu xe</button>`;
    return `
    <section class="lead"><div><div class="eyebrow">Tổng quan · ${fM(M.m)} · cập nhật đến ${fD(M.lastSi)}</div><h1>${esc(scopeLabel())}</h1>
      <p>Còn lại = Target − Sale In − Pending. Số xe còn lại = (Còn lại HL + Ontop HL) ÷ HL của 1 xe.</p></div>
      <div class="btns">${sk}<button class="btn" id="xl-landing">Tải Excel</button></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Target tháng</div><div class="kpi-v">${fmtC(T.t)}<small>Case</small></div><div class="kpi-f">${nf2.format(T.th)} HL</div></div>
      <div class="card c3 kpi${T.t && T.si / T.t < M.tgSi ? ' slowcard' : ''}"><div class="kpi-l">Sale In MTD</div><div class="kpi-v">${fmtC(T.si)}<small>Case</small></div><div class="kpi-f"><b>${pctT(T.t ? T.si / T.t : NaN, M.tgSi)}</b> target · time gone ${pct(M.tgSi)}</div></div>
      <div class="card c3 kpi" role="button" tabindex="0" data-go="pending" style="cursor:pointer"><div class="kpi-l">SO Pending</div><div class="kpi-v">${fmtC(T.pd)}<small>Case</small></div><div class="kpi-f">${nf2.format(T.pdh)} HL · xem chi tiết →</div></div>
      <div class="card c3 kpi hero"><div class="kpi-l">Còn lại cần giao</div><div class="kpi-v">${fmtC(Math.max(0, T.rc))}<small>Case</small></div><div class="kpi-f">${nf2.format(Math.max(0, T.rh))} HL · <b>${T.xe == null ? '—' : fmtC(T.xe)} xe</b></div></div>
      <div class="card c12"><div class="card-h"><div><h2>Còn lại theo Khu vực / NPP / Group</h2><p class="sub">Target, Sale In, Pending, Còn lại theo Case · Còn lại, Ontop theo HL · % = (Sale In + Pending) ÷ Target, xanh khi ≥ time gone ${pct(M.tgSi)} · bấm mũi tên để mở hoặc thu gọn</p></div></div>
        <div class="tw"><table class="ag lnd"><thead><tr><th>Khu vực</th><th>NPP</th><th>Group</th><th class="gs">Target</th><th>Sale In</th><th>Pending</th><th title="(Sale In + Pending) ÷ Target, so với time gone">% (SI + Pending)</th><th>Còn lại (Case)</th><th class="gs">Còn lại (HL)</th><th>Ontop HL</th><th>Số xe còn lại</th></tr></thead><tbody>${body}</tbody></table></div>
        ${missing.length ? `<p class="note" style="margin:8px 0 0">Chưa có HL của 1 xe cho: ${missing.map(esc).join(', ')}${ROLE.type === 'admin' ? ' · cập nhật ở tab Tham chiếu xe' : ''}.</p>` : ''}</div>
    </div>
    ${conclusion([
      `Còn lại <b>${fmtC(Math.max(0, T.rc))} case</b> (${nf2.format(Math.max(0, T.rh))} HL) sau khi trừ Sale In và Pending${T.on ? `, cộng Ontop ${nf2.format(T.on)} HL` : ''}${T.xe != null ? `, tương đương <b>${fmtC(T.xe)} xe</b>` : ''}.`,
      `Group AA còn <b>${fmtC(Math.max(0, AA.rc))} case</b>${AA.xe != null ? ` (${fmtC(AA.xe)} xe)` : ''}; Group BB còn <b>${fmtC(Math.max(0, BB.rc))} case</b>${BB.xe != null ? ` (${fmtC(BB.xe)} xe)` : ''}.`,
      topXe && totN.length > 1 ? `NPP cần nhiều xe nhất: <b>${esc(topXe[0])}</b> (${fmtC(topXe[1].xe)} xe).` : ''
    ])}`;
  }
  function exportLanding(ev) {
    const { M, npps, row, add } = landingModel();
    const C = { band: '0A4A2A', brand: '0B6B39', soft: 'E3F1E8', sub: 'F3F5F4', line: 'D9DED9', ink: '14201A', muted: '6B7A70', good: '137A3F', goodBg: 'DDF2E5', bad: 'C8102E', badBg: 'FBE3E5', white: 'FFFFFF' };
    const bd = { top: { style: 'thin', color: { rgb: C.line } }, bottom: { style: 'thin', color: { rgb: C.line } } };
    const st = (o = {}) => ({ font: { name: 'Arial', sz: 10, color: { rgb: o.color || C.ink }, bold: !!o.bold }, fill: o.fill ? { patternType: 'solid', fgColor: { rgb: o.fill } } : undefined, alignment: { horizontal: o.h || 'right', vertical: 'center', wrapText: !!o.wrap }, border: o.border === false ? undefined : bd, numFmt: o.nf });
    const H = ['Khu vực', 'NPP', 'Group', 'Target (Case)', 'Sale In (Case)', 'Pending (Case)', '% (SI + Pending)', 'Còn lại (Case)', 'Còn lại (HL)', 'Ontop HL', 'Số xe còn lại'];
    const N = H.length; const rows = []; const merges = [];
    const put = (cells, styles, height) => { rows.push({ cells, styles, height }); return rows.length - 1; };
    const title = `Distributor Sales Performance · Tổng quan ${fM(M.m)}`;
    put([title], [st({ bold: true, color: C.white, fill: C.band, h: 'left', border: false })], 30); merges.push([0, 0, N - 1]);
    put([`RTC - Future Fit · HCM Zone 2 · ${scopeLabel()} · cập nhật đến ${fD(M.lastSi)} · time gone ${pct(M.tgSi)}`], [st({ color: 'B9D3C2', fill: C.band, h: 'left', border: false })], 20); merges.push([1, 0, N - 1]);
    put(['Còn lại = Target − Sale In − Pending · % = (Sale In + Pending) ÷ Target, xanh khi ≥ time gone · Số xe = (Còn lại HL + Ontop HL) ÷ HL của 1 xe, làm tròn lên'], [st({ color: C.muted, h: 'left', border: false })], 18); merges.push([2, 0, N - 1]);
    put([], [], 8);
    const hr = put(H, H.map((_, k) => st({ bold: true, color: C.muted, fill: C.soft, h: k < 3 ? 'left' : 'center', wrap: true })), 30);
    const line = (a, n, g, o, kind) => {
      const p = o.t ? (o.si + o.pd) / o.t : null; const ok = p != null && p >= M.tgSi;
      const base = kind === 'area' ? { fill: C.band, color: C.white, bold: true } : kind === 'tot' ? { fill: C.sub, bold: true } : kind === 'grand' ? { fill: C.soft, bold: true } : {};
      const v = [a, n, g, Math.round(o.t), Math.round(o.si), Math.round(o.pd), p, Math.round(o.rc), Math.round(o.rh * 10) / 10, o.on ? Math.round(o.on * 10) / 10 : null, o.xe == null ? 'Chưa có' : o.xe];
      const s2 = v.map((_, k) => {
        if (k < 3) return st({ ...base, h: 'left', color: k === 1 && kind === 'npp' ? C.brand : base.color, bold: base.bold || (k === 1 && kind === 'npp') });
        if (k === 6) return st({ ...base, h: 'center', bold: true, nf: '0.0%', color: p == null ? base.color : kind === 'area' ? (ok ? '9FE3BC' : 'FFB3B8') : ok ? C.good : C.bad, fill: kind === 'area' ? base.fill : p == null ? base.fill : ok ? C.goodBg : C.badBg });
        if (k === 7) return st({ ...base, nf: '#,##0;[Color10]"Vượt "#,##0', bold: true });
        if (k === 8 || k === 9) return st({ ...base, nf: '#,##0.0;[Color10]"Vượt "#,##0.0' });
        if (k === 10) return st({ ...base, bold: true, h: 'center', nf: '#,##0', fill: kind === 'area' ? base.fill : C.soft, color: kind === 'area' ? C.white : o.xe == null ? C.muted : C.brand });
        return st({ ...base, nf: '#,##0' });
      });
      put(v, s2, kind === 'area' || kind === 'grand' ? 22 : 18);
    };
    const totN = [];
    byArea(npps).forEach(([a, cs]) => {
      line(a, `${cs.length} NPP`, 'Tổng', add(cs.map(c => row(c, 'Tổng'))), 'area');
      cs.forEach(c => { totN.push(row(c, 'Tổng')); LG.forEach((g, i) => line('', i === 0 ? c : '', g === 'Tổng' ? 'Tổng' : g.replace('Group ', ''), row(c, g), g === 'Tổng' ? 'tot' : i === 0 ? 'npp' : 'sub')); });
    });
    line('Tổng', '', '', add(totN), 'grand');
    const T = add(totN);
    put([], [], 10);
    const cl = put(['Kết luận nhanh'], [st({ bold: true, color: C.white, fill: C.band, h: 'left', border: false })], 22); merges.push([cl, 0, N - 1]);
    const AA = add(npps.map(c => row(c, 'Group AA'))), BB = add(npps.map(c => row(c, 'Group BB')));
    [`Còn lại ${fmtC(Math.max(0, T.rc))} case (${nf2.format(Math.max(0, T.rh))} HL) sau khi trừ Sale In và Pending${T.on ? `, cộng Ontop ${nf2.format(T.on)} HL` : ''}${T.xe != null ? `, tương đương ${fmtC(T.xe)} xe` : ''}.`,
     `Group AA còn ${fmtC(Math.max(0, AA.rc))} case${AA.xe != null ? ` (${fmtC(AA.xe)} xe)` : ''}; Group BB còn ${fmtC(Math.max(0, BB.rc))} case${BB.xe != null ? ` (${fmtC(BB.xe)} xe)` : ''}.`]
      .forEach(t => { const r = put(['• ' + t], [st({ color: C.white, fill: C.band, h: 'left', border: false })], 18); merges.push([r, 0, N - 1]); });
    // dựng sheet có định dạng (xlsx-js-style); thư viện thường thì xuất bảng số không màu
    const aoa = rows.map(r => { const a = Array(N).fill(null); r.cells.forEach((v, k) => a[k] = v); return a; });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    rows.forEach((r, ri) => { for (let k = 0; k < N; k++) { const ref = XLSX.utils.encode_cell({ r: ri, c: k }); const sty = r.styles[k] || r.styles[0];
      if (!sty) continue; if (!ws[ref]) ws[ref] = { t: 's', v: '' }; ws[ref].s = sty; if (sty.numFmt && ws[ref].t === 'n') ws[ref].z = sty.numFmt; } });
    ws['!merges'] = merges.map(([r, c1, c2]) => ({ s: { r, c: c1 }, e: { r, c: c2 } }));
    ws['!cols'] = [10, 9, 8, 13, 13, 12, 12, 13, 12, 10, 11].map(w => ({ wch: w }));
    ws['!rows'] = rows.map(r => r.height ? { hpt: r.height } : {});
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: hr, c: 0 }, e: { r: hr, c: N - 1 } }) };
    saveXlsx(`Tong_quan_${STATE.cur.month}_${scopeTag()}.xlsx`, [['Tổng quan', ws]], ev.currentTarget);
  }
  /* ---------- TAB: Tham chiếu xe (chỉ Admin) ---------- */
  function viewRef() {
    const RF = refMap(); const npps = npAll().filter(inScope);
    const v = x => x ? String(x).replace('.', ',') : '';
    const inp = (c, k, val, lb) => `<input class="rin" inputmode="decimal" data-rc="${esc(c)}" data-rk="${k}" value="${v(val)}" placeholder="0" aria-label="${lb} ${esc(c)}">`;
    let body = '';
    byArea(npps).forEach(([a, cs]) => cs.forEach((c, i) => { const r = RF[c] || {};
      body += `<tr class="${i === 0 ? 'first' : ''}"><td>${i === 0 ? `<b>${esc(a)}</b>` : ''}</td><td><b>${esc(c)}</b></td><td>${inp(c, 'aa', r.aa, 'Ontop HL Group AA')}</td><td>${inp(c, 'bb', r.bb, 'Ontop HL Group BB')}</td><td>${inp(c, 'hx', r.hx, 'HL của 1 xe')}</td></tr>`; }));
    const at = (STATE.ref || {}).at;
    return `
    <section class="lead"><div><div class="eyebrow">Tham chiếu xe · chỉ Admin</div><h1>Ontop HL và HL của 1 xe</h1>
      <p>Dùng để tính cột Ontop HL và Số xe còn lại ở tab Tổng quan.</p></div>
      <div class="btns"><button class="btn" id="ref-apply">Áp dụng xem thử</button><button class="btn primary" id="ref-xl">Tải file để upload</button></div></section>
    ${at === 'draft' ? '<div class="warnbox">Đang xem thử số vừa nhập, chưa lưu. Bấm <b>Tải file để upload</b> rồi tải file lên thư mục <b>input/</b> trên GitHub để lưu cho mọi tài khoản.</div>' : ''}
    <div class="grid"><div class="card c12"><div class="card-h"><div><h2>Bảng tham chiếu theo NPP</h2><p class="sub">${at === 'draft' ? 'Đang xem thử' : at ? 'Cập nhật ' + esc(fTs(at)) : 'Chưa có bảng tham chiếu'} · đơn vị HL</p></div></div>
      <div class="tw"><table class="reft"><thead><tr><th>Khu vực</th><th>NPP</th><th>OnTop HL Group AA</th><th>OnTop HL Group BB</th><th>HL của 1 xe</th></tr></thead><tbody>${body}</tbody></table></div></div></div>
    ${conclusion(['Cách lưu: nhập số → <b>Tải file để upload</b> → tải file <b>Tham_chieu_xe.xlsx</b> lên thư mục <b>input/</b> trên GitHub. Khoảng 2 phút sau, tab Tổng quan của NPP và ASM cập nhật theo.'])}`;
  }
  function readRefInputs() {
    const n = s => { const x = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : 0; };
    const by = {}; document.querySelectorAll('.rin').forEach(i => { (by[i.dataset.rc] = by[i.dataset.rc] || { aa: 0, bb: 0, hx: 0 })[i.dataset.rk] = n(i.value); });
    return Object.entries(by).filter(([, x]) => x.aa || x.bb || x.hx).map(([c, x]) => [c, x.aa, x.bb, x.hx]);
  }
  function exportRef(ev) {
    const rows = readRefInputs(); const seen = new Set(rows.map(r => r[0]));
    ((STATE.ref || {}).rows || []).forEach(r => { if (typeof r[1] !== 'string' && !inScope(r[0]) && !seen.has(r[0])) rows.push(r); }); // giữ dòng NPP ngoài bộ lọc
    const out = [['Khu vực', 'NPP', 'OnTop HL Group AA', 'OnTop HL Group BB', 'HL của 1 xe']];
    rows.sort((a, b) => nppCmp(a[0], b[0])).forEach(r => out.push([areaOf(r[0]), r[0], r[1], r[2], r[3]]));
    saveXlsx('Tham_chieu_xe.xlsx', [['Tham chieu xe', out, [10, 9, 18, 18, 13]]], ev.currentTarget);
  }

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
    const npps = [...new Set(rows.map(r => r.c))].sort(nppCmp);
    const multi = npps.length > 1;
    const byG = {}; rows.forEach(r => { const g = grp(r.sc); (byG[g] = byG[g] || {})[r.sc] = (byG[g][r.sc] || {}); byG[g][r.sc][r.c] = (byG[g][r.sc][r.c] || 0) + tv(r); });
    const total = sumBy(rows, tv); const gTot = g => sumBy(rows.filter(r => grp(r.sc) === g), tv);
    // Cột NPP nhóm theo Khu vực; bấm tên khu vực để thu gọn thành 1 cột tổng
    const AG = byArea(npps); const cols = [];
    AG.forEach(([a, cs]) => { if (isOpen('tg:' + a, true)) cs.forEach(c => cols.push({ cs: [c], h: esc(c) })); else cols.push({ cs, h: 'Tổng', sum: true }); });
    const cv = (cs, f) => sumBy(cs, f);
    const head = multi ? `<tr class="ah"><th rowspan="2">BrandFamily</th><th rowspan="2">SKU</th>${AG.map(([a, cs]) => { const op = isOpen('tg:' + a, true); return `<th class="agh click${op ? ' open' : ''}" colspan="${op ? cs.length : 1}" data-fold="${esc('tg:' + a)}"><span class="caret">▸</span> ${esc(a)}</th>`; }).join('')}<th rowspan="2">Tổng</th><th rowspan="2">Tỷ trọng</th></tr>
      <tr class="nh">${cols.map(x => `<th class="${x.sum ? 'asum' : ''}">${x.h}</th>`).join('')}</tr>` : `<tr><th>BrandFamily</th><th>SKU</th><th>Target (Case)</th><th>Target (HL)</th><th>Tỷ trọng</th></tr>`;
    let body = '';
    GROUPS.filter(g => byG[g]).forEach(g => {
      const bo = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss']; const bi = sc => (bo.indexOf(brandOf(sc)) + 1) || 99;
      const skus = Object.keys(byG[g]).sort((a, b) => bi(a) - bi(b) || sumBy(Object.values(byG[g][b]), x => x) - sumBy(Object.values(byG[g][a]), x => x));
      const gv = gTot(g);
      if (multi) {
        body += `<tr class="grp"><td colspan="2">${esc(g)}</td>${cols.map(x => `<td class="${x.sum ? 'asum' : ''}">${fmt(sumBy(skus, sc => cv(x.cs, c => byG[g][sc][c] || 0)))}</td>`).join('')}<td>${fmt(gv)}</td><td>${pct(gv / total)}</td></tr>`;
        skus.forEach(sc => { const tt = sumBy(npps, c => byG[g][sc][c] || 0); body += `<tr class="sku"><td>${esc(item(sc).b || '—')}</td><td class="skuc">${esc(sc)}</td>${cols.map(x => { const v = cv(x.cs, c => byG[g][sc][c] || 0); return `<td class="${x.sum ? 'asum' : ''}">${v ? fmt(v) : '<span class="note">–</span>'}</td>`; }).join('')}<td>${fmt(tt)}</td><td>${pct(tt / total)}</td></tr>`; });
      } else {
        const gc = sumBy(rows.filter(r => grp(r.sc) === g), r => r.tc), gh = sumBy(rows.filter(r => grp(r.sc) === g), r => r.th);
        body += `<tr class="grp"><td colspan="2">${esc(g)}</td><td>${fmtC(gc)}</td><td>${nf1.format(gh)}</td><td>${pct(gv / total)}</td></tr>`;
        skus.forEach(sc => { const rr = rows.filter(r => r.sc === sc); const c = sumBy(rr, r => r.tc), hh = sumBy(rr, r => r.th); body += `<tr class="sku"><td>${esc(item(sc).b || '—')}</td><td class="skuc">${esc(sc)}</td><td>${fmtC(c)}</td><td>${nf1.format(hh)}</td><td>${pct(tv({ tc: c, th: hh }) / total)}</td></tr>`; });
      }
    });
    const tc = sumBy(rows, r => r.tc), th = sumBy(rows, r => r.th);
    body += multi ? `<tr class="tot"><td colspan="2">Tổng</td>${cols.map(x => `<td class="${x.sum ? 'asum' : ''}">${fmt(sumBy(rows.filter(r => x.cs.includes(r.c)), tv))}</td>`).join('')}<td>${fmt(total)}</td><td>100%</td></tr>` : `<tr class="tot"><td colspan="2">Tổng</td><td>${fmtC(tc)}</td><td>${nf1.format(th)}</td><td>100%</td></tr>`;
    const gs = GROUPS.filter(g => byG[g]).map(g => [g, gTot(g)]).sort((a, b) => b[1] - a[1]);
    const prev = months[months.indexOf(m) + 1]; let prevNote = '';
    if (prev) { const pr = targetRows(prev); const pv = sumBy(pr, tv); if (pv) { const d = total / pv - 1; prevNote = `So với ${fM(prev)}: <b>${d >= 0 ? '+' : ''}${pct(d)}</b>.`; } }
    let bgNote = [], brNote = '';
    if (prev) { const pr = targetRows(prev);
      const ch = GROUPS.filter(g => g !== 'Khác').map(g => { const a = gTot(g), b = sumBy(pr.filter(r => grp(r.sc) === g), tv); return { g, a, b, d: a - b, p: b ? a / b - 1 : NaN }; }).filter(x => x.a || x.b);
      bgNote = ch.map(x => `<b>${esc(x.g)}</b>: ${fmt(x.a)} ${U()}, ${x.d >= 0 ? 'tăng' : 'giảm'} <b>${isFinite(x.p) ? pct(Math.abs(x.p)) : '—'}</b> so với ${fM(prev)} (${x.d >= 0 ? '+' : '−'}${fmt(Math.abs(x.d))} ${U()}), tỷ trọng ${pct(x.a / total)}.`);
      const bm = {}; rows.forEach(r => { const k = brandOf(r.sc); bm[k] = bm[k] || { a: 0, b: 0 }; bm[k].a += tv(r); }); pr.forEach(r => { const k = brandOf(r.sc); bm[k] = bm[k] || { a: 0, b: 0 }; bm[k].b += tv(r); });
      const bl = Object.entries(bm).filter(([k, v]) => k !== 'Khác' && v.b > 0).map(([k, v]) => ({ k, d: v.a - v.b, p: v.a / v.b - 1 })).sort((x, y) => y.d - x.d);
      if (bl.length > 1) { const up = bl[0], dn = bl[bl.length - 1]; brNote = `BrandFamily tăng mạnh nhất: <b>${esc(up.k)}</b> (${up.d >= 0 ? '+' : '−'}${fmt(Math.abs(up.d))} ${U()}, ${pct(up.p)})` + (dn.d < 0 ? `; giảm nhiều nhất: <b>${esc(dn.k)}</b> (−${fmt(-dn.d)} ${U()}, ${pct(dn.p)}).` : '.'); } }
    const topN = multi ? npps.map(c => [c, sumBy(rows.filter(r => r.c === c), tv)]).sort((a, b) => b[1] - a[1])[0] : null;
    return `
    <section class="lead"><div><div class="eyebrow">Target tháng</div><h1>Target ${fM(m)} · ${esc(scopeLabel())}</h1>
</div>
      <div class="fld"><label for="tmonth">Tháng</label><select id="tmonth">${months.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${fM(x)}${x === STATE.cur.month ? ' (Current)' : ''}</option>`).join('')}</select>
      <button class="btn primary" id="xl-target">Tải Excel</button></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Tổng target</div><div class="kpi-v">${fmt(total)}<small>${U()}</small></div><div class="kpi-f">${ui.unit === 'hl' ? fmtC(tc) + ' case' : nf1.format(th) + ' HL'}</div></div>
      ${gs.slice(0, 3).map(([g, v]) => `<div class="card c3 kpi"><div class="kpi-l">${esc(g)}</div><div class="kpi-v">${fmt(v)}<small>${U()}</small></div><div class="kpi-f">${pct(v / total)} tổng target</div></div>`).join('')}
      <div class="card c12"><div class="card-h"><div><h2>Target theo BrandGroup / SKU</h2><p class="sub">Đơn vị: ${U()}${multi ? ' · cột theo Khu vực / NPP, bấm tên khu vực để thu gọn hoặc mở rộng' : ''}</p></div></div>
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
      const o = groups[g]; const gOpen = ui.open.has(g);
      body += rowHtml(`<span class="caret">▸</span> ${esc(g)}`, o, 'grp click' + (gOpen ? ' open' : ''), `data-g="${esc(g)}"`);
      if (gOpen) { const sk = aggregate(o.rows, r => r.sc); const bo = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss']; const bi = sc => (bo.indexOf(brandOf(sc)) + 1) || 99; Object.values(sk).filter(s => s.t || s.si || s.so).sort((a, b) => bi(a.k) - bi(b.k) || b.t - a.t).forEach(s => { body += rowHtml(s.k, s, 'sku'); }); }
    });
    body += rowHtml('Tổng', { t: T, si: SI, so: SO }, 'tot');
    function rowHtml(label, o, cls, attr = '') {
      const a1 = o.t ? o.si / o.t : NaN, a2 = o.t ? o.so / o.t : NaN; const r1 = o.t - o.si, r2 = o.t - o.so;
      const bar = (a, c) => `<span class="mini"><i style="width:${Math.min(100, (a || 0) * 100)}%;background:${c}"></i></span>`;
      const remCell = r => r > 0 ? `<span class="rem">${fmt(r)}</span>` : `<span class="neg">Vượt ${fmt(-r)}</span>`;
      return `<tr class="${cls}" ${attr}>${cls === 'sku' ? `<td>${esc(item(label).b || '—')}</td><td class="skuc">${esc(label)}</td>` : `<td colspan="2">${label}</td>`}<td>${fmt(o.t)}</td><td>${fmt(o.si)}</td><td>${pctT(a1, M.tgSi)}${bar(a1, cSi)}</td><td>${remCell(r1)}</td><td>${fmt(o.so)}</td><td>${pctT(a2, M.tgSo)}${bar(a2, cSo)}</td><td>${remCell(r2)}</td></tr>`;
    }
    const labels = Array.from({ length: M.D }, (_, i) => String(i + 1));
    const daily = Array(M.D).fill(null); M.siDays.forEach(d => { daily[+d.slice(6) - 1] = sumBy(STATE.cur.si[d].filter(r => inScope(r[0]) && inBrand(r[1])), r => conv(r[2], r[1])); });
    let acc = 0; const cum = daily.map((v, i) => i < M.dSi ? (acc += v || 0) : null);
    const soCum = Array(M.D).fill(null); M.soDays.forEach(d => { soCum[+d.slice(6) - 1] = sumBy(STATE.cur.so[d].rows.filter(r => inScope(r[0]) && inBrand(r[1])), r => conv(r[2], r[1])); });
    const pace = labels.map((_, i) => T * (i + 1) / M.D);
    const soLine = soCum.some(v => v != null);
    let board = '';
    const npps = [...new Set(L.map(r => r.c))];
    if (npps.length >= 1) {
      const byN = aggregate(L, r => r.c);
      const hasStock = !!M.stockDate && L.some(r => r.st0 || r.dso);
      const SD = ENC.stockDays || { low: 3, high: 3.5 };
      const stockCells = o => { const now = o.st0 + o.si - o.so; const d = o.dso ? Math.max(0, now) / o.dso : NaN;
        const pill = !isFinite(d) ? '<span class="note">—</span>' : d < SD.low ? '<span class="pill orange">Tồn thấp</span>' : d > SD.high ? '<span class="pill bad">Tồn cao</span>' : '<span class="pill good">Phù hợp</span>';
        return `<td class="gs">${fmt(o.st0)}</td><td><b>${fmt(now)}</b></td><td>${isFinite(d) ? nf1.format(d) : '—'}</td><td>${pill}</td>`; };
      const cells = o => `<td class="gs">${fmt(o.t)}</td><td class="gs">${fmt(o.si)}</td><td>${o.t ? pctT(o.si / o.t, M.tgSi) : '—'}</td><td class="rem">${fmt(Math.max(0, o.t - o.si))}</td><td>${status(o.t ? o.si / o.t : NaN, M.tgSi)}</td><td class="gs">${fmt(o.so)}</td><td>${o.t ? pctT(o.so / o.t, M.tgSo) : '—'}</td><td class="rem">${fmt(Math.max(0, o.t - o.so))}</td><td>${status(o.t ? o.so / o.t : NaN, M.tgSo)}</td>${hasStock ? stockCells(o) : ''}`;
      const sumO = os => ({ t: sumBy(os, o => o.t), si: sumBy(os, o => o.si), so: sumBy(os, o => o.so), st0: sumBy(os, o => o.st0), dso: sumBy(os, o => o.dso) });
      const groupsA = byArea(Object.keys(byN).filter(c => byN[c].t || byN[c].si || byN[c].so));
      let rb = '';
      groupsA.forEach(([a, cs]) => { const ak = 'rk:a:' + a, aOpen = isOpen(ak, true);
        rb += `<tr class="grp area click${aOpen ? ' open' : ''}" data-fold="${esc(ak)}"><td><span class="caret">▸</span> ${esc(a)}</td><td>${cs.length} NPP</td>${cells(sumO(cs.map(c => byN[c])))}</tr>`;
        if (!aOpen) return;
        cs.forEach((c, i) => { const nk = 'rk:n:' + c, nOpen = isOpen(nk, false); const o = byN[c];
          rb += `<tr class="npp click${nOpen ? ' open' : ''}${i === 0 ? ' first' : ''}" data-fold="${esc(nk)}"><td></td><td><span class="caret">▸</span> <span class="click-npp" data-npp="${esc(c)}">${esc(c)}</span></td>${cells(o)}</tr>`;
          if (nOpen) { const g = aggregate(o.rows, r => grp(r.sc)); GROUPS.filter(k => g[k] && (g[k].t || g[k].si || g[k].so)).forEach(k => { rb += `<tr class="sku"><td></td><td class="skuc">${esc(k)}</td>${cells(g[k])}</tr>`; }); }
        }); });
      rb += `<tr class="tot"><td>Tổng</td><td></td>${cells(sumO(Object.values(byN)))}</tr>`;
      board = `<div class="card c12"><div class="card-h"><div><h2>Tiến độ theo Khu vực / NPP</h2><p class="sub">Bấm mũi tên hoặc tên NPP để xem chi tiết · time gone ${pct(M.tgSi)} · đơn vị ${U()}${hasStock ? ` · Tồn hiện tại = Tồn ${fD(M.stockDate)} + Sale In − Sale Out (ước tính); Ngày tồn theo Sale Out bình quân ngày, phù hợp ${nf1.format(SD.low)}–${nf1.format(SD.high)} ngày` : ''}</p></div></div>
      <div class="tw"><table class="rank ag"><thead><tr><th>Khu vực</th><th>NPP</th><th class="gs">Target</th><th class="gs">Sale In</th><th>% đạt SI</th><th>Còn lại SI</th><th>Trạng thái SI</th><th class="gs">Sale Out</th><th>% đạt SO</th><th>Còn lại SO</th><th>Trạng thái SO</th>${hasStock ? `<th class="gs" title="Tồn đầu ngày theo file Stock">Tồn ${fD(M.stockDate)}</th><th title="Tồn đầu tháng + Sale In MTD − Sale Out MTD">Tồn hiện tại</th><th title="Tồn hiện tại ÷ Sale Out bình quân ngày (30 ngày trước ${fD(M.stockDate)})">Ngày tồn</th><th>Đánh giá tồn</th>` : ''}</tr></thead><tbody>${rb}</tbody></table></div></div>`;
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
    <section class="lead"><div><div class="eyebrow">Sale In-Out MTD · ${fM(M.m)} · cập nhật đến ${fD(M.lastSi)}</div><h1>${esc(scopeLabel())}</h1>
</div>
      <div class="btns"><button class="btn" id="xl-invoice">Tải SO Invoice</button><button class="btn" id="xl-progress">Tải Excel tiến độ</button></div></section>
    <div class="wkbar card mbar">
      <div class="wkbar-h"><b>Time gone ${fM(M.m)}</b><span class="legend"><span><i class="sq" style="background:var(--si)"></i>Sale In ${pct(aSi)}</span><span><i class="sq" style="background:var(--so)"></i>Sale Out ${pct(aSo)}</span><span><i style="background:var(--ink)"></i>Time gone ${pct(M.tgSi)} · ${M.dSi}/${M.D} ngày</span></span></div>
      ${[['si', aSi, M.tgSi, 'SI'], ['so', aSo, M.tgSo, 'SO']].map(([k, a, tg, lb]) => `<div class="mb-row"><span class="mb-l">${lb}</span><div class="mb-t${a < tg ? ' slow' : ''}"><i class="mb-${k}" style="width:${Math.min(100, (a || 0) * 100)}%"></i><span class="wb-mk" style="left:${tg * 100}%"></span></div><span class="mb-v ${a < tg ? 'lo' : 'hi'}">${pct(a)}</span></div>`).join('')}
      <div class="mb-days"><span class="mb-l"></span><div>${Array.from({ length: M.D }, (_, i) => `<span class="${i < M.dSi ? 'on' : ''}${i + 1 === M.dSi ? ' cur' : ''}">${(i === 0 || (i + 1) % 5 === 0 || i + 1 === M.dSi) ? i + 1 : ''}</span>`).join('')}</div><span class="mb-v"></span></div>
    </div>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Target tháng</div><div class="srcnote">Target Current Month ${fM(M.m)}</div><div class="kpi-v">${fmt(T)}<small>${U()}</small></div><div class="kpi-f">Time gone <b>${pct(M.tgSi)}</b></div><div class="bar"><i style="width:${M.tgSi * 100}%;background:var(--target)"></i></div></div>
      <div class="card c3 kpi${aSi < M.tgSi ? ' slowcard' : ''}"><div class="kpi-l">Sale In MTD</div><div class="srcnote" title="SO Invoice + đơn Delivery chưa có hoá đơn">${M.siDays.length ? fD(M.siDays[0]) + ' → ' + fD(M.lastSi) : 'Chưa có số liệu'}${M.delivN ? ` · +${M.delivN} đơn Delivery` : ''}</div><div class="kpi-v">${fmt(SI)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(aSi)}</b> target ${status(aSi, M.tgSi)}</div><div class="bar"><i style="width:${Math.min(100, aSi * 100)}%;background:var(--si)"></i><span class="tg" style="left:${M.tgSi * 100}%" title="Time gone"></span></div></div>
      <div class="card c3 kpi${aSo < M.tgSo ? ' slowcard' : ''}"><div class="kpi-l">Sale Out MTD</div><div class="srcnote">${M.lastSo ? '01/' + M.m.slice(4, 6) + ' → ' + fD(M.lastSo) : 'Chưa có số liệu'}</div><div class="kpi-v">${fmt(SO)}<small>${U()}</small></div><div class="kpi-f"><b>${pct(aSo)}</b> target ${status(aSo, M.tgSo)}</div><div class="bar"><i style="width:${Math.min(100, aSo * 100)}%;background:var(--so)"></i><span class="tg" style="left:${M.tgSo * 100}%" title="Time gone"></span></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Còn lại đến cuối tháng</div><div class="srcnote">Target − thực đạt MTD</div>
        <div class="remrow"><span class="dot" style="background:var(--si)"></span><span>Sale In</span><b class="num">${fmt(remSi)}</b><small>${U()}</small></div>
        <div class="remrow"><span class="dot" style="background:var(--so)"></span><span>Sale Out</span><b class="num">${fmt(remSo)}</b><small>${U()}</small></div></div>

      ${pendingCard()}
      <div class="card c12"><div class="card-h"><div><h2>Còn lại theo BrandGroup</h2><p class="sub">Target − thực đạt lũy kế · bấm vào BrandGroup để xem từng SKU · đơn vị ${U()}</p></div></div>
        ${hlNote()}<div class="tw"><table class="sticky1 tgt"><thead><tr><th>BrandFamily</th><th>SKU</th><th>Target</th><th>Sale In</th><th>% SI</th><th>Còn lại SI</th><th>Sale Out</th><th>% SO</th><th>Còn lại SO</th></tr></thead><tbody>${body}</tbody></table></div></div>

      ${board}
      <div class="card c12"><div class="card-h"><div><h2>Tiến độ theo BrandFamily</h2><p class="sub">% đạt target tháng · vạch đứng là time gone ${pct(M.tgSi)}</p></div>${legend([['Sale In', cSi], ['Sale Out', cSo]])}</div>
        ${brandProgress(Object.values(aggregate(L, r => brandOf(r.sc))).filter(o => o.k !== 'Khác'), M.tgSi, 'Time gone ' + pct(M.tgSi))}</div>
      <div class="card ${cover ? 'c7' : 'c12'}"><div class="card-h"><div><h2>Lũy kế MTD vs. tiến độ</h2><p class="sub">${U()} · tiến độ = target tháng chia đều theo ngày</p></div>
        ${legend([['Sale In', cSi], ...(soLine ? [['Sale Out', cSo]] : []), ['Tiến độ', cT, 'dash']])}</div>
        ${chart({ labels, lines: [{ name: 'Tiến độ', color: cT, values: pace, dash: true, dots: false }, { name: 'Sale In lũy kế', color: cSi, values: cum }, ...(soLine ? [{ name: 'Sale Out lũy kế', color: cSo, values: soCum }] : [])], tipTitle: i => 'Ngày ' + (i + 1) + '/' + M.m.slice(4, 6), aria: 'Sale In lũy kế theo ngày so với tiến độ' })}
        <div style="margin-top:14px"><div class="card-h"><h2 style="font-size:13px">Sale In theo ngày</h2>${legend([['Sale In ngày', cSi, 'sq']])}</div>
        ${chart({ labels, bars: [{ name: 'Sale In ngày', color: cSi, values: daily }], height: 150, tipTitle: i => 'Ngày ' + (i + 1) + '/' + M.m.slice(4, 6), aria: 'Sale In theo ngày' })}</div>
        ${M.soDays.length < 2 ? '<p class="note" style="margin:8px 0 0">Sale Out lấy số lũy kế tại ngày cập nhật; xu hướng theo ngày hiển thị từ lần cập nhật thứ hai.</p>' : ''}
      </div>
      ${cover}
    </div>
    ${conclusion([
      `Sale In đạt <b>${pct(aSi)}</b> target so với time gone <b>${pct(M.tgSi)}</b> (${aSi >= M.tgSi ? 'đi trước tiến độ' : 'chậm hơn tiến độ'}); còn <b>${fmt(remSi)} ${U()}</b> để đạt target.`,
      `Sale Out đạt <b>${pct(aSo)}</b>, còn <b>${fmt(remSo)} ${U()}</b>. ${soGap > 0 ? `Sale In cao hơn Sale Out <b>${fmt(soGap)} ${U()}</b>, tồn kho NPP đang tăng.` : `Sale Out cao hơn Sale In <b>${fmt(-soGap)} ${U()}</b>, cần đặt hàng bổ sung.`}`,
      (() => { if (!M.stockDate) return ''; const SD = ENC.stockDays || { low: 3, high: 3.5 };
        const ns = Object.values(aggregate(L, r => r.c)).filter(o => o.dso > 0).map(o => ({ c: o.k, d: Math.max(0, o.st0 + o.si - o.so) / o.dso })).sort((a, b) => nppCmp(a.c, b.c));
        if (!ns.length) return ''; const tot = Object.values(aggregate(L, () => 'all'))[0]; const td = tot && tot.dso ? Math.max(0, tot.st0 + tot.si - tot.so) / tot.dso : NaN;
        const lo = ns.filter(x => x.d < SD.low), hi = ns.filter(x => x.d > SD.high);
        return `Tồn kho ước tính hiện tại đủ bán <b>${isFinite(td) ? nf1.format(td) : '—'} ngày</b>${lo.length ? `; tồn thấp: ${lo.map(x => `<b>${esc(x.c)}</b> (${nf1.format(x.d)} ngày)`).join(', ')}` : ''}${hi.length ? `; tồn cao: ${hi.map(x => `<b>${esc(x.c)}</b> (${nf1.format(x.d)} ngày)`).join(', ')}` : ''}${!lo.length && !hi.length ? ', các NPP đều trong mức phù hợp' : ''}.`; })(),
      behind.length ? `BrandGroup cần ưu tiên: ${behind.map(b => `<b>${esc(b.g)}</b> (đạt ${pct(b.a)}, còn ${fmt(b.rem)} ${U()})`).join(', ')}.` : 'Các BrandGroup đều đúng hoặc vượt tiến độ.'
    ])}`;
  }

  /* ---------- TAB 3: Allocation ---------- */
  function viewAlloc() {
    const M = curModel(); const A = (STATE.cur.alloc || []).filter(r => inScope(r[1]) && inBrand(r[2]));
    if (!A.length) return '<div class="card empty">Chưa có dữ liệu Allocation cho phạm vi này.</div>';
    const weeks = [...new Set(A.map(r => r[0]))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const wk = currentWeek(weeks), pw = weeks[weeks.indexOf(wk) - 1]; const nw = weeks[weeks.indexOf(wk) + 1];
    const siMap = {}; M.list.forEach(r => { siMap[r.c + '|' + r.sc] = (siMap[r.c + '|' + r.sc] || 0) + r.si; });
    const aSum = f => sumBy(A.filter(f), r => conv(r[3], r[2]));
    const skus = [...new Set(A.map(r => r[2]))].map(sc => ({ sc, al: aSum(r => r[2] === sc) })).sort((a, b) => b.al - a.al).map(x => x.sc);
    const npps = [...new Set(A.map(r => r[1]))].sort(nppCmp);
    const siOf = (c, sc) => conv(siMap[c + '|' + sc] || 0, sc);
    const bySku = skus.map(sc => { const w = {}; weeks.forEach(k => w[k] = aSum(r => r[2] === sc && r[0] === k));
      const al = sumBy(Object.values(w), x => x); const si = sumBy([...new Set(A.filter(r => r[2] === sc).map(r => r[1]))], c => siOf(c, sc));
      return { sc, w, al, si }; });
    const usedBar = (si, al) => { const p = al ? si / al : 0; const c = 'var(--si)'; return `${al ? pct(p) : '—'}<span class="mini"><i style="width:${Math.min(100, p * 100)}%;background:${c}"></i></span>`; };
    const remTd = (al, si) => { const r = al - si; return `<td class="rem">${r >= 0 ? fmt(r) : '<span style="color:var(--bad)">Vượt ' + fmt(-r) + '</span>'}</td>`; };
    const delta = (a, b) => { if (b == null) return '<span class="note">–</span>'; const d = a - b; const p = b ? d / b : NaN; const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      return `<span class="dl ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${fmt(Math.abs(d))}${isFinite(p) ? ' · ' + pct(Math.abs(p)) : ''}</span>`; };
    // 1) Current Week theo batch
    const cur = STATE.cur || {}; const BC = cur.allocBatches || []; const AD = cur.allocDates || {}; const today = todayKey();
    const fd = d => d ? d.slice(6, 8) + '/' + d.slice(4, 6) : '';
    const bval = (sc, w, i) => sumBy(A.filter(r => r[2] === sc && r[0] === w), r => conv(Array.isArray(r[4]) ? (r[4][i] || 0) : 0, r[2]));
    const bHas = i => (AD[wk] || [])[i] || A.some(r => r[0] === wk && Array.isArray(r[4]) && r[4][i] != null && r[4][i] !== 0);
    const bIdx = BC.map((_, i) => i).filter(bHas);
    const wkTot = sumBy(bySku, s => s.w[wk]); const pwTot = pw ? sumBy(bySku, s => s.w[pw]) : null;
    const bTot = i => sumBy(bySku, s => bval(s.sc, wk, i));
    const bHead = i => { const d = (AD[wk] || [])[i]; const done = d && d <= today;
      return `<th class="bh"><span class="bd">${d ? fd(d) : 'Chưa có ngày'}</span><span class="bn">${esc(BC[i])}</span><span class="pill ${done ? 'good' : 'orange'}">${done ? 'Đã Upload' : 'Chờ Upload'}</span></th>`; };
    const wkRange = (AD[wk] || []).filter(Boolean); const rangeTxt = wkRange.length ? `Lịch Upload Portal ${wkRange.map(fd).join(' · ')}` : '';
    const nextTxt = nw && (AD[nw] || []).some(Boolean) ? `Tuần tới <b>${esc(nw)}</b>: ${BC.map((b, i) => (AD[nw] || [])[i] ? `${esc(b)} ngày ${fd(AD[nw][i])}` : '').filter(Boolean).join(' · ')}` : '';
    // Sale In trong tuần hiện tại: từ ngày Upload đầu tiên của tuần đến trước ngày Upload đầu tiên của tuần sau
    const addD = (d, n) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) + n * 864e5); return t.toISOString().slice(0, 10).replace(/-/g, ''); };
    const wStart = wkRange[0] || null; const nStart = nw ? ((AD[nw] || []).find(Boolean) || null) : null;
    const wEnd = wStart ? (nStart ? addD(nStart, -1) : addD(wStart, 6)) : null;
    const wDays = wStart ? Object.keys(cur.si || {}).filter(d => d >= wStart && d <= wEnd).sort() : [];
    const siWk = sc => sumBy(wDays, d => sumBy(cur.si[d].filter(r => r[1] === sc && inScope(r[0]) && inBrand(r[1])), r => conv(r[2], r[1])));
    const siWkTot = sumBy(bySku, x => siWk(x.sc));
    const prog = (si, al) => { const p = al ? si / al : 0; return `<td><b>${fmt(si)}</b></td><td>${al ? pct(p) : '—'}<span class="mini"><i style="width:${Math.min(100, p * 100)}%;background:var(--si)"></i></span></td>`; };
    const siNote = wStart && wDays.length ? `Sale In tuần ${esc(wk)}: ${fd(wDays[0])} → ${fd(wDays[wDays.length - 1])}${wDays[0] > wStart ? ` (dữ liệu Sale In từ ${fd(wDays[0])}, ngày trước đó thuộc tháng trước)` : ''}` : '';
    const latest = `<div class="card c12 wk-card"><div class="card-h"><div><div class="eyebrow">Current Week</div><h2 style="font-size:18px">${esc(wk)}<span class="note" style="font-weight:500;margin-left:8px">${esc(rangeTxt)}</span></h2></div>
        <div class="wk-total"><span class="kpi-l">Tổng allocation ${esc(wk)}</span><b>${fmt(wkTot)}</b><small>${U()}</small> ${pw ? delta(wkTot, pwTot) + `<span class="note">so với ${esc(pw)}</span>` : ''}</div></div>
      ${bIdx.length ? `<div class="tw" style="margin-top:10px"><table class="sticky1 tgt batch"><thead><tr><th>BrandFamily</th><th>SKU</th>${bIdx.map(bHead).join('')}<th>Tổng ${esc(wk)}</th><th>Sale In tuần</th><th>Tiến độ SI</th><th>So với ${esc(pw || '—')}</th></tr></thead><tbody>
        ${bySku.map(s => `<tr class="sku"><td>${esc(item(s.sc).b || '—')}</td><td class="skuc">${esc(s.sc)}</td>${bIdx.map(i => `<td>${fmt(bval(s.sc, wk, i))}</td>`).join('')}<td><b>${fmt(s.w[wk])}</b></td>${prog(siWk(s.sc), s.w[wk])}<td>${delta(s.w[wk], pw ? s.w[pw] : null)}</td></tr>`).join('')}
        ${bySku.length > 1 ? `<tr class="tot"><td colspan="2">Tổng</td>${bIdx.map(i => `<td>${fmt(bTot(i))}</td>`).join('')}<td>${fmt(wkTot)}</td>${prog(siWkTot, wkTot)}<td>${delta(wkTot, pwTot)}</td></tr>` : ''}
      </tbody></table></div>` : `<div class="wk-grid">${bySku.map(s => `<div class="wk-item"><div class="wk-sku">${esc(s.sc)}<span class="wk-b">${esc(item(s.sc).b || '')}</span></div><div class="wk-v num">${fmt(s.w[wk])}</div><div>${delta(s.w[wk], pw ? s.w[pw] : null)}</div></div>`).join('')}</div>`}
      ${nextTxt || siNote ? `<p class="note" style="margin:10px 0 0">${[siNote, nextTxt].filter(Boolean).join(' · ')}</p>` : ''}</div>`;
    // 2) cumulative by SKU
    const totAl = sumBy(bySku, s => s.al), totSi = sumBy(bySku, s => s.si);
    const cum = `<div class="card c12"><h2>Lũy kế tháng theo SKU</h2><p class="sub">Allocation các tuần đã chốt vs. Sale In MTD · đơn vị ${U()}</p><div class="tw"><table class="sticky1 tgt"><thead><tr><th>BrandFamily</th><th>SKU</th>${weeks.map(w => `<th>${esc(w)}</th>`).join('')}<th>Tổng allocation</th><th>Sale In MTD</th><th>% sử dụng</th><th>Còn lại</th></tr></thead><tbody>
      ${bySku.map(s => `<tr class="sku"><td>${esc(item(s.sc).b || '—')}</td><td class="skuc">${esc(s.sc)}</td>${weeks.map(w => `<td>${fmt(s.w[w])}</td>`).join('')}<td>${fmt(s.al)}</td><td>${fmt(s.si)}</td><td>${usedBar(s.si, s.al)}</td>${remTd(s.al, s.si)}</tr>`).join('')}
      ${bySku.length > 1 ? `<tr class="tot"><td colspan="2">Tổng</td>${weeks.map(w => `<td>${fmt(sumBy(bySku, s => s.w[w]))}</td>`).join('')}<td>${fmt(totAl)}</td><td>${fmt(totSi)}</td><td>${usedBar(totSi, totAl)}</td>${remTd(totAl, totSi)}</tr>` : ''}
    </tbody></table></div></div>`;
    // 3) Theo Khu vực: số chia Current Week theo từng batch, mỗi SKU một dòng (số còn lại xem ở tab Tracking Allocation)
    let byNpp = '';
    if (npps.length > 1) {
      const AG = byArea(npps);
      const bv = (cs, sc, i) => sumBy(A.filter(r => r[0] === wk && cs.includes(r[1]) && (sc == null || r[2] === sc)), r => conv(Array.isArray(r[4]) ? (r[4][i] || 0) : 0, r[2]));
      const wv = (cs, sc) => aSum(r => r[0] === wk && cs.includes(r[1]) && (sc == null || r[2] === sc));
      const cells = (cs, sc) => bIdx.map(i => `<td>${fmt(bv(cs, sc, i))}</td>`).join('') + `<td><b>${fmt(wv(cs, sc))}</b></td>`;
      let tb = '';
      AG.forEach(([a, cs]) => { const k = 'al:' + a, op = isOpen(k, true);
        const skusOf = list => skus.filter(sc => A.some(r => r[0] === wk && list.includes(r[1]) && r[2] === sc));
        tb += `<tr class="grp area click${op ? ' open' : ''}" data-fold="${esc(k)}"><td><span class="caret">▸</span> ${esc(a)}</td><td>${cs.length} NPP · ${skusOf(cs).length} SKU</td>${cells(cs, null)}</tr>`;
        if (!op) return;
        cs.forEach(c => { const ss = skusOf([c]); if (!ss.length) return;
          const nk = 'al:n:' + c, nOp = isOpen(nk, true) || ss.length < 2;
          const nm = `${ss.length > 1 ? `<span class="caret fold${nOp ? ' on' : ''}" data-fold="${esc(nk)}" role="button" aria-label="Mở/thu gọn ${esc(c)}">▸</span> ` : ''}<span class="click-npp" data-npp="${esc(c)}">${esc(c)}</span>`;
          if (ss.length > 1) tb += `<tr class="sub first"><td>${nm}</td><td class="note">${ss.length} SKU</td>${cells([c], null)}</tr>`;
          if (nOp) ss.forEach((sc, i) => { tb += `<tr class="sku${ss.length < 2 && i === 0 ? ' first' : ''}"><td>${ss.length < 2 ? nm : ''}</td><td class="skuc">${esc(sc)}</td>${cells([c], sc)}</tr>`; }); }); });
      if (AG.length > 1) tb += `<tr class="tot"><td colspan="2">Tổng</td>${cells(npps, null)}</tr>`;
      const table = `<table class="sticky1 trk batch"><thead><tr><th>Khu vực / NPP</th><th>SKU</th>${bIdx.map(bHead).join('')}<th>Tổng ${esc(wk)}</th></tr></thead><tbody>${tb}</tbody></table>`;
      byNpp = `<div class="card c12"><div class="card-h"><div><h2>Theo Khu vực / NPP · ${esc(wk)}</h2><p class="sub">Đơn vị ${U()} · số chia Current Week theo từng batch · bấm mũi tên để mở khu vực, NPP · số còn lại xem ở tab <button class="linkback" data-go="tracking" style="display:inline;margin:0">Tracking Allocation</button></p></div></div><div class="tw">${table}</div></div>`;
    }
    const over = bySku.filter(s => s.si > s.al);
    const main = bySku[0];
    return `
    <section class="lead"><div><div class="eyebrow">Allocation · cập nhật hàng tuần</div><h1>${esc(scopeLabel())}</h1>
      <p>Allocation Current Week và lũy kế các tuần đã chốt (${weeks.join(', ')}), so với Sale In MTD của cùng SKU.</p></div></section>
    <div class="grid">${latest}${byNpp}${cum}</div>
    ${conclusion([
      `Current Week <b>${esc(wk)}</b>: tổng allocation <b>${fmt(wkTot)} ${U()}</b>${bIdx.length ? ' (' + bIdx.map(i => `${esc(BC[i])} ${fmt(bTot(i))}`).join(', ') + ')' : ''}${pwTot != null ? `, ${wkTot >= pwTot ? 'tăng' : 'giảm'} ${pct(Math.abs(pwTot ? wkTot / pwTot - 1 : 0))} so với ${esc(pw)}` : ''}.`,
      main ? `<b>${esc(main.sc)}</b> đã sử dụng ${pct(main.al ? main.si / main.al : 0)} allocation lũy kế, còn <b>${fmt(Math.max(0, main.al - main.si))} ${U()}</b>.` : '',
      over.length ? `Đã vượt allocation: <b>${over.map(s => s.sc).join(', ')}</b>.` : ''
    ])}`;
  }

  /* ---------- SO Pending: Online Order trừ Backorder và đơn đã có hoá đơn ---------- */
  function pendingOrders() {
    const cur = STATE.cur || {}; const inv = new Set((cur.lines || []).map(l => String(l[2])));
    return (cur.orders || []).filter(o => !/back\s*-?\s*order/i.test(o[2]) && !/deliver/i.test(o[2]) && !inv.has(String(o[1])) && inScope(o[0]) && inBrand(o[3]));
  }
  function pendingCard() {
    const P = pendingOrders(); const n = new Set(P.map(o => o[1])).size; if (!(STATE.cur.orders || []).length) return '';
    const cs = sumBy(P, o => o[4]), hl = sumBy(P, o => o[4] * (item(o[3]).hl || 0));
    return `<div class="card c12 pend" role="button" tabindex="0" data-go="pending"><div><div class="kpi-l">SO Pending · chờ giao hàng</div>
      <div class="pend-v"><b>${fmtC(cs)}</b><small>Case</small><b>${nf1.format(hl)}</b><small>HL</small><span class="note">${n} đơn Order Approve / Schedule · ${new Set(P.map(o => o[3])).size} SKU · cập nhật ${fTs((STATE.updatedAt || {}).orders)}</span></div></div>
      <span class="pend-go">Xem theo SKU →</span></div>`;
  }
  function viewPending() {
    const P = pendingOrders(); const all = (STATE.cur.orders || []).filter(o => inScope(o[0]) && inBrand(o[3]));
    const inv = new Set((STATE.cur.lines || []).map(l => String(l[2])));
    const nBo = new Set(all.filter(o => /back\s*-?\s*order/i.test(o[2])).map(o => o[1])).size, nInv = new Set(all.filter(o => inv.has(String(o[1]))).map(o => o[1])).size;
    const nDel = new Set(all.filter(o => /deliver/i.test(o[2]) && !inv.has(String(o[1]))).map(o => o[1])).size;
    const hlOf = o => o[4] * (item(o[3]).hl || 0);
    const bySku = {}; P.forEach(o => { const x = bySku[o[3]] || (bySku[o[3]] = { sc: o[3], c: 0, h: 0, ord: new Set(), npp: new Set() }); x.c += o[4]; x.h += hlOf(o); x.ord.add(o[1]); x.npp.add(o[0]); });
    const bo = ['Heineken', 'Tiger', 'Bia Viet', 'Larue', 'Bivina', 'Strongbow', 'Edelweiss']; const bi = sc => (bo.indexOf(brandOf(sc)) + 1) || 99;
    const rows = Object.values(bySku).sort((a, b) => GROUPS.indexOf(grp(a.sc)) - GROUPS.indexOf(grp(b.sc)) || bi(a.sc) - bi(b.sc) || b.c - a.c);
    const tc = sumBy(rows, r => r.c), th = sumBy(rows, r => r.h);
    const byN = {}; P.forEach(o => { const x = byN[o[0]] || (byN[o[0]] = { c: 0, h: 0, ord: new Set() }); x.c += o[4]; x.h += hlOf(o); x.ord.add(o[1]); });
    let body = ''; GROUPS.forEach(g => { const rr = rows.filter(r => grp(r.sc) === g); if (!rr.length) return;
      body += `<tr class="grp"><td colspan="2">${esc(g)}</td><td>${fmtC(sumBy(rr, r => r.c))}</td><td>${nf1.format(sumBy(rr, r => r.h))}</td><td></td><td></td></tr>`;
      rr.forEach(r => { body += `<tr class="sku"><td>${esc(item(r.sc).b || '—')}</td><td class="skuc">${esc(r.sc)}</td><td>${fmtC(r.c)}</td><td>${nf1.format(r.h)}</td><td>${r.ord.size}</td><td>${tc ? pct(r.c / tc) : '—'}</td></tr>`; }); });
    body += `<tr class="tot"><td colspan="2">Tổng</td><td>${fmtC(tc)}</td><td>${nf1.format(th)}</td><td>${new Set(P.map(o => o[1])).size}</td><td>100%</td></tr>`;
    const nppRows = Object.entries(byN).sort((a, b) => nppCmp(a[0], b[0]));
    const list = [...P].sort((a, b) => nppCmp(a[0], b[0]) || String(a[1]).localeCompare(String(b[1])));
    return `
    <section class="lead"><div><button class="linkback" data-go="progress">← Sale In-Out MTD</button><div class="eyebrow">SO Pending · chờ giao hàng</div><h1>${esc(scopeLabel())}</h1>
      <p>Online Order trừ ${nBo} đơn Backorder. Đơn Delivery: ${nInv} đơn đã có trong SO Invoice (loại), ${nDel} đơn chưa có (cộng vào Sale In). Pending là các đơn Order Approve / Schedule chưa giao.</p></div>
      <button class="btn" id="xl-pending">Tải Excel Pending</button></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Pending (Case)</div><div class="kpi-v">${fmtC(tc)}<small>Case</small></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Pending (HL)</div><div class="kpi-v">${nf1.format(th)}<small>HL</small></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Số đơn</div><div class="kpi-v">${new Set(P.map(o => o[1])).size}</div><div class="kpi-f">${Object.keys(byN).length} NPP</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Số SKU</div><div class="kpi-v">${rows.length}</div></div>
      <div class="card c12"><h2>Pending theo SKU</h2><p class="sub">Case và HL chờ giao</p>${P.length ? `<div class="tw"><table class="sticky1 tgt"><thead><tr><th>BrandFamily</th><th>SKU</th><th>Case</th><th>HL</th><th>Số đơn</th><th>Tỷ trọng</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="note">Không có đơn Pending trong phạm vi này.</p>'}</div>
      ${nppRows.length > 1 ? `<div class="card c5"><h2>Theo NPP</h2><p class="sub">Bấm để xem từng NPP</p><div class="tw"><table><thead><tr><th>Khu vực</th><th>NPP</th><th>Case</th><th>HL</th><th>Số đơn</th></tr></thead><tbody>
        ${nppRows.map(([c, x]) => `<tr class="click" data-npp="${esc(c)}"><td style="text-align:left">${esc(areaOf(c))}</td><td style="text-align:left"><b>${esc(c)}</b></td><td>${fmtC(x.c)}</td><td>${nf1.format(x.h)}</td><td>${x.ord.size}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${P.length ? `<div class="card ${nppRows.length > 1 ? 'c7' : 'c12'}"><h2>Danh sách đơn</h2><p class="sub">Ngày đặt · ngày hẹn giao · trạng thái</p><div class="tw"><table><thead><tr><th>NPP</th><th>Số đơn</th><th>Trạng thái</th><th>Ngày đặt</th><th>Hẹn giao</th><th>SKU</th><th>Case</th></tr></thead><tbody>
        ${list.map(o => `<tr><td>${esc(o[0])}</td><td>${esc(o[1])}</td><td>${esc(o[2])}</td><td>${esc(o[5])}</td><td>${esc(o[6])}</td><td><b>${esc(o[3])}</b></td><td>${fmtC(o[4])}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    </div>
    ${conclusion([
      `Đang chờ giao <b>${fmtC(tc)} case</b> (${nf1.format(th)} HL) từ ${new Set(P.map(o => o[1])).size} đơn.`,
      rows[0] ? `SKU chờ giao nhiều nhất: <b>${esc(rows[0].sc)}</b> (${fmtC(rows[0].c)} case, ${pct(tc ? rows[0].c / tc : 0)}).` : '',
      nppRows.length > 1 ? `NPP có nhiều hàng chờ giao nhất: <b>${esc([...nppRows].sort((a, b) => b[1].c - a[1].c)[0][0])}</b> (${fmtC([...nppRows].sort((a, b) => b[1].c - a[1].c)[0][1].c)} case).` : ''
    ])}`;
  }
  function exportPending(ev) {
    const P = pendingOrders();
    const rows = [['Khu vực', 'Mã NPP', 'Số đơn', 'Trạng thái', 'Ngày đặt', 'Hẹn giao', 'BrandFamily', 'BrandGroup', 'ShortCode', 'Case', 'HL']];
    [...P].sort((a, b) => nppCmp(a[0], b[0])).forEach(o => rows.push([(STATE.npps[o[0]] || {}).area || '', o[0], o[1], o[2], o[5], o[6], item(o[3]).b || '', grp(o[3]), o[3], o[4], Math.round(o[4] * (item(o[3]).hl || 0) * 100) / 100]));
    if (rows.length === 1) { toastBtn(ev.currentTarget, 'Không có đơn Pending'); return; }
    saveXlsx(`SO_Pending_${todayKey()}_${scopeTag()}.xlsx`, [['SO Pending', rows, [9, 9, 12, 14, 10, 10, 12, 11, 10, 9, 9]]], ev.currentTarget);
  }

  /* ---------- TAB: Tracking Allocation (tuần hiện tại) theo Khu vực / NPP / SKU ---------- */
  const addDay = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const dayDiff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))) / 864e5);
  function orderDateKey(s) { // '02/10' hoặc '2/10/2026' -> YYYYMMDD (năm theo tháng hiện hành)
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/); if (!m) return null;
    const cm = STATE.cur.month || ''; let y = m[3] ? +m[3] : +cm.slice(0, 4); if (!m[3] && +m[2] > +cm.slice(4, 6) + 1) y -= 1;
    return y + m[2].padStart(2, '0') + m[1].padStart(2, '0');
  }
  function viewTracking() {
    const cur = STATE.cur || {}; const A = (cur.alloc || []).filter(r => inScope(r[1]) && inBrand(r[2]));
    if (!A.length) return '<div class="card empty">Chưa có dữ liệu Allocation cho phạm vi này.</div>';
    const weeks = [...new Set(A.map(r => r[0]))].sort(wkSort); const wk = currentWeek(weeks); const nw = weeks[weeks.indexOf(wk) + 1];
    const AD = cur.allocDates || {}; const fd = d => d ? d.slice(6, 8) + '/' + d.slice(4, 6) : '';
    const wStart = (AD[wk] || []).find(Boolean) || null; const nStart = nw ? ((AD[nw] || []).find(Boolean) || null) : null;
    const wEnd = wStart ? (nStart ? addDay(nStart, -1) : addDay(wStart, 6)) : null; const inWk = d => d && wStart && d >= wStart && d <= wEnd;
    // ngày order của từng hoá đơn (ghép InvoiceNumber = Order Number trong Online Order); không ghép được thì dùng ngày hoá đơn
    // Sale In thực tế theo ngày order = Dis Sale by Date (hoá đơn theo ngày order) + đơn Delivery chưa có hoá đơn trong SO Invoice
    const oDate = {}; (cur.orders || []).forEach(o => { const k = orderDateKey(o[5]); if (k) oDate[String(o[1])] = k; });
    const hasSbd = (cur.sbd || []).length > 0;
    const D = todayKey(); // D-1: chỉ lấy hoá đơn có Calendar_Day_Name trước hôm nay
    // Tab này chỉ dùng 2 file: Dis Sale by Date và Online Order (không dùng SO Invoice)
    const lines = hasSbd ? cur.sbd.filter(r => r[1] < D && inScope(r[0]) && inBrand(r[3])).map(r => ({ c: r[0], sc: r[3], q: r[4], d: r[2], w: r[5] || '', byOrder: true })) : [];
    // đơn Delivery: cộng vào Sale In; bỏ đơn đã xuất hoá đơn trước hôm nay (đã nằm trong số D-1)
    // Delivery: Order Number chưa có trong SO Invoice -> cộng Sale In; đã có trong SO Invoice -> đã nằm trong hoá đơn (trừ hoá đơn hôm nay, chưa vào số D-1)
    // Sale In = Dis Sale by Date đến D-1 + toàn bộ đơn Online Order có Invoice Date = hôm nay (trừ Backorder)
    // Công thức: Dis Sale (ConfirmDate < hôm nay, đúng tuần order) + Online Order trạng thái Delivery chưa Synced (Order Number chưa có trong SO Invoice)
    // Delivery chưa Synced: theo cột Synced nếu file có; nếu không, là đơn chưa nằm trong Dis Sale đến D-1 (Invoice Date trống hoặc từ hôm nay)
    const synced = o => o[9] != null && o[9] !== '' ? /^synced$/i.test(o[9]) : !!(orderDateKey(o[8]) && orderDateKey(o[8]) < D);
    const deliv = (cur.orders || []).filter(o => /deliver/i.test(o[2]) && !synced(o) && inScope(o[0]) && inBrand(o[3]));
    const delivNo = new Set(deliv.map(o => String(o[1])));
    deliv.forEach(o => lines.push({ c: o[0], sc: o[3], q: o[4], d: orderDateKey(o[5]), w: wk, byOrder: true, deliv: true }));
    const lastData = addDay(todayKey(), -1);
    // Tiến độ tuần chỉ tính ngày làm việc thứ 2 – thứ 7 (bỏ Chủ nhật)
    const isWork = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay() !== 0;
    const workDays = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDay(d, 1)) if (isWork(d)) n++; return n; };
    const span = wStart ? workDays(wStart, wEnd) || 1 : 6; const goneDays = wStart && lastData >= wStart ? workDays(wStart, lastData < wEnd ? lastData : wEnd) : 0;
    const gone = wStart ? Math.min(1, goneDays / span) : 1;
    const skus = [...new Set(A.map(r => r[2]))].map(sc => ({ sc, al: sumBy(A.filter(r => r[2] === sc && r[0] === wk), r => r[3]) })).sort((a, b) => b.al - a.al).map(x => x.sc);
    if (ui.trSku !== 'all' && !skus.includes(ui.trSku)) ui.trSku = 'all';
    const shown = ui.trSku === 'all' ? skus : [ui.trSku];
    const P = (cur.orders || []).filter(o => /approve|schedule/i.test(o[2]) && inScope(o[0]) && inBrand(o[3]) && shown.includes(o[3]));
    const npps = [...new Set(A.map(r => r[1]))].sort(nppCmp);
    const calc = (cs, ss) => {
      const al = sumBy(A.filter(r => cs.includes(r[1]) && ss.includes(r[2]) && r[0] === wk), r => conv(r[3], r[2]));
      const si = sumBy(lines.filter(l => cs.includes(l.c) && ss.includes(l.sc) && (l.w ? l.w === wk : inWk(l.d))), l => conv(l.q, l.sc));
      const pd = sumBy(P.filter(o => cs.includes(o[0]) && ss.includes(o[3])), o => conv(o[4], o[3]));
      const dup = sumBy(P.filter(o => cs.includes(o[0]) && ss.includes(o[3]) && delivNo.has(String(o[1]))), o => conv(o[4], o[3])); // đơn Delivery đã tính trong Sale In
      return { al, si, pd, rem: al - si - (pd - dup), ps: al ? si / al : NaN, use: al ? (si + pd - dup) / al : NaN };
    };
    const bar = (v, col) => `<span class="mini"><i style="width:${Math.min(100, (v || 0) * 100)}%;background:${col}"></i></span>`;
    const tdv = x => `<td>${fmt(x.al)}</td><td>${fmt(x.si)}</td><td>${!isFinite(x.ps) ? '—' : `<span class="${x.ps < gone ? 'lo' : 'hi'}">${pct(x.ps)}</span>`}</td><td>${fmt(x.pd)}</td><td>${isFinite(x.use) ? pct(x.use) : '—'}${bar(x.use, x.use > 1 ? 'var(--good)' : 'var(--si)')}</td><td class="rem">${x.rem >= 0 ? fmt(x.rem) : `<span class="ov">Vượt ${fmt(-x.rem)}</span>`}</td>`;
    let body = ''; const flat = [];
    byArea(npps).forEach(([a, cs]) => { const ak = 'tr:a:' + a, open = isOpen(ak, true);
      const ax = calc(cs, shown); body += `<tr class="grp area click${open ? ' open' : ''}" data-fold="${esc(ak)}"><td><span class="caret">▸</span> ${esc(a)}</td><td>${shown.length > 1 ? cs.length + ' NPP' : esc(shown[0])}</td>${tdv(ax)}</tr>`;
      cs.forEach(c => { const y = calc([c], shown); flat.push([c, y]); if (!open) return;
        const ss = shown.filter(sc => A.some(r => r[1] === c && r[2] === sc && r[0] === wk));
        const nk = 'tr:n:' + c, nOpen = isOpen(nk, true) || ss.length < 2;
        const nm = `${ss.length > 1 ? `<span class="caret fold${nOpen ? ' on' : ''}" data-fold="${esc(nk)}" role="button" aria-label="Mở/thu gọn ${esc(c)}">▸</span> ` : ''}<span class="click-npp" data-npp="${esc(c)}">${esc(c)}</span>`;
        if (!nOpen) { body += `<tr class="sku first${isFinite(y.ps) && y.ps < gone ? ' slow' : ''}"><td>${nm}</td><td class="note">${ss.length} SKU</td>${tdv(y)}</tr>`; return; }
        ss.forEach((sc, i) => { const z = calc([c], [sc]); body += `<tr class="sku${i === 0 ? ' first' : ''}${isFinite(z.ps) && z.ps < gone ? ' slow' : ''}"><td>${i === 0 ? nm : ''}</td><td class="skuc">${esc(sc)}</td>${tdv(z)}</tr>`; });
        }); });
    const T = calc(npps, shown); body += `<tr class="tot"><td>Tổng</td><td>${shown.length > 1 ? '' : esc(shown[0])}</td>${tdv(T)}</tr>`;
    const slow = flat.filter(([, y]) => isFinite(y.ps) && y.ps < gone).sort((a, b) => a[1].ps - b[1].ps);
    const over = flat.filter(([, y]) => y.rem < 0);
    const chips = `<div class="chips" role="group" aria-label="Chọn SKU">${['all', ...skus].map(k => `<button data-tsku="${esc(k)}" aria-pressed="${ui.trSku === k}">${k === 'all' ? 'Tất cả SKU' : esc(k)}</button>`).join('')}</div>`;
    const byOrd = lines.filter(l => inWk(l.d) && l.byOrder).length, allWk = lines.filter(l => inWk(l.d)).length;
    return `
    <section class="lead"><div><div class="eyebrow">Tracking Allocation · Current Week ${esc(wk)}</div><h1>${esc(scopeLabel())}</h1>
      <p>${wStart ? `Tuần ${fd(wStart)} → ${fd(wEnd)} · đã qua ${goneDays}/${span} ngày làm việc T2–T7 đến D-1 (tiến độ tuần ${pct(gone)}). ` : ''}</p></div>${chips}</section>
    <div class="wkbar card">
      <div class="wkbar-h"><b>Tiến độ ${esc(wk)}</b><span class="legend"><span><i class="sq" style="background:var(--si)"></i>Sale In ${pct(T.ps)}</span><span><i class="sq" style="background:var(--so);opacity:.55"></i>Pending ${pct(T.al ? T.pd / T.al : 0)}</span><span><i style="background:var(--ink)"></i>Tiến độ ${pct(gone)}</span></span><span class="note" hidden>Allocation ${fmt(T.al)} ${U()} · Sale In ${pct(T.ps)} · Pending ${pct(T.al ? T.pd / T.al : 0)} · tiến độ tuần ${pct(gone)}</span></div>
      <div class="wkbar-t">
        <i class="wb-si" style="width:${Math.min(100, (T.ps || 0) * 100)}%"></i><i class="wb-pd" style="width:${Math.max(0, Math.min(100 - Math.min(100, (T.ps || 0) * 100), (T.al ? T.pd / T.al : 0) * 100))}%"></i>
        <span class="wb-mk${gone > 0.85 ? ' r' : gone < 0.15 ? ' l' : ''}" style="left:${gone * 100}%"><em>Tiến độ ${pct(gone)}</em></span>
      </div>
      <div class="wkbar-d">${(() => { const out = []; if (wStart) for (let d = wStart; d <= wEnd; d = addDay(d, 1)) if (isWork(d)) out.push(d); return out.map(d => `<span class="${d <= lastData ? 'on' : ''}">${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay()]}<small> ${fd(d)}</small></span>`).join(''); })()}</div>
    </div>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Allocation ${esc(wk)}</div><div class="kpi-v">${fmt(T.al)}<small>${U()}</small></div><div class="kpi-f">${wStart ? 'Upload ' + (AD[wk] || []).filter(Boolean).map(fd).join(' · ') : ''}</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale In ${esc(wk)}</div><div class="kpi-v">${fmt(T.si)}<small>${U()}</small></div><div class="kpi-f"><span class="${T.ps < gone ? 'lo' : 'hi'}">${pct(T.ps)}</span> allocation · tiến độ ${pct(gone)}</div></div>
      <div class="card c3 kpi" role="button" tabindex="0" data-go="pending" style="cursor:pointer"><div class="kpi-l">SO Pending ${esc(wk)}</div><div class="kpi-v">${fmt(T.pd)}<small>${U()}</small></div><div class="kpi-f">Xem theo SKU →</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Còn lại ${esc(wk)}</div><div class="kpi-v" style="color:${T.rem < 0 ? 'var(--good)' : 'inherit'}">${fmt(T.rem)}<small>${U()}</small></div><div class="kpi-f">Đã dùng <b>${pct(T.use)}</b> (Sale In + Pending)</div><div class="bar"><i style="width:${Math.min(100, (T.use || 0) * 100)}%;background:${T.use > 1 ? 'var(--good)' : 'var(--si)'}"></i></div></div>
      <div class="card c12"><h2>Theo khu vực / NPP / SKU · ${esc(wk)}</h2><p class="sub">Đơn vị ${U()}</p><div class="tw"><table class="sticky1 trk"><thead><tr><th>Khu vực / NPP</th><th>SKU</th><th>Allocation ${esc(wk)}</th><th>Sale In ${esc(wk)}</th><th>% Sale In</th><th>SO Pending</th><th>% đã dùng</th><th>Còn lại</th></tr></thead><tbody>${body}</tbody></table></div>
        <p class="note" style="margin:8px 0 0">${hasSbd ? `Dis Sale by Date tính đến ${fd(addDay(D, -1))} (D-1).` : 'Chưa có file Dis Sale by Date.'}${deliv.length ? ` Cộng ${fmt(sumBy(deliv.filter(o => inWk(orderDateKey(o[5])) && shown.includes(o[3])), o => conv(o[4], o[3])))} ${U()} từ ${new Set(deliv.map(o => o[1])).size} đơn Delivery chưa Synced. Pending = Order Approve & Schedule, loại Backorder.` : ' Pending = Order Approve & Schedule, loại Backorder.'}</p></div>
    </div>
    ${conclusion([
      `Current Week <b>${esc(wk)}</b>: Sale In đạt <b>${pct(T.ps)}</b> allocation so với tiến độ tuần ${pct(gone)}; tính cả Pending đã dùng <b>${pct(T.use)}</b>, ${T.rem >= 0 ? `còn <b>${fmt(T.rem)} ${U()}</b>` : `vượt allocation <b>${fmt(-T.rem)} ${U()}</b>`}.`,
      slow.length ? `Chậm hơn tiến độ: ${slow.slice(0, 4).map(([c, y]) => `<b>${esc(c)}</b> (${pct(y.ps)})`).join(', ')}.` : 'Tất cả NPP đều đúng tiến độ tuần.',
      over.length ? `Vượt allocation: ${over.map(([c, y]) => `<b>${esc(c)}</b> (${fmt(-y.rem)} ${U()})`).join(', ')}.` : ''
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
    const bm = {}; full.forEach(d => d.rows.forEach(r => { const b = brandOf(r[1]); const o = bm[b] || (bm[b] = { t: 0, si: 0, so: 0, mo: {} }); const hl = ui.unit === 'hl';
      o.t += hl ? r[3] : r[2]; o.si += hl ? r[5] : r[4]; o.so += hl ? r[7] : r[6]; const mm = o.mo[d.m] || (o.mo[d.m] = { t: 0, si: 0 }); mm.t += hl ? r[3] : r[2]; mm.si += hl ? r[5] : r[4]; }));
    const brs = Object.entries(bm).filter(([, o]) => o.t || o.si).sort((a, b) => (a[0] === 'Khác') - (b[0] === 'Khác') || b[1].si - a[1].si);
    const siAll = sumBy(brs, ([, o]) => o.si);
    const lastM = full.length ? full[full.length - 1].m : '';
    const brandChart = brs.length ? `<div class="card c12"><div class="card-h"><div><h2>Tiến độ BrandFamily · YTD</h2><p class="sub">% đạt target lũy kế T1–${fM(lastM)} · vạch đứng là mốc 100%</p></div>${legend([['Sale In', css('--si')], ['Sale Out', css('--so')]])}</div>${brandProgress(brs.filter(([b]) => b !== 'Khác').map(([k, o]) => ({ k, t: o.t, si: o.si, so: o.so })), 1, '100%')}</div>` : '';
    const brandCard = brs.length ? `<div class="card c12"><h2>Theo BrandFamily · YTD</h2><p class="sub">Đơn vị ${U()} · xếp theo Sale In · cột cuối là % đạt Sale In tháng gần nhất (${fM(lastM)})</p><div class="tw"><table><thead><tr><th>BrandFamily</th><th>Target</th><th>Sale In</th><th>% SI</th><th>Sale Out</th><th>% SO</th><th>Tỷ trọng SI</th><th>% SI ${fM(lastM).replace(/\/\d{4}$/, '')}</th></tr></thead><tbody>
      ${brs.map(([b, o]) => { const lm = o.mo[lastM]; return `<tr><td><b>${esc(b)}</b></td><td>${fmt(o.t)}</td><td>${fmt(o.si)}</td><td>${o.t ? pctA(o.si / o.t) : '—'}${o.t ? `<span class="mini"><i style="width:${Math.min(100, o.si / o.t * 100)}%;background:${o.si >= o.t ? 'var(--si)' : 'var(--warn)'}"></i></span>` : ''}</td><td>${fmt(o.so)}</td><td>${o.t ? pctA(o.so / o.t) : '—'}</td><td>${pct(siAll ? o.si / siAll : 0)}</td><td>${lm && lm.t ? pctA(lm.si / lm.t) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div></div>` : '';
    const tAll = sumBy(brs, ([, o]) => o.t); const brT = brs.filter(([b, o]) => b !== 'Khác' && o.t > 0 && o.t >= tAll * 0.01).map(([b, o]) => [b, o.si / o.t, o]);
    const brBest = [...brT].sort((a, b) => b[1] - a[1])[0], brWorst = [...brT].sort((a, b) => a[1] - b[1])[0];
    const gm = {}; full.forEach(d => d.rows.forEach(r => { const g = grp(r[1]); gm[g] = gm[g] || { t: 0, si: 0, so: 0 }; gm[g].t += ui.unit === 'hl' ? r[3] : r[2]; gm[g].si += ui.unit === 'hl' ? r[5] : r[4]; gm[g].so += ui.unit === 'hl' ? r[7] : r[6]; }));
    // Drill down: Tháng → Khu vực → NPP
    const hv = (rows) => { const hl = ui.unit === 'hl'; return { t: sumBy(rows, r => hl ? r[3] : r[2]), si: sumBy(rows, r => hl ? r[5] : r[4]), so: sumBy(rows, r => hl ? r[7] : r[6]) }; };
    const mCells = rows => { const o = hv(rows); return `<td>${fmt(o.t)}</td><td>${fmt(o.si)}</td><td>${o.t ? pctA(o.si / o.t) : '—'}</td><td>${fmt(o.so)}</td><td>${o.t ? pctA(o.so / o.t) : '—'}</td><td>${fmt(o.si - o.so)}</td>`; };
    const multiN = new Set(full.flatMap(d => d.rows.map(r => r[0]))).size > 1;
    const drill = (key, label, rows, cls, cellsF) => {
      if (!multiN) return `<tr class="${cls}"><td>${label}</td>${cellsF(rows)}</tr>`;
      const op = isOpen(key, false);
      let h = `<tr class="${cls} lv0 click${op ? ' open' : ''}" data-fold="${esc(key)}"><td><span class="caret">▸</span> ${label}</td>${cellsF(rows)}</tr>`;
      if (!op) return h;
      byArea([...new Set(rows.map(r => r[0]))]).forEach(([a, cs]) => { const ak = key + ':' + a, aop = isOpen(ak, false);
        h += `<tr class="lv1 click${aop ? ' open' : ''}" data-fold="${esc(ak)}"><td><span class="caret">▸</span> ${esc(a)}</td>${cellsF(rows.filter(r => cs.includes(r[0])))}</tr>`;
        if (aop) cs.forEach(c => { h += `<tr class="lv2"><td><b class="nppn">${esc(c)}</b></td>${cellsF(rows.filter(r => r[0] === c))}</tr>`; }); });
      return h; };
    return `
    <section class="lead"><div><div class="eyebrow">YTD as of ${fM(asOf)}</div><h1>${esc(scopeLabel())}</h1>
      <p>Lũy kế từ T1 đến ${fM(asOf)} (tháng đã chốt gần nhất): target, Sale In, Sale Out và tỷ lệ đạt từng tháng.</p></div></section>
    <div class="grid">
      <div class="card c3 kpi"><div class="kpi-l">Target YTD</div><div class="kpi-v">${fmt(tT)}<small>${U()}</small></div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale In YTD</div><div class="kpi-v">${fmt(tSi)}<small>${U()}</small></div><div class="kpi-f"><b>${pctA(tSi / tT)}</b> target</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Sale Out YTD</div><div class="kpi-v">${fmt(tSo)}<small>${U()}</small></div><div class="kpi-f"><b>${pctA(tSo / tT)}</b> target</div></div>
      <div class="card c3 kpi"><div class="kpi-l">Tháng đạt cao nhất</div><div class="kpi-v">${best[0] ? fM(best[0].m) : '—'}</div><div class="kpi-f">${best[0] ? 'Sale In ' + pctA(best[0].si / best[0].t) : ''}</div></div>
      <div class="card c12"><div class="card-h"><div><h2>Target, Sale In, Sale Out theo tháng</h2><p class="sub">Đơn vị ${U()}</p></div>${legend([['Target', cT, 'sq'], ['Sale In', cSi], ['Sale Out', cSo]])}</div>
        ${chart({ labels: data.map(d => fM(d.m).replace(/\/\d{4}$/, '')), bars: [{ name: 'Target', color: cT, values: data.map(d => d.t) }], lines: [{ name: 'Sale In', color: cSi, values: data.map(d => d.si) }, { name: 'Sale Out', color: cSo, values: data.map(d => d.so) }], height: 230, tipTitle: i => fM(data[i].m), aria: 'Target, Sale In và Sale Out theo tháng' })}</div>
      <div class="card c12"><h2>Chi tiết theo tháng</h2><p class="sub">Đơn vị ${U()}${multiN ? ' · bấm mũi tên để xem theo Khu vực / NPP' : ''}</p><div class="tw"><table class="yd"><thead><tr><th>Tháng</th><th>Target</th><th>Sale In</th><th>% SI</th><th>Sale Out</th><th>% SO</th><th>SI − SO</th></tr></thead><tbody>
        ${data.map(d => drill('ym:' + d.m, `<b>${fM(d.m)}</b>`, d.rows, '', mCells)).join('')}
        ${full.length ? drill('ym:tot', 'Tổng YTD', full.flatMap(d => d.rows), 'tot', mCells) : ''}
      </tbody></table></div></div>
      ${(() => { const gs = GROUPS.filter(g => gm[g] && gm[g].t);
        const v = (rows, g) => { const o = { t: 0, si: 0, so: 0 }; rows.forEach(r => { if (grp(r[1]) !== g) return; const hl = ui.unit === 'hl'; o.t += hl ? r[3] : r[2]; o.si += hl ? r[5] : r[4]; o.so += hl ? r[7] : r[6]; }); return o; };
        const cells = o => `<td>${fmt(o.t)}</td><td>${o.t ? pctA(o.si / o.t) : '—'}</td><td class="gsep">${o.t ? pctA(o.so / o.t) : '—'}</td>`;
        return `<div class="card c12"><h2>Theo BrandGroup · từng tháng</h2><p class="sub">Target và tỷ lệ đạt Sale In / Sale Out · đơn vị ${U()}${multiN ? ' · bấm mũi tên để xem theo Khu vực / NPP' : ''}</p><div class="tw"><table class="bgm yd"><thead>
          <tr><th rowspan="2">Tháng</th>${gs.map(g => `<th colspan="3" class="gh">${esc(g)}</th>`).join('')}</tr>
          <tr>${gs.map(() => '<th>Target</th><th>% SI</th><th class="gsep">% SO</th>').join('')}</tr></thead><tbody>
          ${full.map(d => drill('yg:' + d.m, `<b>${fM(d.m)}</b>`, d.rows, '', rr => gs.map(g => cells(v(rr, g))).join(''))).join('')}
          ${drill('yg:tot', 'Tổng YTD', full.flatMap(d => d.rows), 'tot', rr => gs.map(g => cells(v(rr, g))).join(''))}
        </tbody></table></div></div>`; })()}
      ${brandChart}
      ${brandCard}
    </div>
    ${conclusion([
      `YTD as of ${fM(asOf)}: Sale In đạt <b>${pct(tSi / tT)}</b>, Sale Out đạt <b>${pct(tSo / tT)}</b> tổng target.`,
      best.length > 1 ? `Cao nhất <b>${fM(best[0].m)}</b> (${pct(best[0].si / best[0].t)}), thấp nhất <b>${fM(best[best.length - 1].m)}</b> (${pct(best[best.length - 1].si / best[best.length - 1].t)}).` : '',
      brs.length ? `BrandFamily đóng góp lớn nhất: <b>${esc(brs[0][0])}</b> (${pct(siAll ? brs[0][1].si / siAll : 0)} Sale In YTD, đạt ${brs[0][1].t ? pct(brs[0][1].si / brs[0][1].t) : '—'} target).` : '',
      brBest && brWorst && brBest[0] !== brWorst[0] ? `BrandFamily đạt cao nhất: <b>${esc(brBest[0])}</b> (${pct(brBest[1])}); thấp nhất: <b>${esc(brWorst[0])}</b> (${pct(brWorst[1])}, thiếu ${fmt(Math.max(0, brWorst[2].t - brWorst[2].si))} ${U()}).` : '',
      (() => { const w = GROUPS.filter(g => g !== 'Khác' && gm[g] && gm[g].t > 0).map(g => [g, gm[g].si / gm[g].t]).sort((a, b) => a[1] - b[1])[0]; return w ? `BrandGroup đạt thấp nhất: <b>${esc(w[0])}</b> (${pct(w[1])}), cần ưu tiên cải thiện.` : ''; })()
    ])}`;
  }

  /* ---------- bindings ---------- */
  function bindView() {
    const v = $('#view');
    v.querySelectorAll('tr[data-g]').forEach(tr => tr.onclick = () => { const g = tr.dataset.g; ui.open.has(g) ? ui.open.delete(g) : ui.open.add(g); render(); });
    v.querySelectorAll('[data-fold]').forEach(el => el.onclick = e => { e.stopPropagation(); const k = el.dataset.fold; ui.flip.has(k) ? ui.flip.delete(k) : ui.flip.add(k); render(); });
    // Bấm tên NPP: mở/thu gọn chi tiết của NPP đó (không lọc, để bảng giữ nguyên)
    v.querySelectorAll('.click-npp').forEach(el => el.onclick = e => { e.stopPropagation(); const tr = el.closest('tr'); const f = tr && (tr.matches('[data-fold]') ? tr : tr.querySelector('[data-fold]'));
      if (!f) return; const k = f.dataset.fold; ui.flip.has(k) ? ui.flip.delete(k) : ui.flip.add(k); render(); });
    v.querySelectorAll('tr[data-npp]').forEach(tr => tr.onclick = e => { e.stopPropagation(); if (ROLE.type === 'npp') return; const c = tr.dataset.npp; ui.npp = c; ui.area = (STATE.npps[c] || {}).area || ui.area; applyRole(); shell(); window.scrollTo({ top: 0, behavior: 'smooth' }); render(); });
    const tm = $('#tmonth'); if (tm) tm.onchange = () => { ui.tMonth = tm.value; render(); };
    v.querySelectorAll('[data-asku]').forEach(b => b.onclick = () => { ui.allocSku = b.dataset.asku; render(); });
    const xt = $('#xl-target'); if (xt) xt.onclick = exportTarget;
    const xp = $('#xl-progress'); if (xp) xp.onclick = exportProgress;
    const xi = $('#xl-invoice'); if (xi) xi.onclick = exportInvoice;
    v.querySelectorAll('[data-go]').forEach(b => { const go = () => { ui.tab = b.dataset.go; saveUi(); shell(); window.scrollTo({ top: 0 }); render(); }; b.onclick = go; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    v.querySelectorAll('[data-tsku]').forEach(b => b.onclick = () => { ui.trSku = b.dataset.tsku; render(); });
    const xpd = $('#xl-pending'); if (xpd) xpd.onclick = exportPending;
    const xld = $('#xl-landing'); if (xld) xld.onclick = exportLanding;
    const ra = $('#ref-apply'); if (ra) ra.onclick = () => { STATE.ref = { rows: readRefInputs(), at: 'draft' }; render(); };
    const rx2 = $('#ref-xl'); if (rx2) rx2.onclick = exportRef;
  }

  /* ---------- Excel export ---------- */
  async function saveXlsx(filename, sheets, btn) {
    if (!window.XLSX) { toastBtn(btn, 'Chưa tải được thư viện Excel'); return; }
    const wb = XLSX.utils.book_new();
    sheets.forEach(([name, aoa, widths]) => { const ws = Array.isArray(aoa) ? XLSX.utils.aoa_to_sheet(aoa) : aoa; if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); });
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
    const long = [['Tháng', 'Khu vực', 'Mã NPP', 'ShortCode', 'BrandFamily', 'BrandGroup', 'Target (Case)', 'Target (HL)']];
    rows.sort((a, b) => nppCmp(a.c, b.c) || GROUPS.indexOf(grp(a.sc)) - GROUPS.indexOf(grp(b.sc)) || a.sc.localeCompare(b.sc)).forEach(r => long.push([fM(m), (STATE.npps[r.c] || {}).area || '', r.c, r.sc, item(r.sc).b || '', grp(r.sc), Math.round(r.tc), Math.round(r.th * 100) / 100]));
    const npps = [...new Set(rows.map(r => r.c))];
    const piv = [['BrandGroup', ...npps.flatMap(c => [c + ' (Case)', c + ' (HL)']), 'Tổng (Case)', 'Tổng (HL)']];
    GROUPS.forEach(g => { const rr = rows.filter(r => grp(r.sc) === g); if (!rr.length) return;
      piv.push([g, ...npps.flatMap(c => { const x = rr.filter(r => r.c === c); return [Math.round(sumBy(x, r => r.tc)), Math.round(sumBy(x, r => r.th) * 10) / 10]; }), Math.round(sumBy(rr, r => r.tc)), Math.round(sumBy(rr, r => r.th) * 10) / 10]); });
    saveXlsx(`Target_${m}_${scopeTag()}.xlsx`, [['Target chi tiết', long, [10, 10, 9, 10, 12, 13, 12]], ['Theo BrandGroup', piv, [16]]], ev.currentTarget);
  }
  function exportInvoice(ev) {
    const cur = STATE.cur || {}; const ship = cur.ship || {};
    const rows = [['Ngày', 'Khu vực', 'Mã NPP', 'Số hoá đơn', 'Loại chứng từ', 'Mã ShipTo', 'Tên ShipTo', 'BrandFamily', 'BrandGroup', 'ShortCode', 'Số lượng (Case)', 'Sản lượng (HL)']];
    (cur.lines || []).filter(l => inScope(l[1]) && inBrand(l[5])).forEach(([d, c, inv, dt, st, sc, q]) => rows.push([d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4), (STATE.npps[c] || {}).area || '', c, inv, dt, st, ship[st] || '', item(sc).b || '', grp(sc), sc, q, Math.round(q * (item(sc).hl || 0) * 100) / 100]));
    if (rows.length === 1) { toastBtn(ev.currentTarget, 'Không có hoá đơn trong phạm vi này'); return; }
    const days = Object.keys(cur.si || {}).sort();
    saveXlsx(`SO_Invoice_${cur.month}_${days[days.length - 1] || ''}_${scopeTag()}.xlsx`, [['SO Invoice', rows, [11, 9, 9, 12, 15, 11, 36, 11, 11, 10, 14, 13]]], ev.currentTarget);
  }
  function exportProgress(ev) {
    const M = curModel(); const left = M.D - M.dSi;
    const rows = [['Tháng', 'Đến ngày', 'Mã NPP', 'ShortCode', 'BrandFamily', 'BrandGroup', 'Target (Case)', 'Sale In (Case)', '% SI', 'Còn lại SI (Case)', 'Sale Out (Case)', '% SO', 'Còn lại SO (Case)', 'hl/case', 'Target (HL)', 'Sale In (HL)', 'Sale Out (HL)']];
    M.list.filter(r => r.t || r.si || r.so).sort((a, b) => nppCmp(a.c, b.c) || GROUPS.indexOf(grp(a.sc)) - GROUPS.indexOf(grp(b.sc)) || a.sc.localeCompare(b.sc)).forEach(r => { const hl = item(r.sc).hl || 0; const rem = Math.max(0, r.t - r.si);
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
    const title = document.querySelector('title') ? document.querySelector('title').textContent : 'Distributor Sales Performance';
    const cssText = document.getElementById('page-css').textContent;
    const logoTag = `<script id="logo-src" type="text/plain">${LOGO}</scr` + `ipt>`;
    const scripts = ['engine', 'main'].map(id => `<script id="${id}">${document.getElementById(id).textContent}</scr` + `ipt>`).join('');
    return window.__SKELETON_HEAD + `<title>${esc(title)}</title><style id="page-css">${cssText}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"><div id="app"></div><script id="state" type="application/json">${json}</scr` + `ipt><script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></scr` + `ipt>` + logoTag + scripts + '</body></html>';
  }

  loginView();
})();
