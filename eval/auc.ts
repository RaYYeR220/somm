/** Mann–Whitney AUC: chance a random positive outscores a random negative (ties count half). */
export function auc(positives: number[], negatives: number[]): number | null {
  if (positives.length === 0 || negatives.length === 0) return null;
  let wins = 0;
  for (const p of positives) for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}

export function mean(values: (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null);
  return defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : null;
}
