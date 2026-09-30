# -*- coding: utf-8 -*-
# Разовая проверка на каждый тип танка: есть ли в файлах клиента серверные модели столкновений
# (<hitTester>/<collisionModelServer> в XML танка). В клиентской модели, по которой считает движок, только внешние
# модули (гусеницы, орудие); внутренние (двигатель, баки, боеукладка, экипаж), если и есть, то в серверной.
# Загрузить модель по имени клиент не умеет (BigWorld.BspCollisionModel есть только на сервере, ModelHitTester.py),
# поэтому здесь только чтение через ResMgr и строки в лог: по ним видно, можно ли разобрать файл самим.
# ResMgr.isFile в 0.12.1 вернул 0 даже для клиентской модели, которую игра загружает, поэтому файл открывается
# через openSection, а содержимое папок танка (collision_client, collision) выводится списком.
# Файлы клиента не меняются.
import ResMgr
import nations

from gui.mods.armor_highlight import log, logException

# items/vehicles.py: _VEHICLE_TYPE_XML_PATH + nation + '/' + xmlName + '.xml', ITEM_DEFS_PATH = 'scripts/item_defs/'.
_VEHICLES_PATH = 'scripts/item_defs/vehicles/'
_PRIMITIVES_EXT = ('.primitives_processed', '.primitives')
_HEX_BYTES = 32
_FOLDER_ENTRIES = 40
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
        folders = []
        for part, section in parts:
            hitTester = section['hitTester'] if section is not None else None
            if hitTester is None:
                log('collision probe %s %s: no hitTester in %s', vType.name, part, path)
                continue
            client = hitTester.readString('collisionModelClient')
            server = hitTester.readString('collisionModelServer')
            log('collision probe %s %s: client %s (%s), server %s (%s)', vType.name, part, client, _exists(client), server, _exists(server))
            for model in (client, server):
                folder = model.rsplit('/', 1)[0] if '/' in model else ''
                if folder and folder not in folders:
                    folders.append(folder)
            if server and server != client and ResMgr.openSection(server) is not None:
                log('collision probe %s %s server: %s', vType.name, part, _describeModel(server))
                log('collision probe %s %s client: %s', vType.name, part, _describeModel(client))

        # Папка танка и папки моделей: есть ли вообще collision рядом с collision_client.
        if folders:
            vehicleFolder = folders[0].rsplit('/', 1)[0]
            for folder in [vehicleFolder] + folders:
                log('collision probe %s folder %s', vType.name, _describeFolder(folder))

        ResMgr.purge(path, True)
    except Exception:
        logException('collision probe')


def _exists(path):
    if not path:
        return 'empty'
    return 'isFile %s, open %s' % (ResMgr.isFile(path), ResMgr.openSection(path) is not None)


def _describeFolder(path):
    section = ResMgr.openSection(path)
    if section is None:
        return '%s: not found (isDir %s)' % (path, ResMgr.isDir(path))
    keys = sorted(section.keys())
    return '%s: %d entries %s' % (path, len(keys), keys[:_FOLDER_ENTRIES])


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
