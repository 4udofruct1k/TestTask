# -*- coding: utf-8 -*-
# Офлайн-тесты flashlight_params.py (сборка для WG). Запуск на Python 2.7 из папки armor-highlight:
#   python -m unittest discover -s tests
import unittest

import support
support.installWgPackages()
from gui.mods.armor_highlight import flashlight_params as params

# Значения из res/gui/armor_flashlight_config.xml клиента WG 2.4.0.2.
_ALPHA_BY_DIST = [(200, 1.0), (300, 0.0)]
_MAX_SIZE = 28.0
_FADEOFF = 3.0


class ColourTest(unittest.TestCase):

    def test_order_and_range(self):
        # Порядок фонаря: не пробьёт, может пробить, пробьёт; a = 1 (прозрачность — ползунок игры).
        full, half, zero = (0, 255, 0), (255, 128, 0), (255, 0, 0)
        colours = params.colourFloats(full, half, zero)
        self.assertEqual(len(colours), 3)
        self.assertEqual(colours[0], (1.0, 0.0, 0.0, 1.0))
        self.assertAlmostEqual(colours[1][1], 128 / 255.0)
        self.assertEqual(colours[2], (0.0, 1.0, 0.0, 1.0))
        for rgba in colours:
            self.assertEqual(len(rgba), 4)
            for channel in rgba:
                self.assertTrue(0.0 <= channel <= 1.0)


class DistanceTest(unittest.TestCase):

    def test_game_fade_kept(self):
        result = params.alphaByDist(_ALPHA_BY_DIST, True)
        self.assertEqual(result, _ALPHA_BY_DIST)
        self.assertIsNot(result, _ALPHA_BY_DIST)

    def test_no_fade(self):
        self.assertEqual(params.alphaByDist(_ALPHA_BY_DIST, False), [(0, 1.0)])
        # Список фонаря не делится с константой модуля: игра не испортит её при изменении.
        self.assertIsNot(params.alphaByDist(_ALPHA_BY_DIST, False), params.NO_DISTANCE_FADE)


class SizeTest(unittest.TestCase):

    def test_scales(self):
        self.assertEqual(params.SPOT_SCALES[0], 1.0)
        self.assertEqual(list(params.SPOT_SCALES), sorted(params.SPOT_SCALES))

    def test_scaled_keeps_distances(self):
        pairs = [(0, 0.5), (300, 2.0)]
        self.assertEqual(params.scaled(pairs, 1.0), pairs)
        self.assertEqual(params.scaled(pairs, 2.0), [(0, 1.0), (300, 4.0)])

    def test_max_size_limit(self):
        self.assertEqual(params.maxSizePercent(_MAX_SIZE, 1.0), _MAX_SIZE)
        self.assertEqual(params.maxSizePercent(_MAX_SIZE, 2.0), 56.0)
        # validate.Range(0, 100) в config.py клиента.
        self.assertEqual(params.maxSizePercent(_MAX_SIZE, 4.0), 100.0)
        for scale in params.SPOT_SCALES:
            self.assertTrue(params.maxSizePercent(_MAX_SIZE, scale) <= 100.0)


class AimFadeTest(unittest.TestCase):

    def test_game_fade(self):
        self.assertEqual(params.fadeoffFactor(_FADEOFF, True), _FADEOFF)

    def test_no_fade(self):
        factor = params.fadeoffFactor(_FADEOFF, False)
        # Множитель прозрачности игры (сведение / разброс) ** factor = 1 при любом разбросе.
        for ratio in (0.2, 0.5, 1.0):
            self.assertEqual(ratio ** factor, 1.0)


if __name__ == '__main__':
    unittest.main()
