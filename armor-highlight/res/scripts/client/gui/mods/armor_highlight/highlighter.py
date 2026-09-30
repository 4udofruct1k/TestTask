# -*- coding: utf-8 -*-
# Кадр подсветки одной цели: сетка на её габаритах, расчёт ячеек в бюджете кадра, отрисовка.
# Общий для боя (controller.py) и предпросмотра в ангаре (preview.py) — они отличаются выбором цели и расчётом.
import math
import sys
import time

import BigWorld
import GUI
import Math
from AvatarInputHandler import cameras
from vehicle_systems.tankStructure import TankPartIndexes

from gui.mods.armor_highlight import config, log, palette
from gui.mods.armor_highlight.lattice import BUSY, Lattice
from gui.mods.armor_highlight.overlay import Overlay
from gui.mods.armor_highlight.sampler import RAY_EXTRA_LENGTH, FrameRays
from gui.mods.armor_highlight.window import AimWindow

# В Python 2 на Windows time.clock() — счётчик высокого разрешения, а time.time() шагает по ~15 мс.
timer = time.clock if sys.platform == 'win32' else time.time
_UNIT_CORNERS = tuple(((x, y, z) for x in (0.0, 1.0) for y in (0.0, 1.0) for z in (0.0, 1.0)))
_POSE_CORNERS = ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
_WHITE_TEXTURE = 'system/maps/col_white.dds'
# Проверка сетки: годится, цель на экране чуть сдвинулась, нужна новая (другая цель, снаряд, зум, экран).
_OK, _DRIFT, _RESET = range(3)
_FULL_PASS_MODES = ('background', 'blocking')


def buildPaints(settings):
    # {уровень градиента: (текстура, colour или None)} и id текстур в памяти.
    steps = settings.gradientSteps
    full, half, zero = settings.colours()
    opacity = settings.opacity
    mode = settings.colourMode
    paints = {}
    memory = []
    for level, rgb in enumerate(palette.gradient(steps, full, half, zero)):
        if mode == 'texture':
            paints[level] = (palette.texturePath(palette.nearestColour(rgb), palette.nearestOpacity(opacity)), None)
        elif mode == 'memory':
            alpha = palette.roundHalfUp(255 * opacity / 100.0)
            textureID = 'armor_highlight_%02x%02x%02x%02x' % (rgb + (alpha,))
            BigWorld.addScaleformTexture(textureID, palette.png(rgb + (alpha,)))
            memory.append(textureID)
            paints[level] = ('img://' + textureID, None)
        elif mode == 'tint255':
            paints[level] = (_WHITE_TEXTURE, (float(rgb[0]), float(rgb[1]), float(rgb[2]), 255.0 * opacity / 100.0))
        else:
            paints[level] = (_WHITE_TEXTURE, (rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0, opacity / 100.0))

    return (paints, memory)


_resolutionLogged = [False]


def screenResolution():
    # Сетка пикселей — разрешение GUI, как в клиенте (helpers/gui_utils.pixToClipVector2).
    # Один раз пишем в лог и BigWorld.screenSize(): в 0.4.0 размеры в пикселях не совпали с экраном.
    width, height = GUI.screenResolution()[:2]
    if not _resolutionLogged[0]:
        _resolutionLogged[0] = True
        log('screen: GUI.screenResolution=%s, BigWorld.screenSize=%s', (width, height), tuple(BigWorld.screenSize()[:2]))
    return (float(width), float(height))


def _project(viewProj, point, screenW, screenH):
    # Мировая точка -> пиксели от левого верхнего угла экрана, или None, если точка за камерой.
    clip = viewProj.applyV4Point(Math.Vector4(point.x, point.y, point.z, 1.0))
    if clip.w <= 0.0:
        return None
    return ((clip.x / clip.w + 1.0) * 0.5 * screenW, (1.0 - clip.y / clip.w) * 0.5 * screenH)


class Stats(object):

    def __init__(self):
        self.reset(timer())

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

    def addActive(self, computed, computeTime, renderTime):
        self.activeFrames += 1
        self.computed += computed
        self.computeSum += computeTime
        self.computeMax = max(self.computeMax, computeTime)
        self.renderSum += renderTime
        self.renderMax = max(self.renderMax, renderTime)

    def line(self, now):
        active = float(max(1, self.activeFrames))
        return 'stats %.1fs: frames=%d active=%d computed/frame=%.1f (%.0f us per cell) compute avg=%.2f max=%.2f ms, render avg=%.2f max=%.2f ms, new grids=%d' % (now - self.startedAt,
         self.frames,
         self.activeFrames,
         self.computed / active,
         self.computeSum * 1000000.0 / max(1, self.computed),
         self.computeSum / active * 1000.0,
         self.computeMax * 1000.0,
         self.renderSum / active * 1000.0,
         self.renderMax * 1000.0,
         self.lattices)


