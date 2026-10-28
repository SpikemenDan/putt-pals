"""Side-by-side before/after strips from two profile.cjs capture folders (V1a #58).

    python tests/render/windows/compare.py <before-dir> <after-dir> <out-dir> [view ...]

For each starter and view (default: strategic and follow) writes <out-dir>/map-<id>-<view>.jpg:
the unedited before capture on the left, the after capture on the right, each scaled to half size,
with a plain label strip. Needs Pillow.
"""
import os
import sys

from PIL import Image, ImageDraw

STARTERS = [(0, 'Switchback Garden'), (8, 'Dune Serpent'), (20, 'Frost Hollow'), (21, 'Slime Springs'), (5, 'Cyclone Ring'), (19, 'Grand Finale')]


def main():
    before, after, out = sys.argv[1:4]
    views = sys.argv[4:] or ['strategic', 'follow']
    os.makedirs(out, exist_ok=True)
    for map_id, name in STARTERS:
        for view in views:
            file = f'map-{map_id}-{view}.png'
            a, b = (Image.open(os.path.join(d, file)).convert('RGB') for d in (before, after))
            w, h = a.width // 2, a.height // 2
            strip = Image.new('RGB', (w * 2, h + 28), 'white')
            strip.paste(a.resize((w, h), Image.LANCZOS), (0, 28))
            strip.paste(b.resize((w, h), Image.LANCZOS), (w, 28))
            draw = ImageDraw.Draw(strip)
            draw.text((8, 8), f'BEFORE (main) - {name} - {view}', fill='black')
            draw.text((w + 8, 8), f'AFTER (V1a toon) - {name} - {view}', fill='black')
            strip.save(os.path.join(out, f'map-{map_id}-{view}.jpg'), quality=85)
    print('wrote', len(STARTERS) * len(views), 'strips to', out)


if __name__ == '__main__':
    main()
