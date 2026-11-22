"""Plan 06 spike Q2: fonts. Downloads the upstream releases, subsets to the report charset, checks coverage,
reproducibility and the base64 size budget. Exits 0 only when every expectation holds.

Run: uv run --no-project --python 3.12 --with fonttools==4.68.0 --with brotli==1.2.1 python -I docs/spikes/plan-06/q2_fonts.py [cache_dir]
"""
import base64, glob, hashlib, io, json, os, re, subprocess, sys, tempfile, urllib.request, zipfile
from fontTools import subset, ttLib, version as ft_version
import brotli

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "docs", "spikes", "plan-06", "fonts")
BUDGET_KB = 300
SOURCES = {
    "inter": dict(
        url="https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip",
        zip_sha256="9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e",
        version="4.1", licence_member="LICENSE.txt", licence_out="OFL-Inter.txt",
        licence_sha256="262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a",
        files={"Inter-Regular": ("extras/ttf/Inter-Regular.ttf", "40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82"),
               "Inter-SemiBold": ("extras/ttf/Inter-SemiBold.ttf", "78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3")}),
    "jetbrains-mono": dict(
        url="https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip",
        zip_sha256="6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf",
        version="2.304", licence_member="OFL.txt", licence_out="OFL-JetBrainsMono.txt",
        licence_sha256="30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
        files={"JetBrainsMono-Regular": ("fonts/ttf/JetBrainsMono-Regular.ttf", "a0bf60ef0f83c5ed4d7a75d45838548b1f6873372dfac88f71804491898d138f"),
               "JetBrainsMono-SemiBold": ("fonts/ttf/JetBrainsMono-SemiBold.ttf", "1b3bfa1ed5665a4ce3f9feb68d2d4e40e70bf8b4b7d9a3edd418f321b4e166a0")}),
}
# Glyphs the redesigned text is expected to use beyond what the current report shows (plan 06 Q2 list).
PLANNED = "µ°±≥≤→←↑↓·–—‘’“”…•⁻²³¹⁰≈≠×÷−′″"
# Characters set in monospace (numerals, signs, simple units). Superscript minus (U+207B) is absent from JetBrains Mono:
# unit exponents such as W m⁻² are therefore set in Inter, never in the mono face (a rule for Task 2).
MONO_NEEDED = "0123456789.,:;+-/%()[]<>= µ°±≥≤·–²³−"
FEATURES = ["kern", "liga", "calt", "tnum", "case", "ccmp", "locl", "mark", "mkmk"]

fails = []
def expect(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

def sha(b): return hashlib.sha256(b).hexdigest()

def charset():
    chars = {chr(c) for c in range(0x20, 0x7F)}
    nonascii_src = set()
    for f in glob.glob(os.path.join(ROOT, "src", "**", "*"), recursive=True):
        if os.path.isfile(f) and f.endswith((".ts", ".css", ".html")):
            nonascii_src |= {ch for line in open(f, encoding="utf8") for ch in line if ord(ch) > 126}
    report = os.path.join(ROOT, "reports", "report.html")
    nonascii_report = set()
    if os.path.exists(report):
        html = open(report, encoding="utf8").read()
        html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S)
        text = re.sub(r"<[^>]+>", " ", html)
        nonascii_report = {c for c in text if ord(c) > 126}
    drop = {"﻿", " "}
    allc = (chars | nonascii_src | nonascii_report | set(PLANNED)) - drop
    return sorted(allc), sorted(nonascii_src - drop), sorted(nonascii_report - drop)

def fetch(name, spec, cache):
    p = os.path.join(cache, os.path.basename(spec["url"]))
    if not os.path.exists(p):
        urllib.request.urlretrieve(spec["url"], p)
    data = open(p, "rb").read()
    expect(sha(data) == spec["zip_sha256"], f"{name} release archive sha256 matches the pin")
    return zipfile.ZipFile(io.BytesIO(data))

def subset_bytes(ttf_bytes, text):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.notdef_outline = True
    opts.hinting = False
    opts.drop_tables += ["DSIG"]
    f = ttLib.TTFont(io.BytesIO(ttf_bytes), recalcTimestamp=False)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    out = io.BytesIO(); f.flavor = "woff2"; f.save(out)
    return out.getvalue()

