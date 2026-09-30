# -*- coding: utf-8 -*-
# Офлайн-тесты window.py: область вокруг центра прицела по логике 0.3.0.
import math
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight.window import AimWindow, rowRanges

LEVELS = range(7)


def tank(x, y):
    # Как в test_lattice.py: «танк» 300x150 с градиентом и непробиваемой «башней», вокруг пусто.
    if not (-150 <= x < 150 and -75 <= y < 75):
        return None
    if (x - 60) ** 2 + (y + 40) ** 2 < 900:
        return 0
    return max(0, min(6, int((x + 0.5 * y + 150) / 300.0 * 7)))


def atCell(scene, cell):
    # Значение ячейки (i, j) — в её центре.
    return lambda i, j: scene(int(math.floor((i + 0.5) * cell)), int(math.floor((j + 0.5) * cell)))


def run(window, scene, cell, limit=None):
    # Один кадр: ячейки, пока окно их отдаёт (непосчитанные, затем пересчёт по кругу не больше раза на ячейку).
    value = atCell(scene, cell)
    keys = []
    while limit is None or len(keys) < limit:
        key = window.nextKey()
        if key is None:
            break
        window.store(key, value(*key))
        keys.append(key)

    return keys


def frames(window, scene, cell, count):
    keys = []
    for _ in range(count):
        window.setAim(window.aim)
        keys.extend(run(window, scene, cell))

    return keys


def coverage(rects):
    cells = {}
    for value, x0, y0, x1, y1 in rects:
        for y in range(y0, y1):
            for x in range(x0, x1):
                assert (x, y) not in cells, 'rects overlap'
                cells[x, y] = value

    return cells


def expected(scene, aim, radius, cell, step=1):
    # Пиксели ячеек, чьи центры в круге, со значением сцены в центре ячейки.
    out = {}
    value = atCell(scene, cell)
    for j, iLo, iHi in rowRanges(aim[0] / float(cell), aim[1] / float(cell), radius / float(cell), step):
        for i in range(iLo, iHi + 1, step):
            v = value(i, j)
            if v is None:
                continue
            for y in range(j * cell, (j + step) * cell):
                for x in range(i * cell, (i + step) * cell):
                    out[x, y] = v

    return out


class AimWindowTest(unittest.TestCase):

    def test_coarse_picture_first(self):
        # После расчёта только крупного уровня (шаг 8 ячеек) круг уже закрашен целиком.
        window = AimWindow(3, LEVELS, (0.0, 0.0), 60, 2500, 3)
        coarse = 0
        keys = []
        while True:
            key = window.nextKey()
            if key[0] % 8 or key[1] % 8:
                break
            window.store(key, atCell(tank, 3)(*key))
            keys.append(key)

        self.assertGreater(len(keys), 10)
        self.assertLess(len(keys), 60)
        self.assertGreater(len(coverage(window.rects()[0])), 0.9 * math.pi * 60 * 60)

    def test_exact_after_first_pass(self):
        aim = (-20.0, 10.0)
        window = AimWindow(3, LEVELS, aim, 60, 2500, 3)
        run(window, tank, 3)
        self.assertTrue(window.done)
        self.assertEqual(coverage(window.rects()[0]), expected(tank, aim, 60, 3))

    def test_round_robin_refresh_follows_changes(self):
        aim = (0.0, 0.0)
        window = AimWindow(3, LEVELS, aim, 45, 2500, 3)
        run(window, tank, 3)
        shifted = lambda x, y: tank(x - 20, y)
        # Каждая ячейка пересчитывается не больше раза за кадр.
        perFrame = len(frames(window, shifted, 3, 1))
        self.assertLessEqual(perFrame, len(window.cache))
        frames(window, shifted, 3, 1)
        self.assertEqual(coverage(window.rects()[0]), expected(shifted, aim, 45, 3))

    def test_budget_limited_frames_still_catch_up(self):
        # Кадры по 50 ячеек: пересчёт идёт по кругу и за несколько кадров догоняет изменения.
        aim = (0.0, 0.0)
        window = AimWindow(3, LEVELS, aim, 45, 2500, 3)
        run(window, tank, 3)
        shifted = lambda x, y: tank(x + 12, y)
        for _ in range(20):
            window.setAim(aim)
            run(window, shifted, 3, 50)

        self.assertEqual(coverage(window.rects()[0]), expected(shifted, aim, 45, 3))

    def test_aim_moves_new_area_coarse_first(self):
        window = AimWindow(3, LEVELS, (-60.0, 0.0), 30, 2500, 3)
        run(window, tank, 3)
        window.setAim((60.0, 0.0))
        first = run(window, tank, 3, 5)
        self.assertTrue(all((i % 8 == 0 and j % 8 == 0 for i, j in first)), first)
        run(window, tank, 3)
        self.assertEqual(coverage(window.rects()[0]), expected(tank, (60.0, 0.0), 30, 3))
        # Вернулись — старая область уже посчитана: сразу точная картинка, дальше только пересчёт.
        cached = set(window.cache)
        window.setAim((-60.0, 0.0))
        self.assertEqual(coverage(window.rects()[0]), expected(tank, (-60.0, 0.0), 30, 3))
        self.assertTrue(set(run(window, tank, 3)) <= cached)

    def test_step_grows_for_huge_circle(self):
        window = AimWindow(1, LEVELS, (0.0, 0.0), 160, 2500, 3)
        self.assertEqual(window.level, 3)
        run(window, tank, 1)
        self.assertEqual(coverage(window.rects()[0]), expected(tank, (0.0, 0.0), 160, 1, 8))

    def test_one_pixel_cells(self):
        aim = (5.0, 5.0)
        window = AimWindow(1, LEVELS, aim, 25, 2500, 3)
        run(window, tank, 1)
        self.assertEqual(coverage(window.rects()[0]), expected(tank, aim, 25, 1))

    def test_rects_are_whole_cells(self):
        window = AimWindow(3, LEVELS, (7.0, -4.0), 50, 2500, 3)
        run(window, tank, 3)
        for _, x0, y0, x1, y1 in window.rects()[0]:
            self.assertTrue(x0 % 3 == 0 and y0 % 3 == 0 and x1 % 3 == 0 and y1 % 3 == 0)

    def test_uniform_armour_is_few_rects(self):
        # Каждый прямоугольник — квадрат на экране: однородная броня — не больше одного на строку ячеек.
        window = AimWindow(3, LEVELS, (0.0, 0.0), 60, 2500, 3)
        run(window, lambda x, y: 3, 3)
        self.assertLessEqual(len(window.rects()[0]), 2 * 60 // 3 + 2)

    def test_rects_changed_flag(self):
        window = AimWindow(3, LEVELS, (0.0, 0.0), 30, 2500, 3)
        run(window, tank, 3)
        rects, changed = window.rects()
        self.assertTrue(changed)
        self.assertEqual(window.rects(), (rects, False))
        # Пересчёт тех же значений картинку не меняет.
        frames(window, tank, 3, 1)
        self.assertEqual(window.rects(), (rects, False))


if __name__ == '__main__':
    unittest.main()
