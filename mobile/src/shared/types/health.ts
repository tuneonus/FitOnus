export type SourceKind = 'synced' | 'estimated' | 'manual';

export type DataSource = {
  kind: SourceKind;
  label: string;
};

export type HealthStatus =
  | 'synced'
  | 'loading'
  | 'noDevice'
  | 'permissions'
  | 'offline'
  | 'error';

export type HealthPlatform = 'ios' | 'android';

export type TimeRange = 'D' | 'W' | 'M' | 'Y';

export type ChartPoint = { label: string; value: number };
