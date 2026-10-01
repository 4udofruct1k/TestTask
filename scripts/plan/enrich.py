"""Шаг 2 из 2: racion.json → src/household/plan.json.

    python3 scripts/plan/enrich.py

Раскладывает строки рациона на фишки продуктов, добавляет каталог
(цены и пачки из корзины) и расход продуктов по рецептам. Каталог и расход
написаны здесь руками: в рационе граммовки текстом, и надёжнее выписать их,
чем угадывать разбором. Новый рацион — поправить CATALOG и USES.
"""

import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
d = json.load(open(os.path.join(HERE, 'racion.json'), encoding='utf8'))

EMOJI = [
    ('соль', '🧂'), ('специ', '🧂'), ('паприк', '🌶️'), ('лавров', '🌿'), ('карри', '🍛'),
    ('кукуруз', '🌽'), ('бульон', '🧂'),
    ('молоко', '🥛'), ('хлеб', '🍞'), ('намазк', '🧀'), ('помидор', '🍅'), ('огур', '🥒'),
    ('форел', '🐟'), ('рис', '🍚'), ('перец', '🫑'), ('масло', '🫒'), ('кастрюл', '🍲'),
    ('кур', '🍗'), ('кревет', '🦐'), ('соус', '🥫'), ('макарон', '🍝'), ('йогурт', '🥣'),
    ('яблок', '🍎'), ('банан', '🍌'), ('яйц', '🥚'), ('картоф', '🥔'), ('горош', '🫛'),
    ('кукуруз', '🌽'), ('говядин', '🥩'), ('гречк', '🌾'), ('овся', '🥣'), ('каш', '🥣'),
    ('вишн', '🍒'), ('сыр', '🧀'), ('творог', '🧀'), ('морков', '🥕'), ('шампиньон', '🍄'),
    ('лук', '🧅'), ('чеснок', '🧄'), ('сливк', '🥛'), ('мук', '🌾'), ('паст', '🥫'),
    ('бульон', '🧂'), ('соев', '🍶'), ('орех', '🥜'), ('соль', '🧂'), ('специ', '🧂'),
    ('паприк', '🌶️'), ('лавров', '🌿'), ('карри', '🍛'),
]

def emoji(name):
    low = name.lower()
    for key, e in EMOJI:
        if key in low:
            return e
    return '🍽️'

AMT = re.compile(r'^(.*?)\s+(≈?\d[\d,.]*\s*(?:г|мл|шт|кг)\b.*)$')
PIECES = re.compile(r'^(\d+)\s+(кус\w*|варён\w*)\s+(.+)$')

def chip(raw, dish):
    t = raw.strip()
    if not t or t == '—':
        return None
    if t.startswith('без '):
        return {'e': '🚫', 'name': t, 'amt': None, 'muted': True}
    m = re.match(r'^(≈?\d+%)\s+кастрюли\s*(?:\((.*)\))?$', t)
    if m:
        return {'e': '🍲', 'name': dish or 'из кастрюли', 'amt': f'{m.group(1)} кастрюли', 'sub': m.group(2)}
    m = re.match(r'^([⅓⅙½¼⅔])\s+(.+)$', t)
    if m:
        return {'e': emoji(m.group(2)), 'name': m.group(2), 'amt': m.group(1)}
    m = PIECES.match(t)
    if m:
        n, word, rest = m.groups()
        if word.startswith('кус'):
            return {'e': emoji(rest), 'name': rest.replace('хлеба', 'хлеб'), 'amt': f'{n} {word}'}
        return {'e': emoji(rest), 'name': f'{word} {rest}', 'amt': f'{n} шт'}
    m = AMT.match(t)
    if m:
        name, amt = m.group(1), m.group(2)
        sub = None
        for sep in (': ', ' → ', ' + '):
            if sep in amt:
                amt, rest = amt.split(sep, 1)
                sub = ('+ ' if sep == ' + ' else '') + rest
                break
        return {'e': emoji(name), 'name': name, 'amt': amt, 'sub': sub}
    return {'e': emoji(t), 'name': t, 'amt': None}

