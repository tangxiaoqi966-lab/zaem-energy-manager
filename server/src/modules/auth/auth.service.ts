import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole, OperationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeOperation } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import { JWT_SECRET } from '../../config/env';
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
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
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
        loginAddress: actorContext?.ip,
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
        loginAddress: actorContext?.ip,
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
      loginAddress: actorContext?.ip,
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
      loginAddress: actorContext?.ip,
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
  };
};
