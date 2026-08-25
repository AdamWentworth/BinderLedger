export type CatalogLayoutDensity = 'large' | 'standard' | 'compact';

export function getCatalogColumnCount(
  availableWidth: number,
  density: CatalogLayoutDensity,
  gap: number,
): number {
  const minimumWidth: Record<CatalogLayoutDensity, number> = {
    large: 300,
    standard: 205,
    compact: 150,
  };
  const maximumColumns: Record<CatalogLayoutDensity, number> = {
    large: 2,
    standard: 3,
    compact: 4,
  };
  const fittedColumns = Math.floor((availableWidth + gap) / (minimumWidth[density] + gap));
  return Math.max(1, Math.min(maximumColumns[density], fittedColumns));
}

export function formatCatalogDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}
