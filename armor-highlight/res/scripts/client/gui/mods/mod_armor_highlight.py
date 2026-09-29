# -*- coding: utf-8 -*-
from PlayerEvents import g_playerEvents

from gui.mods.armor_highlight import VERSION, log, logException
from gui.mods.armor_highlight.controller import ArmorHighlightController

_controller = None


def init():
    global _controller
    try:
        log('init, version %s', VERSION)
        _controller = ArmorHighlightController()
        g_playerEvents.onAvatarReady += _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer += _onAvatarBecomeNonPlayer
    except Exception:
        logException('init')


def fini():
    global _controller
    try:
        g_playerEvents.onAvatarReady -= _onAvatarReady
        g_playerEvents.onAvatarBecomeNonPlayer -= _onAvatarBecomeNonPlayer
        if _controller is not None:
            _controller.stop()
            _controller = None
        log('fini')
    except Exception:
        logException('fini')


def _onAvatarReady():
    try:
        log('avatar ready')
        _controller.start()
    except Exception:
        logException('onAvatarReady')


def _onAvatarBecomeNonPlayer():
    try:
        log('avatar become non-player')
        _controller.stop()
    except Exception:
        logException('onAvatarBecomeNonPlayer')
