#!/usr/bin/env python3
"""
Photo Gallery — a lightweight, self-hosted, iPhotos-style gallery server.

Scans a photo library on disk, builds a date-sorted manifest (using the
icloudpd-style YYYY/MM/DD folder structure where available, falling back
to EXIF date or file modified time), and serves a continuous-scroll web
gallery grouped by day, oldest to newest.

Run directly for testing:
    python3 app.py

In production, run under waitress (see systemd unit in the setup docs):
    waitress-serve --host=0.0.0.0 --port=8080 app:app
"""

import hashlib
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_file, abort, send_from_directory
from PIL import Image, ExifTags

# ---------------------------------------------------------------------------
# Configuration — override any of these with environment variables
# ---------------------------------------------------------------------------
PHOTOS_ROOT = Path(os.environ.get("PHOTOS_ROOT", "/mnt/backup/mobile/iphone-photos")).resolve()
CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/opt/photo-gallery/cache")).resolve()
THUMB_DIR = CACHE_DIR / "thumbs"
FULL_DIR = CACHE_DIR / "full"
MANIFEST_PATH = CACHE_DIR / "manifest.json"

THUMB_MAX = 400     # px, longest edge, for the grid
FULL_MAX = 2000     # px, longest edge, for the lightbox view
THUMB_QUALITY = 82
FULL_QUALITY = 88

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
HEIC_EXTS = {".heic"}
VIDEO_EXTS = {".mov"}  # used only to detect Live Photo companions, never served directly

PATH_DATE_RE = re.compile(r"(?:^|/)(\d{4})/(\d{2})/(\d{2})(?:/|$)")

for d in (THUMB_DIR, FULL_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder="static", static_url_path="/static")

# In-memory state, loaded/rebuilt by load_or_build_manifest()
_manifest_lock = threading.Lock()
_items = []          # list of dicts, sorted by date ascending
_by_hash = {}         # hash -> item, for fast thumb/full lookups
_year_index = []      # list of {year, start_index, count}


# ---------------------------------------------------------------------------
# Manifest building
# ---------------------------------------------------------------------------
def _exif_date(path: Path):
    """Try to read EXIF DateTimeOriginal from a JPEG/PNG. Returns datetime or None."""
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return None
            for tag_id, value in exif.items():
                tag = ExifTags.TAGS.get(tag_id)
                if tag in ("DateTimeOriginal", "DateTime") and value:
                    return datetime.strptime(value.split(".")[0], "%Y:%m:%d %H:%M:%S")
    except Exception:
        return None
    return None


def _file_date(path: Path, rel: str):
    """Date priority: path-encoded YYYY/MM/DD (icloudpd) > EXIF > mtime."""
    m = PATH_DATE_RE.search(rel)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    if path.suffix.lower() in IMAGE_EXTS:
        exif_dt = _exif_date(path)
        if exif_dt:
            return exif_dt

    return datetime.fromtimestamp(path.stat().st_mtime)


def _has_live_companion(path: Path) -> bool:
    stem_lower = path.stem.lower()
    try:
        for sibling in path.parent.iterdir():
            if sibling.suffix.lower() in VIDEO_EXTS and sibling.stem.lower().startswith(stem_lower):
                return True
    except OSError:
        pass
    return False


def build_manifest():
    """Walk PHOTOS_ROOT and build the sorted photo manifest. Slow-ish; cached to disk."""
    items = []
    for dirpath, _dirnames, filenames in os.walk(PHOTOS_ROOT):
        for name in filenames:
            ext = Path(name).suffix.lower()
            if ext not in IMAGE_EXTS and ext not in HEIC_EXTS:
                continue
            full_path = Path(dirpath) / name
            rel = str(full_path.relative_to(PHOTOS_ROOT))
            try:
                dt = _file_date(full_path, rel)
            except OSError:
                continue
            h = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:16]
            items.append({
                "hash": h,
                "rel": rel,
                "date": dt.isoformat(),
                "year": dt.year,
                "live": _has_live_companion(full_path),
            })

    items.sort(key=lambda i: i["date"])
    for idx, item in enumerate(items):
        item["index"] = idx

    manifest = {
        "generated": datetime.now().isoformat(),
        "root": str(PHOTOS_ROOT),
        "count": len(items),
        "items": items,
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f)
    return manifest


