import React from 'react';

type SparklineProps = {
  points: number[];
  width?: number;
  height?: number;
  strokeClassName?: string;
  dotClassName?: string;
};

export function Sparkline({
  points,
  width = 76,
  height = 28,
  strokeClassName = 'stroke-ink',
  dotClassName = 'fill-ink'
}: SparklineProps) {
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => [
  pad + i * (width - pad * 2) / (points.length - 1),
  pad + (1 - (p - min) / range) * (height - pad * 2)]
  );
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [endX, endY] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={strokeClassName} />
      <circle cx={endX} cy={endY} r={3} className={dotClassName} />
    </svg>);

}