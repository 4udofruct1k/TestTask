# -*- coding: utf-8 -*-
# Цвета подсветки: градиент по вероятности пробития и набор готовых текстур.
# Без импортов клиента: модуль читает и tools/make_textures.py при сборке (Python 2.7 и 3.x).
#
# colour у GUI.Simple в этом клиенте не красит квадрат (в 0.2.0 квадраты вышли белыми), поэтому цвет и
# прозрачность запечены в текстуры. Произвольный цвет из настроек приводится к ближайшему цвету палитры:
# куб CUBE_STEPS^3 плюс точные цвета градиентов по умолчанию.
import struct
import zlib


def roundHalfUp(value):
    # Одинаково в Python 2 и 3: round() в 3.x округляет половину к чётному. Только для value >= 0.
    return int(value + 0.5)


# Путь от корня ресурсов. Клиент монтирует папку res внутри .mtmod как корень (paths.xml: root="res").
TEXTURE_DIR = 'gui/maps/armor_highlight'
TEXTURE_SIZE = 4
CUBE_STEPS = 7
CUBE_VALUES = tuple((roundHalfUp(255.0 * idx / (CUBE_STEPS - 1)) for idx in range(CUBE_STEPS)))
OPACITY_LEVELS = tuple(range(10, 101, 10))

# Число оттенков в градиенте: 100%, промежуточные полосы, 0%.
GRADIENT_STEPS = (3, 5, 7, 11)
DEFAULT_FULL = '1db83a'
DEFAULT_HALF = 'ff8a00'
DEFAULT_ZERO = 'd11a1a'


def _parseHex(value):
    text = str(value).strip().lstrip('#')
    if len(text) != 6:
        raise ValueError(value)
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def parseColour(value, default):
    # 'RRGGBB' или '#RRGGBB' из настроек -> (r, g, b); при ошибке — default.
    try:
        return _parseHex(value)
    except (TypeError, ValueError):
        return _parseHex(default)


def _lerp(a, b, t):
    return tuple((roundHalfUp(a[idx] + (b[idx] - a[idx]) * t) for idx in range(3)))


def colourAt(prob, full, half, zero):
    # Цвет для вероятности пробития prob: zero -> half -> full.
    if prob <= 0.5:
        return _lerp(zero, half, prob / 0.5)
    return _lerp(half, full, (prob - 0.5) / 0.5)


def probabilityLevel(prob, steps):
    # Уровень 0..steps-1: 0 — не пробивает, steps-1 — 100%, между ними полосы равной ширины.
    if prob >= 1.0:
        return steps - 1
    if prob <= 0.0:
        return 0
    inner = steps - 2
    return 1 + min(inner - 1, int(prob * inner))


def levelProbability(level, steps):
    # Вероятность, по которой красится уровень: середина полосы.
    if level >= steps - 1:
        return 1.0
    if level <= 0:
        return 0.0
    return (level - 0.5) / (steps - 2)


def gradient(steps, full, half, zero):
    return [ colourAt(levelProbability(level, steps), full, half, zero) for level in range(steps) ]


def _defaultGradientColours():
    colours = set()
    full = parseColour(DEFAULT_FULL, DEFAULT_FULL)
    half = parseColour(DEFAULT_HALF, DEFAULT_HALF)
    zero = parseColour(DEFAULT_ZERO, DEFAULT_ZERO)
    for steps in GRADIENT_STEPS:
        colours.update(gradient(steps, full, half, zero))

    return colours


EXACT_COLOURS = frozenset(_defaultGradientColours())


def _nearestValue(value):
    return min(CUBE_VALUES, key=lambda cube: abs(cube - value))


def nearestColour(rgb):
    # Ближайший цвет, для которого есть текстура.
    rgb = tuple(rgb)
    if rgb in EXACT_COLOURS:
        return rgb
    return tuple((_nearestValue(value) for value in rgb))


def nearestOpacity(percent):
    return min(OPACITY_LEVELS, key=lambda level: abs(level - percent))


def texturePath(rgb, opacity):
    return '%s/%02x%02x%02x_%d.dds' % ((TEXTURE_DIR,) + tuple(rgb) + (opacity,))


def allTextures():
    # Все пары (цвет, непрозрачность), для которых при сборке генерируются текстуры.
    colours = set(EXACT_COLOURS)
    for r in CUBE_VALUES:
        for g in CUBE_VALUES:
            for b in CUBE_VALUES:
                colours.add((r, g, b))

    for rgb in sorted(colours):
        for opacity in OPACITY_LEVELS:
            yield (rgb, opacity)


def png(rgba, size=TEXTURE_SIZE):
    # Сплошной RGBA PNG size x size — для текстур в памяти (BigWorld.addScaleformTexture).
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    row = b'\x00' + struct.pack('4B', *rgba) * size
    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(row * size)) + chunk(b'IEND', b'')
