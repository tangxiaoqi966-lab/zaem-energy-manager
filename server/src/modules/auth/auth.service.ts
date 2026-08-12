import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole, OperationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeOperation } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import { ADMIN_RESET_NAME, ADMIN_RESET_PASSWORD, ADMIN_RESET_USERNAME, JWT_SECRET } from '../../config/env';
import { JwtPayload } from '../../middleware/auth';
import { OperationActorContext } from '../../lib/operation-log';

export interface LoginInput {
  username: string;
  password: string;
}

export interface UserResponse {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

export interface UserManagementItem {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: UserRole;
}

export interface ForcePasswordChangeInput {
  username: string;
  currentPassword: string;
  newUsername: string;
  newPassword: string;
  newName?: string;
}

export const login = async (
  input: LoginInput,
  actorContext?: OperationActorContext,
): Promise<LoginResponse> => {
  if (
    !input ||
    typeof input.username !== 'string' ||
    typeof input.password !== 'string' ||
    !input.username.trim() ||
    !input.password
  ) {
    throw new AppError(400, 'INVALID_LOGIN_INPUT', '用户名和密码不能为空');
  }

  const user = await prisma.user.findUnique({
    where: { username: input.username.trim() },
    include: { role: true },
  });

  if (!user) {
    await writeOperation(
      null,
      OperationType.login,
      null,
      {
        action: 'login_failed',
        actionLabel: '登录失败',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        username: input.username.trim(),
        loginAddress: actorContext?.locationLabel || actorContext?.ip,
        ip: actorContext?.ip,
        loginDevice: actorContext?.deviceLabel,
        userAgent: actorContext?.userAgent,
        error: '用户名不存在',
      },
      false,
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isPasswordValid) {
    await writeOperation(
      user.id,
      OperationType.login,
      null,
      {
        action: 'login_failed',
        actionLabel: '登录失败',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        username: user.username,
        loginAddress: actorContext?.locationLabel || actorContext?.ip,
        ip: actorContext?.ip,
        loginDevice: actorContext?.deviceLabel,
        userAgent: actorContext?.userAgent,
        error: '密码错误',
      },
      false,
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  if (!user.role) {
    throw new AppError(500, 'USER_ROLE_INVALID', '当前账号角色数据异常');
  }

  const payload: JwtPayload = {
    id: user.id,
    username: user.username,
    role: user.role.name,
    name: user.name,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeOperation(
    user.id,
    OperationType.login,
    null,
    {
      action: 'login_success',
      actionLabel: '登录',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      username: user.username,
      loginAddress: actorContext?.locationLabel || actorContext?.ip,
      ip: actorContext?.ip,
      loginDevice: actorContext?.deviceLabel,
      userAgent: actorContext?.userAgent,
      note: '登录成功',
    },
    true,
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role.name,
      mustChangePassword: user.mustChangePassword,
    },
  };
};

export const logout = async (
  userId: string,
  actorContext?: OperationActorContext,
): Promise<void> => {
  await writeOperation(
    userId,
    OperationType.logout,
    null,
    {
      action: 'logout',
      actionLabel: '退出登录',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      loginAddress: actorContext?.locationLabel || actorContext?.ip,
      ip: actorContext?.ip,
      loginDevice: actorContext?.deviceLabel,
      userAgent: actorContext?.userAgent,
    },
    true,
  );
};

export const getCurrentUser = async (userId: string): Promise<UserResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role.name,
    mustChangePassword: user.mustChangePassword,
  };
};

export const listUsers = async (): Promise<UserManagementItem[]> => {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: [{ createdAt: 'asc' }],
  });

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role.name,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  }));
};

