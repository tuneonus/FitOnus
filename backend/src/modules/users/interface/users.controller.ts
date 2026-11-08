import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { toPaginationMeta } from '../../../shared/pagination/pagination.js';
import type { ChangeUserStatusUseCase } from '../application/use-cases/change-user-status.js';
import type { CreateUserUseCase } from '../application/use-cases/create-user.js';
import type { DeleteAccountUseCase, DeleteAccountResult } from '../application/use-cases/delete-account.js';
import type { GetUserUseCase } from '../application/use-cases/get-user.js';
import type { ListUsersUseCase } from '../application/use-cases/list-users.js';
import type { UpdateUserProfileUseCase } from '../application/use-cases/update-user-profile.js';
import type { UserView } from '../application/user-view.js';
import {
  createUserRequest,
  deleteAccountRequest,
  listUsersRequest,
  updateOwnProfileRequest,
  updateUserProfileRequest,
  userIdRequest,
} from './users.schemas.js';

export interface UsersUseCases {
  createUser: CreateUserUseCase;
  getUser: GetUserUseCase;
  listUsers: ListUsersUseCase;
  updateProfile: UpdateUserProfileUseCase;
  changeStatus: ChangeUserStatusUseCase;
  deleteAccount: DeleteAccountUseCase;
}

/** Thin HTTP adapter: read validated input, call one use case, shape the result. */
export function createUsersController(useCases: UsersUseCases) {
  return {
    create: async (req: Request): Promise<RouteResult<UserView>> => {
      const { body, headers } = getValidated(req, createUserRequest);
      const result = await useCases.createUser.execute(requireActor(req), body, headers['idempotency-key']);
      return {
        data: result.value,
        ...(result.replayed ? { headers: { 'Idempotent-Replayed': 'true' } } : {}),
      };
    },

    list: async (req: Request): Promise<RouteResult<UserView[]>> => {
      const { query } = getValidated(req, listUsersRequest);
      const page = await useCases.listUsers.execute(requireActor(req), query);
      return { data: page.items, meta: toPaginationMeta(query, page.total) };
    },

    getMe: async (req: Request): Promise<RouteResult<UserView>> => {
      const actor = requireActor(req);
      return { data: await useCases.getUser.execute(actor, actor.userId) };
    },

    updateMe: async (req: Request): Promise<RouteResult<UserView>> => {
      const { body } = getValidated(req, updateOwnProfileRequest);
      const actor = requireActor(req);
      return { data: await useCases.updateProfile.execute(actor, actor.userId, body) };
    },

    deleteMe: async (req: Request): Promise<RouteResult<DeleteAccountResult>> => {
      const { body } = getValidated(req, deleteAccountRequest);
      const actor = requireActor(req);
      const data = await useCases.deleteAccount.execute(actor, body);
      return { data, message: 'Account and all associated personal data permanently deleted.' };
    },

    getById: async (req: Request): Promise<RouteResult<UserView>> => {
      const { params } = getValidated(req, userIdRequest);
      return { data: await useCases.getUser.execute(requireActor(req), params.id) };
    },

    updateById: async (req: Request): Promise<RouteResult<UserView>> => {
      const { params, body } = getValidated(req, updateUserProfileRequest);
      return { data: await useCases.updateProfile.execute(requireActor(req), params.id, body) };
    },

    disable: async (req: Request): Promise<RouteResult<UserView>> => {
      const { params } = getValidated(req, userIdRequest);
      return { data: await useCases.changeStatus.execute(requireActor(req), params.id, 'disabled') };
    },

    enable: async (req: Request): Promise<RouteResult<UserView>> => {
      const { params } = getValidated(req, userIdRequest);
      return { data: await useCases.changeStatus.execute(requireActor(req), params.id, 'active') };
    },
  };
}

export type UsersController = ReturnType<typeof createUsersController>;
