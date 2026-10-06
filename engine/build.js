/* Dựng dashboard Distributor Sales Performance.
 *
 *  1. Mở kho dữ liệu mã hoá input/vault/state.enc (khoá từ ADMIN_PASSWORD).
 *  2. Nạp các file mới (build/aoa/*.json do engine/read_xlsx.py đọc từ input/*.xlsx): tự nhận loại file,
 *     gộp vào kho; chốt tháng tự động khi có Target Total của tháng đang chạy + Target tháng mới.
 *  3. Lưu lại kho mã hoá.
 *  4. Cắt dữ liệu theo từng tài khoản (Admin / ASM theo khu vực / NPP theo DisCode), mã hoá từng gói
 *     bằng mật khẩu tương ứng và ghi docs/index.html.
 *
 * Mật khẩu (GitHub Secrets): ADMIN_PASSWORD (bắt buộc), ASM_PASSWORD, NPP_PASSWORD,
 * tuỳ chọn NPP_PASSWORDS / ASM_PASSWORDS dạng JSON {"P444":"...","10260142":"..."} / {"HCM3":"..."}.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const P = require('./parse.js');

const ROOT = path.resolve(__dirname, '..');
const VAULT = path.join(ROOT, 'input', 'vault', 'state.enc');
const AOA = path.join(ROOT, 'build', 'aoa');
const ITER = 200000;
const env = k => String(process.env[k] || '').trim();
const die = m => { console.error('LỖI: ' + m); process.exit(1); };

const ADMIN = env('ADMIN_PASSWORD');
if (!ADMIN) die('chưa đặt secret ADMIN_PASSWORD (Settings → Secrets and variables → Actions).');
const ASM = env('ASM_PASSWORD'), NPP = env('NPP_PASSWORD');
const jsonEnv = k => { try { return JSON.parse(env(k) || '{}'); } catch (e) { die(`secret ${k} không đúng định dạng JSON.`); } };
const NPPS_PW = jsonEnv('NPP_PASSWORDS'), ASMS_PW = jsonEnv('ASM_PASSWORDS');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

/* ---------- kho mã hoá (dữ liệu tổng, chỉ ADMIN_PASSWORD mở được) ---------- */
const kdf = (pw, salt) => crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), salt, ITER, 32, 'sha256');
function seal(obj, pw) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kdf(pw, salt), iv);
  const raw = zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 9 });
  const ct = Buffer.concat([c.update(raw), c.final(), c.getAuthTag()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}
function open(b, pw) {
  const salt = Buffer.from(b.salt, 'base64'), iv = Buffer.from(b.iv, 'base64'), all = Buffer.from(b.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', kdf(pw, salt), iv);
  d.setAuthTag(all.subarray(all.length - 16));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()])).toString('utf8'));
}

let state = P.emptyState();
if (fs.existsSync(VAULT)) {
  try { state = open(JSON.parse(fs.readFileSync(VAULT, 'utf8')), ADMIN); }
  catch (e) { die('không mở được kho dữ liệu input/vault/state.enc (ADMIN_PASSWORD đã đổi?). Xoá file này rồi tải lại toàn bộ file dữ liệu.'); }
  console.log('Mở kho dữ liệu: tháng hiện hành ' + (state.cur.month || '—'));
}

