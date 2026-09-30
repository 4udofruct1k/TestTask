# -*- coding: utf-8 -*-
# Модули мода импортируются как в клиенте: gui.mods.armor_highlight.*. Пакеты gui и gui.mods клиента
# подменяются пустыми, чтобы не тянуть их __init__.py.
import os
import sys
import types

_CLIENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'res', 'scripts', 'client')


def installPackages():
    for name, path in (('gui', ('gui',)), ('gui.mods', ('gui', 'mods'))):
        if name not in sys.modules:
            module = types.ModuleType(name)
            module.__path__ = [os.path.join(_CLIENT, *path)]
            sys.modules[name] = module