def groups(text, dish):
    out = []
    for part in text.split('; '):
        label = None
        m = re.match(r'^(салат|полсалата)\s*:\s*(.+)$', part)
        if m:
            label, part = m.group(1).capitalize(), m.group(2)
        chips = [c for c in (chip(x, dish) for x in part.split(', ')) if c]
        if not chips:
            continue
        # Подряд идущие части без подписи — одна сетка: «карри …; рис …» это один приём
        if label is None and out and out[-1]['label'] is None:
            out[-1]['chips'].extend(chips)
        else:
            out.append({'label': label, 'chips': chips})
    return out

def kbju(s):
    if not s:
        return None
    m = re.match(r'(\d+) ккал, Б (\d+), Ж (\d+), У (\d+)', s)
    return {'kcal': int(m[1]), 'p': int(m[2]), 'f': int(m[3]), 'c': int(m[4])} if m else None

PEOPLE = {'Макс': 'max', 'Ильвина': 'ilvina'}

def clean_dish(text):
    if not text:
        return None
    return text.split(' — ')[0].strip()
DISH_NAMES = {'curry': 'Карри', 'shrimp': 'Паста с креветками', 'trout': 'Форель', 'ragu': 'Рагу', 'beef': 'Говядина'}

days = []
for day in d['days']:
    meals = []
    for m in day['meals']:
        who = {}
        for name, w in m['who'].items():
            text = ' '.join(w['items']).strip()
            who[PEOPLE[name]] = {'groups': groups(text, clean_dish(m['dish'])) if text not in ('', '—') else [], 'kbju': kbju(w['kbju'])}
        meals.append({'name': m['name'], 'dish': clean_dish(m['dish']), 'fresh': bool(m['dish'] and 'готовим сегодня' in m['dish']), 'rub': m['rub'], 'who': who})
    cost = re.search(r'(\d[\d\s]*) ₽', day['cost'] or '')
    days.append({
        'key': day['key'], 'title': day['title'], 'dish': day['dish'],
        'cook': (day['cook'] or '').replace('Готовим: ', ''),
        'cost': int(cost.group(1).replace(' ', '')) if cost else None,
        'meals': meals,
    })

def cap(t):
    return t[:1].upper() + t[1:]

def one_ingredient(part):
    part = part.strip()
    m = re.match(r'^(.*?)\s+—\s+(.+)$', part)
    if m:
        name, amt = m.group(1), m.group(2)
    else:
        m = AMT.match(part)
        name, amt = (m.group(1), m.group(2)) if m else (part, None)
    sub = None
    extra = []
    if amt and ': ' in amt:
        amt, sub = amt.split(': ', 1)
    elif amt and ', ' in amt:
        amt, rest = amt.split(', ', 1)
        # Хвост после суммы — либо ещё продукты («карри, соль»), либо указание («мелко натереть»)
        if not re.search(r'\d', rest) and '(' not in rest and len(rest) <= 25 and any(k in rest.lower() for k, _ in EMOJI):
            extra = [{'e': emoji(x), 'name': cap(x), 'amt': None, 'sub': None} for x in [rest]]
        else:
            sub = rest
    return [{'e': emoji(name), 'name': cap(name), 'amt': amt, 'sub': sub}] + extra

def ingredients(line):
    if line.startswith('К ужину'):
        body = line[len('К ужину'):].lstrip(':— ').strip()
        body, _, note = body.partition(' — ')
        return [dict(one_ingredient(x)[0], sub='к ужину' + (f', {note}' if note else '')) for x in body.split(' и ')]
    parts = re.split(r', (?=[^,—(]+ — |[а-яё][а-яё ]*\s≈?\d+\s*(?:г|мл|шт)\b)', line)
    # «Говядина, тазобедренный отруб — 800 г» — одно название через запятую, а не два продукта
    merged = []
    for part in parts:
        prev = merged[-1] if merged else None
        if prev is not None and ' — ' not in prev and not re.search(r'\d', prev) and not known(part):
            merged[-1] = prev + ', ' + part
        else:
            merged.append(part)
    return [c for x in merged for c in one_ingredient(x)]

def known(part):
    first = part.strip().split(' ')[0].lower()
    return any(k in first for k, _ in EMOJI)

