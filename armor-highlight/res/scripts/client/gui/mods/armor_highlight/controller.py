# -*- coding: utf-8 -*-
# Бой: подписки, выбор цели, условия показа, тик каждый кадр, клавиша вкл/выкл.
import BigWorld
import Keys
import Math
import aih_constants
from AvatarInputHandler import aih_global_binding
from Vehicle import Vehicle
from gui import InputHandler
from gui.battle_control import avatar_getter
from gui.battle_control.battle_constants import FEEDBACK_EVENT_ID
from helpers import dependency
from messenger import MessengerEntry
from skeletons.gui.battle_session import IBattleSessionProvider

from gui.mods.armor_highlight import config, log, logException, penetration
from gui.mods.armor_highlight.aiminfo import AimInfo
from gui.mods.armor_highlight.highlighter import Highlighter, timer
from gui.mods.armor_highlight.sampler import BattleSampler

_CTRL_MODE = aih_constants.CTRL_MODE_NAME
_MARKER_TYPE = aih_constants.GUN_MARKER_TYPE
_MARKER_FLAG = aih_constants.GUN_MARKER_FLAG
_SNIPER_MODES = frozenset((_CTRL_MODE.SNIPER, _CTRL_MODE.DUAL_GUN))
_ARCADE_MODES = frozenset((_CTRL_MODE.ARCADE,))



def _resultText(result, prob):
    # Шанс пробития для подписи или None — нет данных о броне. prob None — фугас с новой механикой:
    # ванильный результат по урону (пробьёт — 100%, урон без гарантии пробития, не пробьёт — 0%).
    if result == penetration.UNDEFINED:
        return None
    if prob is None:
        return {penetration.GREAT_PIERCED: u'100%', penetration.LITTLE_PIERCED: u'урон'}.get(result, u'0%')
    return u'%d%%' % int(prob * 100.0 + 0.5)

