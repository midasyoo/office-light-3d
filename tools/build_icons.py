# -*- coding: utf-8 -*-
"""앱 아이콘 PNG 생성기.

icon.svg 와 같은 도안(천장 조명 5열 x 3행, 일부만 켜진 모습)을 PNG 로 그린다.
iOS 홈 화면 아이콘(apple-touch-icon)은 SVG 를 받지 않으므로 PNG 가 따로 필요하다.

  python tools/build_icons.py [출력디렉터리]

산출:
  icon-192.png            매니페스트 (모서리 둥근 형태)
  icon-512.png            매니페스트
  icon-512-maskable.png   매니페스트 maskable — 플랫폼이 알아서 잘라내므로 꽉 채운다
  apple-touch-icon.png    iOS 홈 화면 — iOS 가 둥글게 깎으므로 꽉 채운다
"""
import os
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SS = 4                       # 슈퍼샘플링 배율 (곡선을 매끈하게)
BASE = 512                   # 도안 기준 좌표계

C_FROM = (30, 58, 138)       # #1e3a8a
C_TO = (37, 99, 235)         # #2563eb
C_ON = (251, 191, 36, 255)   # #fbbf24
C_OFF = (147, 165, 196, 166) # #93a5c4 · 65%
C_GLOW = (255, 224, 160)

# (x, y, 켜짐) — 5열 x 3행
BARS = [
    (112, 150, 1), (172, 150, 1), (232, 150, 1), (292, 150, 1), (352, 150, 1),
    (112, 246, 1), (172, 246, 1), (232, 246, 0), (292, 246, 1), (352, 246, 1),
    (112, 342, 1), (172, 342, 0), (232, 342, 1), (292, 342, 0), (352, 342, 1),
]
BAR_W, BAR_H, BAR_R = 52, 22, 11
GLOW_RX, GLOW_RY = 52, 40


def diagonal_gradient(size):
    """좌상 -> 우하 대각선 그라데이션. 작게 그린 뒤 확대해 부드럽게 만든다."""
    n = 64
    small = Image.new('RGB', (n, n))
    px = small.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2.0 * (n - 1))
            px[x, y] = tuple(int(round(a + (b - a) * t)) for a, b in zip(C_FROM, C_TO))
    return small.resize((size, size), Image.BICUBIC)


def glow_mask(w, h):
    """중심이 밝고 가장자리로 사라지는 타원 알파 마스크 (icon.svg 의 stop 과 동일)."""
    n = 96
    m = Image.new('L', (n, n), 0)
    px = m.load()
    c = (n - 1) / 2.0
    for y in range(n):
        for x in range(n):
            r = (((x - c) / c) ** 2 + ((y - c) / c) ** 2) ** 0.5
            if r >= 1.0:
                a = 0.0
            elif r <= 0.55:
                a = 0.55 + (0.18 - 0.55) * (r / 0.55)
            else:
                a = 0.18 + (0.0 - 0.18) * ((r - 0.55) / 0.45)
            px[x, y] = int(round(a * 255))
    return m.resize((w, h), Image.BICUBIC)


def build(size, rounded):
    s = size * SS
    k = s / float(BASE)

    img = diagonal_gradient(s).convert('RGBA')

    if rounded:
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(112 * k), fill=255)
        img.putalpha(mask)

    # 켜진 등에서 퍼지는 빛
    gw, gh = int(GLOW_RX * 2 * k), int(GLOW_RY * 2 * k)
    gmask = glow_mask(gw, gh)
    glow = Image.new('RGBA', (gw, gh), C_GLOW + (255,))
    for x, y, on in BARS:
        if not on:
            continue
        cx = (x + BAR_W / 2.0) * k
        cy = (y + BAR_H / 2.0) * k
        layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        layer.paste(glow, (int(cx - gw / 2), int(cy - gh / 2)), gmask)
        img = Image.alpha_composite(img, layer)

    # 등기구
    bars = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(bars)
    for x, y, on in BARS:
        d.rounded_rectangle(
            [x * k, y * k, (x + BAR_W) * k, (y + BAR_H) * k],
            radius=BAR_R * k, fill=C_ON if on else C_OFF)
    img = Image.alpha_composite(img, bars)

    if rounded:                      # 합성 과정에서 모서리 알파가 덮였다면 되살린다
        a = img.getchannel('A')
        m = Image.new('L', (s, s), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(112 * k), fill=255)
        img.putalpha(Image.composite(a, Image.new('L', (s, s), 0), m))

    return img.resize((size, size), Image.LANCZOS)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else ROOT
    jobs = [
        ('icon-192.png', 192, True),
        ('icon-512.png', 512, True),
        ('icon-512-maskable.png', 512, False),
        ('apple-touch-icon.png', 180, False),
    ]
    for name, size, rounded in jobs:
        p = os.path.join(out, name)
        build(size, rounded).save(p, 'PNG', optimize=True)
        print('  %-24s %4dpx %7.1f KB' % (name, size, os.path.getsize(p) / 1024.0))


if __name__ == '__main__':
    main()
