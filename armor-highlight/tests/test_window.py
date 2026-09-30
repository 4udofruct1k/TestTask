# -*- coding: utf-8 -*-
# Офлайн-тесты window.py: область вокруг центра прицела по логике 0.3.0.
import math
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight.lattice import BUSY
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
        if key is BUSY:
            continue
        window.store(key, value(*key))
        keys.append(key)

    return keys


def settle(window, scene, cell, limit=50):
    # Кадры, пока не закончится круг пересчёта для текущей области (с уточнением).
    for _ in range(limit):
        window.setAim(window.aim)
        run(window, scene, cell)
        if window.done:
            return
    raise AssertionError('window did not settle')


def mismatches(window, scene, aim, radius):
    # Пиксели круга (радиус минус 2 px — край режется полосками), где нарисовано не то, что в сцене.
    cells = coverage(window.rects()[0])
    bad = []
    for y in range(int(aim[1] - radius), int(aim[1] + radius) + 1):
        for x in range(int(aim[0] - radius), int(aim[0] + radius) + 1):
            if math.hypot(x + 0.5 - aim[0], y + 0.5 - aim[1]) > radius - 2:
                continue
            want = scene(x, y)
            want = want if want in LEVELS else None
            if cells.get((x, y)) != want:
                bad.append((x, y))

    return bad


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


