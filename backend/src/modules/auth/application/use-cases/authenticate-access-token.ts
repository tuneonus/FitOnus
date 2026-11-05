import { createActor, type Actor } from '../../../../shared/auth/actor.js';
import { isSessionActive } from '../../domain/session.js';
import { accountDisabled, sessionRevoked } from '../errors.js';
import type { AccessTokenService, Clock, SessionRepository, UserAccountsPort } from '../ports.js';

/**
 * Resolves a bearer token into an Actor on every request.
 *
 * Fail-closed: besides the JWT signature/claims, the session row and the account are read
 * from PostgreSQL, so logout, password change and account disabling take effect immediately,
 * and role changes apply on the next request. Any lookup error rejects the request.
 */
export class AuthenticateAccessTokenUseCase {
  constructor(
    private readonly deps: {
      tokens: AccessTokenService;
      sessions: SessionRepository;
      accounts: UserAccountsPort;
      clock: Clock;
    },
  ) {}

  async execute(token: string): Promise<Actor> {
    const claims = await this.deps.tokens.verify(token);
    const session = await this.deps.sessions.findById(claims.sessionId);
    if (!session || session.userId !== claims.userId || !isSessionActive(session, this.deps.clock())) {
      throw sessionRevoked();
    }
    const account = await this.deps.accounts.getAccountState(claims.userId);
    if (!account) throw sessionRevoked();
    if (account.status !== 'active') throw accountDisabled();

    return createActor({ userId: account.id, sessionId: session.id, role: account.role });
  }
}
