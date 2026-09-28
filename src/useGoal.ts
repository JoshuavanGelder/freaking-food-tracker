import { useMemo } from 'react';
import { computeGoal, macroGrams, splitFor, GoalResult, MacroSplit } from './logic/calc';
import { latestWeight, useApp } from './store';

export type GoalInfo = {
  weight: number;
  result: GoalResult;
  split: MacroSplit;
  grams: { e: number; k: number; v: number };
  planLabel: string;
};

const PLAN_LABELS: Record<string, string> = {
  bal: 'Gebalanceerd',
  eiwit: 'Eiwitrijk',
  low: 'Low carb',
  keto: 'Keto',
  duur: 'Duursport',
  eigen: 'Eigen',
};

export function useGoal(): GoalInfo | null {
  const { state } = useApp();
  return useMemo(() => {
    if (!state.profile) return null;
    const weight = latestWeight(state) ?? 75;
    const result = computeGoal(state.profile, weight, state.goals);
    const split = splitFor(state.goals);
    return {
      weight,
      result,
      split,
      grams: macroGrams(result.goal, split),
      planLabel: PLAN_LABELS[state.goals.planId] ?? 'Eigen',
    };
  }, [state.profile, state.goals, state.weights]);
}