recipes = []
for r in d['cooking']:
    recipes.append({
        'day': r['day'], 'dish': r['dish'], 'title': r['title'], 'when': r['when'],
        'ingredients': [c for x in r['ingredients'] for c in ingredients(x)],
        'steps': r['steps'], 'split': r['split'], 'notes': r['notes'],
    })

weekly = [{'group': g['group'], 'items': [{'name': i['name'], 'qty': i['qty'], 'price': i['price']} for i in g['items']]} for g in d['shopping']]

goals = {
    'max': {'kcal': 2000, 'p': 160, 'f': 65, 'c': 200, 'label': '≈2000 ккал · Б 160 · Ж 65 · У 200'},
    'ilvina': {'kcal': 1400, 'p': 65, 'f': 48, 'c': 165, 'label': '≈1400 ккал · Б 60–70 · Ж 45–50 · У 150–180'},
}


# ---------------------------------------------------------------------------
# Продукты и потребность готовки по дням — структурно, для расчёта покупок.
# price — ₽ за единицу (г, мл или шт), из списка покупок исходного файла.
# lead: 'eve' — брать накануне: мясо и охлаждённая рыба долго не лежат.
CATALOG = {
    'chicken':  {'name': 'Филе цыплёнка-бройлера', 'e': '🍗', 'unit': 'г', 'pack': 900, 'price': 0.44, 'kind': 'fresh', 'lead': 'eve'},
    'beef':     {'name': 'Говядина, тазобедренный отруб', 'e': '🥩', 'unit': 'г', 'pack': 800, 'price': 1.3, 'kind': 'fresh', 'lead': 'eve'},
    'trout':    {'name': 'Форель охлаждённая, филе', 'e': '🐟', 'unit': 'г', 'pack': None, 'price': 2.3, 'kind': 'fresh', 'lead': 'eve'},
    'shrimp':   {'name': 'Креветки очищенные', 'e': '🦐', 'unit': 'г', 'pack': 200, 'price': 1.785, 'kind': 'fresh', 'lead': None},
    'cottage':  {'name': 'Творог со сметаной 7%', 'e': '🧀', 'unit': 'г', 'pack': 130, 'price': 0.531, 'kind': 'fresh', 'lead': None},
    'cheese':   {'name': 'Сыр', 'e': '🧀', 'unit': 'г', 'pack': 300, 'price': 0.567, 'kind': 'fresh', 'lead': None},
    'cream':    {'name': 'Сливки 10%', 'e': '🥛', 'unit': 'г', 'pack': 450, 'price': 0.251, 'kind': 'fresh', 'lead': None},
    'onion':    {'name': 'Лук репчатый', 'e': '🧅', 'unit': 'г', 'pack': None, 'price': 0.034, 'kind': 'fresh', 'lead': None},
    'tomato':   {'name': 'Томаты', 'e': '🍅', 'unit': 'г', 'pack': None, 'price': 0.1, 'kind': 'fresh', 'lead': None},
    'potato':   {'name': 'Картофель', 'e': '🥔', 'unit': 'г', 'pack': None, 'price': 0.045, 'kind': 'fresh', 'lead': None},
    'carrot':   {'name': 'Морковь', 'e': '🥕', 'unit': 'г', 'pack': None, 'price': 0.03, 'kind': 'fresh', 'lead': None},
    'mushroom': {'name': 'Шампиньоны', 'e': '🍄', 'unit': 'г', 'pack': 900, 'price': 0.27, 'kind': 'fresh', 'lead': None},
    'pepper':   {'name': 'Перец красный', 'e': '🫑', 'unit': 'г', 'pack': None, 'price': 0.25, 'kind': 'fresh', 'lead': None},
    'peas':     {'name': 'Горошек консервированный', 'e': '🫛', 'unit': 'г', 'pack': 240, 'price': 0.5625, 'kind': 'fresh', 'lead': None},
    'corn':     {'name': 'Кукуруза консервированная', 'e': '🌽', 'unit': 'г', 'pack': 210, 'price': 0.643, 'kind': 'fresh', 'lead': None},
    'eggs':     {'name': 'Яйца С1', 'e': '🥚', 'unit': 'шт', 'pack': 10, 'price': 7.0, 'kind': 'fresh', 'lead': None},
    'tpaste':   {'name': 'Томатная паста', 'e': '🥫', 'unit': 'г', 'pack': 270, 'price': 0.333, 'kind': 'pantry', 'lead': None},
    'oil':      {'name': 'Масло подсолнечное', 'e': '🫒', 'unit': 'мл', 'pack': 1000, 'price': 0.145, 'kind': 'pantry', 'lead': None},
    'rice':     {'name': 'Рис круглозёрный', 'e': '🍚', 'unit': 'г', 'pack': 800, 'price': 0.15, 'kind': 'pantry', 'lead': None},
    'pasta':    {'name': 'Макароны', 'e': '🍝', 'unit': 'г', 'pack': 450, 'price': 0.133, 'kind': 'pantry', 'lead': None},
    'buckwheat':{'name': 'Гречка', 'e': '🌾', 'unit': 'г', 'pack': 800, 'price': 0.1125, 'kind': 'pantry', 'lead': None},
    'flour':    {'name': 'Мука', 'e': '🌾', 'unit': 'г', 'pack': 2000, 'price': 0.06, 'kind': 'pantry', 'lead': None},
    'cubes':    {'name': 'Бульонные кубики', 'e': '🧂', 'unit': 'шт', 'pack': 8, 'price': 5.0, 'kind': 'pantry', 'lead': None},
    'soy':      {'name': 'Соевый соус', 'e': '🍶', 'unit': 'мл', 'pack': 1000, 'price': 0.15, 'kind': 'pantry', 'lead': None},
    'garlic':   {'name': 'Чеснок', 'e': '🧄', 'unit': 'зуб.', 'pack': None, 'price': 1.45, 'kind': 'pantry', 'lead': None},
}

