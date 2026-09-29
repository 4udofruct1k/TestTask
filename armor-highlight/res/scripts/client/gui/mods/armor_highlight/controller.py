# -*- coding: utf-8 -*-
# Подписки, условия активации (2.1), тик каждый кадр, клавиша вкл/выкл.
import sys
import time

import BigWorld
import Keys
import Math
import aih_constants
from AvatarInputHandler import aih_global_binding, cameras
from Vehicle import Vehicle
from gui import InputHandler
from gui.battle_control import avatar_getter
from gui.battle_control.battle_constants import FEEDBACK_EVENT_ID
from helpers import dependency
from messenger import MessengerEntry
from skeletons.gui.battle_session import IBattleSessionProvider

from gui.mods.armor_highlight import config, geometry, log, logException
from gui.mods.armor_highlight.overlay import Overlay
from gui.mods.armor_highlight.sampler import FrameRays, Sampler

_CTRL_MODE = aih_constants.CTRL_MODE_NAME
_MARKER_TYPE = aih_constants.GUN_MARKER_TYPE
_MARKER_FLAG = aih_constants.GUN_MARKER_FLAG
_SHOT_RESULT = aih_constants.SHOT_RESULT
_RESULT_NAMES = ((_SHOT_RESULT.GREAT_PIERCED, 'green'),
 (_SHOT_RESULT.LITTLE_PIERCED, 'yellow'),
 (_SHOT_RESULT.NOT_PIERCED, 'red'),
 (_SHOT_RESULT.UNDEFINED, 'undef'))
# В Python 2 на Windows time.clock() — счётчик высокого разрешения, а time.time() шагает по ~15 мс.
_timer = time.clock if sys.platform == 'win32' else time.time


class _Stats(object):
    # Сводка по времени и результатам для python.log раз в config.statsInterval секунд.

    def __init__(self):
        self.reset(_timer())

    def reset(self, now):
        self.startedAt = now
        self.frames = 0
        self.activeFrames = 0
        self.computed = 0
        self.computeSum = 0.0
        self.computeMax = 0.0
        self.renderSum = 0.0
        self.renderMax = 0.0

    def addFrame(self):
        self.frames += 1

    def addActive(self, computed, computeTime, renderTime):
        self.activeFrames += 1
        self.computed += computed
        self.computeSum += computeTime
        self.computeMax = max(self.computeMax, computeTime)
        self.renderSum += renderTime
        self.renderMax = max(self.renderMax, renderTime)


