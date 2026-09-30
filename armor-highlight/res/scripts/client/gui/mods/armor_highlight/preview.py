# -*- coding: utf-8 -*-
# Режим просмотра в ангаре. Пункт «Подсветка брони: просмотр» в списке модов (ModsList API) включает и выключает его.
# Цель — танк в ангаре (свой или открытый в предпросмотре из дерева исследований). Стрелок — выбранный в карусели
# танк: его орудия и снаряды перебираются клавишами. Курсор мыши — точка прицеливания: уточнение идёт от него,
# в подсказке пишется шанс пробития под курсором.
# Клавиши: 1–4 — снаряд, G — следующее орудие, «-» и «=» — дистанция.
# Расчёт упрощённый (sampler.PreviewSampler): ванильный расчёт пробития в ангаре недоступен.
import BigWorld
import GUI
import Keys
from gui import InputHandler
from helpers import dependency
from messenger import MessengerEntry
from skeletons.gui.shared.utils import IHangarSpace

from gui.mods.armor_highlight import config, log, logException, palette
from gui.mods.armor_highlight.highlighter import Highlighter, screenResolution, timer
from gui.mods.armor_highlight.penetration import UNDEFINED
from gui.mods.armor_highlight.sampler import PreviewSampler

MODS_LIST_ID = 'max.armor_highlight.view'
DISTANCE_DEFAULT = 100
DISTANCE_STEP = 50
DISTANCE_MAX = 700
_SHELL_KEYS = {Keys.KEY_1: 0,
 Keys.KEY_2: 1,
 Keys.KEY_3: 2,
 Keys.KEY_4: 3}
_SHELL_KINDS = {'ARMOR_PIERCING': u'ББ',
 'ARMOR_PIERCING_CR': u'БП',
 'ARMOR_PIERCING_FSDS': u'БОПС',
 'ARMOR_PIERCING_HE': u'ББ-ОФ',
 'HOLLOW_CHARGE': u'КС',
 'HIGH_EXPLOSIVE': u'ОФ',
 'FLAME': u'огнесмесь'}
# Подсказка лежит перед интерфейсом лобби (0.5), квадраты подсветки — за ним (config.overlayDepth).
_TEXT_DEPTH = 0.45
_TEXT_POSITION = (-0.97, 0.5)


def _unicode(value):
    if isinstance(value, unicode):
        return value
    return str(value).decode('utf-8', 'replace')


def _guns(vDesc):
    # Все орудия всех башен танка, без повторов. Установленное — первым не ставим: порядок как в описании танка.
    guns = []
    seen = set()
    for turret in vDesc.type.turrets[0]:
        for gun in turret.guns:
            if gun.compactDescr not in seen:
                seen.add(gun.compactDescr)
                guns.append(gun)

    return guns or [vDesc.gun]


