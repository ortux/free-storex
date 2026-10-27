"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const config_1 = require("../config");
const auth_middleware_1 = require("../middleware/auth.middleware");
const user_service_1 = require("../users/user.service");
const router = (0, express_1.Router)();
// Initiate GitHub OAuth flow
router.get('/github', passport_1.default.authenticate('github', { scope: ['user:email', 'repo'] }));
// GitHub OAuth callback
router.get('/github/callback', passport_1.default.authenticate('github', { failureRedirect: `${config_1.config.frontendUrl}/login?error=auth_failed` }), (req, res) => {
    // Successful login — redirect to dashboard
    req.session.userId = req.user.id;
    res.redirect(`${config_1.config.frontendUrl}/dashboard`);
});
// Logout
router.post('/logout', auth_middleware_1.requireAuth, (req, res) => {
    const userId = req.session.userId;
    req.logout(() => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });
});
// Get current session user
router.get('/me', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(req.session.userId);
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session invalid' } });
            return;
        }
        const profile = await user_service_1.userService.getSafeProfile(user);
        res.json({ success: true, data: profile });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
