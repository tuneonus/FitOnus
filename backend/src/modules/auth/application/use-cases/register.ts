import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { assertPasswordPolicy } from '../../../../shared/security/password-policy.js';
import type { AuthTokens, ClientMeta, UserAccountsPort } from '../ports.js';
import type { SessionIssuer } from '../session-issuer.js';

/**
 * Self-service registration. Disabled unless AUTH_PUBLIC_REGISTRATION=true; new accounts
 * always get the least-privileged role. Account + session are created atomically.
 */
export class RegisterUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      passwordHasher: PasswordHasher;
      issuer: SessionIssuer;
      uow: UnitOfWork;
      publicRegistrationEnabled: boolean;
    },
  ) {}

  async execute(
    input: { email: string; displayName: string; password: string },
    meta: ClientMeta,
  ): Promise<AuthTokens> {
    if (!this.deps.publicRegistrationEnabled) {
      throw new AppError('forbidden', 'REGISTRATION_DISABLED', 'Self-service registration is disabled.');
    }
    assertPasswordPolicy(input.password);
    const passwordHash = await this.deps.passwordHasher.hash(input.password);

    return this.deps.uow.run(async () => {
      const account = await this.deps.accounts.registerAccount({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      });
      return this.deps.issuer.issue(account.id, meta);
    });
  }
}
