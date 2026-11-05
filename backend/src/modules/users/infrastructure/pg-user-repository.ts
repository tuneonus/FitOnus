import type { SqlExecutor } from '../../../database/transaction.js';
import { isUniqueViolation } from '../../../database/errors.js';
import { escapeLike, orderByClause } from '../../../database/sql.js';
import type { Role } from '../../../shared/auth/permissions.js';
import { conflict } from '../../../shared/errors/app-error.js';
import { offsetOf, type Page } from '../../../shared/pagination/pagination.js';
import type { User, UserStatus } from '../domain/user.js';
import type { NewUser, UserListQuery, UserRepository, UserSortField } from '../application/ports.js';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

const COLUMNS =
  'id, email, display_name, password_hash, role, status, version, created_at, updated_at, disabled_at';

const SORT_COLUMNS: Readonly<Record<UserSortField, string>> = {
  createdAt: 'created_at',
  email: 'email',
  displayName: 'display_name',
};

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  role: row.role,
  status: row.status,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  disabledAt: row.disabled_at,
});

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: SqlExecutor) {}

  async insert(user: NewUser): Promise<User> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [user.email, user.displayName, user.passwordHash, user.role],
      );
      return toUser(rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw conflict('EMAIL_ALREADY_EXISTS', 'A user with this email already exists.');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async list(query: UserListQuery): Promise<Page<User>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const param = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.search) {
      const pattern = param(`%${escapeLike(query.search)}%`);
      conditions.push(`(email ILIKE ${pattern} ESCAPE '\\' OR display_name ILIKE ${pattern} ESCAPE '\\')`);
    }
    if (query.status) conditions.push(`status = ${param(query.status)}`);
    if (query.role) conditions.push(`role = ${param(query.role)}`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const filterValues = [...values];
    const orderBy = orderByClause(SORT_COLUMNS, query.sort, query.order);
    const limit = param(query.limit);
    const offset = param(offsetOf(query));

    const [items, count] = await Promise.all([
      this.db.query<UserRow>(
        `SELECT ${COLUMNS} FROM users ${where} ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
        values,
      ),
      this.db.query<{ total: number }>(`SELECT count(*)::int AS total FROM users ${where}`, filterValues),
    ]);
    return { items: items.rows.map(toUser), total: count.rows[0]?.total ?? 0 };
  }

  async updateProfile(
    id: string,
    expectedVersion: number,
    changes: { displayName: string },
  ): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users
          SET display_name = $3, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2
        RETURNING ${COLUMNS}`,
      [id, expectedVersion, changes.displayName],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async changeStatus(id: string, expectedVersion: number, status: UserStatus): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users
          SET status = $3,
              disabled_at = CASE WHEN $3 = 'disabled' THEN now() ELSE NULL END,
              version = version + 1,
              updated_at = now()
        WHERE id = $1 AND version = $2 AND status <> $3
        RETURNING ${COLUMNS}`,
      [id, expectedVersion, status],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE users SET password_hash = $2, version = version + 1, updated_at = now() WHERE id = $1`,
      [id, passwordHash],
    );
    return result.rowCount === 1;
  }
}
