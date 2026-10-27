"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = exports.UserService = void 0;
const crypto = __importStar(require("crypto"));
const user_repository_1 = require("./user.repository");
const encryption_service_1 = require("../encryption/encryption.service");
const key_service_1 = require("../encryption/key.service");
const github_storage_provider_1 = require("../storage/github-storage.provider");
const logger_1 = require("../lib/logger");
function generateRepoName() {
    return `encrypted-store-${crypto.randomBytes(4).toString('hex')}`;
}
class UserService {
    async findOrCreate(githubProfile) {
        const existing = await user_repository_1.userRepository.findByGithubId(githubProfile.id);
        if (existing) {
            const encryptedToken = key_service_1.keyService.encryptToken(githubProfile.accessToken);
            await user_repository_1.userRepository.updateGithubToken(existing.id, encryptedToken);
            return user_repository_1.userRepository.findById(existing.id);
        }
        const masterKey = encryption_service_1.encryptionService.generateKey();
        const encryptedMasterKey = key_service_1.keyService.encryptMasterKey(masterKey);
        masterKey.fill(0);
        const encryptedToken = key_service_1.keyService.encryptToken(githubProfile.accessToken);
        const user = await user_repository_1.userRepository.create({
            githubId: githubProfile.id,
            githubUsername: githubProfile.username,
            email: githubProfile.email,
            githubAccessTokenEncrypted: encryptedToken,
            encryptedMasterKey,
        });
        try {
            const repoName = generateRepoName();
            const repo = await github_storage_provider_1.githubStorageProvider.createRepository(githubProfile.accessToken, repoName);
            await user_repository_1.userRepository.updateTokenAndRepo(user.id, {
                repositoryName: repo.name,
                repositoryOwner: repo.owner,
            });
            logger_1.safeLog.repoCreated(user.id, repo.name);
        }
        catch (err) {
            logger_1.safeLog.error('Failed to create GitHub repository for new user', err);
        }
        logger_1.safeLog.authLogin(user.id, githubProfile.username);
        return user_repository_1.userRepository.findById(user.id);
    }
    async getById(id) {
        return user_repository_1.userRepository.findById(id);
    }
    async getStats(userId) {
        return user_repository_1.userRepository.getStats(userId);
    }
    getMasterKey(user) {
        return key_service_1.keyService.decryptMasterKey(user.encryptedMasterKey);
    }
    getAccessToken(user) {
        return key_service_1.keyService.decryptToken(user.githubAccessTokenEncrypted);
    }
    async getSafeProfile(user) {
        const stats = await this.getStats(user.id);
        return {
            id: user.id,
            githubUsername: user.githubUsername,
            email: user.email,
            repositoryName: user.repositoryName,
            repositoryOwner: user.repositoryOwner,
            createdAt: user.createdAt,
            stats,
        };
    }
}
exports.UserService = UserService;
exports.userService = new UserService();
