# -*- coding: utf-8 -*-
# Предпросмотр в ангаре: та же подсветка на танке в ангаре с текущими настройками.
# Расчёт упрощённый (sampler.PreviewSampler): ванильный расчёт пробития в ангаре недоступен.
# Квадраты лежат под интерфейсом лобби (config.overlayDepth), поэтому видны только на самом танке.
import BigWorld
from helpers import dependency
from skeletons.gui.shared.utils import IHangarSpace

from gui.mods.armor_highlight import config, log, logException
from gui.mods.armor_highlight.highlighter import Highlighter, timer
from gui.mods.armor_highlight.sampler import PreviewSampler


class HangarPreview(object):
    __hangarSpace = dependency.descriptor(IHangarSpace)

    def __init__(self, settings):
        self.__settings = settings
        self.__highlighter = Highlighter(settings)
        self.__sampler = None
        self.__callbackID = None
        self.__state = None
        self.__lastErrorLogAt = None

    def start(self):
        self.stop()
        self.__sampler = PreviewSampler()
        self.__settings.addListener(self.__onSettingsChanged)
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        log('hangar preview started')

    def stop(self):
        if self.__callbackID is None:
            return
        BigWorld.cancelCallback(self.__callbackID)
        self.__callbackID = None
        self.__settings.removeListener(self.__onSettingsChanged)
        self.__highlighter.stop()
        self.__sampler = None
        self.__state = None
        log('hangar preview stopped')

    def __onSettingsChanged(self):
        try:
            if self.__highlighter.isStarted:
                self.__highlighter.start()
        except Exception:
            logException('preview.onSettingsChanged')

    def __tick(self):
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        try:
            self.__setState(self.__update())
        except Exception:
            self.__highlighter.reset()
            self.__setState('error')
            now = timer()
            if self.__lastErrorLogAt is None or now - self.__lastErrorLogAt >= config.errorLogInterval:
                self.__lastErrorLogAt = now
                logException('preview tick')

    def __update(self):
        settings = self.__settings
        if not settings.enabled or not settings.hangarPreview:
            self.__highlighter.stop()
            return 'disabled in settings'
        hangarSpace = self.__hangarSpace
        if not hangarSpace.inited or not hangarSpace.isModelLoaded:
            self.__highlighter.reset()
            return 'hangar is not ready'
        entity = hangarSpace.getVehicleEntity()
        appearance = getattr(entity, 'appearance', None)
        if entity is None or appearance is None or getattr(appearance, 'collisions', None) is None or entity.typeDescriptor is None:
            self.__highlighter.reset()
            return 'no vehicle in hangar'
        if not self.__highlighter.isStarted:
            self.__highlighter.start()
        sampleKey = self.__sampler.prepare(entity, settings.gradientSteps)
        return self.__highlighter.frame(entity, None, self.__sampler, sampleKey)

    def __setState(self, state):
        if state != self.__state:
            self.__state = state
            if config.debug:
                log('preview: %s', 'shown' if state is None else state)