/* ---------- nạp file mới ---------- */
const now = new Date().toISOString();
const files = fs.existsSync(AOA) ? fs.readdirSync(AOA).filter(f => f.endsWith('.json')) : [];
const parsed = [];
// Báo cáo kiểm tra file nguồn: rejects = file bị loại (sai nguồn), warns = điểm bất thường cần xem lại
const REPORT = { at: now, files: [], rejects: [], warns: [] };
const warn2 = (level, msg) => { REPORT.warns.push({ level, msg }); console.log((level === 'error' ? 'CẢNH BÁO' : 'Lưu ý') + ': ' + msg); };
const headerHint = aoa => { for (const row of (aoa || []).slice(0, 15)) { const h = (row || []).filter(v => typeof v === 'string' && v.trim()); if (h.length >= 4) return h.slice(0, 6).join(', '); } return ''; };
for (const f of files) {
  const { name, sheets, aoa, error } = JSON.parse(fs.readFileSync(path.join(AOA, f), 'utf8'));
  if (error) { REPORT.rejects.push({ file: name, reason: 'Không mở được file Excel (file hỏng hoặc sai định dạng).' }); continue; }
  const found = (sheets || [{ sheet: '', aoa }]).map(s => ({ name: name + (sheets && sheets.length > 1 ? ' › ' + s.sheet : ''), p: P.detect(s.aoa) })).filter(x => x.p);
  if (!found.length) {
    const hint = headerHint((sheets && sheets[0] && sheets[0].aoa) || aoa);
    REPORT.rejects.push({ file: name, reason: 'Không phải file nguồn của dashboard này' + (hint ? ` (cột: ${hint}…)` : '') + '. File đã bị bỏ qua và xoá khỏi input/.' });
    console.log(`CẢNH BÁO: bỏ qua "${name}": không nhận diện được loại file.`);
    continue;
  }
  parsed.push(...found);
}
parsed.sort((a, b) => P.KIND_ORDER.indexOf(a.p.kind) - P.KIND_ORDER.indexOf(b.p.kind));
const nextMonth = m => { const y = +m.slice(0, 4), mo = +m.slice(4, 6); return mo === 12 ? (y + 1) + '01' : y + String(mo + 1).padStart(2, '0'); };
const opts = { month: String(CFG.month || '').replace(/\D/g, ''), soDate: String(CFG.so_date || '').replace(/\D/g, ''), now };
const curM = state.cur.month;
const sum = a => a.reduce((x, y) => x + y, 0);
const siLast = () => Object.keys(state.cur.si || {}).sort().pop() || '';
const before = { siLast: siLast(), npps: new Set(Object.keys(state.npps)) };
for (const { name, p } of parsed) {
  // Chặn file SO Invoice cũ hơn dữ liệu đang có (cùng tháng) để không ghi đè số mới
  if (p.kind === 'si' && before.siLast) {
    const di = p.idx['Date_ID']; const mx = p.rows.map(r => String(r[di] ?? '').replace(/\D/g, '').slice(0, 8)).filter(d => d.length === 8).sort().pop() || '';
    if (mx && mx.slice(0, 6) === before.siLast.slice(0, 6) && mx < before.siLast) {
      const f2 = d => d.slice(6, 8) + '/' + d.slice(4, 6);
      REPORT.rejects.push({ file: name, reason: `File SO Invoice chỉ có dữ liệu đến ${f2(mx)}, cũ hơn dữ liệu đang có (đến ${f2(before.siLast)}). Đã bỏ qua để giữ số mới nhất; có thể bạn đã tải nhầm file cũ.` });
      console.log(`CẢNH BÁO: bỏ qua "${name}": SO Invoice cũ hơn dữ liệu hiện có.`); continue;
    }
  }
  // Chốt tháng: tháng đang chạy đã có Target Total -> Target/Allocation mới thuộc tháng kế tiếp
  if ((p.kind === 'target' || p.kind === 'alloc') && curM && (!opts.month || opts.month === curM) && state.months[curM]) opts.month = nextMonth(curM);
  const r = P.applyParsed(state, p, opts);
  console.log(`Nạp ${name}: ${r.label} · ${r.rows} dòng · ${r.note}`);
  REPORT.files.push({ file: name, kind: p.kind, label: r.label, rows: r.rows, note: r.note });
  if (/thiếu hệ số HL: (.+)$/.test(r.note)) warn2('info', `${name}: SKU chưa có hệ số HL trong Item Master (${r.note.match(/thiếu hệ số HL: (.+)$/)[1]}), Sale In của các SKU này đang tính 0.`);
}
/* ---------- kiểm tra chéo dữ liệu nguồn ---------- */
const kinds = new Set(REPORT.files.map(x => x.kind));
const fd = d => d ? d.slice(6, 8) + '/' + d.slice(4, 6) : '—';
if ((kinds.has('si') || kinds.has('sbd')) && Object.keys(state.cur.si || {}).length && (state.cur.sbd || []).length) {
  const a = {}, b = {};
  Object.entries(state.cur.si).forEach(([d, rows]) => { a[d] = sum(rows.map(r => r[2])); });
  state.cur.sbd.forEach(r => { b[r[1]] = (b[r[1]] || 0) + r[4]; });
  const days = Object.keys(a).filter(d => d in b);
  const A = sum(days.map(d => a[d])), B = sum(days.map(d => b[d]));
  if (B > 0 && Math.abs(A - B) / B > 0.03) warn2('error', `Sale In theo SO Invoice (${Math.round(A).toLocaleString('vi-VN')} case) lệch ${Math.round(Math.abs(A - B) / B * 100)}% so với Dis Sale by Date (${Math.round(B).toLocaleString('vi-VN')} case) cùng ngày hoá đơn ${fd(days.sort()[0])}–${fd(days[days.length - 1])}. Kiểm tra lại đơn vị (Case/HL) hoặc file nguồn.`);
}
const newNpp = Object.keys(state.npps).filter(c => !before.npps.has(c));
if (before.npps.size && newNpp.length) warn2('info', `Phát hiện mã NPP mới: ${newNpp.join(', ')}. Kiểm tra lại nếu không phải NPP thuộc HCM Zone 2.`);
const ALERT = REPORT.rejects.length > 0 || REPORT.warns.some(w => w.level === 'error');
if (files.length) state.lastReport = REPORT;
if (state.cur.month !== curM) console.log(`Tháng hiện hành: ${curM || '—'} → ${state.cur.month}`);
delete state.auth;
if (files.length) {
  fs.mkdirSync(path.dirname(VAULT), { recursive: true });
  fs.writeFileSync(VAULT, JSON.stringify(seal(state, ADMIN)));
  console.log('Đã lưu kho dữ liệu mã hoá.');
}

