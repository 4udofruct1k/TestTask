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