class ArmorHighlightController(object):
    __gunMarkersFlags = aih_global_binding.bindRO(aih_global_binding.BINDING_ID.GUN_MARKERS_FLAGS)
    __sessionProvider = dependency.descriptor(IBattleSessionProvider)

    def __init__(self, settings):
        self.__settings = settings
        self.__isStarted = False
        self.__callbackID = None
        self.__highlighter = Highlighter(settings)
        self.__aimInfo = AimInfo()
        self.__sampler = None
        self.__crosshairCtrl = None
        self.__feedbackCtrl = None
        self.__resetBattleState()

    def start(self):
        self.stop()
        self.__isStarted = True
        self.__resetBattleState()
        crosshairCtrl = self.__sessionProvider.shared.crosshair
        if crosshairCtrl is not None:
            crosshairCtrl.onGunMarkerStateChanged += self.__onGunMarkerStateChanged
            self.__crosshairCtrl = crosshairCtrl
        else:
            log('crosshair controller not found, highlight will stay hidden')
        feedbackCtrl = self.__sessionProvider.shared.feedback
        if feedbackCtrl is not None:
            feedbackCtrl.onVehicleFeedbackReceived += self.__onVehicleFeedbackReceived
            self.__feedbackCtrl = feedbackCtrl
        InputHandler.g_instance.onKeyDown += self.__onKeyDown
        self.__settings.addListener(self.__onSettingsChanged)
        self.__sampler = BattleSampler(config.debug)
        self.__highlighter.start()
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        log('started in battle: %s', self.__settings.describe())

    def stop(self):
        if not self.__isStarted:
            return
        self.__isStarted = False
        if self.__callbackID is not None:
            BigWorld.cancelCallback(self.__callbackID)
            self.__callbackID = None
        if self.__crosshairCtrl is not None:
            self.__crosshairCtrl.onGunMarkerStateChanged -= self.__onGunMarkerStateChanged
            self.__crosshairCtrl = None
        if self.__feedbackCtrl is not None:
            self.__feedbackCtrl.onVehicleFeedbackReceived -= self.__onVehicleFeedbackReceived
            self.__feedbackCtrl = None
        InputHandler.g_instance.onKeyDown -= self.__onKeyDown
        self.__settings.removeListener(self.__onSettingsChanged)
        self.__highlighter.stop()
        self.__aimInfo.destroy()
        self.__sampler = None
        self.__resetBattleState()
        log('stopped in battle')

    def __resetBattleState(self):
        self.__markerStates = {}
        self.__piercingMultiplier = 1
        self.__isEnabled = True
        self.__stillSince = None
        self.__readySince = None
        # id, а не сам объект: танк, ушедший из видимости, в клиенте уничтожается, и обращение к нему — ошибка.
        self.__stickyTargetID = None
        self.__inactiveReason = 'starting'
        self.__lastErrorLogAt = None
        self.__suppressedErrors = 0

    # --- события: только сохраняем состояние (2.5) ---

    def __onGunMarkerStateChanged(self, markerType, position, direction, collision):
        try:
            self.__markerStates[markerType] = (position, direction, collision)
        except Exception:
            logException('onGunMarkerStateChanged')

    def __onVehicleFeedbackReceived(self, eventID, _, value):
        try:
            if eventID == FEEDBACK_EVENT_ID.VEHICLE_ATTRS_CHANGED:
                self.__piercingMultiplier = value.get('gunPiercing', 1)
        except Exception:
            logException('onVehicleFeedbackReceived')

    def __onKeyDown(self, event):
        try:
            if not self.__settings.isToggleKey(event):
                return
            if self.__isChatFocused():
                return
            self.__isEnabled = not self.__isEnabled
            log('highlight %s by key', 'enabled' if self.__isEnabled else 'disabled')
            if not self.__isEnabled:
                self.__deactivate('disabled by key')
        except Exception:
            logException('onKeyDown')

    def __onSettingsChanged(self):
        # Новые цвета, прозрачность или размер ячейки: квадраты и сетка создаются заново.
        try:
            if self.__isStarted:
                self.__highlighter.start()
        except Exception:
            logException('onSettingsChanged')

    @staticmethod
    def __isChatFocused():
        messengerGui = MessengerEntry.g_instance.gui
        return messengerGui is not None and messengerGui.isFocused()

    # --- тик ---

    def __tick(self):
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        try:
            self.__update()
        except Exception:
            self.__deactivate('error in tick')
            self.__logTickError()

    def __update(self):
        player = BigWorld.player()
        now = BigWorld.time()
        self.__highlighter.stats.frames += 1
        self.__updateStillness(player, now)
        reason, ctx = self.__findTarget(player)
        if ctx is None:
            self.__deactivate(reason)
        else:
            target, aimWorld, markerWorld, shellDir, team = ctx
            if self.__readySince is None:
                self.__readySince = now
            if now - self.__readySince < self.__settings.appearDelay:
                self.__hide('appear delay')
            else:
                sampleKey = self.__sampler.prepare(player, target, shellDir, self.__piercingMultiplier, team, self.__settings.gradientSteps)
                reason = self.__highlighter.frame(target, aimWorld, self.__sampler, sampleKey, markerWorld=markerWorld)
                self.__setInactiveReason(reason)
                self.__updateAimInfo(player, aimWorld if reason is None else None)
        self.__logStatsIfDue()

    def __updateAimInfo(self, player, aimWorld):
        # Подпись у прицела: шанс пробития в точке прицеливания текущим снарядом, с зажатым Alt — всеми снарядами
        # орудия, по строке на снаряд (номер, тип, шанс), текущий отмечен.
        highlighter = self.__highlighter
        if aimWorld is None or not self.__settings.aimInfo or highlighter.aimPx is None:
            self.__aimInfo.hide()
            return
        vDesc = player.getVehicleDescriptor()
        allShells = BigWorld.isKeyDown(Keys.KEY_LALT) or BigWorld.isKeyDown(Keys.KEY_RALT)
        shots = vDesc.gun.shots if allShells else (vDesc.shot,)
        results = self.__sampler.resultsAt(aimWorld, shots)
        if results is None:
            self.__aimInfo.hide()
            return
        if allShells:
            current = vDesc.activeGunShotIndex
            lines = [ u'%s%d %s  %s' % (u'> ' if idx == current else u'   ', idx + 1, penetration.SHELL_KINDS.get(shot.shell.kind, unicode(shot.shell.kind)), _resultText(*result) or u'—') for idx, (shot, result) in enumerate(zip(shots, results)) ]
            text = u'\n'.join(lines)
        else:
            text = _resultText(*results[0])
        if text is None:
            self.__aimInfo.hide()
            return
        self.__aimInfo.show(text, highlighter.aimPx, highlighter.screen)

    def __updateStillness(self, player, now):
        if player is None or not hasattr(player, 'getOwnVehicleSpeeds'):
            self.__stillSince = None
            return
        if abs(player.getOwnVehicleSpeeds()[0]) < config.stillSpeed:
            if self.__stillSince is None:
                self.__stillSince = now
        else:
            self.__stillSince = None

    def __findTarget(self, player):
        # Возвращает (причина, None) или (None, (цель, точка прицеливания на ней или None, центр прицела в мире,
        # направление снаряда, команда)).
        settings = self.__settings
        if not settings.enabled:
            return ('disabled in settings', None)
        if not self.__isEnabled:
            return ('disabled by key', None)
        if player is None or getattr(player, 'inputHandler', None) is None:
            return ('no avatar', None)
        if player.isObserver():
            return ('observer', None)
        if not player.isVehicleAlive:
            return ('own vehicle is dead', None)
        mode = player.inputHandler.ctrlModeName
        if mode not in _SNIPER_MODES and not (settings.showInArcade and mode in _ARCADE_MODES):
            self.__stickyTargetID = None
            return ('control mode %s' % mode, None)
        if not settings.showWhileMoving and self.__stillSince is None:
            return ('own vehicle is moving', None)
        state = self.__markerStates.get(self.__activeMarkerType())
        if state is None:
            return ('no gun marker state yet', None)
        position, direction, collision = state
        if getattr(direction, 'lengthSquared', 0.0) <= 0.0:
            return ('no shell direction', None)
        team = avatar_getter.getPlayerTeam(player)
        target = getattr(collision, 'entity', None)
        aimWorld = position
        if not self.__isEnemy(target, team):
            stickyID = self.__stickyTargetID
            target = BigWorld.entities.get(stickyID) if settings.stickyTarget and stickyID is not None else None
            aimWorld = None
            if not self.__isEnemy(target, team):
                self.__stickyTargetID = None
                return ('no enemy under the marker', None)
        self.__stickyTargetID = target.id
        shellDir = Math.Vector3(direction)
        shellDir.normalise()
        return (None, (target, aimWorld, position, shellDir, team))

    @staticmethod
    def __isEnemy(entity, team):
        # getattr: у уничтоженной сущности (танк ушёл из видимости) атрибуты недоступны — в 0.7.1 это была ошибка
        # в каждом тике до конца боя.
        return isinstance(entity, Vehicle) and getattr(entity, 'isStarted', False) and entity.health > 0 and entity.publicInfo['team'] != team

    def __activeMarkerType(self):
        # 2.5: серверный маркер, если он включён, иначе клиентский.
        if self.__gunMarkersFlags & _MARKER_FLAG.SERVER_MODE_ENABLED:
            return _MARKER_TYPE.SERVER
        return _MARKER_TYPE.CLIENT

    def __hide(self, reason):
        self.__highlighter.reset()
        self.__aimInfo.hide()
        self.__setInactiveReason(reason)

    def __deactivate(self, reason):
        self.__readySince = None
        if config.debug and self.__inactiveReason is None:
            # Сводка по сетке для ближайшей строки stats: после сброса её уже не посчитать.
            try:
                self.__lastSummary = self.__highlighter.describe()
            except Exception:
                logException('describe')

        self.__hide(reason)

    def __setInactiveReason(self, reason):
        if reason == self.__inactiveReason:
            return
        self.__inactiveReason = reason
        if config.debug:
            log('state: %s', 'active' if reason is None else 'inactive, ' + reason)

    # --- логирование ---

    __lastSummary = None

    def __logStatsIfDue(self):
        stats = self.__highlighter.stats
        now = timer()
        if now - stats.startedAt < config.statsInterval:
            return
        if config.debug and stats.activeFrames:
            summary = self.__highlighter.describe() or self.__lastSummary
            line = stats.line(now)
            if summary:
                line += ' | ' + summary
            sampler = self.__sampler
            if sampler is not None and sampler.checks:
                line += ' | vanilla check %d/%d ok' % (sampler.checks - sampler.mismatches, sampler.checks)
            log(line)
        self.__lastSummary = None
        stats.reset(now)

    def __logTickError(self):
        now = timer()
        if self.__lastErrorLogAt is not None and now - self.__lastErrorLogAt < config.errorLogInterval:
            self.__suppressedErrors += 1
            return
        self.__lastErrorLogAt = now
        if self.__suppressedErrors:
            log('%d more tick errors were not logged', self.__suppressedErrors)
            self.__suppressedErrors = 0
        logException('tick')
