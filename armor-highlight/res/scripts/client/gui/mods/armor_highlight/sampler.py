# -*- coding: utf-8 -*-
# Луч через пиксель -> попадание в цель -> вероятность пробития -> уровень градиента.
# Значение ячейки: уровень 0..steps-1 (0 — не пробивает, steps-1 — пробивает на 100%), UNDEFINED_VALUE или None (мимо цели).
import math
from collections import namedtuple

import BigWorld
import Math
import constants
from AvatarInputHandler import cameras
from AvatarInputHandler.gun_marker_ctrl import _computePiercingPowerAtDistImpl, createShotResultResolver
from ProjectileMover import collideDynamicAndStatic
from helpers_common import computeDistanceFactor
from vehicle_systems.tankStructure import TankPartIndexes

from gui.mods.armor_highlight import log, palette, penetration

UNDEFINED_VALUE = -1
# Запас длины луча за целью, м.
RAY_EXTRA_LENGTH = 50.0
# В debug каждый VANILLA_CHECK_EVERY-й расчёт сверяется с ванильным getShotResult.
VANILLA_CHECK_EVERY = 50
_Detail = namedtuple('_Detail', ('dist', 'hitAngleCos', 'matInfo', 'compName'))


class FrameRays(object):
    # То же, что cameras.getWorldRayAndPoint(x, y), но проекция и матрица камеры
    # читаются один раз за кадр, а не для каждой из тысяч точек.

    def __init__(self):
        proj = BigWorld.projection()
        self.__near = proj.nearPlane
        self.__yLength = self.__near * math.tan(proj.fov * 0.5)
        self.__xLength = self.__yLength * cameras.getScreenAspectRatio()
        self.__inv = Math.Matrix(BigWorld.camera().invViewMatrix)
        self.origin = self.__inv.translation

    def get(self, x, y):
        # x, y в clip-координатах -> (направление, точка на ближней плоскости).
        point = Math.Vector3(self.__xLength * x, self.__yLength * y, self.__near)
        ray = self.__inv.applyVector(point)
        ray.normalise()
        return (ray, self.__inv.applyPoint(point))


def _valueFor(result, prob, steps):
    if result == penetration.UNDEFINED:
        return UNDEFINED_VALUE
    return palette.probabilityLevel(prob, steps)


def _isModernHE(shell):
    return shell.kind == constants.SHELL_TYPES.HIGH_EXPLOSIVE and shell.type.mechanics == constants.SHELL_MECHANICS_TYPE.MODERN


