# -*- coding: utf-8 -*-
# Офлайн-тесты geometry.py. Запуск на Python 2.7 из папки armor-highlight:
#   python -m unittest discover -s tests
import math
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight import geometry


def _inside(i, j, u, v, radius):
    return (i - u) ** 2 + (j - v) ** 2 <= radius * radius


class CircleRadiusTest(unittest.TestCase):

    def test_formula(self):
        fov = math.radians(60.0)
        rx, ry = geometry.circleRadiusClip(0.002, fov, 16.0 / 9.0, 1.15, 28.0)
        expectedY = math.tan(0.002) / math.tan(fov / 2.0) * 1.15
        self.assertAlmostEqual(ry, expectedY)
        self.assertAlmostEqual(rx, expectedY * 9.0 / 16.0)

    def test_clamped_to_max_size(self):
        rx, ry = geometry.circleRadiusClip(0.5, math.radians(10.0), 2.0, 1.15, 28.0)
        self.assertAlmostEqual(ry, 0.28)
        self.assertAlmostEqual(rx, 0.14)


class GridLevelTest(unittest.TestCase):

    def test_small_circle_is_level_zero(self):
        self.assertEqual(geometry.gridLevel(10.0, 2500), 0)

    def test_level_grows_with_radius(self):
        # pi * r^2 = 4 * 2500 -> ровно уровень 1, чуть больше -> 2
        radius = math.sqrt(4 * 2500 / math.pi)
        self.assertEqual(geometry.gridLevel(radius * 0.99, 2500), 1)
        self.assertEqual(geometry.gridLevel(radius * 1.01, 2500), 2)

    def test_cells_within_limit(self):
        # Самый большой круг: 28% высоты 1440p при ячейке 3 px
        radius = 0.28 * 720 / 3.0
        level = geometry.gridLevel(radius, 2500)
        step = 1 << level
        count = geometry.cellCount(geometry.rowRanges(0.3, -0.2, radius, step), step)
        self.assertLessEqual(count, 2500 * 1.1)
        self.assertGreater(count, 2500 / 4.0 * 0.9)

    def test_max_samples_clamped(self):
        self.assertEqual(geometry.gridLevel(5.0, 0), geometry.gridLevel(5.0, 1))


class RowRangesTest(unittest.TestCase):

    def test_cells_inside_and_complete(self):
        for step in (1, 2, 4):
            u, v, radius = 3.3, -7.6, 11.2
            rows = geometry.rowRanges(u, v, radius, step)
            found = set()
            for j, iLo, iHi in rows:
                self.assertEqual(j % step, 0)
                self.assertEqual(iLo % step, 0)
                self.assertEqual(iHi % step, 0)
                for i in range(iLo, iHi + 1, step):
                    self.assertTrue(_inside(i, j, u, v, radius))
                    found.add((i, j))

            for j in range(-40, 40, step):
                for i in range(-40, 40, step):
                    if _inside(i, j, u, v, radius):
                        self.assertIn((i, j), found)

            self.assertEqual(geometry.cellCount(rows, step), len(found))

    def test_zero_radius(self):
        self.assertEqual(geometry.rowRanges(0.0, 0.0, 0.0, 1), ())

    def test_tiny_radius_hits_nearest_cell(self):
        self.assertEqual(geometry.rowRanges(2.1, -0.9, 0.3, 1), ((-1, 2, 2),))


class RefineOrderTest(unittest.TestCase):

    def test_coarse_first(self):
        order, refresh = geometry.refineOrder(0.0, 0.0, 20.0, 0, 3)
        levels = [ geometry.keyLevel(i, j, 3) for i, j in order ]
        firstFine = levels.index(0)
        self.assertTrue(all((lvl == 3 for lvl in levels[:levels.index(2)])))
        self.assertTrue(all((lvl >= 1 for lvl in levels[:firstFine])))
        self.assertEqual(set(order), set(refresh))
        rows = geometry.rowRanges(0.0, 0.0, 20.0, 1)
        self.assertEqual(len(refresh), geometry.cellCount(rows, 1))

    def test_refresh_on_level(self):
        _, refresh = geometry.refineOrder(1.0, 2.0, 30.0, 1, 2)
        self.assertTrue(all((i % 2 == 0 and j % 2 == 0 for i, j in refresh)))


class KeyLevelTest(unittest.TestCase):

    def test_levels(self):
        self.assertEqual(geometry.keyLevel(0, 0, 3), 3)
        self.assertEqual(geometry.keyLevel(4, 8, 5), 2)
        self.assertEqual(geometry.keyLevel(-4, 8, 5), 2)
        self.assertEqual(geometry.keyLevel(3, 8, 5), 0)
        self.assertEqual(geometry.keyLevel(16, -32, 3), 3)


class AlphaTest(unittest.TestCase):

    def test_aim_factor(self):
        self.assertEqual(geometry.aimFactor(0.002, 0.002, 3.0), 1.0)
        self.assertEqual(geometry.aimFactor(0.002, 0.0015, 3.0), 1.0)
        self.assertAlmostEqual(geometry.aimFactor(0.002, 0.004, 3.0), 0.125)
        self.assertEqual(geometry.aimFactor(0.002, 0.0, 3.0), 1.0)

    def test_quantize(self):
        self.assertEqual(geometry.quantize(1.0, 16), 16)
        self.assertEqual(geometry.quantize(0.125, 16), 2)
        self.assertEqual(geometry.quantize(0.01, 16), 0)
        self.assertEqual(geometry.quantize(2.0, 16), 16)


if __name__ == '__main__':
    unittest.main()
