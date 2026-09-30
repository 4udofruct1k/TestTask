# -*- coding: utf-8 -*-
# Офлайн-тесты lattice.py: адаптивная сетка, растр в прямоугольники.
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight.lattice import BUSY, Lattice, blockCount, chooseLevels

LEVELS = range(7)


def tank(x, y):
    # «Танк» 300x150: градиент из 7 уровней по x + 0.5y, «башня» не пробивается, вокруг пусто (None).
    if not (-150 <= x < 150 and -75 <= y < 75):
        return None
    if (x - 60) ** 2 + (y + 40) ** 2 < 900:
        return 0
    return max(0, min(6, int((x + 0.5 * y + 150) / 300.0 * 7)))


def build(scene, area=(-160, -85, 160, 85), minLevel=0, limit=None, **kwargs):
    lattice = Lattice(area, minLevel, 700, 400, LEVELS, **kwargs)
    count = run(lattice, scene, limit)
    return (lattice, count)


def run(lattice, scene, limit=None):
    count = 0
    while limit is None or count < limit:
        key = lattice.nextKey()
        if key is None:
            break
        if key is BUSY:
            continue
        lattice.store(key, scene(*key))
        count += 1

    return count


def plate(spots):
    # Однородный лист 300x150 (значение 0) со слабыми местами (x, y, w, h) значения 6.
    def scene(x, y):
        if not (-150 <= x < 150 and -75 <= y < 75):
            return None
        for sx, sy, w, h in spots:
            if sx <= x < sx + w and sy <= y < sy + h:
                return 6
        return 0

    return scene


def drawnValue(lattice, value):
    return sum(((x1 - x0) * (y1 - y0) for v, x0, y0, x1, y1 in lattice.rects()[0] if v == value))


def coverage(rects):
    cells = {}
    for value, x0, y0, x1, y1 in rects:
        for y in range(y0, y1):
            for x in range(x0, x1):
                assert (x, y) not in cells, 'rects overlap'
                cells[x, y] = value

    return cells


class LevelsTest(unittest.TestCase):

    def test_block_count(self):
        self.assertEqual(blockCount((0, 0, 16, 16), 4), 1)
        self.assertEqual(blockCount((-1, 0, 16, 16), 4), 2)
        self.assertEqual(blockCount((0, 0, 0, 16), 4), 0)

    def test_choose_levels(self):
        minLevel, base, top = chooseLevels((-160, -85, 160, 85), 0, 700, 400)
        self.assertEqual(minLevel, 0)
        self.assertLessEqual(blockCount((-160, -85, 160, 85), base), 700)
        self.assertGreater(blockCount((-160, -85, 160, 85), base - 1), 700)
        self.assertEqual(top, base + 2)
        # Огромная цель: строк больше maxRows -> ячейка крупнее
        self.assertEqual(chooseLevels((0, 0, 100, 1000), 0, 700, 400)[0], 2)