class BattleSampler(object):
    # Коллизия и слои брони — ванильные (collideDynamicAndStatic, _getAllCollisionDetails), рикошет и приведённая
    # броня — ванильные методы _CrosshairShotResults. Свой только цикл по слоям (penetration.evaluate),
    # потому что ванильный не отдаёт процент пробития.

    def __init__(self, debug):
        self.__resolver = createShotResultResolver()
        self.__debug = debug
        self.__count = 0
        self.checks = 0
        self.mismatches = 0
        self.__segmentDistChecked = False

    def prepare(self, player, target, shellDir, piercingMultiplier, team, steps):
        # Всё, что одинаково для точек кадра. Возвращает ключ снаряда: при его смене сетку надо строить заново.
        resolver = self.__resolver
        vDesc = player.getVehicleDescriptor()
        shot = vDesc.shot
        shell = shot.shell
        self.__target = target
        self.__shellDir = shellDir
        self.__team = team
        self.__steps = steps
        self.__playerVehicleID = player.playerVehicleID
        self.__ownPosition = player.getOwnVehiclePosition()
        self.__piercingMultiplier = piercingMultiplier
        self.__shell = shell
        self.__ppDesc = shot.piercingPower
        self.__maxDist = shot.maxDistance
        self.__minPP, self.__maxPP = resolver._computePiercingPowerRandomization(shell)
        self.__jetLoss = resolver._SHELL_EXTRA_DATA[shell.kind].jetLossPPByDist
        self.__isModernHE = _isModernHE(shell)
        return (id(shot), piercingMultiplier)

    def sample(self, start, end):
        res = collideDynamicAndStatic(start, end, (self.__playerVehicleID,))
        if res is None or res[1] is None or res[1].entity is not self.__target:
            return None
        hitPoint, collision = res
        resolver = self.__resolver
        if self.__isModernHE:
            # Фугас с новой механикой считается по урону, процента пробития у него нет: только ванильные три цвета.
            result = resolver.getShotResult(hitPoint, collision, self.__shellDir, excludeTeam=self.__team, piercingMultiplier=self.__piercingMultiplier)
            prob = {penetration.GREAT_PIERCED: 1.0, penetration.LITTLE_PIERCED: 0.5}.get(result, 0.0)
            return _valueFor(result, prob, self.__steps)
        shell = self.__shell
        dist = (hitPoint - self.__ownPosition).length
        fullPiercingPower = resolver._computePiercingPowerAtDist(self.__ppDesc, dist, self.__maxDist, self.__piercingMultiplier)
        fullPiercingPower *= computeDistanceFactor(shell, dist, 'pierceFactor')
        details = resolver._getAllCollisionDetails(hitPoint, self.__shellDir, self.__target)
        if details is None:
            return UNDEFINED_VALUE
        result, prob, _ = penetration.evaluate(details, fullPiercingPower, shell, self.__minPP, self.__maxPP, resolver._shouldRicochet, resolver._computePenetrationArmor, self.__jetLoss)
        if self.__debug:
            self.__count += 1
            if self.__count % VANILLA_CHECK_EVERY == 0:
                self.__checkVanilla(hitPoint, collision, result)
        return _valueFor(result, prob, self.__steps)

    def resultsAt(self, hitPoint, shots):
        # Точка прицеливания (маркер орудия на цели) и направление текущего снаряда — как у ванильного индикатора.
        # Для каждого снаряда из shots — (SHOT_RESULT, вероятность пробития 0..1). Фугас с новой механикой считается
        # по урону, а не по пробитию: для него (ванильный результат, None). None — луч не попал в цель.
        # Слои брони одни на все снаряды: направление — текущего снаряда (у других угол падения чуть другой).
        resolver = self.__resolver
        details = resolver._getAllCollisionDetails(hitPoint, self.__shellDir, self.__target)
        if not details:
            return None
        dist = (hitPoint - self.__ownPosition).length
        results = []
        for shot in shots:
            shell = shot.shell
            fullPiercingPower = resolver._computePiercingPowerAtDist(shot.piercingPower, dist, shot.maxDistance, self.__piercingMultiplier)
            fullPiercingPower *= computeDistanceFactor(shell, dist, 'pierceFactor')
            minPP, maxPP = resolver._computePiercingPowerRandomization(shell)
            if _isModernHE(shell):
                # Ванильный getShotResult считает только текущий снаряд, поэтому его ветка для фугаса — напрямую.
                modernHE = getattr(resolver, '_CrosshairShotResults__shotResultModernHE', None)
                result = modernHE(details, fullPiercingPower, shell, minPP, maxPP, self.__target) if modernHE is not None else penetration.UNDEFINED
                results.append((result, None))
                continue
            jetLoss = resolver._SHELL_EXTRA_DATA[shell.kind].jetLossPPByDist
            result, prob, _ = penetration.evaluate(details, fullPiercingPower, shell, minPP, maxPP, resolver._shouldRicochet, resolver._computePenetrationArmor, jetLoss)
            results.append((result, prob))

        return results

    def __checkVanilla(self, hitPoint, collision, result):
        vanilla = self.__resolver.getShotResult(hitPoint, collision, self.__shellDir, excludeTeam=self.__team, piercingMultiplier=self.__piercingMultiplier)
        self.checks += 1
        if vanilla != result:
            self.mismatches += 1
            if self.mismatches <= 5:
                log('vanilla check: result %s, vanilla %s at %s', result, vanilla, hitPoint)

    def checkSegmentDistOnce(self, rays, x, y, rayLength):
        # Фаза 1: один раз за бой сверить, что dist в collideSegmentExt — метры от startPoint.
        if self.__segmentDistChecked:
            return
        ray, start = rays.get(x, y)
        end = start + ray.scale(rayLength)
        res = collideDynamicAndStatic(start, end, (self.__playerVehicleID,))
        if res is None or res[1] is None or res[1].entity is not self.__target:
            return
        self.__segmentDistChecked = True
        details = self.__target.collideSegmentExt(start, end)
        if not details:
            log('segment dist check: collideSegmentExt returned nothing')
            return
        log('segment dist check: collideSegmentExt dist=%.3f, (hitPoint - start).length=%.3f, layers=%d', details[0].dist, (res[0] - start).length, len(details))


