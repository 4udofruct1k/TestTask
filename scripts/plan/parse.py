"""Шаг 1 из 2: рацион (HTML) → racion.json рядом со скриптом.

    python3 scripts/plan/parse.py [путь к рациону.html]

По умолчанию берётся scripts/plan/racion.html. Дальше — enrich.py.
"""

import re, json, html, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "racion.html")
s = open(SRC, encoding="utf8").read()

def text(fragment):
    t = re.sub(r"<[^>]+>", " ", fragment)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()

# --- цели по людям
goals = []
for name, row, trow in re.findall(r'<tr class="p"><th>([^<]+)</th>(.*?)</tr>\s*<tr class="t"><th>цель</th>(.*?)</tr>', s, re.S):
    vals = re.findall(r"<td>([^<]*)</td>", row)
    tvals = re.findall(r"<td>([^<]*)</td>", trow)
    goals.append({"name": name, "avg": vals, "goal": tvals})

# --- дни
days = []
for m in re.finditer(r'<section class="day" id="day-([^"]+)" data-dish="([^"]+)"[^>]*>(.*?)</section>', s, re.S):
    key, dish, body = m.group(1), m.group(2), m.group(3)
    title = text(re.search(r'<h3 class="day-title">(.*?)</h3>', body, re.S).group(1))
    cook = re.search(r'<p class="cook-today">(.*?)</p>', body, re.S)
    meals = []
    for a in re.finditer(r'<article class="meal">(.*?)</article>', body, re.S):
        ab = a.group(1)
        head = re.search(r"<header>(.*?)</header>", ab, re.S).group(1)
        mname = text(re.search(r"<strong>(.*?)</strong>", head, re.S).group(1))
        dishm = re.search(r'<span class="dish">(.*?)</span>', head, re.S)
        rubm = re.search(r'<span class="rub">(.*?)</span>', head, re.S)
        who = {}
        for w in re.finditer(r'<div class="who"><em>([^<]+)</em>(.*?)</div>', ab, re.S):
            person, wb = w.group(1), w.group(2)
            ps = re.findall(r"<p( class=\"kbju\")?>(.*?)</p>", wb, re.S)
            items = [text(p) for k, p in ps if not k]
            kbju = next((text(p) for k, p in ps if k), None)
            who[person] = {"items": items, "kbju": kbju}
        meals.append({
            "name": mname,
            "dish": text(dishm.group(1)) if dishm else None,
            "rub": text(rubm.group(1)) if rubm else None,
            "who": who,
        })
    daycost = re.search(r'<p class="daycost">(.*?)</p>', body, re.S)
    days.append({
        "key": key, "dish": dish, "title": title,
        "cook": text(cook.group(1)) if cook else None,
        "meals": meals,
        "cost": text(daycost.group(1)) if daycost else None,
    })

# --- готовка
cooking = []
for r in re.finditer(r'<details class="recipe ([^"]+)">(.*?)</details>', s, re.S):
    cls, rb = r.group(1), r.group(2)
    d = text(re.search(r'<span class="d">(.*?)</span>', rb, re.S).group(1))
    tspan = re.search(r'<span class="t">(.*?)<small>(.*?)</small>', rb, re.S)
    lis = [text(x) for x in re.findall(r"<li>(.*?)</li>", rb, re.S)]
    split = re.search(r'<p class="split">(.*?)</p>', rb, re.S)
    notes = [text(x) for x in re.findall(r'<p class="note">(.*?)</p>', rb, re.S)]
    steps = [text(x) for x in re.findall(r"<ol>(.*?)</ol>", rb, re.S)]
    olitems = []
    for ol in re.findall(r"<ol>(.*?)</ol>", rb, re.S):
        olitems += [text(x) for x in re.findall(r"<li>(.*?)</li>", ol, re.S)]
    # ингредиенты — только из <ul>
    ul = re.search(r"<ul>(.*?)</ul>", rb, re.S)
    ingredients = [text(x) for x in re.findall(r"<li>(.*?)</li>", ul.group(1), re.S)] if ul else []
    cooking.append({
        "dish": cls, "day": d,
        "title": text(tspan.group(1)), "when": text(tspan.group(2)),
        "ingredients": ingredients,
        "steps": olitems,
        "split": text(split.group(1)) if split else None,
        "notes": notes,
    })

# --- покупки
shopping = []
for g in re.finditer(r'<div class="shop-group"><h3>(.*?)</h3><ul>(.*?)</ul></div>', s, re.S):
    group = text(g.group(1))
    items = []
    for li in re.finditer(r"<li>(.*?)</li>", g.group(2), re.S):
        lb = li.group(1)
        get = lambda cls: (lambda mm: text(mm.group(1)) if mm else None)(re.search(rf'<span class="{cls}">(.*?)</span>', lb, re.S))
        note = re.search(r"<small>(.*?)</small>", lb, re.S)
        items.append({"name": get("n"), "qty": get("q"), "price": get("c"), "note": text(note.group(1)) if note else None})
    shopping.append({"group": group, "items": items})

data = {"goals": goals, "days": days, "cooking": cooking, "shopping": shopping}
json.dump(data, open(os.path.join(HERE, "racion.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(goals), "people;", len(days), "days;", sum(len(d["meals"]) for d in days), "meals;", len(cooking), "recipes;", sum(len(g["items"]) for g in shopping), "shop items")
