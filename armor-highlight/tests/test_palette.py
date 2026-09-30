# -*- coding: utf-8 -*-
# Офлайн-тесты palette.py. Запуск на Python 2.7 из папки armor-highlight:
#   python -m unittest discover -s tests
import struct
import unittest
import zlib

import support
support.installPackages()
from gui.mods.armor_highlight import palette


class ColourTest(unittest.TestCase):

    def test_parse(self):
        self.assertEqual(palette.parseColour('1DB83A', '000000'), (29, 184, 58))
        self.assertEqual(palette.parseColour('#ff8a00', '000000'), (255, 138, 0))
        self.assertEqual(palette.parseColour('bad', 'ff0000'), (255, 0, 0))
        self.assertEqual(palette.parseColour(None, '00ff00'), (0, 255, 0))

    def test_gradient_ends_and_middle(self):
        full, half, zero = (0, 200, 0), (255, 140, 0), (200, 0, 0)
        for steps in palette.GRADIENT_STEPS:
            colours = palette.gradient(steps, full, half, zero)
            self.assertEqual(len(colours), steps)
            self.assertEqual(colours[0], zero)
            self.assertEqual(colours[-1], full)

        # 3 оттенка: середина — ровно цвет 50%
        self.assertEqual(palette.gradient(3, full, half, zero)[1], half)
        self.assertEqual(palette.gradient(7, full, half, zero)[3], half)

    def test_probability_levels(self):
        self.assertEqual(palette.probabilityLevel(1.0, 7), 6)
        self.assertEqual(palette.probabilityLevel(0.0, 7), 0)
        self.assertEqual(palette.probabilityLevel(0.999, 7), 5)
        self.assertEqual(palette.probabilityLevel(0.001, 7), 1)
        self.assertEqual(palette.probabilityLevel(0.5, 7), 3)
        self.assertEqual(palette.probabilityLevel(0.5, 3), 1)
        levels = [ palette.probabilityLevel(p / 100.0, 11) for p in range(101) ]
        self.assertEqual(levels, sorted(levels))

    def test_every_colour_has_texture(self):
        textures = set((palette.texturePath(rgb, opacity) for rgb, opacity in palette.allTextures()))
        full, half, zero = [ palette.parseColour(c, '000000') for c in (palette.DEFAULT_FULL, palette.DEFAULT_HALF, palette.DEFAULT_ZERO) ]
        for steps in palette.GRADIENT_STEPS:
            for rgb in palette.gradient(steps, full, half, zero):
                # Цвета по умолчанию — точные
                self.assertEqual(palette.nearestColour(rgb), rgb)
                self.assertIn(palette.texturePath(rgb, 50), textures)

        for rgb in ((1, 2, 3), (250, 129, 64), (17, 200, 99)):
            nearest = palette.nearestColour(rgb)
            self.assertTrue(all((abs(a - b) <= 22 for a, b in zip(rgb, nearest))))
            for opacity in (10, 44, 100):
                self.assertIn(palette.texturePath(nearest, palette.nearestOpacity(opacity)), textures)

    def test_png(self):
        data = palette.png((10, 20, 30, 128), 4)
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        length, tag = struct.unpack('>I4s', data[8:16])
        self.assertEqual((length, tag), (13, b'IHDR'))
        self.assertEqual(struct.unpack('>II', data[16:24]), (4, 4))
        idat = data.index(b'IDAT')
        size = struct.unpack('>I', data[idat - 4:idat])[0]
        raw = zlib.decompress(data[idat + 4:idat + 4 + size])
        self.assertEqual(raw, (b'\x00' + b'\x0a\x14\x1e\x80' * 4) * 4)


if __name__ == '__main__':
    unittest.main()