def _rebuild_year_index():
    global _year_index
    idx = []
    current_year = None
    for i, item in enumerate(_items):
        if item["year"] != current_year:
            idx.append({"year": item["year"], "start_index": i, "count": 0})
            current_year = item["year"]
        idx[-1]["count"] += 1
    _year_index = idx


def load_or_build_manifest(force=False):
    global _items, _by_hash
    with _manifest_lock:
        manifest = None
        if not force and MANIFEST_PATH.exists():
            try:
                with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
            except (json.JSONDecodeError, OSError):
                manifest = None
        if manifest is None:
            manifest = build_manifest()

        _items = manifest["items"]
        _by_hash = {item["hash"]: item for item in _items}
        _rebuild_year_index()
        return manifest


# ---------------------------------------------------------------------------
# Image rendering (thumbnails + full-size, with on-disk caching)
# ---------------------------------------------------------------------------
def _render_image(item, max_dim, quality, cache_dir: Path):
    cache_path = cache_dir / f"{item['hash']}.jpg"
    if cache_path.exists():
        return cache_path

    src = PHOTOS_ROOT / item["rel"]
    ext = src.suffix.lower()

    tmp_jpeg = None
    try:
        if ext in HEIC_EXTS:
            # Reuse the already-proven heif-convert CLI instead of a Python HEIC binding.
            tmp_fd, tmp_path = tempfile.mkstemp(suffix=".jpg")
            os.close(tmp_fd)
            tmp_jpeg = Path(tmp_path)
            result = subprocess.run(
                ["heif-convert", "-q", "95", str(src), str(tmp_jpeg)],
                capture_output=True, timeout=30,
            )
            if result.returncode != 0 or not tmp_jpeg.exists():
                raise RuntimeError(f"heif-convert failed: {result.stderr.decode(errors='ignore')}")
            source_for_pillow = tmp_jpeg
        else:
            source_for_pillow = src

        with Image.open(source_for_pillow) as img:
            img = img.convert("RGB")
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(cache_path, "JPEG", quality=quality, optimize=True)
    finally:
        if tmp_jpeg and tmp_jpeg.exists():
            tmp_jpeg.unlink(missing_ok=True)

    return cache_path


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/years")
def api_years():
    return jsonify(_year_index)


@app.route("/api/photos")
def api_photos():
    try:
        offset = int(request.args.get("offset", 0))
        limit = min(int(request.args.get("limit", 150)), 300)
    except ValueError:
        abort(400)

    start_year = request.args.get("start_year")
    if start_year:
        try:
            start_year = int(start_year)
        except ValueError:
            abort(400)
        match = next((y for y in _year_index if y["year"] == start_year), None)
        offset = match["start_index"] if match else 0

    chunk = _items[offset:offset + limit]
    out = [
        {
            "index": item["index"],
            "hash": item["hash"],
            "date": item["date"],
            "live": item["live"],
        }
        for item in chunk
    ]
    return jsonify({
        "offset": offset,
        "next_offset": offset + len(chunk),
        "has_more": (offset + len(chunk)) < len(_items),
        "total": len(_items),
        "items": out,
    })


@app.route("/thumb/<h>.jpg")
def thumb(h):
    item = _by_hash.get(h)
    if not item:
        abort(404)
    try:
        path = _render_image(item, THUMB_MAX, THUMB_QUALITY, THUMB_DIR)
    except Exception as e:
        app.logger.error(f"thumb render failed for {item['rel']}: {e}")
        abort(500)
    return send_file(path, mimetype="image/jpeg")


@app.route("/full/<h>.jpg")
def full(h):
    item = _by_hash.get(h)
    if not item:
        abort(404)
    try:
        path = _render_image(item, FULL_MAX, FULL_QUALITY, FULL_DIR)
    except Exception as e:
        app.logger.error(f"full render failed for {item['rel']}: {e}")
        abort(500)
    return send_file(path, mimetype="image/jpeg")


@app.route("/api/rescan", methods=["POST"])
def api_rescan():
    manifest = load_or_build_manifest(force=True)
    return jsonify({"status": "ok", "count": manifest["count"]})


@app.route("/health")
def health():
    return jsonify({"status": "ok", "photos": len(_items)})


# ---------------------------------------------------------------------------
load_or_build_manifest()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), debug=False)
