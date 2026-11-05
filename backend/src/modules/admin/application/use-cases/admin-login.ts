import { AppError } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
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

export class AdminLoginUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      passwordHasher: PasswordHasher;
      issuer: SessionIssuer;
      adminRepo: AdminRepository;
    },
  ) {}

  async execute(input: AdminLoginInput, meta: ClientMeta): Promise<AdminLoginResult> {
    const creds = await this.deps.accounts.findCredentialsByEmail(input.email);
    if (!creds) {
      throw new AppError('unauthorized', 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (creds.status !== 'active') {
      throw new AppError('forbidden', 'ACCOUNT_DISABLED', 'This administrator account is disabled.');
    }

    if (creds.role !== 'admin') {
      throw new AppError(
        'forbidden',
        'FORBIDDEN',
        'Administrator privileges are required to access this portal.',
      );
    }

    const matches = await this.deps.passwordHasher.verify(creds.passwordHash, input.password);
    if (!matches) {
      throw new AppError('unauthorized', 'INVALID_CREDENTIALS', 'Invalid email or password.');
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
