import type { Database } from '../../../database/transaction.js';
import { toPaginationMeta, type PaginationMeta } from '../../../shared/pagination/pagination.js';
import type { AdminAuditLog, AuditAction } from '../domain/admin-audit-log.js';
import type { DashboardStats } from '../domain/dashboard-stats.js';
import type {
  AdminAuditLogView,
  AdminRepository,
  AdminUserActivityView,
  AdminUserDetailView,
  AdminUserListItemView,
  ListAdminUsersQuery,
  ListAuditLogsQuery,
} from '../application/ports.js';

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly db: Database) {}

  async getDashboardStats(timeframe = '14d'): Promise<DashboardStats> {
    const days = timeframe === '90d' ? 90 : timeframe === '30d' ? 30 : timeframe === '7d' ? 7 : 14;
    const intervalDays = days - 1;

    const totalQuery = `
      SELECT
        (SELECT count(*)::int FROM users) AS total_users,
        (SELECT count(*)::int FROM users WHERE status = 'active') AS active_users,
        (SELECT count(*)::int FROM users WHERE status = 'disabled') AS disabled_users,
        (SELECT count(DISTINCT user_id)::int FROM auth_sessions WHERE last_used_at >= now() - INTERVAL '7 days' AND revoked_at IS NULL) AS active_7d,
        (SELECT count(DISTINCT user_id)::int FROM auth_sessions WHERE last_used_at >= now() - INTERVAL '30 days' AND revoked_at IS NULL) AS active_30d,
        (SELECT count(*)::int FROM user_profiles WHERE onboarding_completed = true) AS completed_onboarding,
        (SELECT count(*)::int FROM users WHERE created_at >= now() - INTERVAL '7 days') AS new_7d,
        (SELECT count(*)::int FROM users WHERE created_at >= now() - INTERVAL '30 days') AS new_30d
    `;

    const recentQuery = `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.status,
        coalesce(p.onboarding_completed, false) AS onboarding_completed,
        u.created_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 6
    `;

    const trendQuery = `
      SELECT
        to_char(date_trunc('day', d), 'YYYY-MM-DD') AS date_label,
        count(u.id)::int AS registration_count
      FROM generate_series(CURRENT_DATE - INTERVAL '${intervalDays} days', CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN users u ON date_trunc('day', u.created_at) = d
      GROUP BY d
      ORDER BY d ASC
    `;

    const [countsResult, recentResult, trendResult] = await Promise.all([
      this.db.query<{
        total_users: number;
        active_users: number;
        disabled_users: number;
        active_7d: number;
        active_30d: number;
        completed_onboarding: number;
        new_7d: number;
        new_30d: number;
      }>(totalQuery),
      this.db.query<{
        id: string;
        email: string;
        display_name: string;
        role: string;
        status: string;
        onboarding_completed: boolean;
        created_at: Date;
      }>(recentQuery),
      this.db.query<{
        date_label: string;
        registration_count: number;
      }>(trendQuery),
    ]);

    const counts = countsResult.rows[0]!;
    const totalUsers = counts.total_users;
    const completedOnboarding = counts.completed_onboarding;
    const pendingOnboarding = Math.max(0, totalUsers - completedOnboarding);

    return {
      totalUsers,
      activeUsers: counts.active_users,
      disabledUsers: counts.disabled_users,
      activeUsers7d: counts.active_7d,
      activeUsers30d: counts.active_30d,
      completedOnboarding,
      pendingOnboarding,
      newRegistrations7d: counts.new_7d,
      newRegistrations30d: counts.new_30d,
      recentUsers: recentResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        onboardingCompleted: row.onboarding_completed,
        createdAt: row.created_at,
      })),
      registrationTrend: trendResult.rows.map((row) => ({
        date: row.date_label,
        count: row.registration_count,
      })),
    };
  }

  async listUsers(
    query: ListAdminUsersQuery,
  ): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    const { page, limit, search, status, role, onboarding, sort, order } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (search && search.trim().length > 0) {
      conditions.push(`(u.display_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      values.push(`%${search.trim()}%`);
      idx++;
    }

    if (status) {
      conditions.push(`u.status = $${idx}`);
      values.push(status);
      idx++;
    }

    if (role) {
      conditions.push(`u.role = $${idx}`);
      values.push(role);
      idx++;
    }

    if (onboarding) {
      if (onboarding === 'completed') {
        conditions.push(`p.onboarding_completed = true`);
      } else {
        conditions.push(`(p.onboarding_completed IS NULL OR p.onboarding_completed = false)`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumnMap: Record<string, string> = {
      createdAt: 'u.created_at',
      email: 'u.email',
      displayName: 'u.display_name',
      status: 'u.status',
    };
    const sortCol = sortColumnMap[sort] ?? 'u.created_at';
    const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countSql = `
      SELECT count(*)::int AS total
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      ${whereClause}
    `;

    const dataSql = `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.status,
        u.version,
        coalesce(p.onboarding_completed, false) AS onboarding_completed,
        p.current_onboarding_step,
        u.created_at,
        u.updated_at,
        u.disabled_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}, u.id ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countResult = await this.db.query<{ total: number }>(countSql, values);
    const totalItems = countResult.rows[0]?.total ?? 0;

    const dataResult = await this.db.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      status: string;
      version: number;
      onboarding_completed: boolean;
      current_onboarding_step: string | null;
      created_at: Date;
      updated_at: Date;
      disabled_at: Date | null;
    }>(dataSql, [...values, limit, offset]);

    const items: AdminUserListItemView[] = dataResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      version: row.version,
      onboardingCompleted: row.onboarding_completed,
      currentOnboardingStep: row.current_onboarding_step,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      disabledAt: row.disabled_at ? row.disabled_at.toISOString() : null,
    }));

    return {
      items,
      meta: toPaginationMeta({ page, limit }, totalItems),
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetailView | null> {
    const userSql = `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.status,
        u.version,
        u.created_at,
        u.updated_at,
        u.disabled_at,
        coalesce(s.active_sessions, 0)::int AS active_sessions_count,
        s.last_active_at,
        p.user_id IS NOT NULL AS has_profile,
        coalesce(p.onboarding_completed, false) AS onboarding_completed,
        p.current_onboarding_step,
        p.primary_goal,
        p.experience_level,
        p.preferred_workout_place,
        p.workout_days_per_week,
        p.preferred_workout_duration_min,
        p.diet_type,
        p.daily_calorie_target,
        p.daily_protein_grams,
        p.created_at AS profile_created_at,
        p.updated_at AS profile_updated_at
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          count(*)::int AS active_sessions,
          max(last_used_at) AS last_active_at
        FROM auth_sessions
        WHERE revoked_at IS NULL AND expires_at > now()
        GROUP BY user_id
      ) s ON s.user_id = u.id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
    `;

    const res = await this.db.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      status: string;
      version: number;
      created_at: Date;
      updated_at: Date;
      disabled_at: Date | null;
      active_sessions_count: number;
      last_active_at: Date | null;
      has_profile: boolean;
      onboarding_completed: boolean;
      current_onboarding_step: string | null;
      primary_goal: string | null;
      experience_level: string | null;
      preferred_workout_place: string | null;
      workout_days_per_week: number | null;
      preferred_workout_duration_min: number | null;
      diet_type: string | null;
      daily_calorie_target: number | null;
      daily_protein_grams: number | null;
      profile_created_at: Date | null;
      profile_updated_at: Date | null;
    }>(userSql, [userId]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;

    return {
      user: {
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        role: r.role,
        status: r.status,
        version: r.version,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        disabledAt: r.disabled_at ? r.disabled_at.toISOString() : null,
      },
      sessionsSummary: {
        activeSessionsCount: r.active_sessions_count,
        lastActiveAt: r.last_active_at ? r.last_active_at.toISOString() : null,
      },
      profileMetadata: {
        hasProfile: r.has_profile,
        onboardingCompleted: r.onboarding_completed,
        currentOnboardingStep: r.current_onboarding_step,
        primaryGoal: r.primary_goal,
        experienceLevel: r.experience_level,
        preferredWorkoutPlace: r.preferred_workout_place,
        workoutDaysPerWeek: r.workout_days_per_week,
        preferredWorkoutDurationMin: r.preferred_workout_duration_min,
        dietType: r.diet_type,
        dailyCalorieTarget: r.daily_calorie_target,
        dailyProteinGrams: r.daily_protein_grams,
        createdAt: r.profile_created_at ? r.profile_created_at.toISOString() : null,
        updatedAt: r.profile_updated_at ? r.profile_updated_at.toISOString() : null,
      },
    };
  }

  async recordAuditLog(entry: {
    adminId: string;
    action: AuditAction;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AdminAuditLog> {
    const sql = `
      INSERT INTO admin_audit_logs (
        admin_id,
        action,
        target_user_id,
        details,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const res = await this.db.query<{
      id: string;
      admin_id: string;
      action: AuditAction;
      target_user_id: string | null;
      details: Record<string, unknown>;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
    }>(sql, [
      entry.adminId,
      entry.action,
      entry.targetUserId ?? null,
      JSON.stringify(entry.details ?? {}),
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ]);

    const row = res.rows[0]!;
    return {
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      targetUserId: row.target_user_id,
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    };
  }

  async listAuditLogs(
    query: ListAuditLogsQuery,
  ): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    const { page, limit, action, adminId, targetUserId } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (action) {
      conditions.push(`a.action = $${idx}`);
      values.push(action);
      idx++;
    }

    if (adminId) {
      conditions.push(`a.admin_id = $${idx}`);
      values.push(adminId);
      idx++;
    }

    if (targetUserId) {
      conditions.push(`a.target_user_id = $${idx}`);
      values.push(targetUserId);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT count(*)::int AS total
      FROM admin_audit_logs a
      ${whereClause}
    `;

    const dataSql = `
      SELECT
        a.id,
        a.admin_id,
        adm.email AS admin_email,
        adm.display_name AS admin_name,
        a.action,
        a.target_user_id,
        tu.email AS target_user_email,
        a.details,
        a.ip_address,
        a.user_agent,
        a.created_at
      FROM admin_audit_logs a
      LEFT JOIN users adm ON adm.id = a.admin_id
      LEFT JOIN users tu ON tu.id = a.target_user_id
      ${whereClause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countResult = await this.db.query<{ total: number }>(countSql, values);
    const totalItems = countResult.rows[0]?.total ?? 0;

    const dataResult = await this.db.query<{
      id: string;
      admin_id: string;
      admin_email: string | null;
      admin_name: string | null;
      action: string;
      target_user_id: string | null;
      target_user_email: string | null;
      details: Record<string, unknown>;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
    }>(dataSql, [...values, limit, offset]);

    const items: AdminAuditLogView[] = dataResult.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminEmail: row.admin_email,
      adminName: row.admin_name,
      action: row.action,
      targetUserId: row.target_user_id,
      targetUserEmail: row.target_user_email,
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at.toISOString(),
    }));

    return {
      items,
      meta: toPaginationMeta({ page, limit }, totalItems),
    };
  }

  async getUserActivity(userId: string): Promise<AdminUserActivityView> {
    const [workoutsAggRes, workoutSessionsRes, mealsAggRes, mealsRes, weightSummaryRes, weightLogsRes] =
      await Promise.all([
        this.db.query<{
          total_sessions: number;
          total_duration_min: number;
          total_volume_kg: number;
        }>(
          `SELECT
             count(*)::int AS total_sessions,
             coalesce(sum(duration_seconds), 0)::int / 60 AS total_duration_min,
             coalesce(sum(total_volume_kg), 0)::float AS total_volume_kg
           FROM workout_sessions
           WHERE user_id = $1`,
          [userId],
        ),
        this.db.query<{
          id: string;
          workout_name: string | null;
          started_at: Date;
          completed_at: Date | null;
          duration_seconds: number | null;
          total_volume_kg: number | null;
        }>(
          `SELECT
             id,
             workout_name,
             started_at,
             completed_at,
             duration_seconds,
             total_volume_kg
           FROM workout_sessions
           WHERE user_id = $1
           ORDER BY started_at DESC
           LIMIT 10`,
          [userId],
        ),
        this.db.query<{
          total_meals: number;
          avg_daily_calories: number;
        }>(
          `SELECT
             count(*)::int AS total_meals,
             round(coalesce(avg(total_calories), 0))::int AS avg_daily_calories
           FROM meals
           WHERE user_id = $1 AND deleted_at IS NULL`,
          [userId],
        ),
        this.db.query<{
          id: string;
          meal_type: string;
          total_calories: number;
          total_protein_g: number;
          total_carbs_g: number;
          total_fat_g: number;
          created_at: Date;
        }>(
          `SELECT
             id,
             meal_type,
             coalesce(total_calories, 0)::int AS total_calories,
             coalesce(total_protein_g, 0)::float AS total_protein_g,
             coalesce(total_carbs_g, 0)::float AS total_carbs_g,
             coalesce(total_fat_g, 0)::float AS total_fat_g,
             created_at
           FROM meals
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT 10`,
          [userId],
        ),
        this.db.query<{
          current_weight_kg: number | null;
          starting_weight_kg: number | null;
          total_entries: number;
        }>(
          `SELECT
             p.current_weight_kg,
             p.starting_weight_kg,
             (SELECT count(*)::int FROM weight_logs WHERE user_id = $1 AND deleted_at IS NULL) AS total_entries
           FROM user_profiles p
           WHERE p.user_id = $1`,
          [userId],
        ),
        this.db.query<{
          id: string;
          weight_kg: number;
          logged_at: Date;
        }>(
          `SELECT id, weight_kg::float, logged_at
           FROM weight_logs
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY logged_at DESC
           LIMIT 10`,
          [userId],
        ),
      ]);

    const workoutAgg = workoutsAggRes.rows[0] ?? {
      total_sessions: 0,
      total_duration_min: 0,
      total_volume_kg: 0,
    };
    const mealsAgg = mealsAggRes.rows[0] ?? {
      total_meals: 0,
      avg_daily_calories: 0,
    };
    const weightSummary = weightSummaryRes.rows[0] ?? {
      current_weight_kg: null,
      starting_weight_kg: null,
      total_entries: 0,
    };

    return {
      userId,
      workouts: {
        totalSessions: workoutAgg.total_sessions,
        totalDurationMin: workoutAgg.total_duration_min,
        totalVolumeKg: Number((workoutAgg.total_volume_kg || 0).toFixed(1)),
        recentSessions: workoutSessionsRes.rows.map((r) => ({
          id: r.id,
          name: r.workout_name || 'Workout Session',
          startedAt: r.started_at.toISOString(),
          completedAt: r.completed_at ? r.completed_at.toISOString() : null,
          durationMin: Math.round((r.duration_seconds || 0) / 60),
          volumeKg: Number((r.total_volume_kg || 0).toFixed(1)),
        })),
      },
      nutrition: {
        totalMeals: mealsAgg.total_meals,
        avgDailyCalories: mealsAgg.avg_daily_calories,
        recentMeals: mealsRes.rows.map((r) => ({
          id: r.id,
          mealType: r.meal_type,
          calories: r.total_calories,
          proteinG: Number((r.total_protein_g || 0).toFixed(1)),
          carbsG: Number((r.total_carbs_g || 0).toFixed(1)),
          fatG: Number((r.total_fat_g || 0).toFixed(1)),
          loggedAt: r.created_at.toISOString(),
        })),
      },
      weight: {
        currentWeightKg: weightSummary.current_weight_kg ? Number(weightSummary.current_weight_kg) : null,
        startingWeightKg: weightSummary.starting_weight_kg ? Number(weightSummary.starting_weight_kg) : null,
        totalEntries: weightSummary.total_entries,
        recentEntries: weightLogsRes.rows.map((r) => ({
          id: r.id,
          weightKg: Number(r.weight_kg),
          loggedAt: r.logged_at.toISOString(),
        })),
      },
    };
  }
}
