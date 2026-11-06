export interface DataPoint {
  label: string;
  value: number;
}

export interface EmaOptions {
  alpha?: number; // Smoothing factor, default 0.1
  decimals?: number; // Decimal places, default 1
}

/**
 * Computes Exponential Moving Average (EMA) for a chronological sequence of points.
 *
 * Formula:
 *   EMA_0 = value_0
 *   EMA_t = (value_t * alpha) + (EMA_{t-1} * (1 - alpha))
 *
 * Designed to filter out daily fluid/food fluctuations and reveal true trajectory.
 */
export function calculateEma(points: readonly DataPoint[], options?: EmaOptions): DataPoint[] {
  if (!points || points.length === 0) {
    return [];
  }

  const alpha = Math.min(Math.max(options?.alpha ?? 0.1, 0.01), 1.0);
  const decimals = options?.decimals ?? 1;
  const factor = Math.pow(10, decimals);

  const result: DataPoint[] = [];
  let currentEma = points[0]!.value;

  for (let i = 0; i < points.length; i++) {
    const rawVal = points[i]!.value;
    if (i === 0) {
      currentEma = rawVal;
    } else {
      currentEma = rawVal * alpha + currentEma * (1 - alpha);
    }

    const rounded = Math.round(currentEma * factor) / factor;
    result.push({
      label: points[i]!.label,
      value: rounded,
    });
  }

  return result;
}
