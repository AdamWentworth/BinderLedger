export type CatalogLayoutDensity = 'large' | 'standard' | 'compact';

export function getCatalogColumnCount(
  availableWidth: number,
  density: CatalogLayoutDensity,
  gap: number,
): number {
  const minimumWidth: Record<CatalogLayoutDensity, number> = {
    large: 260,
    standard: 160,
    compact: 100,
  };
  const maximumColumns: Record<CatalogLayoutDensity, number> = {
    large: 3,
    standard: 4,
    compact: 6,
  };
  const fittedColumns = Math.floor((availableWidth + gap) / (minimumWidth[density] + gap));
  return Math.max(1, Math.min(maximumColumns[density], fittedColumns));
}

export function getCatalogItemWidth(
  availableWidth: number,
  columns: number,
  gap: number,
): number {
  if (availableWidth <= 0 || columns <= 0) return 0;
  return Math.max(0, (availableWidth - gap * (columns - 1)) / columns);
}

export function formatCatalogDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}
