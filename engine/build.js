/* Dựng dashboard Daily Sale by Distributor.
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
for (const f of files) {
  const { name, sheets, aoa } = JSON.parse(fs.readFileSync(path.join(AOA, f), 'utf8'));
  const found = (sheets || [{ sheet: '', aoa }]).map(s => ({ name: name + (sheets && sheets.length > 1 ? ' › ' + s.sheet : ''), p: P.detect(s.aoa) })).filter(x => x.p);
  if (!found.length) die(`không nhận diện được file "${name}" (thiếu cột tiêu đề chuẩn).`);
  parsed.push(...found);
}
parsed.sort((a, b) => P.KIND_ORDER.indexOf(a.p.kind) - P.KIND_ORDER.indexOf(b.p.kind));
const nextMonth = m => { const y = +m.slice(0, 4), mo = +m.slice(4, 6); return mo === 12 ? (y + 1) + '01' : y + String(mo + 1).padStart(2, '0'); };
const opts = { month: String(CFG.month || '').replace(/\D/g, ''), soDate: String(CFG.so_date || '').replace(/\D/g, ''), now };
const curM = state.cur.month;
for (const { name, p } of parsed) {
  // Chốt tháng: tháng đang chạy đã có Target Total -> Target/Allocation mới thuộc tháng kế tiếp
  if ((p.kind === 'target' || p.kind === 'alloc') && curM && (!opts.month || opts.month === curM) && state.months[curM]) opts.month = nextMonth(curM);
  const r = P.applyParsed(state, p, opts);
  console.log(`Nạp ${name}: ${r.label} · ${r.rows} dòng · ${r.note}`);
}
if (state.cur.month !== curM) console.log(`Tháng hiện hành: ${curM || '—'} → ${state.cur.month}`);
delete state.auth;
if (parsed.length) {
  fs.mkdirSync(path.dirname(VAULT), { recursive: true });
  fs.writeFileSync(VAULT, JSON.stringify(seal(state, ADMIN)));
  console.log('Đã lưu kho dữ liệu mã hoá.');
}

/* ---------- cắt dữ liệu theo tài khoản ---------- */
const areaCode = a => String(a || '').replace(/\s+/g, '').toUpperCase();
function slice(st, keep) {
  const s = JSON.parse(JSON.stringify(st)); const k = r => keep(r[0]);
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
  const ships = new Set(c.lines.map(l => l[4])); c.ship = Object.fromEntries(Object.entries(c.ship || {}).filter(([id]) => ships.has(id)));
  return s;
}
const blobs = {};
const hasData = Object.keys(state.npps).length > 0;
if (!hasData) console.log('Chưa có dữ liệu: trang sẽ báo "Dashboard chưa có dữ liệu" khi đăng nhập.');
if (hasData) blobs.admin = seal({ role: { type: 'admin', id: 'ADMIN', label: 'Admin · toàn vùng' }, state }, ADMIN);
const areas = !hasData ? [] : [...new Set(Object.values(state.npps).map(n => n.area).filter(Boolean))];
const warn = [];
for (const a of areas) {
  const code = areaCode(a); const pw = String(ASMS_PW[code] || ASM).trim();
  if (!pw) { warn.push('ASM ' + code); continue; }
  blobs[code.toLowerCase()] = seal({ role: { type: 'asm', id: code, area: a, label: 'ASM · ' + a }, state: slice(state, c => (state.npps[c] || {}).area === a) }, pw);
}
for (const [c, n] of Object.entries(state.npps)) {
  if (!n.dis) { warn.push(`NPP ${c} (chưa có DisCode)`); continue; }
  const pw = String(NPPS_PW[c] || NPPS_PW[n.dis] || NPP).trim();
  if (!pw) { warn.push('NPP ' + c); continue; }
  blobs[n.dis.toLowerCase()] = seal({ role: { type: 'npp', id: c, area: n.area, label: 'NPP · ' + c }, state: slice(state, x => x === c) }, pw);
}
if (warn.length) console.log('Cảnh báo: chưa tạo tài khoản cho ' + warn.join(', ') + ' (thiếu mật khẩu hoặc DisCode).');

/* ---------- ghi trang ---------- */
const vn = new Date(Date.now() + 7 * 3600e3), p2 = n => String(n).padStart(2, '0');
const built = `${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())} ${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
const ENC = { iter: ITER, built, blobs };
const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');
const page = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Daily Sale by Distributor</title>
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
