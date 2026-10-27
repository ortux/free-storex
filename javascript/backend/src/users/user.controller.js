"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const user_service_1 = require("./user.service");
const github_storage_provider_1 = require("../storage/github-storage.provider");
const router = (0, express_1.Router)();
function actorId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
// GET /api/v1/user
router.get('/', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(actorId(req));
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
            return;
        }
        const profile = await user_service_1.userService.getSafeProfile(user);
        res.json({ success: true, data: profile });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/v1/user/repository
router.get('/repository', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(actorId(req));
        if (!user.repositoryName || !user.repositoryOwner) {
            res.status(404).json({ success: false, error: { code: 'NO_REPOSITORY', message: 'GitHub repository not yet created' } });
            return;
        }
        try {
            const accessToken = user_service_1.userService.getAccessToken(user);
            const info = await github_storage_provider_1.githubStorageProvider.getRepository(accessToken, user.repositoryOwner, user.repositoryName);
            res.json({ success: true, data: { ...info, visibility: 'public', encryption: 'AES-256-GCM' } });
        }
        catch {
            res.json({
                success: true,
                data: {
                    name: user.repositoryName, owner: user.repositoryOwner,
                    url: `https://github.com/${user.repositoryOwner}/${user.repositoryName}`,
                    visibility: 'public', encryption: 'AES-256-GCM',
                },
            });
        }
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
