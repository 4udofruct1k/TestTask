# -*- coding: utf-8 -*-
# Офлайн-тесты geometry.py. Запуск на Python 2.7 из папки armor-highlight:
#   python -m unittest discover -s tests
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'res', 'scripts', 'client', 'gui', 'mods', 'armor_highlight'))
import geometry


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


class GridTest(unittest.TestCase):
    STEP_X = 2.0 * 10 / 1920
    STEP_Y = 2.0 * 10 / 1080

    def test_points_inside_ellipse(self):
        rx, ry = 0.05, 0.09
        scale, offsets = geometry.buildGrid(rx, ry, self.STEP_X, self.STEP_Y, 10000)
        self.assertEqual(scale, 1.0)
        self.assertIn((0, 0), offsets)
        for i, j in offsets:
            self.assertTrue(geometry.isInsideEllipse(i * self.STEP_X, j * self.STEP_Y, rx, ry))

    def test_grid_is_complete(self):
        rx, ry = 0.05, 0.09
        _, offsets = geometry.buildGrid(rx, ry, self.STEP_X, self.STEP_Y, 10000)
        found = set(offsets)
        for i in range(-20, 21):
            for j in range(-20, 21):
                if geometry.isInsideEllipse(i * self.STEP_X, j * self.STEP_Y, rx, ry):
                    self.assertIn((i, j), found)

    def test_no_duplicates(self):
        _, offsets = geometry.buildGrid(0.1, 0.2, self.STEP_X, self.STEP_Y, 10000)
        self.assertEqual(len(offsets), len(set(offsets)))

    def test_max_samples_increases_step(self):
        # Самый большой круг: r_y = 0.28 на 1920x1080 и шаг 10 px даёт ~700 точек.
        rx, ry = 0.28 * 9.0 / 16.0, 0.28
        _, full = geometry.buildGrid(rx, ry, self.STEP_X, self.STEP_Y, 100000)
        self.assertGreater(len(full), 250)
        scale, offsets = geometry.buildGrid(rx, ry, self.STEP_X, self.STEP_Y, 250)
        self.assertGreater(scale, 1.0)
        self.assertLessEqual(len(offsets), 250)
        self.assertGreater(len(offsets), 100)
        for i, j in offsets:
            self.assertTrue(geometry.isInsideEllipse(i * self.STEP_X * scale, j * self.STEP_Y * scale, rx, ry))

    def test_zero_radius_gives_center(self):
        self.assertEqual(geometry.buildGrid(0.0, 0.0, self.STEP_X, self.STEP_Y, 250), (1.0, [(0, 0)]))

    def test_tiny_radius_gives_center(self):
        scale, offsets = geometry.buildGrid(self.STEP_X * 0.5, self.STEP_Y * 0.5, self.STEP_X, self.STEP_Y, 250)
        self.assertEqual(offsets, [(0, 0)])

    def test_max_samples_one(self):
        scale, offsets = geometry.buildGrid(0.1, 0.1, self.STEP_X, self.STEP_Y, 1)
        self.assertEqual(offsets, [(0, 0)])


class AlphaTest(unittest.TestCase):

    def test_alpha_by_dist(self):
        self.assertEqual(geometry.alphaByDist(50.0, 200.0, 300.0), 1.0)
        self.assertEqual(geometry.alphaByDist(200.0, 200.0, 300.0), 1.0)
        self.assertAlmostEqual(geometry.alphaByDist(250.0, 200.0, 300.0), 0.5)
        self.assertEqual(geometry.alphaByDist(300.0, 200.0, 300.0), 0.0)
        self.assertEqual(geometry.alphaByDist(400.0, 200.0, 300.0), 0.0)

    def test_aim_factor(self):
        self.assertEqual(geometry.aimFactor(0.002, 0.002, 3.0), 1.0)
        self.assertEqual(geometry.aimFactor(0.002, 0.0015, 3.0), 1.0)
        self.assertAlmostEqual(geometry.aimFactor(0.002, 0.004, 3.0), 0.125)
        self.assertEqual(geometry.aimFactor(0.002, 0.0, 3.0), 1.0)

    def test_alpha_byte(self):
        self.assertEqual(geometry.alphaByte(0.45, 1.0, 1.0), 115)
        self.assertEqual(geometry.alphaByte(0.45, 0.0, 1.0), 0)
        self.assertEqual(geometry.alphaByte(2.0, 1.0, 1.0), 255)


if __name__ == '__main__':
    unittest.main()
