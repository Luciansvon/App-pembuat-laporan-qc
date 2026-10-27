import docx
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# Open references/roda.docx or template
doc = docx.Document("templates/roda.docx")
table = doc.sections[0].header.tables[0]

# Proper DXA grid for 18 cm width (total 10205 dxa)
# 15 columns matching the original layout:
# col 0: 1337 (DESC/CUSTOMER/DATE-LOC/QTY/DIM label)
# col 1: 430  (W)
# col 2: 700  (DIM_1)
# col 3: 430  (D)
# col 4: 750  (DIM_2)
# col 5: 450  (H)
# col 6: 800  (DIM_3)
# col 7: 1200 (INSPECT/PO/QC/AQL/BOX label)
# col 8: 430  (L)
# col 9: 650  (BOX_1)
# col 10: 430 (W)
# col 11: 650 (BOX_2)
# col 12: 430 (H)
# col 13: 430 (H2)
# col 14: 688 (BOX_3)

# Let's see original grid in dxa:
# [1337, 428, 703, 408, 759, 499, 814, 1160, 447, 599, 430, 589, 332, 233, 890]
# sum = 9628 dxa (~17 cm). To fit 18 cm (10205 dxa), scale by 10205 / 9628 = 1.0599

base_grid_dxa = [1337, 428, 703, 408, 759, 499, 814, 1160, 447, 599, 430, 589, 332, 233, 890]
scale = 10205 / sum(base_grid_dxa)
target_grid = [int(w * scale) for w in base_grid_dxa]
target_grid[-1] += 10205 - sum(target_grid)

# Set tblGrid
table._tbl.tblGrid.clear()
for w in target_grid:
    col = OxmlElement("w:gridCol")
    col.set(qn("w:w"), str(w))
    table._tbl.tblGrid.append(col)

# Set table width
table_width = table._tbl.tblPr.find(qn("w:tblW"))
if table_width is None:
    table_width = OxmlElement("w:tblW")
    table._tbl.tblPr.insert(0, table_width)
table_width.set(qn("w:type"), "dxa")
table_width.set(qn("w:w"), "10205")

# Set each row's cells width to match grid spans
# Row 0: span 15 -> 10205
# Row 1: span 1 (target_grid[0]), span 6 (sum(target_grid[1:7])), span 2 (sum(target_grid[7:9])), span 2 (sum(target_grid[9:11])), span 2 (sum(target_grid[11:13])), span 2 (sum(target_grid[13:15]))
# Row 2-4: span 1 (target_grid[0]), span 6 (sum(target_grid[1:7])), span 2 (sum(target_grid[7:9])), span 6 (sum(target_grid[9:15]))
# Row 5: spans matching grid: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1

for r_idx, row in enumerate(table.rows):
    # Set row height to 320 dxa (16 pt) for rows 1-5, and 360 dxa for row 0
    trPr = row._tr.get_or_add_trPr()
    trHeight = trPr.find(qn("w:trHeight"))
    if trHeight is None:
        trHeight = OxmlElement("w:trHeight")
        trPr.append(trHeight)
    trHeight.set(qn("w:val"), "360" if r_idx == 0 else "320")
    trHeight.set(qn("w:hRule"), "exact")
    
    col_idx = 0
    for cell in row._tr.xpath("./w:tc"):
        span_elems = cell.xpath("./w:tcPr/w:gridSpan/@w:val")
        span = int(span_elems[0]) if span_elems else 1
        cell_w = sum(target_grid[col_idx : col_idx + span])
        col_idx += span
        
        tcPr = cell.get_or_add_tcPr()
        tcW = tcPr.find(qn("w:tcW"))
        if tcW is None:
            tcW = OxmlElement("w:tcW")
            tcPr.append(tcW)
        tcW.set(qn("w:type"), "dxa")
        tcW.set(qn("w:w"), str(cell_w))

doc.save("test_fixed_table.docx")
print("Saved test_fixed_table.docx")
