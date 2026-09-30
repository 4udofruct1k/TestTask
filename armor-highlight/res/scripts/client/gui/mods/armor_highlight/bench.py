# -*- coding: utf-8 -*-
# Разовый замер в debug при запуске игры: сколько на этом компьютере стоит пересечение луча с треугольником и с
# ограничивающим блоком на чистом Python. По нему видно, быстрее ли считать броню самим по геометрии модели,
# чем через коллизию движка (цена точки движком — «us per cell» в строках stats).
import random
import sys
import time

timer = time.clock if sys.platform == 'win32' else time.time
_COUNT = 1000
_REPEAT = 5
# Луч насквозь через танк по дереву блоков: столько блоков и треугольников на луч (все слои брони, не первый удар).
_BVH_COST = ((60, 20), (120, 40))


def _triangle(o, d, v0, v1, v2):
    # Мёллер–Трумбор: расстояние до пересечения или None.
    e1x, e1y, e1z = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
    e2x, e2y, e2z = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
    px, py, pz = d[1] * e2z - d[2] * e2y, d[2] * e2x - d[0] * e2z, d[0] * e2y - d[1] * e2x
    det = e1x * px + e1y * py + e1z * pz
    if -1e-09 < det < 1e-09:
        return None
    inv = 1.0 / det
    tx, ty, tz = o[0] - v0[0], o[1] - v0[1], o[2] - v0[2]
    u = (tx * px + ty * py + tz * pz) * inv
    if u < 0.0 or u > 1.0:
        return None
    qx, qy, qz = ty * e1z - tz * e1y, tz * e1x - tx * e1z, tx * e1y - ty * e1x
    v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv
    if v < 0.0 or u + v > 1.0:
        return None
    return (e2x * qx + e2y * qy + e2z * qz) * inv


def _box(o, inv, lo, hi):
    # Луч и блок со сторонами вдоль осей (slab).
    t0 = (lo[0] - o[0]) * inv[0]
    t1 = (hi[0] - o[0]) * inv[0]
    if t0 > t1:
        t0, t1 = t1, t0
    for axis in (1, 2):
        s0 = (lo[axis] - o[axis]) * inv[axis]
        s1 = (hi[axis] - o[axis]) * inv[axis]
        if s0 > s1:
            s0, s1 = s1, s0
        if s0 > t0:
            t0 = s0
        if s1 < t1:
            t1 = s1

    return t0 <= t1 and t1 >= 0.0


def run():
    # Возвращает строку для лога. ~20–30 мс.
    rnd = random.Random(1)
    triangles = [ tuple((tuple((rnd.uniform(-3.0, 3.0) for _ in range(3))) for _ in range(3))) for _ in range(_COUNT) ]
    boxes = [ (tuple((rnd.uniform(-3.0, 0.0) for _ in range(3))), tuple((rnd.uniform(0.0, 3.0) for _ in range(3)))) for _ in range(_COUNT) ]
    o = (0.1, 0.2, -50.0)
    d = (0.001, 0.002, 1.0)
    inv = tuple((1.0 / c for c in d))
    start = timer()
    for _ in range(_REPEAT):
        for v0, v1, v2 in triangles:
            _triangle(o, d, v0, v1, v2)

    perTriangle = (timer() - start) / (_REPEAT * _COUNT) * 1000000.0
    start = timer()
    for _ in range(_REPEAT):
        for lo, hi in boxes:
            _box(o, inv, lo, hi)

    perBox = (timer() - start) / (_REPEAT * _COUNT) * 1000000.0
    bvh = [ nodes * perBox + tests * perTriangle for nodes, tests in _BVH_COST ]
    return 'bench: pure Python ray vs triangle %.2f us, vs box %.2f us; own armour geometry via BVH ~%.0f-%.0f us per ray before turret transforms and penetration, brute force over 5000 triangles ~%.0f us (engine: see "us per cell" in stats)' % (perTriangle,
     perBox,
     bvh[0],
     bvh[1],
     5000 * perTriangle)
