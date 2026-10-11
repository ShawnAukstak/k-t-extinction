from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
CURATED = ROOT / "data" / "curated"
APP_DATA = ROOT / "app" / "public" / "data"


def one(pattern: str) -> Path:
    """The single file under data/raw matching a glob, or a helpful error."""
    hits = sorted(RAW.glob(pattern))
    if not hits:
        raise SystemExit(f"missing {pattern} under data/raw — run scripts/fetch.py first")
    return hits[0]
