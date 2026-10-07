# -*- coding: utf-8 -*-
# Точка входа сборки для WG: настройки фонаря брони клиента и панель шансов у прицела.
from PlayerEvents import g_playerEvents

from gui.mods.armor_highlight import VERSION, log, logException

_aimInfo = None


def init():
    global _aimInfo
    try:
        log('init (WG), version %s', VERSION)
        from gui.mods.armor_highlight.settings_wg import g_settings
        try:
            g_settings.load()
        except Exception:
            logException('settings.load')

        # Фонарь и панель независимы: если модуль клиента для одного не загрузился, второе работает.
        # Импорт внутри try: ошибка импорта клиентских модулей попадёт в лог с префиксом мода.
        try:
            from gui.mods.armor_highlight import flashlight
            flashlight.install(g_settings)
        except Exception:
            logException('flashlight.install')

        try:
            from gui.mods.armor_highlight.aim_wg import AimInfoController
            _aimInfo = AimInfoController(g_settings)
        except Exception:
            logException('AimInfoController')

        g_playerEvents.onAvatarReady += _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer += _onAvatarBecomeNonPlayer
    except Exception:
        logException('init')


def fini():
    global _aimInfo
    try:
        g_playerEvents.onAvatarReady -= _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer -= _onAvatarBecomeNonPlayer
        if _aimInfo is not None:
            _aimInfo.stop()
            _aimInfo = None
    except Exception:
        logException('fini')

    try:
        from gui.mods.armor_highlight import flashlight
        flashlight.uninstall()
    except Exception:
        logException('flashlight.uninstall')

    log('fini')


def _onAvatarReady():
    try:
        log('avatar ready')
        if _aimInfo is not None:
            _aimInfo.start()
    except Exception:
        logException('onAvatarReady')


def _onAvatarBecomeNonPlayer():
    try:
        log('avatar become non-player')
        if _aimInfo is not None:
            _aimInfo.stop()
    except Exception:
        logException('onAvatarBecomeNonPlayer')
