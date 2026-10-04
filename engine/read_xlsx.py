"""Đọc mọi file Excel trong input/ thành mảng 2 chiều (sheet đầu tiên) -> build/aoa/*.json cho engine/build.js."""
import json, math, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build' / 'aoa'
OUT.mkdir(parents=True, exist_ok=True)

def cell(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if hasattr(v, 'item'): v = v.item()
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, (int, float, str, bool)): return v
    return str(v)

files = sorted(p for p in (ROOT / 'input').glob('*.xls*') if not p.name.startswith('~$'))
for p in files:
    try:
        df = pd.read_excel(p, header=None, sheet_name=0)
    except Exception as e:
        sys.exit(f'LỖI: không đọc được {p.name}: {e}')
    aoa = [[cell(v) for v in row] for row in df.itertuples(index=False, name=None)]
    (OUT / (p.stem + '.json')).write_text(json.dumps({'name': p.name, 'aoa': aoa}, ensure_ascii=False))
    print(f'Đọc {p.name}: {len(aoa)} dòng')
print(f'Tổng cộng {len(files)} file mới.')
