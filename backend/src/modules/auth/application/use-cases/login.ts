import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { accountDisabled, invalidCredentials } from '../errors.js';
import type { AuthTokens, ClientMeta, UserAccountsPort } from '../ports.js';
import type { SessionIssuer } from '../session-issuer.js';

export class LoginUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      passwordHasher: PasswordHasher;
      issuer: SessionIssuer;
      /** Hash verified against when the e-mail is unknown, so timing does not reveal account existence. */
      dummyPasswordHash: () => Promise<string>;
    },
  ) {}

  async execute(input: { email: string; password: string }, meta: ClientMeta): Promise<AuthTokens> {
    const { accounts, passwordHasher } = this.deps;
    const account = await accounts.findCredentialsByEmail(input.email);
    if (!account) {
      await passwordHasher.verify(await this.deps.dummyPasswordHash(), input.password);
      throw invalidCredentials();
    }
    if (!(await passwordHasher.verify(account.passwordHash, input.password))) throw invalidCredentials();
    // Checked only after the password, so disabled state is not disclosed to someone without it.
    if (account.status !== 'active') throw accountDisabled();

    if (passwordHasher.needsRehash(account.passwordHash)) {
      await accounts.updatePasswordHash(account.id, await passwordHasher.hash(input.password));
    }
    return this.deps.issuer.issue(account.id, meta);
  }
}
