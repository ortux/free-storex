import { Router } from 'express';
import passport from 'passport';
import { config } from '../config';
import { requireAuth } from '../middleware/auth.middleware';
import { userService } from '../users/user.service';
import type { User } from '../lib/models';
import { logger } from '../lib/logger';
import { createHandoffToken, consumeHandoffToken } from './auth-token.store';

const router = Router();

// Restore Passport session only for /auth routes (OAuth flow).
// API routes use req.session.userId directly — no deserializeUser overhead.
router.use(passport.session());

// ── CSRF helpers ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS_SET = new Set([
  config.frontendUrl,
  'https://free-store.vercel.app',
]);

function verifyCsrfOrigin(req: import('express').Request): boolean {
  if (!config.isProduction) return true;

  const origin = req.get('origin');
  if (origin) {
    return ALLOWED_ORIGINS_SET.has(origin) ||
      /^https:\/\/[^.]+\.vercel\.app$/.test(origin);
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      const { origin: refOrigin } = new URL(referer);
      return ALLOWED_ORIGINS_SET.has(refOrigin) ||
        /^https:\/\/[^.]+\.vercel\.app$/.test(refOrigin);
    } catch {
      return false;
    }
  }

  return false;
}

// ── Initiate GitHub OAuth flow ────────────────────────────────────────────────
router.get('/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }));

// ── GitHub OAuth callback ─────────────────────────────────────────────────────
// The GITHUB_CALLBACK_URL on the backend domain (api.*).
// After success we CANNOT set a cross-domain cookie on the frontend origin, so
// instead we mint a one-time handoff token and redirect the browser to the
// frontend /auth/callback page with ?token=XXX.  The frontend then POSTs that
// token back through its same-origin Vercel proxy (/auth/exchange), which hits
// this backend from the frontend origin — so the session cookie is set on the
// correct domain and sent on all subsequent API calls.
router.get(
  '/github/callback',
  (req, res, next) => {
    passport.authenticate('github', (error: unknown, user: Express.User | false | null) => {
      if (error) {
        logger.error('GitHub OAuth callback failed', {
          name:    error instanceof Error ? error.name    : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          stack:   error instanceof Error ? error.stack   : undefined,
        });
        res.redirect(`${config.frontendUrl}/login?error=github_oauth_failed`);
        return;
      }
      if (!user) {
        logger.warn('GitHub OAuth callback did not return a user');
        res.redirect(`${config.frontendUrl}/login?error=github_oauth_failed`);
        return;
      }

      const userId = (user as User).id;

      // Mint the single-use handoff token (2 min TTL).
      // We do NOT call req.logIn() or set the session cookie here — that happens
      // in /exchange once the request arrives from the same origin as the frontend.
      void createHandoffToken(userId)
        .then((handoffToken) => {
          res.redirect(`${config.frontendUrl}/auth/callback?token=${handoffToken}`);
        })
        .catch((handoffError: unknown) => {
          logger.error('GitHub OAuth handoff token creation failed', {
            message: handoffError instanceof Error ? handoffError.message : String(handoffError),
          });
          res.redirect(`${config.frontendUrl}/login?error=handoff_failed`);
        });
    })(req, res, next);
  }
);

// ── Token exchange ────────────────────────────────────────────────────────────
// Called by the frontend /auth/callback page through the same-origin Vercel
// proxy.  Validates the one-time token, creates the real session, and sets the
// session cookie on the response — which the browser now sees as same-origin.
router.post('/exchange', async (req, res, next) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== 'string' || token.length !== 64) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Missing or malformed token' },
    });
    return;
  }

  let userId: string | null;
  try {
    userId = await consumeHandoffToken(token);
  } catch (err) {
    next(err);
    return;
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token is invalid or has expired. Please sign in again.' },
    });
    return;
  }

  try {
    const user = await userService.getById(userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User no longer exists' },
      });
      return;
    }

    // req.logIn serialises the user into the session via Passport, then we also
    // store userId directly for our requireAuth middleware.
    req.logIn(user, (loginError) => {
      if (loginError) { next(loginError); return; }

      req.session.userId = user.id;
      req.session.save((sessionError) => {
        if (sessionError) { next(sessionError); return; }

        // Return the user profile so the frontend can prime its React Query cache
        // without a second round-trip to /api/v1/user.
        userService.getSafeProfile(user).then((profile) => {
          res.json({ success: true, data: profile });
        }).catch(next);
      });
    });
  } catch (err) {
    next(err);
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  if (!verifyCsrfOrigin(req)) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Cross-site request not allowed' },
    });
    return;
  }

  req.logout((logoutError) => {
    if (logoutError) {
      res.status(500).json({ success: false, error: { code: 'LOGOUT_FAILED', message: 'Unable to log out' } });
      return;
    }
    req.session.destroy((sessionError) => {
      if (sessionError) {
        res.status(500).json({ success: false, error: { code: 'LOGOUT_FAILED', message: 'Unable to log out' } });
        return;
      }
      res.clearCookie('__fstore_sid', {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.isProduction ? 'none' : 'lax',
        path: '/',
      });
      res.json({ success: true });
    });
  });
});

// ── Current session user ──────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await userService.getById(req.session.userId!);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session invalid' } });
      return;
    }
    const profile = await userService.getSafeProfile(user);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

export default router;
