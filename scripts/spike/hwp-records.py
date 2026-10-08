# TOOLS5 U4 spike (report only): an rhwp-independent check of an HWP 5.0 file made from an HWPX.
# Walks every DocInfo / BodyText/Section* record (zlib raw-deflate when FileHeader flag bit 0 is set) and checks
# that the record headers tile each stream exactly; collects HWPTAG_PARA_TEXT text (control characters dropped)
# and compares its content characters with the <hp:t> text of the source HWPX (Contents/section*.xml).
# Usage: python scripts/spike/hwp-records.py out.hwp src.hwpx   -> one JSON line
import html, json, re, sys, unicodedata, zipfile, zlib
from collections import Counter
import olefile

HWPTAG_BEGIN = 0x10
PARA_TEXT = HWPTAG_BEGIN + 51
CTRL_HEADER = HWPTAG_BEGIN + 55
TABLE = HWPTAG_BEGIN + 61
PICTURE = HWPTAG_BEGIN + 69
EQEDIT = HWPTAG_BEGIN + 72
# Object counts compared one to one: HWP control id (CTRL_HEADER, 4 chars stored reversed) / record tag vs HWPX element.
OBJECTS = {'tables': (r'<hp:tbl\b', TABLE), 'pictures': (r'<hp:pic\b', PICTURE), 'equations': (r'<hp:equation\b', EQEDIT),
           'headers': (r'<hp:header\b', 'head'), 'footers': (r'<hp:footer\b', 'foot')}
CONTENT = re.compile(r'[가-힣A-Za-z0-9]')
# Extended / inline controls occupy 8 UTF-16 units; char controls 1 unit (HWP 5.0 spec, 문단 텍스트).
CHAR_CTRL = {0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31}


def records(data):
    pos, out = 0, []
    while pos < len(data):
        if pos + 4 > len(data):
            return out, f'truncated header at {pos}'
        h = int.from_bytes(data[pos:pos + 4], 'little')
        tag, level, size = h & 0x3FF, (h >> 10) & 0x3FF, (h >> 20) & 0xFFF
        pos += 4
        if size == 0xFFF:
            size = int.from_bytes(data[pos:pos + 4], 'little')
            pos += 4
        if pos + size > len(data):
            return out, f'record overruns stream at {pos} (tag {tag}, size {size})'
        out.append((tag, level, data[pos:pos + size]))
        pos += size
    return out, None


def para_text(payload):
    u = [int.from_bytes(payload[i:i + 2], 'little') for i in range(0, len(payload) - 1, 2)]
    s, i = [], 0
    while i < len(u):
        c = u[i]
        if c < 32:
            i += 1 if c in CHAR_CTRL else 8
            continue
        s.append(chr(c))
        i += 1
    return ''.join(s)


def content(s):
    return CONTENT.findall(unicodedata.normalize('NFKC', s))


def recall(a, b):
    ca, cb = Counter(a), Counter(b)
    return sum(min(n, cb[c]) for c, n in ca.items()) / len(a) if a else 1.0


hwp, hwpx = sys.argv[1], sys.argv[2]
o = olefile.OleFileIO(hwp)
compressed = int.from_bytes(o.openstream('FileHeader').read()[36:40], 'little') & 1
problems, tags, ctrls, text = [], Counter(), Counter(), []
streams = ['DocInfo'] + sorted(('/'.join(s) for s in o.listdir() if s[0] == 'BodyText'), key=lambda n: int(n.split('Section')[1]))
for name in streams:
    raw = o.openstream(name).read()
    data = zlib.decompress(raw, -15) if compressed else raw
    recs, err = records(data)
    if err:
        problems.append(f'{name}: {err}')
    for tag, _, payload in recs:
        tags[tag] += 1
        if tag == CTRL_HEADER and len(payload) >= 4:
            ctrls[payload[:4][::-1].decode('latin-1')] += 1
        if name != 'DocInfo' and tag == PARA_TEXT:
            text.append(para_text(payload))
z = zipfile.ZipFile(hwpx)
src, xmlAll = [], ''
for n in sorted((n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n)), key=lambda n: int(re.findall(r'\d+', n)[-1])):
    xml = z.read(n).decode('utf-8')
    xmlAll += xml
    for m in re.finditer(r'<hp:t(?:\s[^>]*)?>(.*?)</hp:t>', xml, re.S):
        src.append(html.unescape(re.sub(r"<[^>]+>", "", m.group(1))))
cs, co = content(''.join(src)), content(''.join(text))
print(json.dumps({
    'streams': len(streams), 'records': sum(tags.values()), 'paraText': tags[PARA_TEXT],
    'structureProblems': problems, 'srcChars': len(cs), 'hwpChars': len(co),
    'objects': {k: [len(re.findall(rx, xmlAll)), ctrls[v] if isinstance(v, str) else tags[v]] for k, (rx, v) in OBJECTS.items()},
    'recallHwpVsHwpxXml': round(recall(cs, co), 4), 'precision': round(recall(co, cs), 4),
}, ensure_ascii=False))
