# R2c effect-region comparison. Effect mask = pixels the fix changed (before vs after grey diff > 6).
# Within that mask: mean abs channel diff and mean saturation/contrast of r128, before (R2) and after (R2c).
#   python -I effect-diff.py <r128 dir> <before dir> <after dir>
import json, os, sys
from PIL import Image, ImageChops, ImageStat

r128, before, after = sys.argv[1:4]
out = {}
for f in sorted(os.listdir(r128)):
    if not f.endswith('.png') or not os.path.exists(os.path.join(after, f)):
        continue
    A = Image.open(os.path.join(r128, f)).convert('RGB')
    B = Image.open(os.path.join(before, f)).convert('RGB')
    C = Image.open(os.path.join(after, f)).convert('RGB')
    if A.size != C.size or B.size != C.size:
        out[f] = {'sizeMismatch': [A.size, B.size, C.size]}
        continue
    mask = ImageChops.difference(B, C).convert('L').point(lambda v: 255 if v > 6 else 0)
    share = ImageStat.Stat(mask).mean[0] / 255
    def mad(X, Y, m=mask):
        return round(sum(ImageStat.Stat(ImageChops.difference(X, Y), m).mean) / 3, 2)
    def sat(X):
        return round(ImageStat.Stat(X.convert('HSV').getchannel('S'), mask).mean[0], 1)
    inv = mask.point(lambda v: 255 - v)
    out[f] = {
        'effectShare': round(share, 4),
        'effect_r128_vs_before': mad(A, B), 'effect_r128_vs_after': mad(A, C),
        'rest_before_vs_after': mad(B, C, inv),
        'whole_r128_vs_before': round(sum(ImageStat.Stat(ImageChops.difference(A, B)).mean) / 3, 2),
        'whole_r128_vs_after': round(sum(ImageStat.Stat(ImageChops.difference(A, C)).mean) / 3, 2),
        'sat_r128': sat(A), 'sat_before': sat(B), 'sat_after': sat(C),
    }
print(json.dumps(out, indent=1))
