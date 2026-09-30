# -*- coding: utf-8 -*-
# Офлайн-тесты window.py: область вокруг центра прицела.
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight.window import AimWindow

LEVELS = range(7)
AREA = (-160, -85, 160, 85)


def tank(x, y):
    # Как в test_lattice.py: «танк» 300x150 с градиентом и непробиваемой «башней», вокруг пусто.
    if not (-150 <= x < 150 and -75 <= y < 75):
        return None
    if (x - 60) ** 2 + (y + 40) ** 2 < 900:
        return 0
    return max(0, min(6, int((x + 0.5 * y + 150) / 300.0 * 7)))


def run(window, scene, limit=None):
    keys = []
    while limit is None or len(keys) < limit:
        key = window.nextKey()
        if key is None:
            break
        window.store(key, scene(*key))
        keys.append(key)

    return keys


def coverage(rects):
    cells = {}
    for value, x0, y0, x1, y1 in rects:
        for y in range(y0, y1):
            for x in range(x0, x1):
                assert (x, y) not in cells, 'rects overlap'
                cells[x, y] = value

    return cells


def inWindow(x, y, aim, radius, tile=8):
    # Пиксель в плитке, чей центр в радиусе от прицела.
    tx, ty = x // tile * tile, y // tile * tile
    return (tx + tile * 0.5 - aim[0]) ** 2 + (ty + tile * 0.5 - aim[1]) ** 2 <= radius * radius


