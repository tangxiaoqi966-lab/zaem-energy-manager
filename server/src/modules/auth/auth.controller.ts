import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { getOperationActorContextFromRequest } from '../../lib/request-context';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body, getOperationActorContextFromRequest(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      await authService.logout(req.user.id, getOperationActorContextFromRequest(req));
    }
    res.json({ message: '退出成功' });
  } catch (err) {
    next(err);
  }
};

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new Error('未登录');
    }
    const user = await authService.getCurrentUser(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const listUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await authService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.createUser(
      req.body,
      req.user!.id,
      getOperationActorContextFromRequest(req),
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.updateUser(
      req.params.userId,
      req.body,
      req.user!.id,
      getOperationActorContextFromRequest(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.deleteUser(
      req.params.userId,
      req.user!.id,
      getOperationActorContextFromRequest(req),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const forceChangePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.forceChangePassword(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
