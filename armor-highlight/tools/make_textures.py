# -*- coding: utf-8 -*-
# Генерирует текстуры палитры (palette.allTextures): сплошной цвет с альфой = непрозрачность, и иконку для списка модов.
# Запуск: python tools/make_textures.py <папка res сборки>. Работает на Python 2.7 и 3.x.
import os
import struct
import sys

_PALETTE = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'res', 'scripts', 'client', 'gui', 'mods', 'armor_highlight', 'palette.py')


def _loadPalette():
    # palette.py не импортирует модули клиента, поэтому его можно выполнить как есть.
    with open(_PALETTE, 'rb') as f:
        source = f.read()
    namespace = {'__name__': 'palette'}
    exec(compile(source, _PALETTE, 'exec'), namespace)
    return namespace


def _dds(size, rgba):
    # Несжатый A8R8G8B8 без мипмапов.
    flags = 0x1 | 0x2 | 0x4 | 0x8 | 0x1000
    pixelFormat = struct.pack('<8I', 32, 0x40 | 0x1, 0, 32, 0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000)
    header = struct.pack('<7I', 124, flags, size, size, size * 4, 0, 0) + struct.pack('<11I', *([0] * 11)) + pixelFormat + struct.pack('<5I', 0x1000, 0, 0, 0, 0)
    r, g, b, a = rgba
    return b'DDS ' + header + struct.pack('<4B', b, g, r, a) * (size * size)


def main(resDir):
    palette = _loadPalette()
    outDir = os.path.join(resDir, *palette['TEXTURE_DIR'].split('/'))
    if not os.path.isdir(outDir):
        os.makedirs(outDir)
    count = 0
    for rgb, opacity in palette['allTextures']():
        path = os.path.join(resDir, *palette['texturePath'](rgb, opacity).split('/'))
        alpha = palette['roundHalfUp'](255 * opacity / 100.0)
        with open(path, 'wb') as f:
            f.write(_dds(palette['TEXTURE_SIZE'], tuple(rgb) + (alpha,)))
        count += 1

    print('textures: %d in %s' % (count, outDir))
    iconPath = os.path.join(resDir, *palette['ICON_PATH'].split('/'))
    if not os.path.isdir(os.path.dirname(iconPath)):
        os.makedirs(os.path.dirname(iconPath))
    with open(iconPath, 'wb') as f:
        f.write(palette['icon']())
    print('icon: %s' % iconPath)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: make_textures.py <res dir>')
    main(sys.argv[1])
