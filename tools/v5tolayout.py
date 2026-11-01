"""Convert a Twiddler 3 (config format v5) binary file into the trainer's text layout format.
Bit layout per chord word: thumb N/A/C/S at bits 0/4/8/12; finger row r (0-3) at 4r+1 (R), 4r+2 (M), 4r+3 (L)."""
import struct, sys
data = open(sys.argv[1], 'rb').read()
assert data[0] == 5, 'not a v5 config'
nchords = struct.unpack_from('<H', data, 2)[0]
HID = {}
for n in range(0x04, 0x1e):
    HID[(0, n)] = chr(n - 4 + ord('a')); HID[(1, n)] = chr(n - 4 + ord('A'))
for n in range(0x1e, 0x27):
    HID[(0, n)] = chr(n - 0x1e + ord('1'))
HID[(0, 0x27)] = '0'
for i, c in enumerate('!@#$%^&*()'):
    HID[(1, 0x1e + i)] = c
NAMED = {0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space', 0x39: 'CapsLock',
         0x46: 'PrintScreen', 0x47: 'ScrollLock', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home', 0x4b: 'PageUp',
         0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PageDown', 0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up',
         0x53: 'NumLock'}
for n in range(0x3a, 0x46):
    NAMED[n] = 'F%d' % (n - 0x39)
for code, pair in {0x2d: '-_', 0x2e: '=+', 0x2f: '[{', 0x30: ']}', 0x31: '\\|', 0x33: ';:', 0x34: '\'"',
                   0x35: '`~', 0x36: ',<', 0x37: '.>', 0x38: '/?'}.items():
    HID[(0, code)] = pair[0]; HID[(1, code)] = pair[1]

def esc(ch):
    return '\\' + ch if ch in '<\\' else ch

def key(mod, code):
    shift = bool(mod & 0x22)
    mods = []
    if mod & 0x11: mods.append('Ctrl')
    if mod & 0x44: mods.append('Alt')
    if mod & 0x88: mods.append('Cmd')
    if mods:
        base = NAMED.get(code) or HID.get((0, code)) or ('0x%02x' % code)
        if shift: mods.append('Shift')
        return '<' + '+'.join(mods + [base]) + '>'
    if code in NAMED:
        return '<%s>' % NAMED[code]
    s = HID.get((int(shift), code))
    return esc(s) if s is not None else '<0x%02x>' % code

chords, off = [], 16
for _ in range(nchords):
    chords.append(struct.unpack_from('<HBB', data, off)); off += 4
maxidx = max([hi for _, lo, hi in chords if lo == 0xff] + [-1])
locs = struct.unpack_from('<%dI' % (maxidx + 1), data, off)
for bits, lo, hi in chords:
    thumbs = ''.join(c for c, b in zip('NACS', [0, 4, 8, 12]) if bits & (1 << b))
    rows = ''
    for r in range(4):
        ks = [c for c, o in zip('RML', [1, 2, 3]) if bits & (1 << (4 * r + o))]
        rows += ks[0] if len(ks) == 1 else ('O' if not ks else '(' + ''.join(ks) + ')')
    if lo == 0xff:
        p = locs[hi]; ln = struct.unpack_from('<H', data, p)[0]
        out = ''.join(key(data[p + 2 + 2 * j], data[p + 3 + 2 * j]) for j in range(ln // 2 - 1))
    else:
        out = key(lo, hi)
    print((thumbs + ' ' if thumbs else '') + rows + ' = ' + out)
