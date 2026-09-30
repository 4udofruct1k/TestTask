# -*- coding: utf-8 -*-
# Точка экрана -> луч -> коллизия с учётом статики -> ванильный расчёт пробития. Раздел 2.3.
import math

import BigWorld
import Math
from AvatarInputHandler import cameras
from AvatarInputHandler.gun_marker_ctrl import createShotResultResolver
from ProjectileMover import collideDynamicAndStatic

from gui.mods.armor_highlight import log

# Запас длины луча за точкой прицеливания, м.
_RAY_EXTRA_LENGTH = 50.0


class FrameRays(object):
    # То же, что cameras.getWorldRayAndPoint(x, y), но проекция и матрица камеры
    # читаются один раз за кадр, а не для каждой из сотен точек.

    def __init__(self):
        proj = BigWorld.projection()
        self.__near = proj.nearPlane
        self.__yLength = self.__near * math.tan(proj.fov * 0.5)
        self.__xLength = self.__yLength * cameras.getScreenAspectRatio()
        self.__inv = Math.Matrix(BigWorld.camera().invViewMatrix)
        self.origin = self.__inv.translation

    def get(self, x, y):
        point = Math.Vector3(self.__xLength * x, self.__yLength * y, self.__near)
        ray = self.__inv.applyVector(point)
        ray.normalise()
        return (ray, self.__inv.applyPoint(point))


class Sampler(object):

    def __init__(self):
        # Ванильный индикатор берёт расчёт так же; фабрика возвращает _CrosshairShotResults.
        self.__resolver = createShotResultResolver()
        self.__segmentDistChecked = False

    def sample(self, rays, x, y, rayLength, target, shellDir, playerVehicleID, team, piercingMultiplier):
        # Возвращает SHOT_RESULT или None, если в точке нет цели (укрытие, промах мимо цели).
        ray, start = rays.get(x, y)
        end = start + ray.scale(rayLength)
        res = collideDynamicAndStatic(start, end, (playerVehicleID,))
        if res is None or res[1] is None or res[1].entity is not target:
            return None
        hitPoint, collData = res
        return self.__resolver.getShotResult(hitPoint, collData, shellDir, excludeTeam=team, piercingMultiplier=piercingMultiplier)

    def checkSegmentDistOnce(self, rays, x, y, rayLength, target, playerVehicleID):
        # Фаза 1: один раз за бой сверить, что dist в collideSegmentExt — метры от startPoint.
        if self.__segmentDistChecked:
            return
        ray, start = rays.get(x, y)
        end = start + ray.scale(rayLength)
        res = collideDynamicAndStatic(start, end, (playerVehicleID,))
        if res is None or res[1] is None or res[1].entity is not target:
            return
        self.__segmentDistChecked = True
        details = target.collideSegmentExt(start, end)
        if not details:
            log('segment dist check: collideSegmentExt returned nothing')
            return
        log('segment dist check: collideSegmentExt dist=%.3f, (hitPoint - start).length=%.3f, layers=%d', details[0].dist, (res[0] - start).length, len(details))