export const createUser = async (
  input: CreateUserInput,
  operatorUserId: string,
  actorContext?: OperationActorContext,
): Promise<UserManagementItem> => {
  const username = input.username?.trim();
  const password = input.password ?? '';
  const name = input.name?.trim();

  if (!username || !name || !password) {
    throw new AppError(400, 'INVALID_USER_INPUT', '用户名、姓名和密码不能为空');
  }

  if (password.length < 6) {
    throw new AppError(400, 'INVALID_PASSWORD', '密码至少需要 6 位');
  }

  const existing = await prisma.user.findUnique({
    where: { username },
  });
  if (existing) {
    throw new AppError(409, 'USERNAME_EXISTS', '用户名已存在');
  }

  const role = await prisma.role.findUnique({
    where: { name: input.role },
  });
  if (!role) {
    throw new AppError(400, 'ROLE_NOT_FOUND', '用户角色不存在');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      name,
      mustChangePassword: input.role === UserRole.admin,
      roleId: role.id,
    },
    include: { role: true },
  });

  await writeOperation(
    operatorUserId,
    OperationType.update_settings,
    null,
    {
      action: 'create_user',
      actionLabel: '创建账号',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      username,
      targetUserId: user.id,
      targetUserRole: user.role.name,
      targetUserName: name,
    },
    true,
  );

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role.name,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput,
  operatorUserId: string,
  actorContext?: OperationActorContext,
): Promise<UserManagementItem> => {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!existing) {
    throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  }

  const nextName = input.name?.trim();
  const nextPassword = input.password ?? '';
  const nextRole = input.role;

  if (nextPassword && nextPassword.length < 6) {
    throw new AppError(400, 'INVALID_PASSWORD', '密码至少需要 6 位');
  }

  if (operatorUserId === userId && nextRole && nextRole !== existing.role.name) {
    throw new AppError(400, 'SELF_ROLE_CHANGE_FORBIDDEN', '不能修改当前超级管理员自己的角色');
  }

  let nextRoleId: string | undefined;
  if (nextRole && nextRole !== existing.role.name) {
    const role = await prisma.role.findUnique({
      where: { name: nextRole },
    });
    if (!role) {
      throw new AppError(400, 'ROLE_NOT_FOUND', '用户角色不存在');
    }
    nextRoleId = role.id;
  }

  const data: {
    name?: string;
    passwordHash?: string;
    roleId?: string;
    mustChangePassword?: boolean;
    passwordUpdatedAt?: Date;
  } = {};

  if (nextName) {
    data.name = nextName;
  }
  if (nextPassword) {
    data.passwordHash = await bcrypt.hash(nextPassword, 10);
    data.mustChangePassword = false;
    data.passwordUpdatedAt = new Date();
  }
  if (nextRoleId) {
    data.roleId = nextRoleId;
  }

  if (Object.keys(data).length === 0) {
    return {
      id: existing.id,
      username: existing.username,
      name: existing.name,
      role: existing.role.name,
      createdAt: existing.createdAt.toISOString(),
      lastLoginAt: existing.lastLoginAt ? existing.lastLoginAt.toISOString() : null,
    };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    include: { role: true },
  });

  await writeOperation(
    operatorUserId,
    OperationType.update_settings,
    null,
    {
      action: 'update_user',
      actionLabel: '更新账号',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      username: updated.username,
      targetUserId: updated.id,
      targetUserRole: updated.role.name,
      targetUserName: updated.name,
      passwordUpdated: !!nextPassword,
    },
    true,
  );

  return {
    id: updated.id,
    username: updated.username,
    name: updated.name,
    role: updated.role.name,
    createdAt: updated.createdAt.toISOString(),
    lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
  };
};

