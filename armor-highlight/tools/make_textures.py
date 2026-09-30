# -*- coding: utf-8 -*-
# Генерирует текстуры квадратов подсветки: сплошной цвет из palette.py, альфа = OPACITY.
# Запуск: python tools/make_textures.py <папка res сборки>. Работает на Python 2.7 и 3.x.
import os
import struct
import sys

_SIZE = 8
_PALETTE = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'res', 'scripts', 'client', 'gui', 'mods', 'armor_highlight', 'palette.py')


def _loadPalette():
    # palette.py без импортов, поэтому его можно выполнить как есть.
    with open(_PALETTE, 'rb') as f:
        source = f.read()
    namespace = {}
    exec(compile(source, _PALETTE, 'exec'), namespace)
    return namespace


def _dds(width, height, rgba):
    # Несжатый A8R8G8B8 без мипмапов.
    flags = 0x1 | 0x2 | 0x4 | 0x8 | 0x1000
    pixelFormat = struct.pack('<8I', 32, 0x40 | 0x1, 0, 32, 0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000)
    header = struct.pack('<7I', 124, flags, height, width, width * 4, 0, 0) + struct.pack('<11I', *([0] * 11)) + pixelFormat + struct.pack('<5I', 0x1000, 0, 0, 0, 0)
    r, g, b, a = rgba
    pixel = struct.pack('<4B', b, g, r, a)
    return b'DDS ' + header + pixel * (width * height)


def main(resDir):
    palette = _loadPalette()
    alpha = int(round(255 * palette['OPACITY']))
    outDir = os.path.join(resDir, *palette['TEXTURE_DIR'].split('/'))
    if not os.path.isdir(outDir):
        os.makedirs(outDir)
    for name, rgb in sorted(palette['COLORS'].items()):
        path = os.path.join(resDir, *palette['texturePath'](name).split('/'))
        with open(path, 'wb') as f:
            f.write(_dds(_SIZE, _SIZE, tuple(rgb) + (alpha,)))
        print('texture %s: rgb=%s alpha=%d' % (path, rgb, alpha))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: make_textures.py <res dir>')
    main(sys.argv[1])
