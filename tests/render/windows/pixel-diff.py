# Pixel differences between profile.cjs captures (needs Pillow; not an npm dependency).
#   python tests/render/windows/pixel-diff.py <folder with r128-low-vsync, r186-low-vsync, r128-high-vsync, r186-high-vsync>
# Per shot: mean absolute channel difference (0-255) and share of pixels whose grey difference exceeds 16.
import json, os, sys
from PIL import Image, ImageChops, ImageStat

folder = sys.argv[1]
pairs = {
    'r128_vs_r186_radeon': ('r128-low-vsync', 'r186-low-vsync'),
    'r128_vs_r186_rtx': ('r128-high-vsync', 'r186-high-vsync'),
    'radeon_vs_rtx_r128': ('r128-low-vsync', 'r128-high-vsync'),
    'radeon_vs_rtx_r186': ('r186-low-vsync', 'r186-high-vsync'),
}

def diff(a, b):
    A = Image.open(a).convert('RGB'); B = Image.open(b).convert('RGB')
    D = ImageChops.difference(A, B)
    grey = D.convert('L').point(lambda v: 255 if v > 16 else 0)
    return {'meanAbs': round(sum(ImageStat.Stat(D).mean) / 3, 3), 'changedShare': round(ImageStat.Stat(grey).mean[0] / 255, 4)}

shots = sorted(f[:-4] for f in os.listdir(os.path.join(folder, 'r186-low-vsync')) if f.endswith('.png'))
result = {shot: {name: diff(os.path.join(folder, x, shot + '.png'), os.path.join(folder, y, shot + '.png')) for name, (x, y) in pairs.items()} for shot in shots}
print(json.dumps(result, indent=1))
