# -*- coding: utf-8 -*-
# Цвета подсветки и пути к текстурам. Без импортов клиента: модуль читает и tools/make_textures.py при сборке.
# Цвета из ARMOR_SPEC.md, раздел 2.4.

# Прозрачность запекается в альфу текстур при сборке.
OPACITY = 0.45

COLORS = {'great': (0x00, 0x80, 0x15),
 'little': (0xbb, 0xa7, 0x37),
 'not': (0x8c, 0x07, 0x12)}
COLORS_COLOR_BLIND = {'great': (0xff, 0xcc, 0x33),
 'little': (0xd5, 0x68, 0xe3),
 'not': (0x60, 0x25, 0xb4)}

# Путь от корня ресурсов. Клиент монтирует папку res внутри .mtmod как корень (paths.xml: root="res").
TEXTURE_DIR = 'gui/maps/armor_highlight'


def texturePath(name):
    return '%s/%s.dds' % (TEXTURE_DIR, name)
