# Génère assets/img/fin-brume.png (puis converti en WebP) : python3 site/outils/brume.py sortie.png
# Nuages blancs vaporeux (bruit fractal), qui montent en volutes devant le bas de l'interface et se fondent
# dans la couleur du fond en bas de l'image. Sortie : PNG avec transparence en haut, opaque en bas.
import numpy as np, sys
from PIL import Image

def noise(W, H, cell, rng):
    g = rng.random((max(2, H // cell + 2), max(2, W // cell + 2))).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8), "L").resize((W + cell, H + cell), Image.BICUBIC)
    a = np.asarray(im, np.float32)[:H, :W] / 255
    return a

def fbm(W, H, seed, base=420, oct=7, gain=.52):
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32); amp = 1; tot = 0; cell = base
    for _ in range(oct):
        out += amp * noise(W, H, max(2, int(cell)), rng); tot += amp
        amp *= gain; cell /= 2.05
    return out / tot

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

W, H = 2400, 900
bg = np.array([245, 242, 252], np.float32) / 255          # le fond de la page (violet très clair)
yy = (np.arange(H, dtype=np.float32) / H)[:, None]
n1 = fbm(W, H, 3)
n2 = fbm(W, H, 11, base=260, oct=6)
# la densité : nulle en haut, des volutes au milieu, pleine en bas
n3 = fbm(W, H, 5, base=900, oct=3)                     # de grandes ondulations : certaines volutes montent plus haut
d = (n1 * .8 + n2 * .5 + (n3 - .5) * .7) + (yy - .44) * 1.6
d = d - .68
alpha = smooth(-.03, .32, d)
alpha = np.maximum(alpha, smooth(.72, 1.0, yy) * np.ones_like(d))   # tout en bas : un brouillard opaque
# l'éclairage : les dessus des volutes plus blancs, les creux d'un gris lilas très doux
up = np.roll(d, 22, axis=0); up[:22] = up[22]
shade = np.clip((d - up) * 4.2 + .45, 0, 1)                # positif là où la densité monte vers le bas : un dessus éclairé
detail = fbm(W, H, 29, base=60, oct=4)
c_white = np.array([1, 1, 1], np.float32)
c_shadow = np.array([204, 198, 226], np.float32) / 255
lum = np.clip(.45 + .65 * shade - .28 * (detail - .5), 0, 1)[..., None]
rgb = c_shadow + (c_white - c_shadow) * lum
# vers le bas, la couleur rejoint exactement celle du fond
mix = smooth(.6, .98, yy)[..., None]
rgb = rgb * (1 - mix) + bg * mix
out = np.dstack([np.clip(rgb, 0, 1), alpha[..., None]])
Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(sys.argv[1])
print("ok")
