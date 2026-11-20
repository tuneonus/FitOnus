#!/usr/bin/env python3
"""Builds a genuine HEIC (HEIF container + one HEVC intra frame), the kind an iPhone writes.

Why this exists: neither Sharp nor any tool available in CI can encode HEIC, so tests need a real file. x265 (through
ffmpeg) encodes one HEVC frame and this script writes the ISO-BMFF boxes around it (ftyp, meta with hdlr/pitm/iloc/
iinf/iprp(hvcC, ispe, ipma), mdat). The result is a spec-valid HEIC that libheif parses as `heif / hevc`.

Usage: build-heic.py out.heic [WxH]      (needs ffmpeg with libx265)
Optional: SRC=<ffmpeg lavfi source> CRF=<x265 crf> to make a larger, photo-like (noisy) test image.
Optional: IROT=<1|2|3> adds an `irot` transformation property (rotate 90/180/270 degrees counter-clockwise on display),
which is how an iPhone marks a portrait photo: the stored pixels are landscape and the file says to turn them.
Regenerates tests/fixtures/images/sample.heic with:           build-heic.py sample.heic 96x64
and tests/fixtures/images/sample-rotated.heic with:  IROT=1 build-heic.py sample-rotated.heic 96x64
"""
import struct, subprocess, sys, tempfile, os

out = sys.argv[1]
w, h = (int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "96x64").split("x"))
with tempfile.TemporaryDirectory() as d:
    raw = os.path.join(d, "f.hevc")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", os.environ.get("SRC") or f"testsrc=size={w}x{h}:rate=1", "-frames:v", "1",
                    "-c:v", "libx265", "-pix_fmt", "yuv420p", "-x265-params", "log-level=error:keyint=1:repeat-headers=1:no-sao=1", "-crf", os.environ.get("CRF", "28"), "-f", "hevc", raw], check=True)
    stream = open(raw, "rb").read()

# Split Annex-B into NAL units.
nals, i, starts = [], 0, []
while i + 3 <= len(stream):
    if stream[i:i+3] == b"\x00\x00\x01": starts.append(i + 3); i += 3
    else: i += 1
for n, s in enumerate(starts):
    e = (starts[n + 1] - 3) if n + 1 < len(starts) else len(stream)
    nal = stream[s:e].rstrip(b"\x00") if n + 1 < len(starts) else stream[s:e]
    nals.append(nal)
ntype = lambda nal: (nal[0] >> 1) & 0x3F
vps = next(n for n in nals if ntype(n) == 32); sps = next(n for n in nals if ntype(n) == 33); pps = next(n for n in nals if ntype(n) == 34)
slices = [n for n in nals if ntype(n) < 32]
assert slices, "no slice NAL found"

def unescape(b):
    o, z = bytearray(), 0
    for x in b:
        if z >= 2 and x == 3: z = 0; continue
        o.append(x); z = z + 1 if x == 0 else 0
    return bytes(o)
rbsp = unescape(sps[2:])                      # after the 2-byte NAL header
ptl = rbsp[1:1 + 12]                          # profile_space/tier/idc, 4B compat, 6B constraints, level_idc
box = lambda t, p: struct.pack(">I4s", 8 + len(p), t) + p
full = lambda t, v, f, p: box(t, struct.pack(">I", (v << 24) | f) + p)

arrays = b""
for t, n in ((32, vps), (33, sps), (34, pps)):
    arrays += struct.pack(">BH", 0x80 | t, 1) + struct.pack(">H", len(n)) + n
hvcc = box(b"hvcC", bytes([1]) + ptl + struct.pack(">HBBBBBH", 0xF000, 0xFC, 0xFC | 1, 0xF8, 0xF8, 0, 0)[0:0] +
           struct.pack(">H", 0xF000) + bytes([0xFC, 0xFD, 0xF8, 0xF8]) + struct.pack(">H", 0) + bytes([0x0F, 3]) + arrays)
ispe = full(b"ispe", 0, 0, struct.pack(">II", w, h))
irot_angle = int(os.environ.get("IROT", "0")) & 3
irot = box(b"irot", bytes([irot_angle])) if irot_angle else b""
ipco = box(b"ipco", hvcc + ispe + irot)
# Property associations for item 1: hvcC (essential), ispe, and irot (essential) when present.
associations = bytes([0x81, 0x02]) + (bytes([0x83]) if irot_angle else b"")
ipma = full(b"ipma", 0, 0, struct.pack(">I", 1) + struct.pack(">HB", 1, len(associations)) + associations)
iprp = box(b"iprp", ipco + ipma)
infe = full(b"infe", 2, 0, struct.pack(">HH4s", 1, 0, b"hvc1") + b"\x00")
iinf = full(b"iinf", 0, 0, struct.pack(">H", 1) + infe)
pitm = full(b"pitm", 0, 0, struct.pack(">H", 1))
hdlr = full(b"hdlr", 0, 0, struct.pack(">I4s", 0, b"pict") + b"\x00" * 12 + b"\x00")
mdat_payload = b"".join(struct.pack(">I", len(s)) + s for s in slices)
ftyp = box(b"ftyp", b"heic" + struct.pack(">I", 0) + b"mif1heic")

def iloc(offset):
    return full(b"iloc", 0, 0, bytes([0x44, 0x00]) + struct.pack(">H", 1) + struct.pack(">HHH", 1, 0, 1) + struct.pack(">II", offset, len(mdat_payload)))
meta_wo = hdlr + pitm + iloc(0) + iinf + iprp
meta_len = len(full(b"meta", 0, 0, meta_wo))
offset = len(ftyp) + meta_len + 8               # start of mdat payload
meta = full(b"meta", 0, 0, hdlr + pitm + iloc(offset) + iinf + iprp)
open(out, "wb").write(ftyp + meta + box(b"mdat", mdat_payload))
print(f"wrote {out}: {os.path.getsize(out)} bytes, {w}x{h}, {len(slices)} slice NAL(s)")
