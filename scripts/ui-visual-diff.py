"""Pixel comparison for scripts/ui-visual-parity.cjs output.

Usage: python3 scripts/ui-visual-diff.py <dir>
For each <viewport>-<screen>-legacy.png / -ui.png pair, reports the share of pixels whose largest
channel difference exceeds a small anti-aliasing tolerance, writes a red-highlighted diff image and
report.json. Requires Pillow and NumPy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TOLERANCE = 24  # per-channel difference treated as anti-aliasing noise


def compare(legacy_path, ui_path, diff_path):
    a = np.asarray(Image.open(legacy_path).convert('RGB')).astype(np.int16)
    b = np.asarray(Image.open(ui_path).convert('RGB')).astype(np.int16)
    result = {'legacy_size': [a.shape[1], a.shape[0]], 'ui_size': [b.shape[1], b.shape[0]]}
    h, w = max(a.shape[0], b.shape[0]), max(a.shape[1], b.shape[1])
    pa = np.zeros((h, w, 3), np.int16); pa[:a.shape[0], :a.shape[1]] = a
    pb = np.zeros((h, w, 3), np.int16); pb[:b.shape[0], :b.shape[1]] = b
    delta = np.abs(pa - pb).max(axis=2)
    bad = delta > TOLERANCE
    result['mismatch_pixels'] = int(bad.sum())
    result['mismatch_ratio'] = round(float(bad.mean()), 6)
    if bad.any():
        ys, xs = np.nonzero(bad)
        result['mismatch_box'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    out = (pa * 0.35).astype(np.uint8)
    out[bad] = [255, 0, 0]
    Image.fromarray(out).save(diff_path)
    return result


def main():
    folder = Path(sys.argv[1])
    report = []
    for legacy in sorted(folder.glob('*-legacy.png')):
        stem = legacy.name[:-len('-legacy.png')]
        ui = folder / f'{stem}-ui.png'
        if not ui.exists():
            continue
        r = compare(legacy, ui, folder / f'{stem}-diff.png')
        r['pair'] = stem
        report.append(r)
        print(f"{stem:24s} legacy {r['legacy_size']} ui {r['ui_size']} mismatch {r['mismatch_ratio']*100:.3f}% {r.get('mismatch_box', '')}")
    (folder / 'report.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
