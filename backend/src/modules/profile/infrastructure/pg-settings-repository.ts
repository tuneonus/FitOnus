import type { SqlExecutor } from '../../../database/transaction.js';
import {
  type ThemeMode,
  type UnitSystem,
  UserSettings,
  type UserSettingsProps,
} from '../domain/user-settings.js';
import type { SettingsRepository, UpdateSettingsParams } from '../application/ports.js';

interface SettingsRow {
  user_id: string;
  theme_mode: ThemeMode;
  unit_system: UnitSystem;
  health_connect_enabled: boolean;
  smartwatch_connected: boolean;
  notifications_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

const SELECT_SETTINGS = `
  SELECT
    user_id,
    theme_mode,
    unit_system,
    health_connect_enabled,
    smartwatch_connected,
    notifications_enabled,
    created_at,
    updated_at
  FROM user_settings
`;

const toUserSettings = (row: SettingsRow): UserSettings => {
  const props: UserSettingsProps = {
    userId: row.user_id,
    themeMode: row.theme_mode,
    unitSystem: row.unit_system,
    healthConnectEnabled: row.health_connect_enabled,
    smartwatchConnected: row.smartwatch_connected,
    notificationsEnabled: row.notifications_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return UserSettings.reconstruct(props);
};

export class PgSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findByUserId(userId: string): Promise<UserSettings | null> {
    const { rows } = await this.db.query<SettingsRow>(`${SELECT_SETTINGS} WHERE user_id = $1`, [userId]);
    if (!rows[0]) return null;
    return toUserSettings(rows[0]);
  }

  async ensureSettings(userId: string): Promise<UserSettings> {
    await this.db.query(
      `INSERT INTO user_settings (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const result = await this.findByUserId(userId);
    if (!result) {
      throw new Error(`Failed to ensure user settings for user ${userId}`);
    }
    return result;
  }

  async updateSettings(userId: string, changes: UpdateSettingsParams): Promise<UserSettings> {
    const setClauses: string[] = [];
    const values: unknown[] = [userId];

    const addClause = (col: string, val: unknown) => {
      values.push(val);
      setClauses.push(`${col} = $${values.length}`);
    };

    if (changes.themeMode !== undefined) addClause('theme_mode', changes.themeMode);
    if (changes.unitSystem !== undefined) addClause('unit_system', changes.unitSystem);
    if (changes.healthConnectEnabled !== undefined)
      addClause('health_connect_enabled', changes.healthConnectEnabled);
    if (changes.smartwatchConnected !== undefined)
      addClause('smartwatch_connected', changes.smartwatchConnected);
    if (changes.notificationsEnabled !== undefined)
      addClause('notifications_enabled', changes.notificationsEnabled);

    if (setClauses.length > 0) {
      setClauses.push('updated_at = now()');
      await this.db.query(
        `UPDATE user_settings
         SET ${setClauses.join(', ')}
         WHERE user_id = $1`,
        values,
      );
    }

    const result = await this.findByUserId(userId);
    return result!;
  }
}