class AimWindowTest(unittest.TestCase):

    def test_every_cell_around_aim(self):
        aim = (-20.0, 10.0)
        window = AimWindow(AREA, 0, LEVELS, aim, 40)
        keys = run(window, tank)
        self.assertTrue(window.done)
        self.assertEqual(len(keys), len(set(keys)))
        cells = coverage(window.rects()[0])
        expected = dict((((x, y), tank(x, y)) for y in range(-85, 85) for x in range(-160, 160) if inWindow(x, y, aim, 40) and tank(x, y) is not None))
        self.assertEqual(cells, expected)
        # Каждая ячейка области посчитана, лишних нет.
        self.assertEqual(set(keys), set(((x, y) for y in range(-85, 85) for x in range(-160, 160) if inWindow(x, y, aim, 40))))

    def test_centre_first(self):
        aim = (30.0, -5.0)
        window = AimWindow(AREA, 0, LEVELS, aim, 60)
        keys = run(window, tank)
        first = keys[:64]
        self.assertTrue(all((abs(x - 30) < 8 and abs(y + 5) < 8 for x, y in first)), first)
        # Последние — у края области.
        last = keys[-64:]
        self.assertTrue(all(((x - 30) ** 2 + (y + 5) ** 2 > 40 ** 2 for x, y in last)))

    def test_clipped_to_target_area(self):
        window = AimWindow((-20, -20, 20, 20), 0, LEVELS, (15.0, 15.0), 40)
        keys = run(window, tank)
        self.assertTrue(keys)
        self.assertTrue(all((-20 <= x < 20 and -20 <= y < 20 for x, y in keys)))

    def test_aim_moves_and_returns(self):
        window = AimWindow(AREA, 0, LEVELS, (-60.0, 0.0), 30)
        first = run(window, tank)
        window.setAim((60.0, 0.0))
        second = run(window, tank)
        self.assertTrue(second)
        self.assertFalse(set(first) & set(second))
        cells = coverage(window.rects()[0])
        self.assertTrue(all((inWindow(x, y, (60.0, 0.0), 30) for x, y in cells)), 'old area is not drawn')
        # Вернулись — всё уже посчитано.
        window.setAim((-60.0, 0.0))
        self.assertEqual(run(window, tank), [])
        self.assertEqual(len(coverage(window.rects()[0])), sum((1 for x, y in first if tank(x, y) is not None)))

    def test_refresh_keeps_picture(self):
        aim = (0.0, 0.0)
        window = AimWindow(AREA, 0, LEVELS, aim, 30)
        run(window, tank)
        before = coverage(window.rects()[0])
        shifted = lambda x, y: tank(x - 3, y)
        window.refresh(AREA, 1.5)
        self.assertFalse(window.done)
        run(window, shifted, 50)
        middle = coverage(window.rects()[0])
        # Посчитанное заново — новое, остальное — прежнее, дыр нет.
        self.assertEqual(set(middle), set(before) | set(((x, y) for x, y in middle if shifted(x, y) is not None)))
        run(window, shifted)
        after = coverage(window.rects()[0])
        expected = dict((((x, y), shifted(x, y)) for y in range(-85, 85) for x in range(-160, 160) if inWindow(x, y, aim, 30) and shifted(x, y) is not None))
        self.assertEqual(after, expected)

    def test_refresh_restarts_from_centre(self):
        window = AimWindow(AREA, 0, LEVELS, (0.0, 0.0), 30)
        run(window, tank)
        window.refresh(AREA, 1.0)
        run(window, tank, 100)
        window.refresh(AREA, 0.5)
        # Пересчёт начался заново от центра, не дожидаясь края.
        first = window.nextKey()
        self.assertTrue(-8 <= first[0] < 8 and -8 <= first[1] < 8, first)
        self.assertEqual(window.refreshes, 2)

    def test_stale_values_are_hidden(self):
        # Прежние значения видны, пока суммарный сдвиг с их расчёта не больше staleDriftPx (2 px).
        window = AimWindow(AREA, 0, LEVELS, (0.0, 0.0), 30, staleDriftPx=2.0)
        run(window, tank)
        full = len(coverage(window.rects()[0]))
        window.refresh(AREA, 1.0)
        run(window, tank, 64)
        window.refresh(AREA, 1.0)
        self.assertEqual(len(coverage(window.rects()[0])), full, '2 px of drift: still shown')
        run(window, tank, 64)
        window.refresh(AREA, 1.0)
        # 3 px с расчёта краёв: видно только пересчитанное после первого сдвига — центр.
        cells = coverage(window.rects()[0])
        self.assertLess(len(cells), full / 4)
        self.assertTrue(all((abs(x) < 16 and abs(y) < 16 for x, y in cells)))
        run(window, tank)
        self.assertEqual(len(coverage(window.rects()[0])), full)

    def test_two_pixel_cells(self):
        aim = (5.0, 5.0)
        window = AimWindow(AREA, 1, LEVELS, aim, 30)
        keys = run(window, tank)
        self.assertTrue(all((x % 2 == 0 and y % 2 == 0 for x, y in keys)))
        cells = coverage(window.rects()[0])
        bad = [ xy for xy, value in cells.items() if value != tank(xy[0] & ~1, xy[1] & ~1) ]
        self.assertEqual(bad, [])

    def test_uniform_armour_is_few_rects(self):
        # Каждый прямоугольник — квадрат на экране. Однородная броня в круге — полосы по 8 строк
        # (у каждой своя ширина круга), а не по прямоугольнику на плитку.
        window = AimWindow(AREA, 0, LEVELS, (0.0, 0.0), 60)
        run(window, lambda x, y: 3)
        rects = window.rects()[0]
        self.assertLessEqual(len(rects), 16)
        self.assertEqual(sum(((x1 - x0) * (y1 - y0) for _, x0, y0, x1, y1 in rects)), len(coverage(rects)))

    def test_rects_changed_flag(self):
        window = AimWindow(AREA, 0, LEVELS, (0.0, 0.0), 30)
        run(window, tank)
        rects, changed = window.rects()
        self.assertTrue(changed)
        self.assertEqual(window.rects(), (rects, False))
        window.setAim((0.4, 0.4))
        self.assertEqual(window.rects(), (rects, False))


if __name__ == '__main__':
    unittest.main()
