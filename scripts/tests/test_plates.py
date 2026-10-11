"""Offline PALEOMAP reconstructions must match the GPlates Web Service (values fetched 2026-10-11).

    .venv/bin/python -m pytest scripts/tests      (or: .venv/bin/python scripts/tests/test_plates.py)
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from kt.plates import PlateModel  # noqa: E402

GWS_PALEOMAP_65MA = {
    "chicxulub": (21.29, -89.53, 25.1149, -71.5823),
    "tanis": (46.0218, -103.791, 51.6738, -79.5993),
    "hell-creek": (47.32, -106.91, 53.5066, -82.4061),
    "deccan": (18.85, 73.72, -22.1954, 57.1253),
    "seymour": (-64.233, -56.617, -63.6118, -67.2653),
    "el-kef": (36.1537, 8.6486, 25.917, 6.2836),
    "gubbio": (43.3655, 12.5826, 32.5114, 11.1),
}


def test_matches_gws() -> None:
    m = PlateModel()
    for name, (la, lo, ela, elo) in GWS_PALEOMAP_65MA.items():
        pla, plo, plate = m.reconstruct(la, lo, 65)
        assert plate is not None, name
        d_km = 111.2 * math.hypot(pla - ela, (plo - elo) * math.cos(math.radians(ela)))
        assert d_km < 1.0, f"{name}: {d_km:.2f} km off"


def test_no_antipodal_plate() -> None:
    """West Africa is antipodal to the Pacific plate polygon; it must reconstruct with Africa."""
    m = PlateModel()
    lagos = m.reconstruct(6.52, 3.38, 65)
    for name, la, lo in [("accra", 5.56, -0.2), ("abidjan", 5.36, -4.0), ("ouagadougou", 12.37, -1.52)]:
        pla, plo, plate = m.reconstruct(la, lo, 65)
        assert plate != 901, name
        assert math.hypot(pla - lagos[0], plo - lagos[1]) < 12, f"{name}: {pla:.1f}, {plo:.1f}"
    assert m.reconstruct(21.3, -157.86, 65)[2] == 901  # Honolulu stays on the Pacific plate


if __name__ == "__main__":
    test_matches_gws()
    test_no_antipodal_plate()
    print("ok")
