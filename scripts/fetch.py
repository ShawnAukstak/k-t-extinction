#!/usr/bin/env python3
"""Download the upstream datasets listed in data/catalog.yaml into data/raw/.

    .venv/bin/python scripts/fetch.py                 # every `core` source
    .venv/bin/python scripts/fetch.py --group heavy   # the multi-GB extras
    .venv/bin/python scripts/fetch.py --only pbdb,tabor2020
    .venv/bin/python scripts/fetch.py --list

Files that already exist with the right size/md5 are skipped, so the script is safe to re-run.
Each completed source is recorded in data/raw/.fetched.json with the fetch date (PBDB results
change over time, so that date is part of the citation).
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import gzip
import hashlib
import io
import json
import shutil
import sys
import tarfile
import time
import zipfile
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalog.yaml"
RAW = ROOT / "data" / "raw"
LEDGER = RAW / ".fetched.json"
UA = {"User-Agent": "k-t-extinction data fetch (research project; contact via repository)"}


def md5sum(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_complete(path: Path, size: int | None, md5: str | None) -> bool:
    if not path.exists():
        return False
    if size is not None and path.stat().st_size != size:
        return False
    if md5 is not None and md5sum(path) != md5:
        return False
    return True


def download(url: str, dest: Path, size: int | None = None, md5: str | None = None, retries: int = 3) -> None:
    if is_complete(dest, size, md5):
        print(f"  ok      {dest.relative_to(RAW)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    for attempt in range(1, retries + 1):
        try:
            done = part.stat().st_size if part.exists() else 0
            headers = dict(UA)
            if done:
                headers["Range"] = f"bytes={done}-"
            with requests.get(url, headers=headers, stream=True, timeout=60, allow_redirects=True) as r:
                if done and r.status_code != 206:      # server ignored the range: start over
                    done = 0
                r.raise_for_status()
                total = (int(r.headers.get("Content-Length", 0)) + done) or size or 0
                mode = "ab" if done else "wb"
                last = time.time()
                with part.open(mode) as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                        done += len(chunk)
                        if time.time() - last > 5:
                            pct = f"{100 * done / total:5.1f}%" if total else ""
                            print(f"  ...     {dest.name} {done / 1e6:8.1f} MB {pct}", flush=True)
                            last = time.time()
            part.rename(dest)
            if not is_complete(dest, size, md5):
                got = dest.stat().st_size
                dest.unlink()
                raise IOError(f"verification failed for {dest.name} (size {got}, expected {size}, md5 {md5})")
            print(f"  fetched {dest.relative_to(RAW)} ({dest.stat().st_size / 1e6:.1f} MB)")
            return
        except Exception as e:  # noqa: BLE001 — report and retry any network/IO failure
            print(f"  attempt {attempt} failed: {e}", file=sys.stderr)
            time.sleep(3 * attempt)
    raise SystemExit(f"giving up on {url}")


class RemoteFile(io.RawIOBase):
    """A file on a server that honours HTTP Range requests, readable and seekable like a local one."""

    def __init__(self, url: str):
        r = requests.head(url, headers=UA, allow_redirects=True, timeout=60)
        r.raise_for_status()
        self.url, self.size, self.pos = r.url, int(r.headers["Content-Length"]), 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def readinto(self, b) -> int:  # type: ignore[no-untyped-def]
        if not len(b) or self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        r = requests.get(self.url, headers={**UA, "Range": f"bytes={self.pos}-{end}"}, timeout=60)
        if r.status_code != 206:
            raise IOError(f"{self.url} ignored a range request ({r.status_code})")
        b[: len(r.content)] = r.content
        self.pos += len(r.content)
        return len(r.content)


def _wanted(patterns: list[str]):  # type: ignore[no-untyped-def]
    def wanted(name: str) -> bool:
        base = name.rsplit("/", 1)[-1]
        return any(fnmatch.fnmatch(name, p) or fnmatch.fnmatch(base, p) for p in patterns)
    return wanted


def _extract_zip(z: zipfile.ZipFile, out_dir: Path, patterns: list[str]) -> list[Path]:
    wanted, out = _wanted(patterns), []
    for m in z.infolist():
        if m.is_dir() or not wanted(m.filename) or "__MACOSX" in m.filename:
            continue
        target = out_dir / m.filename
        if not target.exists() or target.stat().st_size != m.file_size:
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(m) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
        out.append(target)
    return out


def extract_remote(url: str, archive: Path, patterns: list[str]) -> list[Path]:
    """Like extract(), straight from a zip on the server: only the wanted members are downloaded."""
    out_dir = archive.parent / archive.name.split(".")[0]
    with zipfile.ZipFile(io.BufferedReader(RemoteFile(url), 1 << 20)) as z:
        out = _extract_zip(z, out_dir, patterns)
    for p in out:
        print(f"  extract {p.relative_to(RAW)} (remote)")
    return out


def extract(archive: Path, patterns: list[str]) -> list[Path]:
    """Extract members matching any glob into <archive dir>/<archive stem>/ (zip and tar only)."""
    out_dir = archive.parent / archive.name.split(".")[0]
    out: list[Path] = []
    wanted = _wanted(patterns)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            out = _extract_zip(z, out_dir, patterns)
    elif tarfile.is_tarfile(archive):
        with tarfile.open(archive) as t:
            for m in t.getmembers():
                if not m.isfile() or not wanted(m.name):
                    continue
                target = out_dir / m.name
                if ".." in Path(m.name).parts or Path(m.name).is_absolute():
                    raise SystemExit(f"refusing unsafe path in {archive.name}: {m.name}")
                if not target.exists() or target.stat().st_size != m.size:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with t.extractfile(m) as src, target.open("wb") as dst:  # type: ignore[union-attr]
                        shutil.copyfileobj(src, dst)
                out.append(target)
    else:
        raise SystemExit(f"don't know how to extract {archive}")
    for p in out:
        print(f"  extract {p.relative_to(RAW)}")
    return out


def gunzip(path: Path) -> Path:
    target = path.with_suffix("")
    if not target.exists():
        with gzip.open(path, "rb") as src, target.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        print(f"  gunzip  {target.relative_to(RAW)}")
    return target


def fetch_source(src: dict) -> dict:
    print(f"[{src['id']}] {src['name']}")
    record: dict = {"fetched": dt.date.today().isoformat(), "files": []}
    for f in src.get("files", []):
        dest = RAW / f["path"]
        if f.get("remote"):
            # Large zip, few members needed: read just those over HTTP ranges.
            for p in extract_remote(f["url"], dest, f["extract"]):
                record["files"].append({"path": str(p.relative_to(RAW)), "md5": md5sum(p)})
            continue
        download(f["url"], dest, f.get("size"), f.get("md5"))
        record["files"].append({"path": f["path"], "md5": md5sum(dest)})
        if f.get("extract"):
            extract(dest, f["extract"])
        if f.get("gunzip"):
            gunzip(dest)
    for q in src.get("queries", []):
        dest = RAW / q["path"]
        if dest.exists():
            print(f"  ok      {dest.relative_to(RAW)} (delete to refresh)")
        else:
            download(q["url"], dest)
            try:
                n = len(json.loads(dest.read_text()).get("records", []))
                print(f"          {n} records")
            except Exception:  # noqa: BLE001
                pass
        record["files"].append({"path": q["path"], "md5": md5sum(dest), "url": q["url"]})
    return record


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--group", default="core", help="core | heavy | reference | all (default: core)")
    ap.add_argument("--only", help="comma-separated source ids (overrides --group)")
    ap.add_argument("--list", action="store_true", help="list sources and exit")
    args = ap.parse_args()

    sources = yaml.safe_load(CATALOG.read_text())["sources"]
    if args.list:
        for s in sources:
            print(f"{s['id']:18} {s['group']:9} {'ship' if s.get('ship') else 'LOCAL':5}  {s['name']}")
        return

    if args.only:
        ids = set(args.only.split(","))
        chosen = [s for s in sources if s["id"] in ids]
        missing = ids - {s["id"] for s in chosen}
        if missing:
            raise SystemExit(f"unknown source id(s): {', '.join(sorted(missing))}")
    else:
        chosen = [s for s in sources if args.group == "all" or s["group"] == args.group]

    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else {}
    RAW.mkdir(parents=True, exist_ok=True)
    for s in chosen:
        ledger[s["id"]] = fetch_source(s)
        LEDGER.write_text(json.dumps(ledger, indent=2) + "\n")
    print(f"done: {len(chosen)} source(s); ledger at {LEDGER.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
