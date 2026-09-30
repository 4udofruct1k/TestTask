# -*- coding: utf-8 -*-
# Офлайн-тесты penetration.py: цикл по слоям брони и вероятность пробития.
import math
import unittest
from collections import namedtuple

import support
support.installPackages()
from gui.mods.armor_highlight import penetration as pen

Detail = namedtuple('Detail', ('dist', 'hitAngleCos', 'matInfo', 'compName'))
Shell = namedtuple('Shell', ('piercingPowerRandomization', 'caliber'))


class Mat(object):

    def __init__(self, armor, damage=1.0, kind=1, useHitAngle=True, extra=None, collideOnceOnly=False, mayRicochet=True):
        self.armor = armor
        self.vehicleDamageFactor = damage
        self.kind = kind
        self.useHitAngle = useHitAngle
        self.extra = extra
        self.collideOnceOnly = collideOnceOnly
        self.mayRicochet = mayRicochet
        self.checkCaliberForRichet = True
        self.checkCaliberForHitAngleNorm = True


SHELL = Shell(0.25, 100)
# Как в клиенте: _computePiercingPowerRandomizationImpl(0.25, 0.5, 0.5)
MIN_PP, MAX_PP = 100.0 * (1.0 - 0.25 * 0.5), 100.0 * (1.0 + 0.25 * 0.5)
NO_RICOCHET = lambda shell, cos, matInfo: False
PLAIN_ARMOR = lambda shell, cos, matInfo: matInfo.armor / cos


def run(details, fullPP=200.0, ricochet=NO_RICOCHET, jet=0.0):
    return pen.evaluate(details, fullPP, SHELL, MIN_PP, MAX_PP, ricochet, PLAIN_ARMOR, jet)[:2]


class Extra(object):

    def __init__(self, name):
        self.name = name


def modules(details, fullPP=200.0, ricochet=NO_RICOCHET):
    return pen.modulesAlong(details, fullPP, SHELL, ricochet, PLAIN_ARMOR, 0.0)


class ModulesTest(unittest.TestCase):

    def test_outer_module_and_modules_behind_pierced_armor(self):
        # Гусеница (экран без урона), броня 100 мм пробита, за ней двигатель — оба на пути снаряда.
        details = [Detail(1.0, 1.0, Mat(20, damage=0.0, extra=Extra('leftTrack0Health')), 'chassis'),
         Detail(2.0, 1.0, Mat(100), 'hull'),
         Detail(3.0, 1.0, Mat(0, damage=0.0, extra=Extra('engineHealth')), 'hull')]
        self.assertEqual(modules(details), ['leftTrack0Health', 'engineHealth'])
        self.assertEqual([ pen.moduleLabel(name) for name in modules(details) ], [u'гусеница', u'двигатель'])

    def test_not_pierced_armor_stops_the_shell(self):
        details = [Detail(1.0, 1.0, Mat(300), 'hull'), Detail(2.0, 1.0, Mat(0, damage=0.0, extra=Extra('ammoBayHealth')), 'hull')]
        self.assertEqual(modules(details), [])

    def test_module_behind_armor_reached_by_the_best_roll(self):
        # 200 мм пробития против 200 мм брони: пробивает в половине выстрелов — двигатель задеть можно.
        details = [Detail(1.0, 1.0, Mat(200), 'hull'), Detail(2.0, 1.0, Mat(0, damage=0.0, extra=Extra('engineHealth')), 'hull')]
        self.assertEqual(modules(details), ['engineHealth'])

    def test_ricochet_stops_the_shell(self):
        details = [Detail(1.0, 0.2, Mat(50), 'hull'), Detail(2.0, 1.0, Mat(0, damage=0.0, extra=Extra('gunnerHealth')), 'hull')]
        self.assertEqual(modules(details, ricochet=lambda shell, cos, mat: cos < 0.5), [])

    def test_labels(self):
        self.assertEqual(pen.moduleLabel('gunner1Health'), u'наводчик')
        self.assertEqual(pen.moduleLabel('gunHealth'), u'орудие')
        self.assertEqual(pen.moduleLabel('radioman1Health'), u'радист')
        self.assertEqual(pen.moduleLabel('radioHealth'), u'рация')


class ProbabilityTest(unittest.TestCase):

    def test_bounds(self):
        self.assertEqual(pen.probability(75.0, 0.25), 1.0)
        self.assertEqual(pen.probability(50.0, 0.25), 1.0)
        self.assertAlmostEqual(pen.probability(100.0, 0.25), 0.5)
        self.assertEqual(pen.probability(125.0, 0.25), 0.0)
        self.assertAlmostEqual(pen.probability(112.5, 0.25), 0.25)
        self.assertEqual(pen.probability(99.0, 0.0), 1.0)
        self.assertEqual(pen.probability(101.0, 0.0), 0.0)


