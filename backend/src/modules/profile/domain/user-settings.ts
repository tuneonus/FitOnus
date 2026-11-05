export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export interface UserSettingsProps {
  userId: string;
  themeMode: ThemeMode;
  unitSystem: UnitSystem;
  healthConnectEnabled: boolean;
  smartwatchConnected: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserSettings {
  private constructor(private readonly props: UserSettingsProps) {}

  static createDefault(userId: string): UserSettings {
    const now = new Date();
    return new UserSettings({
      userId,
      themeMode: 'system',
      unitSystem: 'metric',
      healthConnectEnabled: false,
      smartwatchConnected: false,
      notificationsEnabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstruct(props: UserSettingsProps): UserSettings {
    return new UserSettings(props);
  }

  get userId(): string {
    return this.props.userId;
  }
  get themeMode(): ThemeMode {
    return this.props.themeMode;
  }
  get unitSystem(): UnitSystem {
    return this.props.unitSystem;
  }
  get healthConnectEnabled(): boolean {
    return this.props.healthConnectEnabled;
  }
  get smartwatchConnected(): boolean {
    return this.props.smartwatchConnected;
  }
  get notificationsEnabled(): boolean {
    return this.props.notificationsEnabled;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  copy(): UserSettingsProps {
    return { ...this.props };
  }
}
