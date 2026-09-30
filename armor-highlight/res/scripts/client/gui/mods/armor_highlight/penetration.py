# -*- coding: utf-8 -*-
# Вероятность пробития по слоям брони. Без импортов клиента — тестируется офлайн (tests/test_penetration.py).
#
# evaluate() повторяет цикл _CrosshairShotResults.__shotResultDefault (AvatarInputHandler/gun_marker_ctrl.py,
# клиент 1.45.0.0) и возвращает кроме ванильного результата вероятность пробития. Ванильный расчёт её не отдаёт:
# piercingPercent решающего листа идёт только в отладочное событие. Рикошет и приведённую броню считают
# переданные функции — в бою это ванильные _shouldRicochet и _computePenetrationArmor.
import math

# Значения aih_constants.SHOT_RESULT.
UNDEFINED = 0
NOT_PIERCED = 1
LITTLE_PIERCED = 2
GREAT_PIERCED = 3

_MAX_HIT_ANGLE_BOUND = math.pi / 2.0 - 1e-05


def probability(piercingPercent, randomization):
    # Бронепробитие снаряда случайно в пределах ±randomization от номинала. piercingPercent — сколько
    # процентов номинального пробития нужно, чтобы пробить. Распределение считаем равномерным.
    if randomization <= 0.0:
        return 1.0 if piercingPercent <= 100.0 else 0.0
    prob = (100.0 * (1.0 + randomization) - piercingPercent) / (200.0 * randomization)
    return max(0.0, min(1.0, prob))


def evaluate(details, fullPiercingPower, shell, minPP, maxPP, shouldRicochet, penetrationArmor, jetLossPPByDist):
    # details — слои по ходу снаряда (dist, hitAngleCos, matInfo, compName) из collideSegmentExt.
    # Возвращает (SHOT_RESULT, вероятность пробития 0..1, piercingPercent последнего посчитанного листа или None).
    result = NOT_PIERCED
    prob = 0.0
    lastPercent = None
    isJet = False
    jetStartDist = None
    piercingPower = fullPiercingPower
    ignoredMaterials = set()
    for cDetails in details:
        if isJet:
            jetDist = cDetails.dist - jetStartDist
            if jetDist > 0.0:
                piercingPower *= 1.0 - jetDist * jetLossPPByDist
        matInfo = cDetails.matInfo
        if matInfo is None:
            result = NOT_PIERCED
            prob = 0.0
        else:
            if (cDetails.compName, matInfo.kind) in ignoredMaterials:
                continue
            if matInfo.armor is None:
                result = UNDEFINED
                continue
            hitAngleCos = cDetails.hitAngleCos if matInfo.useHitAngle else 1.0
            piercingPercent = 1000.0
            if not isJet and shouldRicochet(shell, hitAngleCos, matInfo):
                break
            if piercingPower > 0.0:
                armor = penetrationArmor(shell, hitAngleCos, matInfo)
                piercingPercent = 100.0 + (armor - piercingPower) / fullPiercingPower * 100.0
                piercingPower -= armor
                lastPercent = piercingPercent
            if matInfo.vehicleDamageFactor:
                if minPP < piercingPercent < maxPP:
                    result = LITTLE_PIERCED
                elif piercingPercent <= minPP:
                    result = GREAT_PIERCED
                prob = probability(piercingPercent, shell.piercingPowerRandomization)
                break
            if matInfo.extra and piercingPercent <= maxPP:
                result = NOT_PIERCED
                prob = 0.0
            if matInfo.collideOnceOnly:
                ignoredMaterials.add((cDetails.compName, matInfo.kind))
        if piercingPower <= 0.0:
            break
        if jetLossPPByDist > 0.0:
            isJet = True
            armor = matInfo.armor if matInfo is not None else 0.0
            jetStartDist = cDetails.dist + armor * 0.001

    return (result, prob, lastPercent)


# --- Для предпросмотра в ангаре: там нет боя и ванильный расчёт недоступен ---
# Те же формулы, что _CrosshairShotResults._shouldRicochet и _computePenetrationArmor, но нормализация и косинус
# рикошета передаются явно (в бою их отдаёт arenaVisitor.modifiers).

def shouldRicochet(shell, hitAngleCos, matInfo, mayRicochet, checkCaliber, ricochetCos):
    if not matInfo.mayRicochet or not mayRicochet:
        return False
    armor = matInfo.armor
    if armor == 0:
        return False
    if hitAngleCos <= ricochetCos:
        if not matInfo.checkCaliberForRichet or not checkCaliber:
            return True
        if armor * 3 >= shell.caliber:
            return True
    return False


def penetrationArmor(shell, hitAngleCos, matInfo, hasNormalization, normalizationAngle):
    armor = matInfo.armor
    if not matInfo.useHitAngle:
        return armor
    if not hasNormalization:
        normalizationAngle = 0.0
    if normalizationAngle > 0.0 and hitAngleCos < 1.0:
        if matInfo.checkCaliberForHitAngleNorm and shell.caliber > armor * 2 > 0:
            normalizationAngle *= 1.4 * shell.caliber / (armor * 2)
        hitAngle = math.acos(hitAngleCos) - normalizationAngle
        if hitAngle < 0.0:
            hitAngleCos = 1.0
        else:
            hitAngleCos = math.cos(min(hitAngle, _MAX_HIT_ANGLE_BOUND))
    if hitAngleCos < 1e-05:
        hitAngleCos = 1e-05
    return armor / hitAngleCos