class Highlighter(object):

    def __init__(self, settings, preview=False):
        # preview — режим просмотра в ангаре: там свой бюджет расчёта на кадр.
        self.__settings = settings
        self.__preview = preview
        self.__overlay = None
        self.__lattice = None
        self.__shown = None
        self.stats = Stats()
        # Последний кадр: якорь в пикселях, лучи камеры и длина луча — для точечного расчёта под курсором.
        self.anchor = None
        self.rays = None
        self.rayLength = 0.0

    def start(self):
        self.stop()
        paints, memory = buildPaints(self.__settings)
        self.__overlay = Overlay(paints, config.overlayDepth, config.quadsCreatePerFrame, config.quadsMax, memory)

    def stop(self):
        if self.__overlay is not None:
            self.__overlay.destroy()
            self.__overlay = None
        self.__lattice = None
        self.__shown = None

    @property
    def isStarted(self):
        return self.__overlay is not None

    def reset(self):
        # Скрыть подсветку и забыть сетку.
        if self.__overlay is not None:
            self.__overlay.hide()
        self.__lattice = None
        self.__shown = None

    def frame(self, target, aimWorld, sampler, sampleKey, aimScreen=None, markerWorld=None):
        # Один кадр для цели target (Vehicle в бою или танк в ангаре). aimWorld — точка прицеливания на цели
        # или None; markerWorld — центр прицела в мире, даже если он не на цели; aimScreen — центр прицела
        # в пикселях экрана (курсор в режиме просмотра) или None.
        # sampler.sample(start, end) считает ячейку. Возвращает None или причину, почему не рисуем.
        settings = self.__settings
        model = getattr(target, 'model', None)
        if model is None:
            return 'target has no model'
        screenW, screenH = screenResolution()
        viewProj = cameras.getViewProjectionMatrix()
        fov = BigWorld.projection().fov
        rays = FrameRays()
        cameraPos = rays.origin
        targetMatrix = Math.Matrix(target.matrix)
        toLocal = Math.Matrix(targetMatrix)
        toLocal.invert()
        bounds = [ Math.Matrix(model.getBoundsForPart(idx)) for idx in TankPartIndexes.ALL ]
        pose = [ toLocal.applyPoint(box.applyPoint(corner)) for box in bounds for corner in _POSE_CORNERS ]
        pxPerRadian = screenH * 0.5 / math.tan(fov * 0.5)
        aimPx = aimScreen
        if aimPx is None:
            aimPoint = markerWorld if markerWorld is not None else aimWorld
            aimPx = _project(viewProj, aimPoint, screenW, screenH) if aimPoint is not None else None
        lattice = self.__lattice
        anchorWorld = None
        if lattice is not None:
            anchorWorld = targetMatrix.applyPoint(lattice.anchorLocal)
            check = self.__check(lattice, target, sampleKey, (screenW, screenH), fov, pose, toLocal, anchorWorld, cameraPos, pxPerRadian)
            if check == _DRIFT and lattice.window:
                # Область у прицела: картинка остаётся, область пересчитывается от центра наружу.
                anchor = _project(viewProj, anchorWorld, screenW, screenH)
                area = self.__targetArea(bounds, viewProj, screenW, screenH, anchor) if anchor is not None else None
                if area is None:
                    lattice = None
                else:
                    lattice.refresh(area[0])
                    self.__setReference(lattice, pose, toLocal, anchorWorld, cameraPos, area[1])
            elif check == _RESET or check == _DRIFT and lattice.done:
                lattice = None
            # Сдвиг цели, пока сетка всей цели не досчитана: досчитываем её, новую — потом. В 0.6.0 сетка
            # начиналась заново от каждого сдвига на пиксель и на движущейся цели не доходила до картинки.
        if lattice is None:
            lattice, anchorWorld = self.__createLattice(target, aimWorld, aimPx, sampleKey, (screenW, screenH), fov, pose, bounds, toLocal, targetMatrix, viewProj, cameraPos)
            if lattice is None:
                self.__hide()
                return 'target is off screen'
        anchor = _project(viewProj, anchorWorld, screenW, screenH)
        if anchor is None:
            self.__hide()
            return 'target is behind the camera'
        # Якорь округляется до пикселя: края ячеек ложатся на границы пикселей, без щелей и наложений.
        ax = int(math.floor(anchor[0] + 0.5))
        ay = int(math.floor(anchor[1] + 0.5))
        if aimPx is not None:
            lattice.setAim((aimPx[0] - ax, aimPx[1] - ay))
        self.anchor = (ax, ay)
        self.rays = rays
        self.rayLength = (anchorWorld - cameraPos).length + RAY_EXTRA_LENGTH
        computeStart = timer()
        # Вся цель, каждая ячейка: «за один кадр» — без бюджета (игра замирает), «в фоне» — не меньше 25 мс.
        mode = lattice.mode
        budget = settings.previewFrameBudget if self.__preview else settings.frameBudget
        if mode == 'blocking':
            budget = config.fullPassMaxSeconds
        elif mode == 'background':
            budget = max(budget, config.fullPassFrameBudget)
        wasDone = lattice.done
        computed = self.__compute(lattice, sampler, rays, ax, ay, screenW, screenH, (anchorWorld - cameraPos).length + RAY_EXTRA_LENGTH, budget)
        if mode in _FULL_PASS_MODES and not wasDone:
            lattice.fullPassCells += computed
            lattice.fullPassTime += timer() - computeStart
            if lattice.done and config.debug:
                log('full pass (%s): %d cells in %.2f s of compute, %.1f us per cell', mode, lattice.fullPassCells, lattice.fullPassTime, lattice.fullPassTime * 1000000.0 / max(1, lattice.fullPassCells))
        renderStart = timer()
        # Новая сетка показывается сразу, если старой картинки этой цели нет; иначе — когда готова её основная часть.
        # Вся цель «в фоне» показывается только целиком. Область у прицела показывается всегда.
        shown = self.__shown
        ready = lattice.done if mode == 'background' else lattice.hasPicture
        if ready or (mode != 'background' and (shown is None or shown.target is not target)):
            shown = lattice
        if shown is None or shown.target is not target:
            self.__hide()
        else:
            self.__shown = shown
            rects, changed = shown.rects()
            # Кроме уточняемой сетки всей цели, квадраты создаются без ограничения на кадр: картинка сразу целиком.
            self.__overlay.update(rects, changed, ax, ay, screenW, screenH, config.quadsMax if shown.mode != 'adaptive' else None)
        self.stats.addActive(computed, renderStart - computeStart, timer() - renderStart)
        return None

    def __hide(self):
        if self.__overlay is not None:
            self.__overlay.hide()

    def __check(self, lattice, target, sampleKey, screen, fov, pose, toLocal, anchorWorld, cameraPos, pxPerRadian):
        if lattice.stale or lattice.target is not target or lattice.sampleKey != sampleKey or lattice.screen != screen:
            return _RESET
        if abs(fov - lattice.fov) > 1e-4 * abs(lattice.fov):
            return _RESET
        toCamera = cameraPos - anchorWorld
        dist = toCamera.length
        if dist <= 0.0:
            return _RESET
        pxPerMeter = pxPerRadian / dist
        # Сдвиг картинки в пикселях. Башня, орудие, корпус: сдвиг габаритов в системе координат цели.
        drift = max(((new - old).length for old, new in zip(lattice.pose, pose))) * pxPerMeter
        # Камера: угол и дистанция, под которыми видна цель.
        direction = toLocal.applyVector(toCamera)
        direction.normalise()
        cosine = max(-1.0, min(1.0, direction.dot(lattice.cameraDir)))
        drift = max(drift, math.acos(cosine) * lattice.radiusPx, abs(dist / lattice.cameraDist - 1.0) * lattice.radiusPx)
        if drift <= lattice.tolerancePx:
            return _OK
        # Резкий сдвиг: прежняя картинка уже не похожа на цель, строим заново.
        if drift > config.resetDriftPx:
            return _RESET
        return _DRIFT

    @staticmethod
    def __targetArea(bounds, viewProj, screenW, screenH, anchor):
        # Габариты цели на экране в пикселях от якоря и половина их диагонали, или None, если цели не видно.
        ax = int(math.floor(anchor[0] + 0.5))
        ay = int(math.floor(anchor[1] + 0.5))
        points = []
        for box in bounds:
            for corner in _UNIT_CORNERS:
                point = _project(viewProj, box.applyPoint(corner), screenW, screenH)
                if point is not None:
                    points.append(point)

        if not points:
            return None
        margin = config.areaMarginPx
        x0 = max(0, int(math.floor(min((p[0] for p in points)))) - margin)
        y0 = max(0, int(math.floor(min((p[1] for p in points)))) - margin)
        x1 = min(int(screenW), int(math.ceil(max((p[0] for p in points)))) + margin)
        y1 = min(int(screenH), int(math.ceil(max((p[1] for p in points)))) + margin)
        if x1 <= x0 or y1 <= y0:
            return None
        return ((x0 - ax, y0 - ay, x1 - ax, y1 - ay), 0.5 * math.hypot(x1 - x0, y1 - y0))

    @staticmethod
    def __setReference(lattice, pose, toLocal, anchorWorld, cameraPos, radiusPx):
        # Положение цели и камеры, от которого считается сдвиг картинки.
        toCamera = cameraPos - anchorWorld
        cameraDir = toLocal.applyVector(toCamera)
        cameraDir.normalise()
        lattice.pose = pose
        lattice.cameraDir = cameraDir
        lattice.cameraDist = toCamera.length
        lattice.radiusPx = radiusPx

    def __createLattice(self, target, aimWorld, aimPx, sampleKey, screen, fov, pose, bounds, toLocal, targetMatrix, viewProj, cameraPos):
        # Якорь: прежний, если цель та же (картинка не прыгает), иначе точка прицеливания или центр корпуса.
        previous = self.__lattice or self.__shown
        if previous is not None and previous.target is target:
            anchorLocal = previous.anchorLocal
        elif aimWorld is not None:
            anchorLocal = toLocal.applyPoint(aimWorld)
        else:
            anchorLocal = toLocal.applyPoint(bounds[TankPartIndexes.HULL].applyPoint((0.5, 0.5, 0.5)))
        anchorWorld = targetMatrix.applyPoint(anchorLocal)
        screenW, screenH = screen
        anchor = _project(viewProj, anchorWorld, screenW, screenH)
        if anchor is None:
            return (None, None)
        targetArea = self.__targetArea(bounds, viewProj, screenW, screenH, anchor)
        if targetArea is None:
            return (None, None)
        area, radiusPx = targetArea
        ax = int(math.floor(anchor[0] + 0.5))
        ay = int(math.floor(anchor[1] + 0.5))
        aim = (aimPx[0] - ax, aimPx[1] - ay) if aimPx is not None else ((area[0] + area[2]) * 0.5, (area[1] + area[3]) * 0.5)
        settings = self.__settings
        mode = settings.mode
        drawable = range(settings.gradientSteps)
        if mode == 'aim':
            lattice = AimWindow(area, settings.cellLevel, drawable, aim, settings.aimRadius)
            lattice.tolerancePx = config.rebuildTolerancePx
        else:
            fullPass = mode in _FULL_PASS_MODES
            lattice = Lattice(area, settings.cellLevel, config.uniformMax, config.maxRows, drawable, aim, settings.searchLevel, settings.focusRadius, fullPass)
            lattice.tolerancePx = config.rebuildTolerancePxFullPass if fullPass else config.rebuildTolerancePx
        lattice.mode = mode
        lattice.window = mode == 'aim'
        lattice.target = target
        lattice.fullPassCells = 0
        lattice.fullPassTime = 0.0
        lattice.anchorLocal = anchorLocal
        lattice.sampleKey = sampleKey
        lattice.screen = screen
        lattice.fov = fov
        self.__setReference(lattice, pose, toLocal, anchorWorld, cameraPos, radiusPx)
        self.__lattice = lattice
        self.stats.lattices += 1
        return (lattice, anchorWorld)

    def __compute(self, lattice, sampler, rays, ax, ay, screenW, screenH, rayLength, budget):
        sx = 2.0 / screenW
        sy = 2.0 / screenH
        start = timer()
        computed = 0
        probes = config.probesPerFrame
        sample = sampler.sample
        getRay = rays.get
        while True:
            key = lattice.nextKey()
            if key is BUSY:
                if timer() - start >= budget:
                    break
                continue
            if key is None:
                # Сетка готова: перепроверяем по одному однородному блоку, не изменилась ли цель.
                if probes <= 0:
                    break
                probes -= 1
                probe = lattice.probe()
                if probe is None:
                    break
                x, y, expected = probe
                ray, point = getRay((ax + x) * sx - 1.0, 1.0 - (ay + y) * sy)
                if sample(point, point + ray.scale(rayLength)) != expected:
                    lattice.stale = True
                    break
                computed += 1
                continue
            i, j = key
            ray, point = getRay((ax + i + 0.5) * sx - 1.0, 1.0 - (ay + j + 0.5) * sy)
            lattice.store(key, sample(point, point + ray.scale(rayLength)))
            computed += 1
            if timer() - start >= budget:
                break

        return computed

    def describe(self):
        # Для строки статистики.
        lattice = self.__lattice
        if lattice is None:
            return None
        overlay = self.__overlay
        return '%s quads=%d/%d' % (lattice.summary(), overlay.shownCount if overlay is not None else 0, overlay.quadCount if overlay is not None else 0)
