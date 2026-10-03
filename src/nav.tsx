import React, { createContext, useContext } from 'react';
import type { Food } from './logic/off';
import type { Friend } from './cloud';
import type { MealId } from './store';

export type Tab = 'today' | 'weight' | 'friends' | 'goals';

export type Route =
  | { name: 'tabs' }
  | { name: 'add'; meal: MealId; date: string }
  | { name: 'scan'; meal: MealId; date: string }
  | { name: 'product'; food: Food; meal: MealId; date: string; entryId?: string; grams?: number }
  | { name: 'manual'; meal: MealId; date: string; barcode?: string; base?: Food; editOnly?: boolean }
  | { name: 'favmeal'; id: string }
  | { name: 'profile' }
  | { name: 'import' }
  | { name: 'cloud' }
  | { name: 'friend'; friend: Friend }
  | { name: 'micros'; date: string };

export type Nav = {
  tab: Tab;
  setTab: (t: Tab) => void;
  day: string;
  setDay: (d: string) => void;
  push: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  /** Terug naar het laatste scherm met deze naam in de stapel. */
  popTo: (name: Route['name']) => void;
  home: () => void;
  /** Id van de favoriete maaltijd waar producten aan worden toegevoegd (zoeken/scannen werkt dan als kiezer). */
  pickFor: string | null;
  setPickFor: (id: string | null) => void;
};

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav buiten NavCtx');
  return n;
}

export function NavProvider({ value, children }: { value: Nav; children: React.ReactNode }) {
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}
