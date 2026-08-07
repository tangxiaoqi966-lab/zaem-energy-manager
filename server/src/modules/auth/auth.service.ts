import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole, OperationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeOperation } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import { JWT_SECRET } from '../../config/env';
import { JwtPayload } from '../../middleware/auth';

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

export const login = async (input: LoginInput): Promise<LoginResponse> => {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
    include: { role: true },
  });

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isPasswordValid) {
    await writeOperation(user.id, OperationType.login, null, '密码错误', false);
    throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
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

  await writeOperation(user.id, OperationType.login, null, '登录成功', true);

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

export const logout = async (userId: string): Promise<void> => {
  await writeOperation(userId, 'logout', null, '退出登录', true);
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
