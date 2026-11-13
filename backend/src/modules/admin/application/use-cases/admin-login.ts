import { AppError } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { randomToken } from '../../../../shared/security/random.js';
import type { AuthTokens, ClientMeta, SessionIssuer, UserAccountsPort } from '../../../auth/index.js';
import type { AdminRepository } from '../ports.js';

export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminLoginResult {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: 'admin';
  };
}

/**
 * Why an admin sign-in was refused. SERVER-SIDE ONLY: it travels as the `cause` of the uniform
 * error below (the HTTP error handler never serialises `cause`) and is only ever logged internally.
 */
export type AdminLoginRejectionReason =
  'unknown_account' | 'invalid_password' | 'account_disabled' | 'not_admin';

export class AdminLoginRejection {
  constructor(
    readonly reason: AdminLoginRejectionReason,
    /** Id of the matched account, null when the e-mail is unknown. Never the e-mail or the password. */
    readonly accountId: string | null,
  ) {}
}

/** Returns the internal rejection reason carried by an error thrown from the admin login, if any. */
export const getAdminLoginRejection = (error: unknown): AdminLoginRejection | undefined =>
  error instanceof AppError && error.cause instanceof AdminLoginRejection ? error.cause : undefined;

/**
 * The single failure every refused admin sign-in produces: unknown e-mail, wrong password,
 * disabled account and non-admin account all look exactly the same to the client.
 */
const invalidAdminCredentials = (rejection: AdminLoginRejection): AppError =>
  new AppError('unauthorized', 'INVALID_CREDENTIALS', 'Invalid email or password.', undefined, {
    cause: rejection,
  });

export class AdminLoginUseCase {
  /** Lazily created so the first sign-in pays for it; cleared on failure so one error is not permanent. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      passwordHasher: PasswordHasher;
      issuer: SessionIssuer;
      adminRepo: AdminRepository;
    },
  ) {}

  /**
   * Hash verified against when the e-mail is unknown. It comes from the same PasswordHasher as
   * real hashes, so cost parameters (and therefore timing) match.
   */
  private dummyPasswordHash(): Promise<string> {
    this.dummyHash ??= this.deps.passwordHasher.hash(randomToken()).catch((error: unknown) => {
      this.dummyHash = undefined;
      throw error;
    });
    return this.dummyHash;
  }

  async execute(input: AdminLoginInput, meta: ClientMeta): Promise<AdminLoginResult> {
    const { accounts, passwordHasher } = this.deps;

    const creds = await accounts.findCredentialsByEmail(input.email);

    // Exactly one password verification on every path (against a dummy hash for unknown
    // accounts), and always BEFORE status or role are looked at. Otherwise response content or
    // timing would reveal which e-mails exist, which are disabled and which are not admins.
    const matches = await passwordHasher.verify(
      creds ? creds.passwordHash : await this.dummyPasswordHash(),
      input.password,
    );

    if (!creds) throw invalidAdminCredentials(new AdminLoginRejection('unknown_account', null));
    if (!matches) throw invalidAdminCredentials(new AdminLoginRejection('invalid_password', creds.id));
    // Both checks run only once the caller has proven knowledge of the password, and are
    // reported with the same generic error. No session is ever issued for these accounts.
    if (creds.status !== 'active') {
      throw invalidAdminCredentials(new AdminLoginRejection('account_disabled', creds.id));
    }
    if (creds.role !== 'admin') {
      throw invalidAdminCredentials(new AdminLoginRejection('not_admin', creds.id));
    }

    const tokens = await this.deps.issuer.issue(creds.id, meta);

    // Record audit event
    await this.deps.adminRepo.recordAuditLog({
      adminId: creds.id,
      action: 'admin.login',
      targetUserId: creds.id,
      details: { role: creds.role },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const userDetail = await this.deps.adminRepo.getUserDetail(creds.id);

    return {
      tokens,
      user: {
        id: creds.id,
        email: creds.email,
        displayName: userDetail?.user.displayName ?? 'Administrator',
        role: 'admin',
      },
    };
  }
}
