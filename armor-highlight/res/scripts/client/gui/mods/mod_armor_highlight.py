# -*- coding: utf-8 -*-
from PlayerEvents import g_playerEvents

from gui.mods.armor_highlight import VERSION, log, logException

_controller = None
_preview = None


def init():
    global _controller, _preview
    try:
        log('init, version %s', VERSION)
        # Импорт внутри try: ошибка импорта клиентских модулей попадёт в лог с префиксом мода.
        from gui.mods.armor_highlight.controller import ArmorHighlightController
        from gui.mods.armor_highlight.preview import ViewMode
        from gui.mods.armor_highlight.settings import g_settings
        try:
            g_settings.load()
        except Exception:
            logException('settings.load')

        _controller = ArmorHighlightController(g_settings)
        _preview = ViewMode(g_settings)
        try:
            _preview.register()
        except Exception:
            logException('ViewMode.register')

        from gui.mods.armor_highlight import config
        if config.debug:
            # Разовый замер скорости Python на этом компьютере (~20–30 мс при запуске игры).
            try:
                from gui.mods.armor_highlight import bench
                log(bench.run())
            except Exception:
                logException('bench')

        g_playerEvents.onAvatarReady += _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer += _onAvatarBecomeNonPlayer
        g_playerEvents.onAccountBecomePlayer += _onAccountBecomePlayer
        g_playerEvents.onAccountBecomeNonPlayer += _onAccountBecomeNonPlayer
    except Exception:
        logException('init')


def fini():
    global _controller, _preview
    try:
        g_playerEvents.onAvatarReady -= _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer -= _onAvatarBecomeNonPlayer
        g_playerEvents.onAccountBecomePlayer -= _onAccountBecomePlayer
        g_playerEvents.onAccountBecomeNonPlayer -= _onAccountBecomeNonPlayer
        if _controller is not None:
            _controller.stop()
            _controller = None
        if _preview is not None:
            _preview.deactivate()
            _preview = None
        log('fini')
    except Exception:
        logException('fini')


def _onAvatarReady():
    try:
        log('avatar ready')
        if _controller is not None:
            _controller.start()
    except Exception:
        logException('onAvatarReady')


def _onAvatarBecomeNonPlayer():
    try:
        log('avatar become non-player')
        if _controller is not None:
            _controller.stop()
    except Exception:
        logException('onAvatarBecomeNonPlayer')


def _onAccountBecomePlayer():
    try:
        if _preview is not None:
            _preview.onLobby(True)
    except Exception:
        logException('onAccountBecomePlayer')


def _onAccountBecomeNonPlayer():
    try:
        if _preview is not None:
            _preview.onLobby(False)
    except Exception:
        logException('onAccountBecomeNonPlayer')
