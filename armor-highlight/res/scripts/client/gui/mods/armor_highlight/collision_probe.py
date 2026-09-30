# -*- coding: utf-8 -*-
# Разовая проверка на каждый тип танка: есть ли в файлах клиента серверные модели столкновений
# (<hitTester>/<collisionModelServer> в XML танка). В клиентской модели, по которой считает движок, только внешние
# модули (гусеницы, орудие); внутренние (двигатель, баки, боеукладка, экипаж), если и есть, то в серверной.
# Загрузить модель по имени клиент не умеет (BigWorld.BspCollisionModel есть только на сервере, ModelHitTester.py),
# поэтому здесь только чтение через ResMgr и строки в лог: по ним видно, можно ли разобрать файл самим.
# Файлы клиента не меняются.
import ResMgr
import nations

from gui.mods.armor_highlight import log, logException

# items/vehicles.py: _VEHICLE_TYPE_XML_PATH + nation + '/' + xmlName + '.xml', ITEM_DEFS_PATH = 'scripts/item_defs/'.
_VEHICLES_PATH = 'scripts/item_defs/vehicles/'
_PRIMITIVES_EXT = ('.primitives_processed', '.primitives')
_HEX_BYTES = 32
_probed = set()


def probe(vDesc):
    # Вызывается часто (режим просмотра — каждый кадр): тип помечается проверенным до чтения, ошибка — одна строка.
    vType = getattr(vDesc, 'type', None)
    name = getattr(vType, 'name', None)
    if name is None or name in _probed:
        return
    _probed.add(name)
    try:
        path = _VEHICLES_PATH + nations.NAMES[vType.id[0]] + '/' + vType.name.split(':')[1] + '.xml'
        root = ResMgr.openSection(path)
        if root is None:
            log('collision probe %s: %s not found', vType.name, path)
            return
        turrets = root['turrets0']
        parts = (('hull', root['hull']), ('turret', turrets[vDesc.turret.name] if turrets is not None else None))
        for part, section in parts:
            hitTester = section['hitTester'] if section is not None else None
            if hitTester is None:
                log('collision probe %s %s: no hitTester in %s', vType.name, part, path)
                continue
            client = hitTester.readString('collisionModelClient')
            server = hitTester.readString('collisionModelServer')
            log('collision probe %s %s: client %s (file %s), server %s (file %s)', vType.name, part, client, bool(client) and ResMgr.isFile(client), server, bool(server) and ResMgr.isFile(server))
            if server and server != client and ResMgr.isFile(server):
                log('collision probe %s %s server: %s', vType.name, part, _describeModel(server))
                log('collision probe %s %s client: %s', vType.name, part, _describeModel(client))

        ResMgr.purge(path, True)
    except Exception:
        logException('collision probe')


def _describeModel(path):
    # Ключи .model и разделы файла геометрии с размерами; у разделов bsp — первые байты (формат для разбора).
    section = ResMgr.openSection(path)
    if section is None:
        return 'cannot open'
    out = ['model keys %s' % list(section.keys())]
    visual = section.readString('nodefullVisual') or section.readString('nodelessVisual')
    if not visual:
        return out[0]
    for ext in _PRIMITIVES_EXT:
        primitives = ResMgr.openSection(visual + ext)
        if primitives is None:
            continue
        parts = []
        for key in primitives.keys():
            data = primitives[key].asBinary or ''
            text = '%s=%d' % (key, len(data))
            if 'bsp' in key:
                text += ' [%s]' % data[:_HEX_BYTES].encode('hex')
            parts.append(text)

        out.append('%s%s: %s' % (visual, ext, ', '.join(parts)))
        return '; '.join(out)

    out.append('no primitives for %s' % visual)
    return '; '.join(out)
