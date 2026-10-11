/**
 * Личные данные в приложении: тренировки, вес и замеры. Zustand.
 * HOUSEHOLD_SPEC, раздел 10.
 *
 * Каждая правка сразу пишется в файл. В облако ничего не уходит.
 */

import { create } from 'zustand';
import type { DateStr, WeekKey } from '../household/days';
import type { Person } from '../household/types';
import {
  emptyPersonal,
  markDone,
  removeMeasurement,
  saveMeasurement,
  setOwnKcal,
  type Measurement,
  type PersonalDoc,
} from '../personal/doc';
import type { PersonalFiles } from '../storage';

interface PersonalStore {
  ready: boolean;
  doc: PersonalDoc;
  loadNote: string | null;
  saveError: string | null;

  init(files: PersonalFiles): Promise<void>;
  markDone(person: Person, date: DateStr, kcal: number | null): void;
  setOwnKcal(person: Person, key: WeekKey, kcal: number | null): void;
  saveMeasurement(person: Person, m: Measurement): void;
  removeMeasurement(person: Person, date: DateStr): void;
}

let storage: PersonalFiles | null = null;

export const usePersonal = create<PersonalStore>()((set, get) => {
  const commit = (doc: PersonalDoc): void => {
    set({ doc });
    void storage?.save(doc).then((result) => set({ saveError: result.ok ? null : result.message }));
  };

  return {
    ready: false,
    doc: emptyPersonal(),
    loadNote: null,
    saveError: null,

    async init(files) {
      storage = files;
      const { doc, note } = await files.load();
      set({ ready: true, doc, loadNote: note });
    },

    markDone: (person, date, kcal) => commit(markDone(get().doc, person, date, kcal)),
    setOwnKcal: (person, key, kcal) => commit(setOwnKcal(get().doc, person, key, kcal)),
    saveMeasurement: (person, m) => commit(saveMeasurement(get().doc, person, m)),
    removeMeasurement: (person, date) => commit(removeMeasurement(get().doc, person, date)),
  };
});