class EvaluateTest(unittest.TestCase):

    def test_single_plate(self):
        # 200 мм пробития, 100 мм брони под 0° -> 50% от нужного -> пробивает всегда
        self.assertEqual(run([Detail(1.0, 1.0, Mat(100), 1)]), (pen.GREAT_PIERCED, 1.0))
        # 200 мм брони -> ровно номинал -> 50%, ванильный результат «может пробить»
        result, prob = run([Detail(1.0, 1.0, Mat(200), 1)])
        self.assertEqual(result, pen.LITTLE_PIERCED)
        self.assertAlmostEqual(prob, 0.5)
        # 150 мм под 60° -> 300 мм приведённой -> не пробивает
        self.assertEqual(run([Detail(1.0, 0.5, Mat(150), 1)]), (pen.NOT_PIERCED, 0.0))

    def test_spaced_armor_consumes_power(self):
        spaced = Mat(40, damage=0.0, kind=2)
        result, prob = run([Detail(1.0, 1.0, spaced, 1), Detail(1.5, 1.0, Mat(160), 1)])
        # 40 + 160 = 200 -> как один лист в 200 мм
        self.assertEqual(result, pen.LITTLE_PIERCED)
        self.assertAlmostEqual(prob, 0.5)

    def test_ricochet(self):
        always = lambda shell, cos, matInfo: True
        self.assertEqual(run([Detail(1.0, 0.1, Mat(10), 1)], ricochet=always), (pen.NOT_PIERCED, 0.0))

    def test_module_without_armor_info(self):
        # matInfo None — «только крит», расчёт идёт дальше
        result, prob = run([Detail(1.0, 1.0, None, 1), Detail(1.2, 1.0, Mat(100), 1)])
        self.assertEqual(result, pen.GREAT_PIERCED)
        self.assertEqual(run([Detail(1.0, 1.0, None, 1)]), (pen.NOT_PIERCED, 0.0))

    def test_undefined_armor(self):
        self.assertEqual(run([Detail(1.0, 1.0, Mat(None), 1)])[0], pen.UNDEFINED)

    def test_collide_once_only(self):
        screen = Mat(20, damage=0.0, kind=5, collideOnceOnly=True)
        result, prob = run([Detail(1.0, 1.0, screen, 1), Detail(1.1, 1.0, screen, 1), Detail(1.2, 1.0, Mat(180), 1)])
        # второй раз тот же экран не считается: 20 + 180 = 200
        self.assertAlmostEqual(prob, 0.5)

    def test_power_exhausted(self):
        self.assertEqual(run([Detail(1.0, 1.0, Mat(300, damage=0.0), 1), Detail(1.1, 1.0, Mat(1), 1)]), (pen.NOT_PIERCED, 0.0))

    def test_jet_loss(self):
        # Кумулятив: 50% пробития теряется на 1 м после первого слоя
        spaced = Mat(20, damage=0.0, kind=2)
        result, prob = run([Detail(1.0, 1.0, spaced, 1), Detail(2.02, 1.0, Mat(80), 1)], jet=0.5)
        # остаток 180 * 0.5 = 90 при нужных 80: piercingPercent = 100 + (80 - 90) / 200 * 100 = 95
        self.assertAlmostEqual(prob, pen.probability(95.0, 0.25))


class PercentTest(unittest.TestCase):

    def test_percent_of_decisive_plate(self):
        spaced = Mat(40, damage=0.0, kind=2)
        result, prob, percent = pen.evaluate([Detail(1.0, 1.0, spaced, 1), Detail(1.5, 1.0, Mat(160), 1)], 200.0, SHELL, MIN_PP, MAX_PP, NO_RICOCHET, PLAIN_ARMOR, 0.0)
        self.assertAlmostEqual(percent, 100.0)
        self.assertIsNone(pen.evaluate([Detail(1.0, 1.0, None, 1)], 200.0, SHELL, MIN_PP, MAX_PP, NO_RICOCHET, PLAIN_ARMOR, 0.0)[2])


class PreviewFormulaTest(unittest.TestCase):

    def test_ricochet_rules(self):
        cos70 = math.cos(math.radians(70.0))
        self.assertTrue(pen.shouldRicochet(SHELL, 0.2, Mat(50), True, True, cos70))
        self.assertFalse(pen.shouldRicochet(SHELL, 0.2, Mat(20), True, True, cos70), 'overmatch: 20 * 3 < 100')
        self.assertFalse(pen.shouldRicochet(SHELL, 0.5, Mat(50), True, True, cos70))
        self.assertFalse(pen.shouldRicochet(SHELL, 0.2, Mat(50), False, True, cos70))

    def test_normalization(self):
        norm = math.radians(5.0)
        cos = math.cos(math.radians(60.0))
        armor = pen.penetrationArmor(SHELL, cos, Mat(100), True, norm)
        self.assertAlmostEqual(armor, 100.0 / math.cos(math.radians(55.0)))
        self.assertAlmostEqual(pen.penetrationArmor(SHELL, cos, Mat(100), False, norm), 200.0)
        self.assertEqual(pen.penetrationArmor(SHELL, 1.0, Mat(100), True, norm), 100.0)


if __name__ == '__main__':
    unittest.main()
