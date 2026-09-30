# -*- coding: utf-8 -*-
# Офлайн-тесты lattice.py: порядок расчёта, кэш, слияние ячеек в полосы.
import unittest

import support
support.installPackages()
from gui.mods.armor_highlight import geometry
from gui.mods.armor_highlight.lattice import Lattice

GREAT, LITTLE, NOT, UNDEFINED = 3, 2, 1, 0


def _lattice(maxSamples=2500, extra=3):
    return Lattice('target', (0.0, 0.0, 0.0), 100.0, 1.0, (1920, 1080), 3, maxSamples, extra, (GREAT, LITTLE, NOT))


def _fill(lattice, resultFn):
    # Пока идёт заполнение, nextKey отдаёт только непосчитанные ячейки; первая посчитанная — уже пересчёт.
    count = 0
    key = lattice.nextKey()
    while key is not None and key not in lattice.cache:
        lattice.store(key, resultFn(*key))
        count += 1
        key = lattice.nextKey()

    return count


def _cover(runs, step):
    # {(i, j): kind} для всех ячеек, покрытых полосами.
    cells = {}
    for kind, i0, i1, j in runs:
        for i in range(i0, i1, step):
            cells[i, j] = kind

    return cells


class LatticeTest(unittest.TestCase):

    def test_first_keys_are_coarse(self):
        lattice = _lattice()
        lattice.setView(0.0, 0.0, 20.0)
        self.assertEqual(lattice.level, 0)
        first = [ lattice.nextKey() for _ in range(5) ]
        for i, j in first:
            self.assertEqual((i % 8, j % 8), (0, 0))

    def test_fill_then_refresh_once_per_frame(self):
        lattice = _lattice()
        lattice.setView(0.0, 0.0, 10.0)
        computed = _fill(lattice, lambda i, j: GREAT)
        drawn = geometry.cellCount(lattice.drawRows, 1)
        self.assertGreaterEqual(computed, drawn)
        lattice.setView(0.0, 0.0, 10.0)
        refreshed = 0
        while lattice.nextKey() is not None:
            refreshed += 1

        self.assertGreater(refreshed, 0)
        self.assertEqual(refreshed, lattice.summary()[1][GREAT])

    def test_runs_merge_same_results(self):
        lattice = _lattice()
        lattice.setView(0.0, 0.0, 12.0)
        # Слева направо: зелёный, жёлтый, пусто, красный; UNDEFINED не рисуется
        def result(i, j):
            if j == 5:
                return UNDEFINED
            if i < -4:
                return GREAT
            if i < 0:
                return LITTLE
            if i < 3:
                return None
            return NOT

        _fill(lattice, result)
        runs, changed = lattice.runs()
        self.assertTrue(changed)
        cover = _cover(runs, 1)
        for j, iLo, iHi in lattice.drawRows:
            kinds = [ kind for kind, i0, i1, jj in runs if jj == j ]
            self.assertEqual(len(kinds), len(set(kinds)), 'one run per colour in a row')
            for i in range(iLo, iHi + 1):
                expected = result(i, j)
                if expected in (GREAT, LITTLE, NOT):
                    self.assertEqual(cover.get((i, j)), expected)
                else:
                    self.assertNotIn((i, j), cover)

        self.assertEqual(lattice.runs()[1], False)

    def test_coarse_results_fill_gaps(self):
        lattice = _lattice()
        lattice.setView(0.0, 0.0, 12.0)
        # Считаем только уровень 3 (шаг 8): остальные ячейки берут его результат
        while True:
            key = lattice.nextKey()
            if key is None or geometry.keyLevel(key[0], key[1], 3) < 3:
                break
            lattice.store(key, NOT)

        runs, _ = lattice.runs()
        cover = _cover(runs, 1)
        covered = sum((1 for j, iLo, iHi in lattice.drawRows for i in range(iLo, iHi + 1) if (i & ~7, j & ~7) in lattice.cache))
        self.assertGreater(covered, 0)
        self.assertEqual(len(cover), covered)
        self.assertTrue(all((kind == NOT for kind in cover.values())))

    def test_changes_mark_rows(self):
        lattice = _lattice()
        lattice.setView(0.0, 0.0, 6.0)
        _fill(lattice, lambda i, j: GREAT)
        lattice.runs()
        self.assertFalse(lattice.runs()[1])
        lattice.store((0, 0), GREAT)
        self.assertFalse(lattice.runs()[1], 'same result does not change runs')
        lattice.store((1, 1), NOT)
        runs, changed = lattice.runs()
        self.assertTrue(changed)
        self.assertEqual(_cover(runs, 1)[1, 1], NOT)

    def test_level_change_reuses_cache(self):
        lattice = _lattice(maxSamples=300)
        lattice.setView(0.0, 0.0, 9.0)
        self.assertEqual(lattice.level, 0)
        _fill(lattice, lambda i, j: LITTLE)
        # Круг вырос: уровень 1, ячейки чётные — все уже посчитаны
        lattice.setView(0.0, 0.0, 18.0)
        self.assertEqual(lattice.level, 1)
        runs, _ = lattice.runs()
        cover = _cover(runs, 2)
        inner = geometry.rowRanges(0.0, 0.0, 8.0, 2)
        for j, iLo, iHi in inner:
            for i in range(iLo, iHi + 1, 2):
                self.assertEqual(cover.get((i, j)), LITTLE)

    def test_matches_and_scale(self):
        lattice = _lattice()
        self.assertTrue(lattice.matches('target', 1.0, (1920, 1080)))
        self.assertFalse(lattice.matches('other', 1.0, (1920, 1080)))
        self.assertFalse(lattice.matches('target', 1.1, (1920, 1080)))
        self.assertFalse(lattice.matches('target', 1.0, (1280, 720)))
        self.assertAlmostEqual(lattice.scaleDrift(104.0), 0.04)
        self.assertAlmostEqual(lattice.scaleDrift(90.0), 0.1)


if __name__ == '__main__':
    unittest.main()
