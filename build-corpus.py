#!/usr/bin/env python3
"""
Extract a web-ready corpus from the Android app's tunepal.db.

Produces two gzipped JSON files:
  index.json.gz  — search_key + light metadata for EVERY tune (this is what the
                   search loads into memory: ~small, load once, cache in the PWA)
  notation/<tunepalid>.json  — optional per-tune ABC, fetched only when a match is
                   picked (keeps the up-front download small)

Or pass --bundle to inline notation into index.json.gz (bigger, but fully offline
in one file — good for a PWA that must work with no network).

Usage:
  python3 build-corpus.py path/to/tunepal.db out/            # split (default)
  python3 build-corpus.py path/to/tunepal.db out/ --bundle   # single offline file
"""
import sqlite3, json, gzip, os, sys

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    db_path, out_dir = sys.argv[1], sys.argv[2]
    bundle = "--bundle" in sys.argv
    os.makedirs(out_dir, exist_ok=True)

    con = sqlite3.connect(db_path); con.row_factory = sqlite3.Row
    # Some legacy tunebook rows contain non-UTF-8 bytes; decode leniently.
    con.text_factory = lambda b: b.decode("utf-8", "replace")
    rows = con.execute("""
        SELECT ti.tunepalid, ti.title, ti.alt_title, ti.tune_type, ti.key_sig,
               ti.time_sig, ti.source, ti.notation, tk.search_key
        FROM tuneindex ti JOIN tunekeys tk ON tk.tuneid = ti.id
        WHERE tk.search_key IS NOT NULL AND length(tk.search_key) > 0
    """).fetchall()

    index = []
    for r in rows:
        entry = {
            "id": r["tunepalid"], "title": r["title"], "altTitle": r["alt_title"],
            "tuneType": r["tune_type"], "keySig": r["key_sig"], "timeSig": r["time_sig"],
            "src": r["source"], "searchKey": r["search_key"],
        }
        if bundle:
            entry["notation"] = r["notation"]
        else:
            with open(os.path.join(out_dir, "notation", f'{r["tunepalid"]}.abc'), "w") as f:
                f.write(r["notation"] or "")
        index.append(entry)

    if not bundle:
        os.makedirs(os.path.join(out_dir, "notation"), exist_ok=True)  # (created above per-file)

    path = os.path.join(out_dir, "index.json.gz")
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    con.close()
    mb = os.path.getsize(path) / 1e6
    print(f"wrote {len(index)} tunes -> {path}  ({mb:.1f} MB gzipped, bundle={bundle})")

if __name__ == "__main__":
    main()
