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


def build(scene, area=(-160, -85, 160, 85), minLevel=0, limit=None):
    lattice = Lattice(area, minLevel, 700, 400, LEVELS)
    count = 0
    while limit is None or count < limit:
        key = lattice.nextKey()
        if key is None:
            break
        if key is BUSY:
            continue
        lattice.store(key, scene(*key))
        count += 1

    return (lattice, count)


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

    def test_first_picture_is_fast(self):
        lattice, count = build(tank, limit=40)
        self.assertTrue(lattice.hasPicture)
        rects, changed = lattice.rects()
        self.assertTrue(changed and rects)

    def test_rects_merge_rows(self):
        # Однородный прямоугольник — один прямоугольник на экране
        lattice, _ = build(lambda x, y: 3 if -50 <= x < 50 and -20 <= y < 20 else None, area=(-64, -32, 64, 32))
        rects, _ = lattice.rects()
        self.assertEqual(rects, [(3, -50, -20, 50, 20)])
        self.assertEqual(lattice.rects(), (rects, False))

    def test_refine_near_aim_first(self):
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
