export function formatCurrency(value: number | null): string {
  if (value === null) return 'No price';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null, includePlus = true): string {
  if (value === null) return 'No change';
  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}
