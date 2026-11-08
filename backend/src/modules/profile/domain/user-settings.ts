export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const SUPPORTED_LANGUAGES = ['en', 'ta'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export interface UserSettingsProps {
  userId: string;
  themeMode: ThemeMode;
  unitSystem: UnitSystem;
  healthConnectEnabled: boolean;
  smartwatchConnected: boolean;
  notificationsEnabled: boolean;
  language: Language;
  privacyAnalytics: boolean;
  privacyPhotoRetention: boolean;
  privacyCoachSharing: boolean;
  notificationSchedule: Record<string, unknown>;
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
      language: 'en',
      privacyAnalytics: true,
      privacyPhotoRetention: true,
      privacyCoachSharing: false,
      notificationSchedule: {},
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
  get language(): Language {
    return this.props.language;
  }
  get privacyAnalytics(): boolean {
    return this.props.privacyAnalytics;
  }
  get privacyPhotoRetention(): boolean {
    return this.props.privacyPhotoRetention;
  }
  get privacyCoachSharing(): boolean {
    return this.props.privacyCoachSharing;
  }
  get notificationSchedule(): Record<string, unknown> {
    return this.props.notificationSchedule;
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
