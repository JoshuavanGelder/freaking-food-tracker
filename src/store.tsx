import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_GOALS, Goals, Profile, WeightEntry, dailyWeights, dateKey } from './logic/calc';
import type { Food } from './logic/off';
import type { ImportEntry } from './logic/importer';

export type MealId = 'ontbijt' | 'lunch' | 'diner' | 'snacks';

export const MEALS: { id: MealId; label: string }[] = [
  { id: 'ontbijt', label: 'Ontbijt' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'diner', label: 'Diner' },
  { id: 'snacks', label: 'Snacks' },
];

export function mealLabel(id: MealId): string {
  return MEALS.find((m) => m.id === id)?.label ?? id;
}

/** Welke maaltijd past bij het tijdstip, voor de grote +-knop. */
export function mealForNow(d = new Date()): MealId {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'ontbijt';
  if (h < 15) return 'lunch';
  if (h < 20.5) return 'diner';
  return 'snacks';
}

export type LogEntry = { id: string; date: string; meal: MealId; food: Food; grams: number };
export type FavMealItem = { food: Food; grams: number };
export type FavMeal = { id: string; name: string; items: FavMealItem[] };

export type AppState = {
  version: 1;
  profile: Profile | null;
  goals: Goals;
  log: LogEntry[];
  weights: WeightEntry[];
  foods: Record<string, Food>;
  favorites: string[];
  recent: string[];
  lastPortion: Record<string, number>;
  favMeals: FavMeal[];
  imports: string[];
};

const EMPTY: AppState = {
  version: 1,
  profile: null,
  goals: DEFAULT_GOALS,
  log: [],
  weights: [],
  foods: {},
  favorites: [],
  recent: [],
  lastPortion: {},
  favMeals: [],
  imports: [],
};

const KEY = 'fft-state-v1';

function rememberFood(s: AppState, food: Food, grams?: number): AppState {
  return {
    ...s,
    foods: { ...s.foods, [food.id]: food },
    recent: [food.id, ...s.recent.filter((id) => id !== food.id)].slice(0, 40),
    lastPortion: grams != null ? { ...s.lastPortion, [food.id]: grams } : s.lastPortion,
  };
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Sleutel om te herkennen of een favoriete maaltijd precies deze producten bevat. */
export function itemsKey(items: FavMealItem[]): string {
  return items
    .map((i) => `${i.food.id}@${Math.round(i.grams)}`)
    .sort()
    .join('|');
}

type Actions = {
  setProfile: (p: Profile, targetWeight?: number, startWeight?: number) => void;
  setGoals: (patch: Partial<Goals>) => void;
  addEntry: (date: string, meal: MealId, food: Food, grams: number) => void;
  updateEntry: (id: string, grams: number) => void;
  removeEntry: (id: string) => void;
  toggleFavorite: (food: Food) => void;
  saveFood: (food: Food) => void;
  addWeight: (date: string, kg: number) => void;
  removeWeight: (date: string) => void;
  toggleFavMeal: (name: string, items: FavMealItem[]) => void;
  removeFavMeal: (id: string) => void;
  addFavMealTo: (fav: FavMeal, date: string, meal: MealId) => void;
  importData: (id: string, entries: ImportEntry[], favMeals: { name: string; meal: MealId }[]) => void;
};

type Ctx = { state: AppState; loaded: boolean; actions: Actions };

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppState>;
          setState({ ...EMPTY, ...parsed, goals: { ...DEFAULT_GOALS, ...(parsed.goals ?? {}) } });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }, 300);
  }, [state, loaded]);

  const addEntry = useCallback((date: string, meal: MealId, food: Food, grams: number) => {
    setState((s) => ({ ...rememberFood(s, food, grams), log: [...s.log, { id: uid(), date, meal, food, grams }] }));
  }, []);

  const actions: Actions = useMemo(
    () => ({
      setProfile: (p, targetWeight, startWeight) =>
        setState((s) => {
          let weights = s.weights;
          if (startWeight != null) {
            const today = dateKey(new Date());
            weights = [...s.weights.filter((w) => w.date !== today), { date: today, kg: startWeight }];
          }
          return {
            ...s,
            profile: p,
            weights,
            goals: targetWeight != null ? { ...s.goals, targetWeight } : s.goals,
          };
        }),
      setGoals: (patch) => setState((s) => ({ ...s, goals: { ...s.goals, ...patch } })),
      addEntry,
      updateEntry: (id, grams) =>
        setState((s) => {
          const e = s.log.find((x) => x.id === id);
          return {
            ...s,
            log: s.log.map((x) => (x.id === id ? { ...x, grams } : x)),
            lastPortion: e ? { ...s.lastPortion, [e.food.id]: grams } : s.lastPortion,
          };
        }),
      removeEntry: (id) => setState((s) => ({ ...s, log: s.log.filter((x) => x.id !== id) })),
      toggleFavorite: (food) =>
        setState((s) => {
          const on = s.favorites.includes(food.id);
          return {
            ...s,
            foods: { ...s.foods, [food.id]: food },
            favorites: on ? s.favorites.filter((id) => id !== food.id) : [food.id, ...s.favorites],
          };
        }),
      saveFood: (food) => setState((s) => ({ ...s, foods: { ...s.foods, [food.id]: food } })),
      addWeight: (date, kg) =>
        setState((s) => ({ ...s, weights: [...s.weights.filter((w) => w.date !== date), { date, kg }] })),
      removeWeight: (date) => setState((s) => ({ ...s, weights: s.weights.filter((w) => w.date !== date) })),
      toggleFavMeal: (name, items) =>
        setState((s) => {
          const key = itemsKey(items);
          const existing = s.favMeals.find((f) => itemsKey(f.items) === key);
          if (existing) return { ...s, favMeals: s.favMeals.filter((f) => f.id !== existing.id) };
          return { ...s, favMeals: [{ id: uid(), name, items }, ...s.favMeals] };
        }),
      removeFavMeal: (id) => setState((s) => ({ ...s, favMeals: s.favMeals.filter((f) => f.id !== id) })),
      addFavMealTo: (fav, date, meal) =>
        setState((s) => {
          let next = s;
          for (const it of fav.items) next = rememberFood(next, it.food, it.grams);
          return {
            ...next,
            log: [...next.log, ...fav.items.map((it) => ({ id: uid(), date, meal, food: it.food, grams: it.grams }))],
          };
        }),
      importData: (id, entries, favMeals) =>
        setState((s) => {
          let next = s;
          for (const e of entries) if (!e.summary) next = rememberFood(next, e.food, e.grams);
          const newFavs: FavMeal[] = favMeals
            .map((fm) => ({
              id: uid(),
              name: fm.name,
              items: entries.filter((e) => e.meal === fm.meal).map((e) => ({ food: e.food, grams: e.grams })),
            }))
            .filter((fm) => fm.items.length > 0 && !s.favMeals.some((x) => itemsKey(x.items) === itemsKey(fm.items)));
          return {
            ...next,
            log: [...next.log, ...entries.map((e) => ({ id: uid(), date: e.date, meal: e.meal, food: e.food, grams: e.grams }))],
            favMeals: [...newFavs, ...next.favMeals],
            imports: [...next.imports, id],
          };
        }),
    }),
    [addEntry],
  );

  const value = useMemo(() => ({ state, loaded, actions }), [state, loaded, actions]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp buiten AppProvider');
  return c;
}

export function latestWeight(state: AppState): number | null {
  const days = dailyWeights(state.weights);
  return days.length ? days[days.length - 1].kg : null;
}
