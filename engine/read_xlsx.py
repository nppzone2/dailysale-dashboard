"""Đọc mọi file Excel trong input/ thành mảng 2 chiều (tất cả các sheet) -> build/aoa/*.json cho engine/build.js."""
import json, math, re, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build' / 'aoa'
OUT.mkdir(parents=True, exist_ok=True)
M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

def cell(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if hasattr(v, 'item'): v = v.item()
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, (int, float, str, bool)): return v
    return str(v)

def col_index(ref):
    letters = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letters: n = n * 26 + (ord(ch) - 64)
    return n - 1

def read_tolerant(path):
    """Phương án dự phòng khi pandas/openpyxl không đọc được (ví dụ ô số chứa chuỗi '57.04%' từ Power BI).
    Đọc thẳng XML của workbook; ô không phải số thì giữ nguyên dạng chuỗi."""
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall(f'{{{M}}}si'):
            ss.append(''.join(t.text or '' for t in si.iter(f'{{{M}}}t')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.iter(f'{{{M}}}sheet')]
    files = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)]
    files.sort(key=lambda n: int(re.search(r'(\d+)\.xml$', n).group(1)))
    out = []
    for i, f in enumerate(files):
        root = ET.fromstring(z.read(f))
        rows = []
        for row in root.iter(f'{{{M}}}row'):
            cells = {}; pos = 0
            for c in row.findall(f'{{{M}}}c'):
                t = c.get('t'); v = c.find(f'{{{M}}}v')
                if t == 's' and v is not None: val = ss[int(v.text)]
                elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter(f'{{{M}}}t'))
                elif v is None: val = None
                elif t in ('str', 'b', 'e'): val = v.text or ''
                else:
                    try: val = float(v.text)
                    except (TypeError, ValueError): val = v.text
                ref = c.get('r')
                cells[col_index(ref) if ref else pos] = cell(val); pos += 1
            width = max(cells) + 1 if cells else 0
            rows.append([cells.get(j) for j in range(width)])
        out.append({'sheet': names[i] if i < len(names) else f'Sheet{i + 1}', 'aoa': rows})
    return out

files = sorted(p for p in (ROOT / 'input').glob('*.xls*') if not p.name.startswith('~$'))
for p in files:
    try:
        sheets = pd.read_excel(p, header=None, sheet_name=None)
        out = [{'sheet': n, 'aoa': [[cell(v) for v in row] for row in df.itertuples(index=False, name=None)]} for n, df in sheets.items()]
    except Exception as e:
        try:
            out = read_tolerant(p)
            print(f'Đọc {p.name} bằng chế độ dự phòng (ô có định dạng không chuẩn)')
        except Exception as e2:
            # Không dừng cả lượt cập nhật: ghi lại lỗi để build.js báo cảnh báo và bỏ qua file này
            (OUT / (p.stem + '.json')).write_text(json.dumps({'name': p.name, 'error': str(e2)[:300]}, ensure_ascii=False))
            print(f'CẢNH BÁO: không đọc được {p.name}: {e2}')
            continue
    (OUT / (p.stem + '.json')).write_text(json.dumps({'name': p.name, 'sheets': out}, ensure_ascii=False))
    print(f'Đọc {p.name}: ' + ', '.join(f"{s['sheet']} ({len(s['aoa'])} dòng)" for s in out))
print(f'Tổng cộng {len(files)} file mới.')