class LatticeTest(unittest.TestCase):

    def test_exact_at_one_pixel(self):
        lattice, count = build(tank)
        self.assertTrue(lattice.done)
        self.assertLess(count, 320 * 170 / 3, 'adaptive grid needs far fewer samples than every pixel')
        cells = coverage(lattice.rects()[0])
        bad = [ (x, y) for y in range(-85, 85) for x in range(-160, 160) if cells.get((x, y)) != tank(x, y) ]
        self.assertEqual(bad, [])

    def test_two_pixel_cells(self):
        lattice, count = build(tank, minLevel=1)
        cells = coverage(lattice.rects()[0])
        bad = [ (x, y) for y in range(-85, 85) for x in range(-160, 160) if cells.get((x, y)) != tank(x & ~1, y & ~1) ]
        self.assertEqual(bad, [])
        self.assertTrue(all((y1 - y0) % 2 == 0 for _, _, y0, _, y1 in lattice.rects()[0]))

    def test_only_final_cells_are_drawn(self):
        # На любом шаге нарисованное совпадает с точным ответом: ни грубых блоков, ни подсветки вне силуэта.
        full, total = build(tank)
        for limit in (40, 700, 2000, 5000, total // 2, total - 100):
            lattice, _ = build(tank, limit=limit)
            cells = coverage(lattice.rects()[0])
            bad = [ xy for xy, value in cells.items() if value != tank(*xy) ]
            self.assertEqual(bad, [], 'limit %d' % limit)
            if limit >= total // 2:
                self.assertTrue(lattice.hasPicture)
                self.assertGreater(len(cells), 320 * 170 // 3, 'uniform armour is drawn before edges')

    def test_small_spot_needs_finer_search(self):
        spot = plate([(3, 5, 10, 10)])
        lattice, _ = build(spot)
        self.assertEqual(lattice.baseLevel, 4)
        self.assertEqual(drawnValue(lattice, 6), 0, 'a 10x10 spot between 16 px search points is missed')
        lattice, _ = build(spot, searchLevel=2)
        self.assertEqual(lattice.baseLevel, 2)
        self.assertEqual(drawnValue(lattice, 6), 100)

    def test_focus_finds_tiny_spot_under_aim(self):
        spot = plate([(3, 3, 4, 4)])
        lattice, _ = build(spot, aim=(5.0, 5.0), focusRadius=20)
        self.assertEqual(drawnValue(lattice, 6), 16)
        cells = coverage(lattice.rects()[0])
        self.assertEqual([ xy for xy, v in cells.items() if v != spot(*xy) ], [])

    def test_focus_follows_aim(self):
        # Пятно 4x4 не попадает на точки поиска 16 px: найдётся, только когда прицел до него доедет.
        spot = plate([(83, 35, 4, 4)])
        lattice, first = build(spot, aim=(-100.0, 0.0), focusRadius=20)
        self.assertTrue(lattice.done)
        self.assertEqual(drawnValue(lattice, 6), 0)
        lattice.setAim((85.0, 37.0))
        more = run(lattice, spot)
        self.assertGreater(more, 0)
        self.assertTrue(lattice.done)
        self.assertEqual(drawnValue(lattice, 6), 16)
        cells = coverage(lattice.rects()[0])
        self.assertEqual([ xy for xy, v in cells.items() if v != spot(*xy) ], [])

    def test_aim_area_is_exact_first(self):
        # Границы и у прицела, и далеко: у прицела точные пиксели появляются намного раньше.
        scene = plate([(-110, -40, 40, 30), (90, 20, 40, 30)])
        lattice, total = build(scene, aim=(-90.0, -25.0))
        near = far = None
        lattice = Lattice((-160, -85, 160, 85), 0, 700, 400, LEVELS, (-90.0, -25.0))
        count = 0
        while near is None or far is None:
            count += run(lattice, scene, 50)
            cells = coverage(lattice.rects()[0])
            if near is None and all((cells.get((x, -40)) == 6 for x in range(-110, -70))):
                near = count
            if far is None and all((cells.get((x, 20)) == 6 for x in range(90, 130))):
                far = count
            self.assertLessEqual(count, total + 50)

        self.assertLess(near * 2, far, (near, far))

    def test_full_pass(self):
        lattice, count = build(tank, fullPass=True)
        self.assertTrue(lattice.hasPicture and lattice.done)
        self.assertEqual(count, 320 * 170)
        cells = coverage(lattice.rects()[0])
        bad = [ (x, y) for y in range(-85, 85) for x in range(-160, 160) if cells.get((x, y)) != tank(x, y) ]
        self.assertEqual(bad, [])

    def test_rects_merge_rows(self):
        # Однородный прямоугольник — один прямоугольник на экране
        lattice, _ = build(lambda x, y: 3 if -50 <= x < 50 and -20 <= y < 20 else None, area=(-64, -32, 64, 32))
        rects, _ = lattice.rects()
        self.assertEqual(rects, [(3, -50, -20, 50, 20)])
        self.assertEqual(lattice.rects(), (rects, False))

    def test_roots_start_at_aim(self):
        lattice = Lattice((-160, -85, 160, 85), 0, 700, 400, LEVELS, (100.0, 50.0))
        first = lattice.nextKey()
        self.assertLess(abs(first[0] + 32 - 100) + abs(first[1] + 32 - 50), 100)

    def test_probe_points_are_inside_uniform_blocks(self):
        lattice, _ = build(tank)
        for _ in range(50):
            x, y, expected = lattice.probe()
            self.assertEqual(tank(int(x), int(y)), expected)

    def test_value_at(self):
        lattice, _ = build(tank)
        self.assertEqual(lattice.valueAt(-100, 0, 0), tank(-100, 0))
        self.assertEqual(lattice.valueAt(59, -41, 0), 0)


if __name__ == '__main__':
    unittest.main()