export const deleteUser = async (
  userId: string,
  operatorUserId: string,
  actorContext?: OperationActorContext,
): Promise<void> => {
  if (userId === operatorUserId) {
    throw new AppError(400, 'SELF_DELETE_FORBIDDEN', '不能删除当前超级管理员自己');
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!existing) {
    throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  await writeOperation(
    operatorUserId,
    OperationType.update_settings,
    null,
    {
      action: 'delete_user',
      actionLabel: '删除账号',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      username: existing.username,
      targetUserId: existing.id,
      targetUserRole: existing.role.name,
      targetUserName: existing.name,
    },
    true,
  );
};

export const forceChangePassword = async (
  input: ForcePasswordChangeInput,
): Promise<LoginResponse> => {
  const username = input.username?.trim();
  const currentPassword = input.currentPassword ?? '';
  const newUsername = input.newUsername?.trim();
  const newPassword = input.newPassword ?? '';
  const newName = input.newName?.trim();

  if (!username || !currentPassword || !newUsername || !newPassword) {
    throw new AppError(400, 'INVALID_PASSWORD_CHANGE_INPUT', '请填完整当前账号、当前密码、新账号和新密码');
  }

  if (newPassword.length < 8) {
    throw new AppError(400, 'INVALID_NEW_PASSWORD', '新密码至少需要 8 位');
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });

  if (!user || user.role?.name !== UserRole.admin) {
    throw new AppError(403, 'FORBIDDEN', '只有超级管理员可以执行首次改密');
  }

  if (!user.mustChangePassword) {
    throw new AppError(400, 'PASSWORD_CHANGE_NOT_REQUIRED', '当前账号不需要执行首次改密');
  }

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '当前密码错误');
  }

  if (newUsername !== username) {
    const existing = await prisma.user.findUnique({
      where: { username: newUsername },
    });
    if (existing && existing.id !== user.id) {
      throw new AppError(409, 'USERNAME_EXISTS', '新用户名已存在');
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      username: newUsername,
      name: newName || user.name,
      passwordHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
      lastLoginAt: new Date(),
    },
    include: { role: true },
  });

  await writeOperation(
    updated.id,
    OperationType.update_settings,
    null,
    {
      action: 'force_change_password',
      actionLabel: '首次修改超级管理员账号密码',
      username: updated.username,
      targetUserId: updated.id,
      targetUserRole: updated.role.name,
      targetUserName: updated.name,
    },
    true,
  );

  const payload: JwtPayload = {
    id: updated.id,
    username: updated.username,
    role: updated.role.name,
    name: updated.name,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  return {
    token,
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.name,
      role: updated.role.name,
      mustChangePassword: updated.mustChangePassword,
    },
  };
};

export const applyAdminResetFromEnv = async (): Promise<void> => {
  const resetPassword = ADMIN_RESET_PASSWORD?.trim();
  if (!resetPassword) {
    return;
  }

  if (resetPassword.length < 8) {
    throw new AppError(500, 'INVALID_ADMIN_RESET_PASSWORD', 'ADMIN_RESET_PASSWORD 至少需要 8 位');
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: UserRole.admin },
  });
  if (!adminRole) {
    throw new AppError(500, 'ADMIN_ROLE_NOT_FOUND', '超级管理员角色不存在');
  }

  const currentAdmin =
    (ADMIN_RESET_USERNAME?.trim()
      ? await prisma.user.findUnique({
          where: { username: ADMIN_RESET_USERNAME.trim() },
          include: { role: true },
        })
      : null) ||
    (await prisma.user.findFirst({
      where: { roleId: adminRole.id },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    }));

  if (!currentAdmin) {
    throw new AppError(500, 'ADMIN_USER_NOT_FOUND', '未找到可重置的超级管理员账号');
  }

  const nextUsername = ADMIN_RESET_USERNAME?.trim() || currentAdmin.username;
  if (nextUsername !== currentAdmin.username) {
    const existing = await prisma.user.findUnique({
      where: { username: nextUsername },
    });
    if (existing && existing.id !== currentAdmin.id) {
      throw new AppError(409, 'ADMIN_RESET_USERNAME_EXISTS', 'ADMIN_RESET_USERNAME 已被其他账号占用');
    }
  }

  const passwordHash = await bcrypt.hash(resetPassword, 10);
  await prisma.user.update({
    where: { id: currentAdmin.id },
    data: {
      username: nextUsername,
      name: ADMIN_RESET_NAME?.trim() || currentAdmin.name,
      passwordHash,
      mustChangePassword: true,
      passwordUpdatedAt: null,
    },
  });

  console.log('[auth] applied admin reset from env for user:', nextUsername);
};
