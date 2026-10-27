"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const file_service_1 = require("../files/file.service");
const user_service_1 = require("../users/user.service");
const router = (0, express_1.Router)();
function getUserId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
/**
 * GET /api/v1/images/:id
 *
 * Serve decrypted image with correct Content-Type.
 * Browser can use this directly in <img src="..."> after authenticating via cookie.
 */
router.get('/:id', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        const { buffer, file } = await file_service_1.fileService.download(user, req.params.id);
        // Only serve files that are actually images
        if (!file.mimeType.startsWith('image/')) {
            res.status(415).json({
                success: false,
                error: { code: 'NOT_AN_IMAGE', message: 'Requested file is not an image' },
            });
            return;
        }
        res.set({
            'Content-Type': file.mimeType,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(buffer);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
