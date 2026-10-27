# Converte il database Excel in public/base.json (dati iniziali inclusi nell'app)
import openpyxl, json, sys, datetime
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/natom-campaigns/data/Natom_Diamonds_DATABASE.xlsx'
wb = openpyxl.load_workbook(src, read_only=True)
ws = wb['Lead']
it = ws.iter_rows(values_only=True)
cols = [str(c) for c in next(it)]
rows = []
for r in it:
    if all(v is None or str(v).strip() == '' for v in r): continue
    rows.append([None if v is None else (v.isoformat()[:10] if isinstance(v, (datetime.date, datetime.datetime)) else str(v)) for v in r])
out = {"version": "base-2026-10-23", "columns": cols, "rows": rows}
json.dump(out, open('public/base.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), cols)
