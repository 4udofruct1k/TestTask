# -*- coding: utf-8 -*-
# Панель шансов у прицела в бою, сборка для WG. Точка и направление снаряда — состояние маркера орудия
# (crosshair.onGunMarkerStateChanged: markerType, GunMarkerState, ...), положение на экране — центр прицела
# (crosshair.getPosition, пиксели GUI.screenResolution). С зажатым Alt — все снаряды орудия.
import BigWorld
import GUI
from AvatarInputHandler import aih_global_binding
from Vehicle import Vehicle
from aih_constants import CTRL_MODE_NAME, GUN_MARKER_FLAG, GUN_MARKER_TYPE
from gui.armor_flashlight.config import getConfig
from gui.battle_control import avatar_getter
from helpers import dependency
from skeletons.account_helpers.settings_core import ISettingsCore
from skeletons.gui.battle_session import IBattleSessionProvider
from account_helpers.settings_core.settings_constants import GRAPHICS, ArmorFlashlight

from gui.mods.armor_highlight import log, logException, palette
from gui.mods.armor_highlight.aimpanel import AimPanel, allShellsKey, buildRows
from gui.mods.armor_highlight.shots_wg import resultsAt

# Режимы, где игра показывает фонарь (battle_controller.VALID_CTRL_MODES); аркадный — по настройке.
_SNIPER_MODES = frozenset((CTRL_MODE_NAME.SNIPER, CTRL_MODE_NAME.TWIN_GUN, CTRL_MODE_NAME.DUAL_GUN))
_GRADIENT_STEPS = 7
# Сколько раз писать в лог одну и ту же ошибку тика.
_MAX_ERRORS_LOGGED = 3


def _hexColour(model, default):
    # ColorModel клиента ('#rrggbb' в code); прозрачный цвет схемы (alpha 0) — значение мода по умолчанию.
    try:
        if model.alpha <= 0.0:
            return default
        return palette.parseColour(model.code, palette.DEFAULT_FULL)
    except Exception:
        return default


class AimInfoController(object):
    sessionProvider = dependency.descriptor(IBattleSessionProvider)
    settingsCore = dependency.descriptor(ISettingsCore)
    gunMarkersFlags = aih_global_binding.bindRO(aih_global_binding.BINDING_ID.GUN_MARKERS_FLAGS)

    def __init__(self, settings):
        self.__settings = settings
        self.__panel = AimPanel()
        self.__states = {}
        self.__callbackID = None
        self.__crosshair = None
        self.__errors = 0

    def start(self):
        self.stop()
        crosshair = self.sessionProvider.shared.crosshair
        if crosshair is not None:
            crosshair.onGunMarkerStateChanged += self.__onGunMarkerStateChanged
            self.__crosshair = crosshair
        self.__settings.addListener(self.__applyColours)
        self.__applyColours()
        self.__errors = 0
        self.__callbackID = BigWorld.callback(0.0, self.__tick)
        log('aim info started')

    def stop(self):
        if self.__callbackID is not None:
            BigWorld.cancelCallback(self.__callbackID)
            self.__callbackID = None
        if self.__crosshair is not None:
            self.__crosshair.onGunMarkerStateChanged -= self.__onGunMarkerStateChanged
            self.__crosshair = None
        self.__settings.removeListener(self.__applyColours)
        self.__states = {}
        self.__panel.destroy()

    def __applyColours(self):
        # Полоска красится как фонарь: свои цвета мода или текущая схема игры.
        settings = self.__settings
        full, half, zero = settings.colours()
        if not settings.ownColours:
            try:
                schema = getConfig().colorSchemas[self.settingsCore.getSetting(ArmorFlashlight.COLOR_SCHEMA)]
                colours = schema.colorBlindness if self.settingsCore.getSetting(GRAPHICS.COLOR_BLIND) else schema.normal
                full, half, zero = _hexColour(colours.greatPierced, full), _hexColour(colours.littlePierced, half), _hexColour(colours.notPierced, zero)
            except Exception:
                logException('aim info colours')
        self.__panel.setColours(_GRADIENT_STEPS, full, half, zero)

    def __onGunMarkerStateChanged(self, markerType, gunMarkerState, *_):
        self.__states[markerType] = gunMarkerState

    def __tick(self):
        self.__callbackID = BigWorld.callback(0.0, self.__tick)
        try:
            self.__update()
        except Exception:
            self.__panel.hide()
            self.__errors += 1
            if self.__errors <= _MAX_ERRORS_LOGGED:
                logException('aim info tick')

    def __gunMarker(self):
        # Как у игры: клиентский маркер, если он включён, иначе серверный.
        if self.gunMarkersFlags & GUN_MARKER_FLAG.CLIENT_MODE_ENABLED:
            return self.__states.get(GUN_MARKER_TYPE.CLIENT)
        return self.__states.get(GUN_MARKER_TYPE.SERVER)

    def __update(self):
        panel = self.__panel
        settings = self.__settings
        player = BigWorld.player()
        crosshair = self.__crosshair
        if not settings.enabled or not settings.aimInfo or player is None or crosshair is None or not getattr(player, 'isVehicleAlive', False):
            panel.hide()
            return
        mode = getattr(player.inputHandler, 'ctrlModeName', None)
        if mode not in _SNIPER_MODES and not (settings.showInArcade and mode == CTRL_MODE_NAME.ARCADE):
            panel.hide()
            return
        gunMarker = self.__gunMarker()
        collision = gunMarker.collData if gunMarker is not None else None
        target = collision.entity if collision is not None else None
        if not isinstance(target, Vehicle) or target.health <= 0 or target.publicInfo['team'] == avatar_getter.getPlayerTeam():
            panel.hide()
            return
        vDesc = player.getVehicleDescriptor()
        # Дополнительные установки (второе орудие) не считаем: снаряды у них свои.
        if not vDesc.gunInstallations[gunMarker.gunInstallationIndex].isMainInstallation():
            panel.hide()
            return
        allShells = allShellsKey()
        shots = vDesc.gun.shots if allShells else (vDesc.shot,)
        multiplier = self.sessionProvider.shared.feedback.getVehicleAttrs().get('gunPiercing', 1)
        results = resultsAt(gunMarker, shots, target, player.getOwnVehiclePosition(), multiplier)
        rows = buildRows(shots, results, vDesc.activeGunShotIndex, allShells) if results is not None else []
        if not rows:
            panel.hide()
            return
        panel.show(rows, crosshair.getPosition(), GUI.screenResolution()[:2])
