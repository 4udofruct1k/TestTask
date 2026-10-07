# -*- coding: utf-8 -*-
# Параметры встроенного фонаря брони WG из настроек мода. Без импортов клиента: тестируется офлайн
# (tests/test_flashlight_params.py). Что значат параметры — gui/armor_flashlight/config.py и
# res/gui/armor_flashlight_config.xml клиента WG 2.4.0.2.

# Размер пятна: множитель радиуса и предела на экране (в игре — 28% окна).
SPOT_SCALES = (1.0, 1.5, 2.0, 3.0)
# Прозрачность по дистанции без затухания: одна точка — на любой дистанции полная.
NO_DISTANCE_FADE = [(0, 1.0)]


def colourFloats(full, half, zero):
    # Цвета фонаря в его порядке (не пробьёт, может пробить, пробьёт): (r, g, b, a) от 0 до 1, как
    # ColorModel.toFloats. Прозрачность задаёт ползунок игры, поэтому здесь a = 1.
    return tuple((tuple((channel / 255.0 for channel in rgb)) + (1.0,) for rgb in (zero, half, full)))


def alphaByDist(original, distanceFade):
    # Затухание с дистанции как в игре или без него.
    if distanceFade:
        return list(original)
    return list(NO_DISTANCE_FADE)


def scaled(pairs, scale):
    # [(дистанция, значение)] с умноженным значением.
    return [ (distance, value * scale) for distance, value in pairs ]


def maxSizePercent(base, scale):
    # Предел пятна в процентах окна; больше 100 игра не принимает (validate.Range в config.py).
    return min(100.0, base * scale)


def fadeoffFactor(original, aimFade):
    # Бледнее при несведённом прицеле: в игре множитель прозрачности (сведение / текущий разброс) ** factor.
    # factor = 0 даёт множитель 1 — одинаково яркая сразу.
    if aimFade:
        return original
    return 0.0