/* ---------- cắt dữ liệu theo tài khoản ---------- */
const areaCode = a => String(a || '').replace(/\s+/g, '').toUpperCase();
function slice(st, keep) {
  const s = JSON.parse(JSON.stringify(st)); const k = r => keep(r[0]); delete s.lastReport;
  s.npps = Object.fromEntries(Object.entries(s.npps).filter(([c]) => keep(c)));
  Object.values(s.months).forEach(m => { m.rows = m.rows.filter(k); });
  const c = s.cur;
  c.target = (c.target || []).filter(k);
  Object.keys(c.si || {}).forEach(d => { c.si[d] = c.si[d].filter(k); });
  c.inv = Object.fromEntries(Object.entries(c.inv || {}).filter(([key]) => keep(key.split('|')[1])));
  Object.values(c.so || {}).forEach(sn => { ['rows', 'seg', 'out', 'segB', 'outB'].forEach(f => { if (sn[f]) sn[f] = sn[f].filter(k); }); });
  c.alloc = (c.alloc || []).filter(r => keep(r[1]));
  c.lines = (c.lines || []).filter(l => keep(l[1]));
  c.orders = (c.orders || []).filter(o => keep(o[0]));
  c.sbd = (c.sbd || []).filter(r => keep(r[0]));
  const ships = new Set(c.lines.map(l => l[4])); c.ship = Object.fromEntries(Object.entries(c.ship || {}).filter(([id]) => ships.has(id)));
  return s;
}
const blobs = {};
const hasData = Object.keys(state.npps).length > 0;
// Chế độ bảo trì (engine/maintenance.json): chỉ tạo gói Admin, NPP/ASM thấy trang thông báo bảo trì
let MAINT = null;
try { const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'maintenance.json'), 'utf8')); if (m && m.on) MAINT = { msg: String(m.message || '').slice(0, 300), since: m.since || '' }; } catch (e) {}
if (MAINT) console.log('Chế độ bảo trì: BẬT (chỉ Admin đăng nhập được).');
if (!hasData) console.log('Chưa có dữ liệu: trang sẽ báo "Dashboard chưa có dữ liệu" khi đăng nhập.');
if (hasData) blobs.admin = seal({ role: { type: 'admin', id: 'ADMIN', label: 'Admin · toàn vùng' }, state }, ADMIN);
const areas = !hasData ? [] : [...new Set(Object.values(state.npps).map(n => n.area).filter(Boolean))];
const warn = [];
for (const a of (MAINT ? [] : areas)) {
  const code = areaCode(a); const pw = String(ASMS_PW[code] || ASM).trim();
  if (!pw) { warn.push('ASM ' + code); continue; }
  blobs[code.toLowerCase()] = seal({ role: { type: 'asm', id: code, area: a, label: 'ASM · ' + a }, state: slice(state, c => (state.npps[c] || {}).area === a) }, pw);
}
for (const [c, n] of (MAINT ? [] : Object.entries(state.npps))) {
  if (!n.dis) { warn.push(`NPP ${c} (chưa có DisCode)`); continue; }
  const pw = String(NPPS_PW[c] || NPPS_PW[n.dis] || NPP).trim();
  if (!pw) { warn.push('NPP ' + c); continue; }
  blobs[n.dis.toLowerCase()] = seal({ role: { type: 'npp', id: c, area: n.area, label: 'NPP · ' + c }, state: slice(state, x => x === c) }, pw);
}
if (warn.length) console.log('Cảnh báo: chưa tạo tài khoản cho ' + warn.join(', ') + ' (thiếu mật khẩu hoặc DisCode).');

