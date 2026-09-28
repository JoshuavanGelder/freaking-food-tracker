import React, { createContext, useContext } from 'react';
import type { Food } from './logic/off';
import type { MealId } from './store';

export type Tab = 'today' | 'weight' | 'friends' | 'goals';

export type Route =
  | { name: 'tabs' }
  | { name: 'add'; meal: MealId; date: string }
  | { name: 'scan'; meal: MealId; date: string }
  | { name: 'product'; food: Food; meal: MealId; date: string; entryId?: string; grams?: number }
  | { name: 'manual'; meal: MealId; date: string; barcode?: string; base?: Food }
  | { name: 'profile' }
  | { name: 'import' };

export type Nav = {
  tab: Tab;
  setTab: (t: Tab) => void;
  day: string;
  setDay: (d: string) => void;
  push: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  home: () => void;
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
