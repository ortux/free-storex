"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePassport = configurePassport;
const passport_1 = __importDefault(require("passport"));
const passport_github2_1 = require("passport-github2");
const config_1 = require("../config");
const user_service_1 = require("../users/user.service");
function configurePassport() {
    passport_1.default.use(new passport_github2_1.Strategy({
        clientID: config_1.config.github.clientId,
        clientSecret: config_1.config.github.clientSecret,
        callbackURL: config_1.config.github.callbackUrl,
        scope: ['user:email', 'repo'],
    }, async (accessToken, _refreshToken, profile, done) => {
        try {
            const user = await user_service_1.userService.findOrCreate({
                id: profile.id,
                username: profile.username,
                email: profile.emails?.[0]?.value ?? null,
                accessToken,
            });
            done(null, user);
        }
        catch (err) {
            done(err instanceof Error ? err : new Error(String(err)));
        }
    }));
    passport_1.default.serializeUser((user, done) => {
        done(null, user.id);
    });
    passport_1.default.deserializeUser(async (id, done) => {
        try {
            const user = await user_service_1.userService.getById(id);
            done(null, user ?? false);
        }
        catch (err) {
            done(err);
        }
    });
}
