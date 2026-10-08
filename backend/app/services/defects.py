"""Editable examples from the inspected POLIFORM and RH reports."""
from sqlmodel import Session, select

from app.models.tables import DefectLibrary

PRESETS = [
    ("COLOR", ["Colour not match with colour panel reference"], ["Setting colour"], ["Make sure colour match with colour panel reference"], ["Color", "Colour"]),
    ("SCRACTH", ["Friction during painting / finishing process"], ["Sanding and touch up"], ["Make sure to handle the product with care during finishing process"], ["Scratch"]),
    ("CHIP OFF", ["Chipped by impact"], ["Patch, sanding and touch up"], ["Make sure to be careful during handling process"], ["Chip off", "Chipped"]),
    ("DIRTY", ["Residue of paint"], ["Sanding and touch up"], ["Make sure after painting surface and interval of component are clean from residue of paint"], ["Dirty"]),
    ("SHARP", ["Less sanding on edges"], ["Sanding and touch up color"], ["Make sure to sand along the edges smooth"], ["Sharp"]),
    ("GAP", ["During assembling press less strong"], ["Patch, small sanding"], ["Make sure before painting no gap on the joint"], ["Gap", "Open Joint"]),
    ("ROUGH", ["Less sanding"], ["Sanding"], ["Make sure to sand until smooth"], ["Rough"]),
    ("RUSTIC", ["Rustic is too deep"], ["Sanding, rustic, setting color"], ["Make sure the depth at the rustic is the same as the others"], ["Rustic"]),
    ("DENT", ["Hit during move the product"], ["Small sanding and re-paint"], ["Be careful during move the product make sure no dent"], ["Dent"]),
    ("FLUSH", ["Uneven joint"], ["sand until smooth and even, touch up"], ["Make sure the surface between the joints is flat"], ["Flush", "Uneven joint"]),
    ("GLUE", ["Excess glue/ Residue of glue"], ["Clean up and sanding"], ["Make sure to clean all excess glue before sanding process"], ["Glue"]),
    ("CUTTERMARK", ["Less sanding/Visible cutter mark"], ["Slightly sanding"], ["Make sure to sand the visible cutter mark until completely removed"], ["Cuttermark", "Cutter mark"]),
    ("PINHOLE", ["Less good during component selection"], ["Patch and sanding"], ["Make sure the wood is good during component selection"], ["Pinhole", "Pin Hole", "Pin hole"]),
    ("Crack", ["Material movement or improper handling"], ["Filling, sanding and re finishing"], ["Ensure proper material dryness and careful handling"], ["CRACK", "crack"]),
    ("Sanding mark", ["Sanding not uniform"], ["Sanding and touch up"], ["Check surface smoothness before painting"], ["SANDING MARK", "Sanding Mark"]),
    ("MC", ["The wood not dry"], ["Sunbath"], ["Make sure the wood is dry during component selection"], ["Moisture Content", "mc"]),
    ("knot", ["Natural wood characteristic"], ["Wood filler and re finishing if required"], ["Improve wood material selection before production"], ["Knot", "KNOT"]),
    ("Wood eye", ["Wood defect"], ["Wood filler, sanding and touch up color"], ["Proper material inspection before finishing"], ["WOOD EYE", "Wood Eye"]),
]


def seed_defects(session: Session) -> None:
    existing = set(session.exec(select(DefectLibrary.name)).all())
    for item in PRESETS:
        name, causes, repairs, caps = item[0], item[1], item[2], item[3]
        aliases = item[4] if len(item) > 4 else []
        if name in existing:
            continue
        session.add(DefectLibrary(name=name, aliases=aliases,
                                  default_causes=causes, default_repairs=repairs,
                                  default_cap=caps, source="Panduan issue baru.docx"))
    session.commit()
