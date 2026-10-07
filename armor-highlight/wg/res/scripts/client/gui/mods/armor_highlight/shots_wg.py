# -*- coding: utf-8 -*-
# Шанс пробития для панели у прицела, сборка для WG. Слои брони, рикошет, приведённая броня, разброс пробития
# и пробитие на дистанции — методы клиента WG 2.4.0.2 (AvatarInputHandler/gun_marker_ctrl.py); цикл по слоям —
# penetration.evaluate, он повторяет _CrosshairShotResults.__shotResultDefault и отдаёт ещё и вероятность.
import constants
from aih_constants import SHOT_RESULT
from AvatarInputHandler.gun_marker_ctrl import computePiercingPowerAtDist, createShotResultResolver

from gui.mods.armor_highlight import penetration

# SHOT_RESULT у WG сдвинут на единицу относительно Лесты (EMPTY = 0): ванильный результат — в константы penetration.
_FROM_CLIENT = {SHOT_RESULT.EMPTY: penetration.UNDEFINED,
 SHOT_RESULT.UNDEFINED: penetration.UNDEFINED,
 SHOT_RESULT.NOT_PIERCED: penetration.NOT_PIERCED,
 SHOT_RESULT.LITTLE_PIERCED: penetration.LITTLE_PIERCED,
 SHOT_RESULT.GREAT_PIERCED: penetration.GREAT_PIERCED}


def isModernHE(shell):
    return shell.kind == constants.SHELL_TYPES.HIGH_EXPLOSIVE and shell.type.mechanics == constants.SHELL_MECHANICS_TYPE.MODERN


def resultsAt(gunMarker, shots, target, ownPosition, piercingMultiplier):
    # gunMarker — GunMarkerState (точка, направление снаряда, collData). Для каждого снаряда из shots —
    # (результат, вероятность 0..1); фугас с новой механикой считается по урону: (ванильный результат, None).
    # None — луч не попал в цель. Слои одни на все снаряды, направление — текущего снаряда.
    resolver = createShotResultResolver()
    details = resolver._getAllCollisionDetails(gunMarker.position, gunMarker.direction, target)
    if not details:
        return None
    dist = (gunMarker.position - ownPosition).length
    results = []
    for shot in shots:
        shell = shot.shell
        fullPiercingPower = computePiercingPowerAtDist(shot.piercingPower, dist, shot.maxDistance, piercingMultiplier)
        minPP, maxPP = resolver._computePiercingPowerRandomization(shell)
        if isModernHE(shell):
            # Ванильный getShotResult считает только текущий снаряд, поэтому его ветка для фугаса — напрямую.
            modernHE = getattr(resolver, '_CrosshairShotResults__shotResultModernHE', None)
            result = modernHE(gunMarker, details, fullPiercingPower, shell, minPP, maxPP, target) if modernHE is not None else SHOT_RESULT.UNDEFINED
            results.append((_FROM_CLIENT.get(result, penetration.UNDEFINED), None))
            continue
        extra = resolver._SHELL_EXTRA_DATA.get(shell.kind)
        if extra is None:
            # Тип снаряда, которого нет в таблице клиента: игра его тоже не считает.
            results.append((penetration.UNDEFINED, None))
            continue
        jetLoss = getattr(shell.type, 'piercingPowerLossFactorByDistance', 0.0) if extra.hasPenetrationLoss else 0.0
        result, prob, _ = penetration.evaluate(details, fullPiercingPower, shell, minPP, maxPP, resolver._shouldRicochet, resolver._computePenetrationArmor, jetLoss, jet=extra.hasPenetrationLoss)
        results.append((result, prob))

    return results
