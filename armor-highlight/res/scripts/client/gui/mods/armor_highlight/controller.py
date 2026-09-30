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

from gui.mods.armor_highlight import config, geometry, log, logException, palette
from gui.mods.armor_highlight.lattice import Lattice
from gui.mods.armor_highlight.overlay import ALPHA_STEPS, Overlay
from gui.mods.armor_highlight.sampler import FrameRays, Sampler

_CTRL_MODE = aih_constants.CTRL_MODE_NAME
_MARKER_TYPE = aih_constants.GUN_MARKER_TYPE
_MARKER_FLAG = aih_constants.GUN_MARKER_FLAG
_SHOT_RESULT = aih_constants.SHOT_RESULT
_RESULT_NAMES = ((_SHOT_RESULT.GREAT_PIERCED, 'green'),
 (_SHOT_RESULT.LITTLE_PIERCED, 'yellow'),
 (_SHOT_RESULT.NOT_PIERCED, 'red'),
 (_SHOT_RESULT.UNDEFINED, 'undef'),
 (None, 'empty'))
# В Python 2 на Windows time.clock() — счётчик высокого разрешения, а time.time() шагает по ~15 мс.
_timer = time.clock if sys.platform == 'win32' else time.time


def _projectPx(viewProj, point, screenW, screenH):
    # Мировая точка -> пиксели от левого верхнего угла экрана, или None, если точка за камерой.
    clip = viewProj.applyV4Point(Math.Vector4(point.x, point.y, point.z, 1.0))
    if clip.w <= 0.0:
        return None
    return ((clip.x / clip.w + 1.0) * 0.5 * screenW, (1.0 - clip.y / clip.w) * 0.5 * screenH)


