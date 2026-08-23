import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { colors, spacing } from '@/constants/theme';
import { formatCurrency, PricePoint } from '@/lib/api';

type PriceHistoryChartProps = {
  points: PricePoint[];
};

const chartWidth = 800;
const chartHeight = 220;
const plot = { left: 74, right: 12, top: 12, bottom: 30 };

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Not enough observations for this range.</Text>
      </View>
    );
  }

  const prices = points.map((point) => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const rawRange = maximum - minimum;
  const padding = rawRange === 0 ? Math.max(maximum * 0.05, 1) : rawRange * 0.08;
  const lower = Math.max(0, minimum - padding);
  const upper = maximum + padding;
  const range = upper - lower || 1;
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const coordinates = points.map((point, index) => {
    const x = plot.left + (index / (points.length - 1)) * plotWidth;
    const y = plot.top + ((upper - point.price) / range) * plotHeight;
    return { x, y };
  });
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');
  const areaPoints = `${plot.left},${chartHeight - plot.bottom} ${linePoints} ${chartWidth - plot.right},${chartHeight - plot.bottom}`;
  const rising = points[points.length - 1].price >= points[0].price;
  const accent = rising ? colors.positive : colors.negative;

  return (
    <View accessibilityLabel={`Price chart with ${points.length} daily observations`} style={styles.container}>
      <Svg
        accessibilityRole="image"
        height={chartHeight}
        preserveAspectRatio="none"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        width="100%">
        {[0, 0.5, 1].map((ratio) => {
          const y = plot.top + ratio * plotHeight;
          const value = upper - ratio * range;
          return (
            <G key={ratio}>
              <Line
                stroke={colors.border}
                strokeDasharray="4 6"
                strokeWidth={1}
                x1={plot.left}
                x2={chartWidth - plot.right}
                y1={y}
                y2={y}
              />
              <SvgText fill={colors.textMuted} fontSize={11} textAnchor="end" x={plot.left - 10} y={y + 4}>
                {formatCompactCurrency(value)}
              </SvgText>
            </G>
          );
        })}
        <Polygon fill={accent} opacity={0.12} points={areaPoints} />
        <Polyline
          fill="none"
          points={linePoints}
          stroke={accent}
          strokeLinejoin="round"
          strokeWidth={3}
        />
      </Svg>
      <View style={styles.dateRow}>
        <Text style={styles.date}>{formatDate(points[0].date)}</Text>
        <Text style={styles.range}>
          Low {formatCurrency(minimum)} / High {formatCurrency(maximum)}
        </Text>
        <Text style={styles.date}>{formatDate(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 250,
    width: '100%',
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: -6,
    paddingLeft: 74,
  },
  date: {
    color: colors.textMuted,
    fontSize: 11,
  },
  range: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    height: 250,
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