/* ---------- ghi trang ---------- */
const vn = new Date(Date.now() + 7 * 3600e3), p2 = n => String(n).padStart(2, '0');
const built = `${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())} ${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
const ENC = { iter: ITER, built, blobs, maint: MAINT };
const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');
const page = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Distributor Sales Performance</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap">
<link rel="icon" href="${rd('logo.b64').trim()}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}[hidden]{display:none!important}
${rd('style.css')}</style></head><body><div id="app"></div>
<script id="logo-src" type="text/plain">${rd('logo.b64').trim()}</script>
<script>window.ENC = ${safe(JSON.stringify(ENC))};</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>${safe(rd('app.js'))}</script></body></html>`;
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), page);
fs.writeFileSync(path.join(ROOT, 'docs', '.nojekyll'), '');
console.log(`Đã dựng docs/index.html (${Math.round(page.length / 1024)} KB) · ${Object.keys(blobs).length} tài khoản · tháng hiện hành ${state.cur.month || '—'}.`);

/* ---------- báo cáo cho GitHub Actions ---------- */
const lines = ['## Kết quả cập nhật dữ liệu', ''];
if (MAINT) lines.push('> 🔧 **Đang bật chế độ bảo trì**: NPP và ASM chưa xem được dashboard.', '');
if (REPORT.files.length) { lines.push('| File | Loại | Dòng | Ghi chú |', '|---|---|---|---|'); REPORT.files.forEach(f => lines.push(`| ${f.file} | ${f.label} | ${f.rows} | ${f.note} |`)); lines.push(''); }
if (REPORT.rejects.length) { lines.push('### ❌ File bị loại'); REPORT.rejects.forEach(r => lines.push(`- **${r.file}**: ${r.reason}`)); lines.push(''); }
if (REPORT.warns.length) { lines.push('### ⚠️ Cần kiểm tra'); REPORT.warns.forEach(w => lines.push(`- ${w.level === 'error' ? '**[Quan trọng]** ' : ''}${w.msg}`)); lines.push(''); }
if (!files.length) lines.push('Không có file Excel mới, chỉ dựng lại trang.');
else if (!ALERT) lines.push('✅ Dữ liệu hợp lệ.');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (process.env.GITHUB_OUTPUT) {
  const msg = [...REPORT.rejects.map(r => `${r.file}: ${r.reason}`), ...REPORT.warns.filter(w => w.level === 'error').map(w => w.msg)].join(' | ').replace(/[\r\n]+/g, ' ');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `alert=${ALERT ? 1 : 0}\nalert_msg=${msg}\n`);
}
