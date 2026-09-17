/**
 * Сторож жёстких правил. Их нарушение — повод переделать код, а не тест,
 * поэтому они проверяются не глазами, а сканированием исходников.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;

function sources(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(full, entry);
    if (statSync(path).isDirectory()) out.push(...sources(join(dir, entry)));
    else if (/\.tsx?$/.test(entry)) out.push(join(dir, entry));
  }
  return out;
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** Блочные комментарии CSS: иначе они прилипают к селектору следующего правила. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Комментарии выкидываются: в них Date и запрещённые импорты упоминаются законно. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('правило 2 — конструктор Date запрещён в domain и engine', () => {
  const files = [...sources('src/domain'), ...sources('src/engine')];

  it('файлы найдены', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((file) => {
    it(file, () => {
      const code = stripComments(read(file));
      expect(code).not.toMatch(/new\s+Date\b/);
      expect(code).not.toMatch(/\bDate\.(now|parse|UTC)\b/);
    });
  });
});

describe('правило 3 — расчёты не читают системные часы', () => {
  [...sources('src/domain'), ...sources('src/engine')].forEach((file) => {
    it(file, () => {
      const code = stripComments(read(file));
      expect(code).not.toMatch(/performance\.now/);
    });
  });
});

function importsOf(file: string): string[] {
  const code = stripComments(read(file));
  return [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

describe('правило 4 — слои не смотрят наверх', () => {
  it('engine не импортирует ui, storage и store', () => {
    const bad: string[] = [];
    for (const file of sources('src/engine')) {
      for (const source of importsOf(file)) {
        if (/(^|\/)(ui|storage|store)(\/|$)/.test(source)) bad.push(`${file} → ${source}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('domain не импортирует ui, storage, store и engine', () => {
    const bad: string[] = [];
    for (const file of sources('src/domain')) {
      for (const source of importsOf(file)) {
        if (/(^|\/)(ui|storage|store|engine)(\/|$)/.test(source)) bad.push(`${file} → ${source}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Что уезжает за экран сдвигом, обязано прятаться и по видимости.
 *
 * Сдвиг на 103% собственной высоты перекрывает край на пару пикселей,
 * и любое смещение раскладки — клавиатура, соседняя открытая шторка —
 * выпускает закрытый элемент обратно на экран. Проверяется по стилям,
 * потому что вёрстку тестами на JSDOM не поймать.
 */
describe('закрытые шторки не показываются краем', () => {
  it('каждое правило со сдвигом за экран гасит visibility', () => {
    const css = stripCssComments(read('src/ui/theme.css'));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const offending: string[] = [];

    for (const [, selectorRaw = '', body = ''] of rules) {
      const selector = selectorRaw.trim();
      // Сдвиг на сто с лишним процентов — это «увести за край»
      if (!/transform:\s*translate[XY]\(-?1\d\d(\.\d+)?%\)/.test(body)) continue;
      if (!/visibility:\s*hidden/.test(body)) offending.push(selector);
    }

    expect(offending).toEqual([]);
  });

  it('у каждого такого элемента есть открытое состояние с visibility: visible', () => {
    const css = stripCssComments(read('src/ui/theme.css'));
    const hidden = [...css.matchAll(/([^{}]+)\{([^{}]*visibility:\s*hidden[^{}]*)\}/g)]
      .map(([, selector = '']) => selector.trim())
      .filter((selector) => /^\.(qsheet|drawer|undo)$/.test(selector));

    expect(hidden.sort()).toEqual(['.drawer', '.qsheet', '.undo']);
    for (const selector of hidden) {
      expect(css).toMatch(new RegExp(`\\${selector}\\.on\\s*\\{[^{}]*visibility:\\s*visible`));
    }
  });
});
