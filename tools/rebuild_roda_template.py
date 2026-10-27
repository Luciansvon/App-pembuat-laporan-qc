import docx
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT

def build_roda_template():
    doc = docx.Document()
    sec = doc.sections[0]
    sec.left_margin = Cm(1.5)
    sec.right_margin = Cm(1.5)
    sec.top_margin = Cm(1.2)
    sec.bottom_margin = Cm(1.2)
    sec.header_distance = Cm(0.6)
    sec.different_first_page_header_footer = False

    header = sec.header
    # Remove default empty paragraph in header
    for p in list(header.paragraphs):
        p_el = p._element
        p_el.getparent().remove(p_el)

    target_grid = [1417, 515, 730, 456, 902, 601, 989, 1229, 482, 750, 456, 753, 456, 456, 713]
    total_w = sum(target_grid) # 10205 dxa = 18.0 cm

    table = header.add_table(rows=6, cols=15, width=Cm(18))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Set tblW and tblBorders
    tblPr = table._tbl.tblPr
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.insert(0, tblW)
    tblW.set(qn("w:type"), "dxa")
    tblW.set(qn("w:w"), str(total_w))

    tblCellMar = OxmlElement("w:tblCellMar")
    for edge in ("top", "bottom"):
        m = OxmlElement(f"w:{edge}")
        m.set(qn("w:w"), "30")
        m.set(qn("w:type"), "dxa")
        tblCellMar.append(m)
    for edge in ("left", "right"):
        m = OxmlElement(f"w:{edge}")
        m.set(qn("w:w"), "40")
        m.set(qn("w:type"), "dxa")
        tblCellMar.append(m)
    tblPr.append(tblCellMar)

    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{edge}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), "4")
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), "auto")
        borders.append(b)
    tblPr.append(borders)

    # Set tblGrid
    table._tbl.tblGrid.clear()
    for w in target_grid:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(w))
        table._tbl.tblGrid.append(col)

    # Helper for cell
    def setup_cell(tc, span, width, text, bold=False, font_size=8.5, align=WD_ALIGN_PARAGRAPH.LEFT):
        tcPr = tc.get_or_add_tcPr()
        tcPr.clear()
        tcW = OxmlElement("w:tcW")
        tcW.set(qn("w:w"), str(width))
        tcW.set(qn("w:type"), "dxa")
        tcPr.append(tcW)
        if span > 1:
            gs = OxmlElement("w:gridSpan")
            gs.set(qn("w:val"), str(span))
            tcPr.append(gs)
        va = OxmlElement("w:vAlign")
        va.set(qn("w:val"), "center")
        tcPr.append(va)

        # Clear paragraphs
        for p in list(tc.xpath("./w:p")):
            tc.remove(p)
        p = OxmlElement("w:p")
        pPr = OxmlElement("w:pPr")
        sp = OxmlElement("w:spacing")
        sp.set(qn("w:before"), "0")
        sp.set(qn("w:after"), "0")
        pPr.append(sp)
        jc = OxmlElement("w:jc")
        jc.set(qn("w:val"), "center" if align == WD_ALIGN_PARAGRAPH.CENTER else "left")
        pPr.append(jc)
        p.append(pPr)

        if text:
            r = OxmlElement("w:r")
            rPr = OxmlElement("w:rPr")
            rf = OxmlElement("w:rFonts")
            rf.set(qn("w:ascii"), "Calibri")
            rf.set(qn("w:hAnsi"), "Calibri")
            rPr.append(rf)
            if bold:
                rPr.append(OxmlElement("w:b"))
            sz = OxmlElement("w:sz")
            sz.set(qn("w:val"), str(int(font_size * 2)))
            rPr.append(sz)
            r.append(rPr)
            t_el = OxmlElement("w:t")
            t_el.text = text
            r.append(t_el)
            p.append(r)
        tc.append(p)

    # Row definitions: (span, text, bold, font_size, align)
    rows_def = [
        # Row 0
        [(15, "QC   INSPECTION REPORT", True, 10, WD_ALIGN_PARAGRAPH.CENTER)],
        # Row 1
        [
            (1, "DESC", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{DESC}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "INSPECT", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "{{INSPECT}}", True, 8.5, WD_ALIGN_PARAGRAPH.CENTER),
        ],
        # Row 2
        [
            (1, "CUSTOMER", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{CUSTOMER}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "PO", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{PO}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
        ],
        # Row 3
        [
            (1, "DATE-LOC", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{DATE}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "QC", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{QC}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
        ],
        # Row 4
        [
            (1, "QTY", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{QTY}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (2, "AQL", True, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
            (6, "{{AQL}}", False, 8.5, WD_ALIGN_PARAGRAPH.LEFT),
        ],
        # Row 5
        [
            (1, "DIM(mm)", True, 8.0, WD_ALIGN_PARAGRAPH.LEFT),
            (1, "W", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{DIM_1}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "D", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{DIM_2}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "H", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{DIM_3}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "BOX(mm)", True, 8.0, WD_ALIGN_PARAGRAPH.LEFT),
            (1, "L", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{BOX_1}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "W", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{BOX_2}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "H", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "H", True, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
            (1, "{{BOX_3}}", False, 8.0, WD_ALIGN_PARAGRAPH.CENTER),
        ]
    ]

    for r_idx, (row_el, cells_def) in enumerate(zip(table.rows, rows_def)):
        trPr = row_el._tr.get_or_add_trPr()
        trPr.clear()
        trHeight = OxmlElement("w:trHeight")
        trHeight.set(qn("w:val"), "360" if r_idx == 0 else "320")
        trHeight.set(qn("w:hRule"), "exact")
        trPr.append(trHeight)

        # Clear existing tc elements
        for tc in list(row_el._tr.xpath("./w:tc")):
            row_el._tr.remove(tc)

        col_pos = 0
        for span, text, bold, font_size, align in cells_def:
            cell_w = sum(target_grid[col_pos : col_pos + span])
            col_pos += span
            tc = OxmlElement("w:tc")
            setup_cell(tc, span, cell_w, text, bold, font_size, align)
            row_el._tr.append(tc)

    return doc

doc = build_roda_template()
doc.save("templates/roda.docx")
doc.save("templates/references/roda.docx")
print("Templates updated successfully!")