def expected(scene, aim, radius, cell, step=1, edge=4):
    # Пиксели круга, как их рисует окно: строки ячеек группами по edge // cell обрезаются по кругу с центром
    # в округлённом до 2 px прицеле. Значение — сцена в центре левой верхней ячейки блока основы (без уточнения).
    out = {}
    value = atCell(scene, cell)
    # Центр обрезки — прицел, округлённый до 2 px.
    cx = int(math.floor(aim[0] * 0.5 + 0.5)) * 2
    cy = int(math.floor(aim[1] * 0.5 + 0.5)) * 2
    group = max(1, edge // cell)
    r = int(radius) + step * cell
    for y in range(cy - r, cy + r):
        g = (y // cell) // group
        dy = (g + 0.5) * group * cell - cy
        rest = radius * radius - dy * dy
        if rest <= 0.0:
            continue
        width = math.sqrt(rest)
        for x in range(int(math.floor(cx - width + 0.5)), int(math.floor(cx + width + 0.5))):
            v = value(x // (step * cell) * step, y // (step * cell) * step)
            if v is not None:
                out[x, y] = v

    return out


def roundness(cells, aim, radius):
    # Насколько нарисованное отходит от идеального круга: (дальше радиуса, пустых ближе радиуса), px.
    cx, cy = aim
    outside = max([ math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius for x, y in cells ] + [0.0])
    return outside


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
        self.assertLess(len(keys), 100)
        self.assertGreater(len(coverage(window.rects()[0])), 0.9 * math.pi * 60 * 60)

    def test_nothing_spills_outside_silhouette(self):
        # Прицел у края танка: пока круг считается, за контуром ничего не рисуется, кроме неуточнённых блоков
        # основы (не дальше шага основы от контура). Крупные блоки первого прохода за контур не выливаются.
        aim = (140.0, 60.0)
        window = AimWindow(1, LEVELS, aim, 80, 2500, 3)
        step = window.stepPx
        outside = lambda x, y: max(0, x - 149, y - 74, -150 - x, -75 - y)
        for _ in range(200):
            window.setAim(aim)
            run(window, tank, 1, 40)
            cells = coverage(window.rects()[0])
            spill = [ xy for xy in cells if tank(*xy) is None and outside(*xy) >= step ]
            self.assertEqual(spill, [])
            if window.done:
                break

        self.assertTrue(window.done)
        settle(window, tank, 1)
        self.assertEqual([ xy for xy in coverage(window.rects()[0]) if tank(*xy) is None ], [])

    def test_prefetch_gives_coarse_picture_after_jump(self):
        # Пока прицел стоит, крупные блоки досчитываются по всей цели; после резкого ухода прицела на другое
        # место цели круг сразу закрашен грубо, ещё до расчёта.
        area = (-160, -85, 160, 85)
        window = AimWindow(3, LEVELS, (-100.0, 0.0), 40, 2500, 3, 4, area)
        for _ in range(40):
            window.setAim((-100.0, 0.0))
            run(window, tank, 3)

        window.setAim((100.0, 0.0))
        cells = coverage(window.rects()[0])
        inside = [ (x, y) for y in range(-40, 40) for x in range(60, 140) if math.hypot(x - 100, y) < 36 ]
        painted = sum((1 for xy in inside if xy in cells))
        self.assertGreater(painted, 0.6 * len(inside), (painted, len(inside)))
        # Без расчёта заранее там было бы пусто.
        cold = AimWindow(3, LEVELS, (-100.0, 0.0), 40, 2500, 3, 4)
        for _ in range(40):
            cold.setAim((-100.0, 0.0))
            run(cold, tank, 3)

        cold.setAim((100.0, 0.0))
        self.assertEqual(len(coverage(cold.rects()[0])), 0)

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
        self.assertEqual(window.stepPx, 8)

    def test_refines_boundaries_to_cell(self):
        # Основа 4 px (1 px, радиус 80), граница цветов и край силуэта не по сетке основы — уточняются до 1 px.
        scene = lambda x, y: None if x >= 47 else (5 if x < 13 else 1)
        aim = (0.0, 0.0)
        window = AimWindow(1, LEVELS, aim, 80, 2500, 3)
        self.assertEqual(window.stepPx, 4)
        settle(window, scene, 1)
        self.assertEqual(mismatches(window, scene, aim, 80), [])
        fine = [ key for key in window.cache if key[0] % 4 or key[1] % 4 ]
        self.assertGreater(len(fine), 0)
        self.assertLess(len(fine), math.pi * 80 * 80 / 8, 'only blocks on boundaries are refined')

    def test_refines_round_silhouette(self):
        scene = lambda x, y: 3 if (x - 10) ** 2 + (y - 5) ** 2 < 50 ** 2 else None
        aim = (0.0, 0.0)
        window = AimWindow(1, LEVELS, aim, 80, 2500, 3)
        settle(window, scene, 1)
        self.assertLessEqual(len(mismatches(window, scene, aim, 80)), 3)

    def test_tank_is_nearly_exact(self):
        aim = (20.0, -10.0)
        window = AimWindow(1, LEVELS, aim, 80, 2500, 3)
        settle(window, tank, 1)
        bad = mismatches(window, tank, aim, 80)
        self.assertLess(len(bad), 0.01 * math.pi * 78 * 78, len(bad))

    def test_uniform_stays_coarse(self):
        window = AimWindow(1, LEVELS, (0.0, 0.0), 80, 2500, 3)
        settle(window, lambda x, y: 3, 1)
        self.assertEqual(window.splitCount, 0)
        self.assertEqual([ key for key in window.cache if key[0] % 4 or key[1] % 4 ], [])

    def test_boundary_gone_is_merged_back(self):
        scene = lambda x, y: 5 if x < 13 else 1
        window = AimWindow(1, LEVELS, (0.0, 0.0), 80, 2500, 3)
        settle(window, scene, 1)
        self.assertGreater(window.splitCount, 0)
        uniform = lambda x, y: 1
        for _ in range(6):
            window.setAim(window.aim)
            run(window, uniform, 1)

        self.assertEqual(window.splitCount, 0)
        self.assertEqual([ key for key in window.cache if key[0] % 4 or key[1] % 4 ], [])
        self.assertEqual(mismatches(window, uniform, (0.0, 0.0), 80), [])

    def test_one_pixel_cells(self):
        aim = (5.0, 5.0)
        window = AimWindow(1, LEVELS, aim, 25, 2500, 3)
        run(window, tank, 1)
        self.assertEqual(coverage(window.rects()[0]), expected(tank, aim, 25, 1))

    def test_round_edge_with_coarse_step(self):
        # Шаг 8 px (1 px, радиус 120), а край круга — не ступеньками по 8 px: отклонение не больше полоски 4 px.
        aim = (0.0, 0.0)
        window = AimWindow(1, LEVELS, aim, 120, 2500, 3)
        self.assertEqual(window.stepPx, 8)
        run(window, lambda x, y: 3, 1)
        cells = coverage(window.rects()[0])
        self.assertLessEqual(roundness(cells, aim, 120), 2.5)
        inside = [ (x, y) for y in range(-120, 120) for x in range(-120, 120) if math.hypot(x + 0.5, y + 0.5) < 116 ]
        self.assertEqual([ xy for xy in inside if xy not in cells ], [])
        # Прямоугольников: строки внутри и полоски у края, а не по пикселю.
        self.assertLess(len(window.rects()[0]), 160)

    def test_interior_is_whole_cells(self):
        window = AimWindow(3, LEVELS, (7.0, -4.0), 50, 2500, 3)
        run(window, tank, 3)
        for _, x0, y0, x1, y1 in window.rects()[0]:
            self.assertTrue(y0 % 3 == 0 or y1 % 3 == 0 or y1 - y0 <= 4)

    def test_uniform_armour_is_few_rects(self):
        # Каждый прямоугольник — квадрат на экране: однородная броня — не больше одного на строку ячеек.
        window = AimWindow(3, LEVELS, (0.0, 0.0), 60, 2500, 3)
        run(window, lambda x, y: 3, 3)
        self.assertLessEqual(len(window.rects()[0]), 2 * 60 // 3 + 4)

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