def _overlayTextures():
    # {результат: текстура}, {результат: (r, g, b)} или None — см. config.colourMode.
    if config.colourMode == 'tint':
        textures = dict(((kind, config.tintTexture) for kind in config.CELL_COLORS))
        tints = dict(((kind, palette.COLORS[name]) for kind, name in config.CELL_COLORS.iteritems()))
        return (textures, tints)
    textures = dict(((kind, palette.texturePath(name)) for kind, name in config.CELL_COLORS.iteritems()))
    return (textures, None)


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
        self.lattices = 0

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
        textures, tints = _overlayTextures()
        self.__overlay = Overlay(textures, tints, palette.OPACITY, config.fadeWithColour, config.overlayDepth, config.quadsPrecreated, config.quadsCreatePerFrame, config.quadsMaxPerColour)
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        log('started: toggle key %s, update %s, frame budget %.1f ms, cell %d px, max %d cells, colour mode %s, fade %s', config.toggleKey, 'every frame' if config.updateInterval <= 0.0 else '%.3f s' % config.updateInterval, config.frameBudgetMs, config.cellPx, config.maxSamples, config.colourMode, 'on' if self.__overlay.canFade else 'off')

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
        self.__lattice = None
        self.__lastSummary = None

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
        target, aimPos, shellDir, team = ctx
        viewProj = cameras.getViewProjectionMatrix()
        screenW, screenH = BigWorld.screenSize()[:2]
        aim = _projectPx(viewProj, aimPos, screenW, screenH)
        if aim is None:
            self.__deactivate('aim point is behind the camera')
            self.__logStatsIfDue()
            return
        fov = BigWorld.projection().fov
        rays = FrameRays()
        lattice, anchorWorld = self.__prepareLattice(target, aimPos, rays.origin, fov, (screenW, screenH))
        anchor = _projectPx(viewProj, anchorWorld, screenW, screenH)
        if anchor is None:
            self.__deactivate('anchor is behind the camera')
            self.__logStatsIfDue()
            return
        # Якорь округляется до пикселя: края ячеек ложатся на границы пикселей, без щелей и наложений.
        ax = int(round(anchor[0]))
        ay = int(round(anchor[1]))
        cell = float(lattice.cellPx)
        # 2.2. Область: круг сведения в ячейках относительно якоря
        dispAngle = player.gunRotator.getCurShotDispersionAngles()[0]
        ry = geometry.circleRadiusClip(dispAngle, fov, cameras.getScreenAspectRatio(), config.aimingCircleAdjustment, config.maxSizePercentOfWindow)[1]
        lattice.setView((aim[0] - ax) / cell - 0.5, (aim[1] - ay) / cell - 0.5, ry * screenH * 0.5 / cell)
        # 2.3. Расчёт ячеек в пределах бюджета кадра
        sx = 2.0 / screenW
        sy = 2.0 / screenH
        rayLength = (aimPos - rays.origin).length + 50.0
        playerVehicleID = player.playerVehicleID
        if config.debug:
            self.__sampler.checkSegmentDistOnce(rays, aim[0] * sx - 1.0, 1.0 - aim[1] * sy, rayLength, target, playerVehicleID)
        computeStart = _timer()
        budget = config.frameBudgetMs / 1000.0
        sample = self.__sampler.sample
        piercingMultiplier = self.__piercingMultiplier
        computed = 0
        while True:
            key = lattice.nextKey()
            if key is None:
                break
            i, j = key
            x = (ax + (i + 0.5) * cell) * sx - 1.0
            y = 1.0 - (ay + (j + 0.5) * cell) * sy
            lattice.store(key, sample(rays, x, y, rayLength, target, shellDir, playerVehicleID, team, piercingMultiplier))
            computed += 1
            if _timer() - computeStart >= budget:
                break

        renderStart = _timer()
        # 2.4. Прозрачность от сведения, если оверлей умеет её менять (см. config.fadeWithColour)
        alphaLevel = ALPHA_STEPS
        if self.__overlay.canFade:
            aimingFactor = geometry.aimFactor(player.getVehicleDescriptor().gun.shotDispersionAngle, dispAngle, config.fadeoffFactorWhenNotAimed)
            alphaLevel = geometry.quantize(aimingFactor, ALPHA_STEPS)
        if alphaLevel > 0:
            runs, changed = lattice.runs()
            self.__overlay.update(runs, ax, ay, lattice.cellPx, lattice.cellPx * lattice.step, screenW, screenH, alphaLevel, changed)
        else:
            self.__overlay.hide()
        self.__setInactiveReason(None)
        endTime = _timer()
        self.__stats.addActive(computed, renderStart - computeStart, endTime - renderStart)
        self.__logStatsIfDue()

    def __prepareLattice(self, target, aimPos, cameraPos, fov, screenSize):
        # Сетка живёт, пока цель, зум, разрешение и масштаб цели на экране прежние. Возвращает (сетка, якорь в мире).
        lattice = self.__lattice
        if lattice is not None and lattice.matches(target, fov, screenSize):
            anchorWorld = Math.Matrix(target.matrix).applyPoint(lattice.anchorLocal)
            if lattice.scaleDrift((anchorWorld - cameraPos).length) <= config.reanchorScaleChange:
                return (lattice, anchorWorld)
        # Якорь — точка прицеливания в системе координат цели: так он едет вместе с целью.
        toLocal = Math.Matrix(target.matrix)
        toLocal.invert()
        lattice = Lattice(target, toLocal.applyPoint(aimPos), (aimPos - cameraPos).length, fov, screenSize, config.cellPx, config.maxSamples, config.refineLevels, config.CELL_COLORS.keys())
        self.__lattice = lattice
        self.__stats.lattices += 1
        return (lattice, aimPos)

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
        if config.maxDistance > 0.0 and (position - player.getOwnVehiclePosition()).length > config.maxDistance:
            return ('target is farther than maxDistance', None)
        if self.__stillSince is None or now - self.__stillSince < config.appearDelay:
            return ('own vehicle is moving', None)
        if getattr(direction, 'lengthSquared', 0.0) <= 0.0:
            return ('no shell direction', None)
        shellDir = Math.Vector3(direction)
        shellDir.normalise()
        return (None, (target, position, shellDir, team))

    def __activeMarkerType(self):
        # 2.5: серверный маркер, если он включён, иначе клиентский.
        if self.__gunMarkersFlags & _MARKER_FLAG.SERVER_MODE_ENABLED:
            return _MARKER_TYPE.SERVER
        return _MARKER_TYPE.CLIENT

    def __deactivate(self, reason):
        if self.__lattice is not None:
            if config.debug:
                # Сводка по сетке для ближайшей строки stats: после сброса сетки её уже не посчитать.
                try:
                    self.__lastSummary = self.__describeLattice()
                except Exception:
                    logException('describeLattice')

            self.__lattice = None
        if self.__overlay is not None:
            self.__overlay.hide()
        self.__setInactiveReason(reason)

    def __setInactiveReason(self, reason):
        if reason == self.__inactiveReason:
            return
        self.__inactiveReason = reason
        if config.debug:
            log('state: %s', 'active' if reason is None else 'inactive, ' + reason)

    # --- логирование ---

    def __logStatsIfDue(self):
        stats = self.__stats
        now = _timer()
        if now - stats.startedAt < config.statsInterval:
            return
        if config.debug and stats.activeFrames:
            active = float(stats.activeFrames)
            line = 'stats %.1fs: frames=%d active=%d computed/frame=%.1f compute avg=%.2f max=%.2f ms, render avg=%.2f max=%.2f ms, new grids=%d' % (now - stats.startedAt,
             stats.frames,
             stats.activeFrames,
             stats.computed / active,
             stats.computeSum / active * 1000.0,
             stats.computeMax * 1000.0,
             stats.renderSum / active * 1000.0,
             stats.renderMax * 1000.0,
             stats.lattices)
            summary = self.__describeLattice() if self.__lattice is not None else self.__lastSummary
            if summary:
                line += ' | ' + summary
            log(line)
        self.__lastSummary = None
        stats.reset(now)

    def __describeLattice(self):
        lattice = self.__lattice
        if lattice is None or lattice.level is None:
            return None
        drawn, counts, pending = lattice.summary()
        parts = [ '%s=%d' % (name, counts.get(result, 0)) for result, name in _RESULT_NAMES ]
        return 'cell=%dpx cells=%d quads=%d %s pending=%d piercing=%s' % (lattice.cellPx * lattice.step,
         drawn,
         self.__overlay.shownCount if self.__overlay is not None else 0,
         ' '.join(parts),
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