class ArmorHighlightController(object):
    __gunMarkersFlags = aih_global_binding.bindRO(aih_global_binding.BINDING_ID.GUN_MARKERS_FLAGS)
    __sessionProvider = dependency.descriptor(IBattleSessionProvider)

    def __init__(self):
        self.__isStarted = False
        self.__callbackID = None
        self.__overlay = None
        self.__sampler = None
        self.__crosshairCtrl = None
        self.__feedbackCtrl = None
        self.__toggleKey = getattr(Keys, config.toggleKey)
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
        self.__sampler = Sampler()
        self.__overlay = Overlay(config.cellTexture, config.overlayDepth, config.maxSamples)
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        log('started: toggle key %s, update %s, frame budget %.1f ms', config.toggleKey, 'every frame' if config.updateInterval <= 0.0 else '%.3f s' % config.updateInterval, config.frameBudgetMs)

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
        if self.__overlay is not None:
            self.__overlay.destroy()
            self.__overlay = None
        self.__sampler = None
        self.__resetBattleState()
        log('stopped')

    def __resetBattleState(self):
        self.__markerStates = {}
        self.__piercingMultiplier = 1
        self.__isEnabled = True
        self.__stillSince = None
        self.__inactiveReason = 'starting'
        self.__stats = _Stats()
        self.__lastErrorLogAt = None
        self.__suppressedErrors = 0
        self.__resetSamples(None)

    def __resetSamples(self, target):
        self.__target = target
        self.__samples = {}
        self.__cursor = 0

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
            if event.key != self.__toggleKey:
                return
            if event.isCtrlDown() or event.isAltDown() or event.isShiftDown():
                return
            if self.__isChatFocused():
                return
            self.__isEnabled = not self.__isEnabled
            log('highlight %s by key', 'enabled' if self.__isEnabled else 'disabled')
            if not self.__isEnabled:
                self.__deactivate('disabled by key')
        except Exception:
            logException('onKeyDown')

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
        self.__stats.addFrame()
        self.__updateStillness(player, now)
        reason, ctx = self.__findTarget(player, now)
        if ctx is None:
            self.__deactivate(reason)
            self.__logStatsIfDue()
            return
        target, aimPos, shellDir, dist, team = ctx
        viewProj = cameras.getViewProjectionMatrix()
        center = viewProj.applyV4Point(Math.Vector4(aimPos.x, aimPos.y, aimPos.z, 1.0))
        if center.w <= 0.0:
            self.__deactivate('aim point is behind the camera')
            self.__logStatsIfDue()
            return
        if target is not self.__target:
            self.__resetSamples(target)
        cx = center.x / center.w
        cy = center.y / center.w
        # 2.2. Область и сетка
        screenW, screenH = BigWorld.screenSize()[:2]
        dispAngle = player.gunRotator.getCurShotDispersionAngles()[0]
        rx, ry = geometry.circleRadiusClip(dispAngle, BigWorld.projection().fov, cameras.getScreenAspectRatio(), config.aimingCircleAdjustment, config.maxSizePercentOfWindow)
        baseStepX = 2.0 * config.cellPx / screenW
        baseStepY = 2.0 * config.cellPx / screenH
        stepScale, offsets = geometry.buildGrid(rx, ry, baseStepX, baseStepY, config.maxSamples)
        stepX = baseStepX * stepScale
        stepY = baseStepY * stepScale
        # 2.3. Расчёт точек в пределах бюджета кадра
        rays = FrameRays()
        rayLength = (aimPos - rays.origin).length + 50.0
        playerVehicleID = player.playerVehicleID
        if config.debug:
            self.__sampler.checkSegmentDistOnce(rays, cx, cy, rayLength, target, playerVehicleID)
        computeStart = _timer()
        budget = config.frameBudgetMs / 1000.0
        samples = self.__samples
        sample = self.__sampler.sample
        piercingMultiplier = self.__piercingMultiplier
        count = len(offsets)
        cursor = self.__cursor % count
        computed = 0
        while computed < count:
            i, j = offsets[cursor]
            samples[i, j] = sample(rays, cx + i * stepX, cy + j * stepY, rayLength, target, shellDir, playerVehicleID, team, piercingMultiplier)
            cursor = (cursor + 1) % count
            computed += 1
            if _timer() - computeStart >= budget:
                break

        self.__cursor = cursor
        renderStart = _timer()
        # 2.4. Цвета и прозрачность; квадраты ставятся по мировым точкам, спроецированным в этом кадре
        aimingFactor = geometry.aimFactor(player.getVehicleDescriptor().gun.shotDispersionAngle, dispAngle, config.fadeoffFactorWhenNotAimed)
        alpha = geometry.alphaByte(config.opacity, geometry.alphaByDist(dist, config.alphaFullDist, config.alphaZeroDist), aimingFactor)
        items = []
        if alpha > 0:
            colours = dict(((result, rgb + (alpha,)) for result, rgb in config.COLORS.iteritems()))
            cellSize = int(round(config.cellPx * stepScale))
            limitX = rx + stepX * 0.5
            limitY = ry + stepY * 0.5
            isInside = geometry.isInsideEllipse
            for key in offsets:
                item = samples.get(key)
                if item is None:
                    continue
                point, result = item
                colour = colours.get(result)
                if colour is None:
                    continue
                clip = viewProj.applyV4Point(Math.Vector4(point.x, point.y, point.z, 1.0))
                if clip.w <= 0.0:
                    continue
                x = clip.x / clip.w
                y = clip.y / clip.w
                if isInside(x - cx, y - cy, limitX, limitY):
                    items.append((x, y, cellSize, colour))

        self.__overlay.update(items)
        self.__setInactiveReason(None)
        endTime = _timer()
        self.__stats.addActive(computed, renderStart - computeStart, endTime - renderStart)
        self.__logStatsIfDue(offsets, stepScale)

    def __updateStillness(self, player, now):
        if player is None or not hasattr(player, 'getOwnVehicleSpeeds'):
            self.__stillSince = None
            return
        if abs(player.getOwnVehicleSpeeds()[0]) < config.stillSpeed:
            if self.__stillSince is None:
                self.__stillSince = now
        else:
            self.__stillSince = None

    def __findTarget(self, player, now):
        # Условия 2.1. Возвращает (причина неактивности, None) или (None, контекст).
        if not self.__isEnabled:
            return ('disabled by key', None)
        if player is None or getattr(player, 'inputHandler', None) is None:
            return ('no avatar', None)
        if player.isObserver():
            return ('observer', None)
        if not player.isVehicleAlive:
            return ('own vehicle is dead', None)
        if player.inputHandler.ctrlModeName != _CTRL_MODE.SNIPER:
            return ('not in sniper mode', None)
        if getattr(player, 'gunRotator', None) is None:
            return ('no gun rotator', None)
        state = self.__markerStates.get(self.__activeMarkerType())
        if state is None:
            return ('no gun marker state yet', None)
        position, direction, collision = state
        target = getattr(collision, 'entity', None)
        if not isinstance(target, Vehicle) or not target.isStarted or target.health <= 0:
            return ('no live vehicle under the marker', None)
        team = avatar_getter.getPlayerTeam(player)
        if target.publicInfo['team'] == team:
            return ('ally under the marker', None)
        dist = (position - player.getOwnVehiclePosition()).length
        if dist > config.maxDistance:
            return ('target is farther than maxDistance', None)
        if self.__stillSince is None or now - self.__stillSince < config.appearDelay:
            return ('own vehicle is moving', None)
        if getattr(direction, 'lengthSquared', 0.0) <= 0.0:
            return ('no shell direction', None)
        shellDir = Math.Vector3(direction)
        shellDir.normalise()
        return (None, (target, position, shellDir, dist, team))

    def __activeMarkerType(self):
        # 2.5: серверный маркер, если он включён, иначе клиентский.
        if self.__gunMarkersFlags & _MARKER_FLAG.SERVER_MODE_ENABLED:
            return _MARKER_TYPE.SERVER
        return _MARKER_TYPE.CLIENT

    def __deactivate(self, reason):
        if self.__overlay is not None:
            self.__overlay.hide()
        if self.__target is not None:
            self.__resetSamples(None)
        self.__setInactiveReason(reason)

    def __setInactiveReason(self, reason):
        if reason == self.__inactiveReason:
            return
        self.__inactiveReason = reason
        if config.debug:
            log('state: %s', 'active' if reason is None else 'inactive, ' + reason)

    # --- логирование ---

    def __logStatsIfDue(self, offsets=None, stepScale=1.0):
        stats = self.__stats
        now = _timer()
        if now - stats.startedAt < config.statsInterval:
            return
        if config.debug and stats.activeFrames:
            active = float(stats.activeFrames)
            line = 'stats %.1fs: frames=%d active=%d computed/frame=%.1f compute avg=%.2f max=%.2f ms, render avg=%.2f max=%.2f ms' % (now - stats.startedAt,
             stats.frames,
             stats.activeFrames,
             stats.computed / active,
             stats.computeSum / active * 1000.0,
             stats.computeMax * 1000.0,
             stats.renderSum / active * 1000.0,
             stats.renderMax * 1000.0)
            if offsets is not None:
                line += ' | ' + self.__describeSamples(offsets, stepScale)
            log(line)
        stats.reset(now)

    def __describeSamples(self, offsets, stepScale):
        counts = dict(((result, 0) for result, _ in _RESULT_NAMES))
        empty = pending = 0
        for key in offsets:
            if key not in self.__samples:
                pending += 1
                continue
            item = self.__samples[key]
            if item is None:
                empty += 1
            else:
                counts[item[1]] = counts.get(item[1], 0) + 1

        parts = [ '%s=%d' % (name, counts.get(result, 0)) for result, name in _RESULT_NAMES ]
        return 'grid=%d cell=%dpx %s empty=%d pending=%d piercing=%s' % (len(offsets),
         int(round(config.cellPx * stepScale)),
         ' '.join(parts),
         empty,
         pending,
         self.__piercingMultiplier)

    def __logTickError(self):
        now = _timer()
        if self.__lastErrorLogAt is not None and now - self.__lastErrorLogAt < config.errorLogInterval:
            self.__suppressedErrors += 1
            return
        self.__lastErrorLogAt = now
        if self.__suppressedErrors:
            log('%d more tick errors were not logged', self.__suppressedErrors)
            self.__suppressedErrors = 0
        logException('tick')
