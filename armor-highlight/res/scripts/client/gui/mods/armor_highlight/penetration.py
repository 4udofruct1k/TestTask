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
# Сколько калибров снаряд пролетает внутри танка после пробития основной брони. Считает сервер, в клиенте этого
# нет; значение — из справки Wargaming (статьи о механике пробития для Blitz и консольной версии).
INSIDE_CALIBERS = 10.0


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


# Модули (vehicle extras) по именам: подпись у прицела. Порядок важен: gunner раньше gun, radioman раньше radio.
_MODULE_LABELS = (('ammoBay', u'боеукладка'),
 ('engine', u'двигатель'),
 ('fuelTank', u'бак'),
 ('radioman', u'радист'),
 ('radio', u'рация'),
 ('gunner', u'наводчик'),
 ('gun', u'орудие'),
 ('turretRotator', u'погон башни'),
 ('surveyingDevice', u'приборы наблюдения'),
 ('leftTrack', u'гусеница'),
 ('rightTrack', u'гусеница'),
 ('track', u'гусеница'),
 ('wheel', u'колесо'),
 ('commander', u'командир'),
 ('driver', u'мехвод'),
 ('loader', u'заряжающий'))


def moduleLabel(name):
    for prefix, label in _MODULE_LABELS:
        if name.startswith(prefix):
            return label

    return unicode(name)


def modulesAlong(details, fullPiercingPower, shell, shouldRicochet, penetrationArmor, jetLossPPByDist):
    # Модули на пути снаряда, до которых он может дойти (не остановлен бронёй или рикошетом): имена по порядку.
    # Тот же проход по слоям, что в evaluate(), но не до решающего листа, а пока у снаряда есть пробитие:
    # за пробитой бронёй он идёт дальше, к модулям внутри — если они есть в клиентской модели столкновений.
    # Пробитие — лучший бросок (номинал + разброс): модули, которые выстрел в эту точку может задеть.
    # После пробития основной брони (лист с уроном) снаряд летит внутри не дальше INSIDE_CALIBERS калибров.
    names = []
    isJet = False
    jetStartDist = None
    insideLimit = None
    piercingPower = fullPiercingPower * (1.0 + shell.piercingPowerRandomization)
    ignoredMaterials = set()
    for cDetails in details:
        if insideLimit is not None and cDetails.dist > insideLimit:
            break
        if isJet:
            jetDist = cDetails.dist - jetStartDist
            if jetDist > 0.0:
                piercingPower *= 1.0 - jetDist * jetLossPPByDist
        matInfo = cDetails.matInfo
        if matInfo is None:
            continue
        if (cDetails.compName, matInfo.kind) in ignoredMaterials:
            continue
        extra = getattr(matInfo, 'extra', None)
        if extra is not None and piercingPower > 0.0:
            name = getattr(extra, 'name', None) or str(extra)
            if name not in names:
                names.append(name)
        if matInfo.armor is None:
            continue
        hitAngleCos = cDetails.hitAngleCos if matInfo.useHitAngle else 1.0
        if not isJet and shouldRicochet(shell, hitAngleCos, matInfo):
            break
        if piercingPower > 0.0:
            piercingPower -= penetrationArmor(shell, hitAngleCos, matInfo)
        if matInfo.collideOnceOnly:
            ignoredMaterials.add((cDetails.compName, matInfo.kind))
        if piercingPower <= 0.0:
            break
        if insideLimit is None and matInfo.vehicleDamageFactor:
            # dist — метры, калибр — мм.
            insideLimit = cDetails.dist + matInfo.armor * 0.001 + INSIDE_CALIBERS * shell.caliber * 0.001
        if jetLossPPByDist > 0.0:
            isJet = True
            jetStartDist = cDetails.dist + matInfo.armor * 0.001

    return names


def describeLayers(details):
    # Для лога: все слои по лучу — часть, материал, броня, модуль.
    out = []
    for cDetails in details:
        matInfo = cDetails.matInfo
        if matInfo is None:
            out.append('%s/none' % (cDetails.compName,))
            continue
        extra = getattr(matInfo, 'extra', None)
        # extra — объект с name или строка (у гусениц с индексом пары: 'leftTrack0Health').
        extraName = (getattr(extra, 'name', None) or str(extra)) if extra is not None else None
        out.append('%s/%s armor=%s dmg=%s extra=%s' % (cDetails.compName, matInfo.kind, matInfo.armor, matInfo.vehicleDamageFactor, extraName))

    return '; '.join(out)


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