def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="plan06-fonts-")
    os.makedirs(cache, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    chars, src_na, rep_na = charset()
    text = "".join(chars)
    open(os.path.join(OUT, "charset.txt"), "w", encoding="utf8").write(text + "\n")
    print("charset", len(chars), "chars; non-ASCII in src:", "".join(src_na), "| in report:", "".join(rep_na))
    expect(set(rep_na) <= set(chars) and set(src_na) <= set(chars), "charset covers every non-ASCII character of src/ and of the report")
    result = {"tool": {"fonttools": ft_version, "brotli": brotli.__version__}, "charset_chars": len(chars), "fonts": []}
    total_b64 = 0; total_raw = 0
    for name, spec in SOURCES.items():
        z = fetch(name, spec, cache)
        lic = z.read(spec["licence_member"])
        expect(sha(lic) == spec["licence_sha256"], f"{name} licence text sha256 matches the pin")
        expect(b"SIL OPEN FONT LICENSE Version 1.1" in lic, f"{name} licence is the SIL OFL 1.1")
        open(os.path.join(OUT, spec["licence_out"]), "wb").write(lic)
        for fname, (member, want) in spec["files"].items():
            ttf = z.read(member)
            expect(sha(ttf) == want, f"{fname} source ttf sha256 matches the pin")
            a = subset_bytes(ttf, text); b = subset_bytes(ttf, text)
            expect(a == b, f"{fname} subsetting is reproducible in one process (two runs, same bytes)")
            cmap = ttLib.TTFont(io.BytesIO(ttf)).getBestCmap()
            need = text if name == "inter" else MONO_NEEDED
            missing = [c for c in need if ord(c) not in cmap]
            expect(not missing, f"{fname} covers {'the whole charset' if name == 'inter' else 'the numeric and unit characters'}" + (f" (missing {missing})" if missing else ""))
            if name != "inter":
                miss_all = [c for c in text if ord(c) not in cmap]
                if miss_all: print("note", fname, "lacks (falls back to the mono stack):", "".join(miss_all))
            outp = os.path.join(OUT, fname + "-subset.woff2")
            open(outp, "wb").write(a)
            b64 = len(base64.b64encode(a))
            total_b64 += b64; total_raw += len(a)
            result["fonts"].append({"file": f"fonts/{fname}-subset.woff2", "family": name, "source": spec["url"], "source_version": spec["version"],
                                    "source_member": member, "source_sha256": want, "licence_file": f"fonts/{spec['licence_out']}",
                                    "woff2_bytes": len(a), "base64_bytes": b64, "sha256": sha(a)})
    result["total_woff2_bytes"] = total_raw; result["total_base64_bytes"] = total_b64
    result["total_base64_kb"] = round(total_b64 / 1024, 1); result["budget_kb"] = BUDGET_KB
    result["decision"] = "embed" if total_b64 <= BUDGET_KB * 1024 else "system-fallback"
    expect(total_b64 <= BUDGET_KB * 1024, f"total base64 size {result['total_base64_kb']} KB is within {BUDGET_KB} KB")
    # Reproducibility across a fresh interpreter: rerun the subsetting in a subprocess and compare with the files on disk.
    r = subprocess.run([sys.executable, "-I", os.path.abspath(__file__), "--verify-only", cache], capture_output=True, text=True)
    expect(r.returncode == 0, "a second interpreter process reproduces the committed woff2 files byte for byte")
    json.dump(result, open(os.path.join(OUT, "..", "q2-result.json"), "w"), indent=2); open(os.path.join(OUT, "..", "q2-result.json"), "a").write("\n")
    print(json.dumps({k: v for k, v in result.items() if k != "fonts"}))
    sys.exit(1 if fails else 0)

def verify_only(cache):
    chars, _, _ = charset(); text = "".join(chars); bad = 0
    for name, spec in SOURCES.items():
        z = zipfile.ZipFile(os.path.join(cache, os.path.basename(spec["url"])))
        for fname, (member, _) in spec["files"].items():
            got = subset_bytes(z.read(member), text)
            want = open(os.path.join(OUT, fname + "-subset.woff2"), "rb").read()
            if got != want: print("DIFF", fname); bad += 1
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify-only":
        verify_only(sys.argv[2])
    else:
        main()