class ViewMode(object):
    __hangarSpace = dependency.descriptor(IHangarSpace)

    def __init__(self, settings):
        self.__settings = settings
        self.__highlighter = Highlighter(settings)
        self.__sampler = None
        self.__callbackID = None
        self.__inLobby = False
        self.__text = None
        self.__textValue = None
        self.__state = None
        self.__lastErrorLogAt = None
        self.__shooterKey = None
        self.__selection = None
        self.__gunIdx = 0
        self.__shellIdx = 0
        self.__distance = DISTANCE_DEFAULT

    @property
    def isActive(self):
        return self.__callbackID is not None

    def register(self):
        # Пункт в списке модов. Без ModsList API режим недоступен, остальное работает.
        try:
            from gui.modsListApi import g_modsListApi
        except ImportError:
            log('ModsList API not found, view mode is unavailable')
            return

        g_modsListApi.addModification(id=MODS_LIST_ID, name='Подсветка брони: просмотр', description='Показать подсветку брони на танке в ангаре. Наводите курсор на танк; 1–4 — снаряд, G — орудие, «-»/«=» — дистанция. Повторный клик — выход.', icon=palette.ICON_PATH, enabled=True, login=False, lobby=True, callback=self.toggle)

    def onLobby(self, inLobby):
        self.__inLobby = inLobby
        if not inLobby:
            self.deactivate()

    def toggle(self):
        try:
            if self.isActive:
                self.deactivate()
            else:
                self.activate()
        except Exception:
            logException('ViewMode.toggle')

    def activate(self):
        if self.isActive or not self.__inLobby:
            return
        self.__sampler = PreviewSampler()
        self.__settings.addListener(self.__onSettingsChanged)
        InputHandler.g_instance.onKeyDown += self.__onKeyDown
        self.__createText()
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        log('view mode on')

    def deactivate(self):
        if not self.isActive:
            return
        BigWorld.cancelCallback(self.__callbackID)
        self.__callbackID = None
        self.__settings.removeListener(self.__onSettingsChanged)
        InputHandler.g_instance.onKeyDown -= self.__onKeyDown
        self.__highlighter.stop()
        self.__destroyText()
        self.__sampler = None
        self.__state = None
        log('view mode off')

    # --- ввод ---

    def __onKeyDown(self, event):
        try:
            if event.isCtrlDown() or event.isAltDown() or event.isShiftDown():
                return
            messengerGui = MessengerEntry.g_instance.gui
            if messengerGui is not None and messengerGui.isFocused():
                return
            if event.key in _SHELL_KEYS:
                self.__shellIdx = _SHELL_KEYS[event.key]
            elif event.key == Keys.KEY_G:
                self.__gunIdx += 1
                self.__shellIdx = 0
            elif event.key == Keys.KEY_MINUS:
                self.__distance = max(0, self.__distance - DISTANCE_STEP)
            elif event.key == Keys.KEY_EQUALS:
                self.__distance = min(DISTANCE_MAX, self.__distance + DISTANCE_STEP)
        except Exception:
            logException('ViewMode.onKeyDown')

    def __onSettingsChanged(self):
        try:
            if self.__highlighter.isStarted:
                self.__highlighter.start()
        except Exception:
            logException('ViewMode.onSettingsChanged')

    # --- тик ---

    def __tick(self):
        self.__callbackID = BigWorld.callback(config.updateInterval, self.__tick)
        try:
            state, info = self.__update()
        except Exception:
            self.__highlighter.reset()
            state, info = 'error', None
            now = timer()
            if self.__lastErrorLogAt is None or now - self.__lastErrorLogAt >= config.errorLogInterval:
                self.__lastErrorLogAt = now
                logException('view mode tick')

        self.__setState(state)
        self.__setText(info)

    def __shooter(self, entity):
        # Стрелок: танк, выбранный в карусели; если его нет — сам танк в ангаре.
        try:
            from CurrentVehicle import g_currentVehicle
            if g_currentVehicle.isPresent():
                return g_currentVehicle.item.descriptor
        except Exception:
            logException('ViewMode.shooter')

        return entity.typeDescriptor

    def __update(self):
        settings = self.__settings
        hangarSpace = self.__hangarSpace
        if not hangarSpace.inited or not hangarSpace.isModelLoaded:
            self.__highlighter.reset()
            return ('hangar is not ready', u'Танк в ангаре ещё не загружен')
        entity = hangarSpace.getVehicleEntity()
        appearance = getattr(entity, 'appearance', None)
        if entity is None or appearance is None or getattr(appearance, 'collisions', None) is None or entity.typeDescriptor is None:
            self.__highlighter.reset()
            return ('no vehicle in hangar', u'Нет танка в ангаре')
        shooter = self.__shooter(entity)
        guns = _guns(shooter)
        shooterKey = shooter.type.compactDescr
        if shooterKey != self.__shooterKey:
            # Новый стрелок: начинаем с установленного орудия и первого снаряда.
            self.__shooterKey = shooterKey
            installed = [ idx for idx, gun in enumerate(guns) if gun.compactDescr == shooter.gun.compactDescr ]
            self.__gunIdx = installed[0] if installed else 0
            self.__shellIdx = 0
        gunIdx = self.__gunIdx % len(guns)
        gun = guns[gunIdx]
        shellIdx = min(self.__shellIdx, len(gun.shots) - 1)
        shot = gun.shots[shellIdx]
        if not self.__highlighter.isStarted:
            self.__highlighter.start()
        sampler = self.__sampler
        sampleKey = sampler.prepare(entity, shot, self.__distance, settings.gradientSteps)
        screenW, screenH = screenResolution()
        cursor = GUI.mcursor().position
        cursorPx = ((cursor[0] + 1.0) * 0.5 * screenW, (1.0 - cursor[1]) * 0.5 * screenH)
        reason = self.__highlighter.frame(entity, None, sampler, sampleKey, aimScreen=cursorPx)
        header = [u'Подсветка брони: просмотр. Выход — снова пункт в списке модов.',
         u'Стрелок: %s' % _unicode(shooter.type.shortUserString),
         u'Орудие [G]: %s (%d из %d)' % (_unicode(gun.shortUserString), gunIdx + 1, len(guns)),
         u'Снаряд [1–%d]: %d — %s %s, пробитие %d мм на %d м [-/=]' % (len(gun.shots),
                                                                    shellIdx + 1,
                                                                    _SHELL_KINDS.get(shot.shell.kind, _unicode(shot.shell.kind)),
                                                                    _unicode(shot.shell.userString),
                                                                    int(sampler.fullPiercingPower + 0.5),
                                                                    self.__distance)]
        self.__logSelection(header)
        return (reason, u'\n'.join(header + [self.__cursorLine(cursor)]))

    def __logSelection(self, header):
        # В лог — только смена выбора, не каждое движение курсора.
        selection = u' | '.join(header[1:])
        if selection != self.__selection:
            self.__selection = selection
            log('view mode: %s', selection.encode('utf-8'))

    def __cursorLine(self, cursor):
        highlighter = self.__highlighter
        if highlighter.rays is None:
            return u'Под курсором: —'
        ray, point = highlighter.rays.get(cursor[0], cursor[1])
        evaluated = self.__sampler.evaluate(point, point + ray.scale(highlighter.rayLength))
        if evaluated is None:
            return u'Под курсором: мимо танка'
        result, prob, percent = evaluated
        if result == UNDEFINED:
            return u'Под курсором: нет данных о броне'
        if percent is None:
            return u'Под курсором: не пробивает (рикошет или только модули)'
        needed = percent / 100.0 * self.__sampler.fullPiercingPower
        return u'Под курсором: пробитие %d%%, нужно ~%d мм' % (int(prob * 100.0 + 0.5), int(needed + 0.5))

    def __setState(self, state):
        if state != self.__state:
            self.__state = state
            if config.debug:
                log('view mode: %s', 'shown' if state is None else state)

    # --- подсказка ---

    def __createText(self):
        try:
            text = GUI.Text('')
            text.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
            text.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
            text.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
            text.verticalAnchor = GUI.Simple.eVAnchor.TOP
            text.multiline = True
            text.position = (_TEXT_POSITION[0], _TEXT_POSITION[1], _TEXT_DEPTH)
            text.visible = True
            GUI.addRoot(text)
            self.__text = text
            self.__textValue = None
        except Exception:
            logException('ViewMode.createText')
            self.__text = None

    def __setText(self, value):
        if value == self.__textValue:
            return
        self.__textValue = value
        if self.__text is None:
            return
        try:
            self.__text.text = value or u''
        except Exception:
            # Если GUI.Text не принимает unicode — пробуем utf-8.
            try:
                self.__text.text = (value or u'').encode('utf-8')
            except Exception:
                logException('ViewMode.setText')
                self.__destroyText()

    def __destroyText(self):
        if self.__text is not None:
            try:
                GUI.delRoot(self.__text)
            except Exception:
                logException('ViewMode.destroyText')

            self.__text = None
        self.__textValue = None