class PreviewSampler(object):
    # Режим просмотра в ангаре: боя нет, ванильный расчёт недоступен (ему нужен аватар и модификаторы арены).
    # Слои брони — коллизия танка в ангаре (collideAllWorld, как в Vehicle.collideSegmentExt), снаряд — выбранный
    # в режиме просмотра, пробитие — на выбранной дистанции, нормализация и рикошет — значения по умолчанию клиента.
    # Коллизия в ангаре содержит кроме частей танка увеличенные копии корпуса, башни и орудия для камеры
    # (hangar_vehicle_appearance.py, индексы частей 4..6) — их попадания отбрасываются.

    def __init__(self):
        from gui.battle_control.arena_visitor import _ArenaModifiersVisitor
        self.__modifiers = _ArenaModifiersVisitor()
        self.__resolver = createShotResultResolver()
        self.__parts = frozenset(TankPartIndexes.ALL)

    def prepare(self, entity, shot, distance, steps):
        # entity — танк в ангаре (цель), shot — выбранный снаряд стрелка, distance — дистанция, м.
        vDesc = entity.typeDescriptor
        shell = shot.shell
        extra = self.__resolver._SHELL_EXTRA_DATA[shell.kind]
        self.__collisions = entity.appearance.collisions
        self.__steps = steps
        self.__shell = shell
        p100, p500 = shot.piercingPower[:2]
        self.fullPiercingPower = _computePiercingPowerAtDistImpl(distance, shot.maxDistance, p100, p500) * computeDistanceFactor(shell, distance, 'pierceFactor')
        self.__minPP, self.__maxPP = self.__resolver._computePiercingPowerRandomization(shell)
        self.__jetLoss = extra.jetLossPPByDist
        self.__materials = {TankPartIndexes.CHASSIS: vDesc.chassis.materials,
         TankPartIndexes.HULL: vDesc.hull.materials,
         TankPartIndexes.TURRET: vDesc.turret.materials,
         TankPartIndexes.GUN: vDesc.gun.materials}
        ricochetCos = self.__modifiers.getShellRicochetCos(shell.kind)
        normalization = self.__modifiers.getShellNormalization(shell.kind)
        self.__shouldRicochet = lambda shell, cos, matInfo: penetration.shouldRicochet(shell, cos, matInfo, extra.mayRicochet, extra.checkCaliberForRicochet, ricochetCos)
        self.__penetrationArmor = lambda shell, cos, matInfo: penetration.penetrationArmor(shell, cos, matInfo, extra.hasNormalization, normalization)
        return (id(entity), id(vDesc), id(shot), distance)

    def __details(self, start, end):
        # Слои брони по лучу или None, если луч не попал в танк.
        hits = self.__collisions.collideAllWorld(start, end)
        if not hits:
            return None
        parts = self.__parts
        hits = sorted((hit for hit in hits if hit[3] in parts), key=lambda hit: hit[0])
        if not hits:
            return None
        details = []
        for hit in hits:
            materials = self.__materials.get(hit[3])
            details.append(_Detail(hit[0], hit[1], materials.get(hit[2]) if materials is not None else None, hit[3]))

        return details

    def evaluate(self, start, end):
        # (результат, вероятность, piercingPercent) или None, если луч не попал в танк.
        details = self.__details(start, end)
        if details is None:
            return None
        return penetration.evaluate(details, self.fullPiercingPower, self.__shell, self.__minPP, self.__maxPP, self.__shouldRicochet, self.__penetrationArmor, self.__jetLoss)

    def sample(self, start, end):
        evaluated = self.evaluate(start, end)
        if evaluated is None:
            return None
        return _valueFor(evaluated[0], evaluated[1], self.__steps)