# Сколько продуктов уходит в каждый рецепт — по порядку рецептов в разделе «Готовка»
USES = [
    {'cottage': 130, 'cheese': 86, 'garlic': 1},
    {'chicken': 800, 'onion': 200, 'garlic': 3, 'tpaste': 70, 'cream': 225, 'peas': 160, 'oil': 15, 'rice': 250},
    {'shrimp': 600, 'tomato': 300, 'tpaste': 30, 'cream': 225, 'oil': 15, 'garlic': 3, 'pasta': 270, 'eggs': 8},
    {'trout': 700, 'potato': 900, 'peas': 160, 'corn': 120},
    {'chicken': 1600, 'potato': 1600, 'carrot': 800, 'mushroom': 800, 'onion': 800, 'flour': 60, 'cubes': 2, 'soy': 60, 'tpaste': 50, 'oil': 30},
    {'beef': 800, 'onion': 300, 'carrot': 200, 'pepper': 300, 'tpaste': 50, 'flour': 20, 'oil': 10, 'buckwheat': 160},
    {'trout': 700, 'rice': 240, 'peas': 160},
]
assert len(USES) == len(recipes), (len(USES), len(recipes))
for r, u in zip(recipes, USES):
    r['uses'] = u

SHORT = {'chicken': 'Курица', 'beef': 'Говядина', 'trout': 'Форель', 'shrimp': 'Креветки', 'cottage': 'Творог',
         'cheese': 'Сыр', 'cream': 'Сливки', 'onion': 'Лук', 'tomato': 'Томаты', 'potato': 'Картофель',
         'carrot': 'Морковь', 'mushroom': 'Шампиньоны', 'pepper': 'Перец', 'peas': 'Горошек', 'eggs': 'Яйца',
         'corn': 'Кукуруза', 'tpaste': 'Томатная паста', 'oil': 'Масло', 'rice': 'Рис', 'pasta': 'Макароны',
         'buckwheat': 'Гречка', 'flour': 'Мука', 'cubes': 'Кубики', 'soy': 'Соевый соус', 'garlic': 'Чеснок'}
for k, v in CATALOG.items():
    v['short'] = SHORT[k]

plan = {
    'title': 'Неделя на двоих',
    'people': goals,
    'days': days,
    'recipes': recipes,
    'catalog': CATALOG,
    'weekly': weekly,
}
json.dump(plan, open(os.path.join(ROOT, 'src', 'household', 'plan.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('plan.json:', len(json.dumps(plan, ensure_ascii=False)), 'chars')
