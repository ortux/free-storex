"use strict";
/**
 * GitHubStorageProvider
 *
 * Wraps the existing GitHubService behind the IStorageProvider interface.
 * Handles all GitHub REST API operations for encrypted file storage.
 *
 * Security contract: only encrypted bytes are passed to/from GitHub.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageProvider = exports.githubStorageProvider = exports.GitHubStorageProvider = void 0;
const rest_1 = require("@octokit/rest");
const axios_1 = __importDefault(require("axios"));
const storage_provider_interface_1 = require("./storage-provider.interface");
const logger_1 = require("../lib/logger");
const user_repository_1 = require("../users/user.repository");
const config_1 = require("../config");
const key_service_1 = require("../encryption/key.service");
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function isRateLimited(value) {
    if (value.status === 429)
        return true;
    if (value.status !== 403)
        return false;
    const headers = value.response?.headers ?? {};
    return Number(headers['x-ratelimit-remaining']) === 0 ||
        headers['retry-after'] !== undefined ||
        /rate limit/i.test(value.message ?? '');
}
function retryDelay(error, attempt) {
    if (typeof error !== 'object' || error === null)
        return null;
    const value = error;
    if (value.status && value.status < 500 && !isRateLimited(value))
        return null;
    if (isRateLimited(value)) {
        const headers = value.response?.headers ?? {};
        const retryAfter = Number(headers['retry-after']);
        if (Number.isFinite(retryAfter) && retryAfter > 0)
            return retryAfter * 1000;
        const remaining = Number(headers['x-ratelimit-remaining']);
        const reset = Number(headers['x-ratelimit-reset']);
        if (remaining === 0 && Number.isFinite(reset))
            return Math.max(1000, reset * 1000 - Date.now());
        return 60_000 * 2 ** (attempt - 1);
    }
    if (!value.status || value.status >= 500)
        return 1000 * 2 ** (attempt - 1);
    return null;
}
async function withRetry(fn) {
    let last;
    const maxAttempts = Math.max(1, config_1.config.upload.maxRetries);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            last = err;
            const delay = retryDelay(err, attempt);
            if (delay === null)
                break;
            if (attempt < maxAttempts && delay !== null) {
                logger_1.logger.warn('GitHub API request failed; retrying', { attempt, delayMs: delay });
                await sleep(delay);
            }
        }
    }
    throw last;
}
class GitHubStorageProvider {
    providerName = 'GITHUB';
    lastWriteByRepository = new Map();
    writeQueueByRepository = new Map();
    getClient(accessToken) {
        return new rest_1.Octokit({ auth: accessToken, request: { timeout: 30000 } });
    }
    async repositoryFor(accountId) {
        const user = await user_repository_1.userRepository.findById(accountId);
        if (!user?.repositoryOwner || !user.repositoryName)
            throw new storage_provider_interface_1.StorageUnavailableError('GitHub storage repository is not configured');
        return {
            owner: user.repositoryOwner,
            repo: user.repositoryName,
            accessCredential: key_service_1.keyService.decryptToken(user.githubAccessTokenEncrypted),
        };
    }
    async assertCapacity(account, additionalBytes) {
        const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId);
        try {
            const { data } = await withRetry(() => this.getClient(accessCredential).repos.get({ owner, repo }));
            const currentBytes = data.size * 1024;
            const documentedRepositoryMaxBytes = 10 * 1024 * 1024 * 1024;
            if (currentBytes + additionalBytes > documentedRepositoryMaxBytes) {
                throw new storage_provider_interface_1.StorageLimitError('Repository storage capacity would exceed GitHub recommended size limits');
            }
        }
        catch (error) {
            if (error instanceof storage_provider_interface_1.StorageLimitError || error instanceof storage_provider_interface_1.StorageUnavailableError)
                throw error;
            throw this.mapProviderError(error);
        }
    }
    async serializeRepositoryWrite(repository, operation) {
        const previous = this.writeQueueByRepository.get(repository) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => { release = resolve; });
        this.writeQueueByRepository.set(repository, current);
        await previous;
        try {
            const lastWrite = this.lastWriteByRepository.get(repository) ?? 0;
            const wait = config_1.config.github.writeIntervalMs - (Date.now() - lastWrite);
            if (wait > 0)
                await sleep(wait);
            this.lastWriteByRepository.set(repository, Date.now());
            return await operation();
        }
        finally {
            release();
            if (this.writeQueueByRepository.get(repository) === current)
                this.writeQueueByRepository.delete(repository);
        }
    }
    mapProviderError(error) {
        if (typeof error !== 'object' || error === null) {
            logger_1.logger.error('GitHub storage request failed', { error: String(error) });
            return new storage_provider_interface_1.StorageUnavailableError('GitHub storage request failed');
        }
        const value = error;
        const status = value.status;
        const headers = value.response?.headers ?? {};
        logger_1.logger.error('GitHub storage request failed', {
            status,
            code: value.code,
            message: value.message,
            requestId: headers['x-github-request-id'],
            rateLimitRemaining: headers['x-ratelimit-remaining'],
            rateLimitReset: headers['x-ratelimit-reset'],
            retryAfter: headers['retry-after'],
        });
        if (isRateLimited(value))
            return new storage_provider_interface_1.StorageUnavailableError('GitHub rate limit reached; retry after the provider reset window');
        if (status === 403)
            return new storage_provider_interface_1.StorageUnavailableError('GitHub denied access to the storage repository; check the GitHub connection and repository permissions');
        if (status === 413 || status === 422)
            return new storage_provider_interface_1.StorageLimitError('GitHub rejected this object or repository write');
        if (status && status >= 500)
            return new storage_provider_interface_1.StorageUnavailableError(`GitHub storage is temporarily unavailable (HTTP ${status})`);
        return new storage_provider_interface_1.StorageUnavailableError('GitHub storage request failed; check the backend logs for provider details');
    }
    async uploadObject(params) {
        const { account, storagePath, encryptedBuffer } = params;
        if (!account?.accountId)
            throw new Error('Storage upload requires an account context');
        if (encryptedBuffer.length > config_1.config.github.contentsMaxObjectBytes) {
            throw new storage_provider_interface_1.StorageLimitError(`Encrypted object exceeds configured GitHub object limit (${config_1.config.github.contentsMaxObjectBytes} bytes)`);
        }
        const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId);
        const repository = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
        const octokit = this.getClient(accessCredential);
        try {
            return await this.serializeRepositoryWrite(repository, () => withRetry(async () => {
                const { data } = await octokit.repos.createOrUpdateFileContents({
                    owner, repo, path: storagePath, message: 'Upload encrypted file', content: encryptedBuffer.toString('base64'),
                });
                if (!data.content?.sha) {
                    throw new Error('GitHub did not return a SHA after upload');
                }
                logger_1.logger.info('GitHub upload successful', { path: storagePath });
                return { storagePath, providerRef: data.content.sha };
            }));
        }
        catch (error) {
            if (error instanceof storage_provider_interface_1.StorageLimitError)
                throw error;
            throw this.mapProviderError(error);
        }
    }
    async downloadObject(params) {
        const { account, storagePath } = params;
        if (!account?.accountId)
            throw new Error('Storage download requires an account context');
        const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId);
        try {
            return await withRetry(async () => {
                // Use raw.githubusercontent.com with arraybuffer — avoids Octokit string
                // encoding which corrupts bytes > 0x7F in binary encrypted data
                for (const branch of ['main', 'master']) {
                    try {
                        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${storagePath}`;
                        const response = await axios_1.default.get(url, {
                            responseType: 'arraybuffer',
                            headers: { Authorization: `Bearer ${accessCredential}`, Accept: 'application/octet-stream' },
                            timeout: 30000,
                        });
                        logger_1.logger.info('GitHub download successful', { path: storagePath, branch });
                        return Buffer.from(response.data);
                    }
                    catch (err) {
                        if (axios_1.default.isAxiosError(err) && err.response?.status === 404)
                            continue;
                        throw err;
                    }
                }
                throw new Error(`File not found in GitHub repository: ${storagePath}`);
            });
        }
        catch (error) {
            throw this.mapProviderError(error);
        }
    }
    async deleteObject(params) {
        const { account, storagePath, providerRef } = params;
        if (!account?.accountId)
            throw new Error('Storage delete requires an account context');
        if (!providerRef) {
            throw new Error('GitHub delete requires providerRef (blob SHA)');
        }
        const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId);
        const octokit = this.getClient(accessCredential);
        try {
            await this.serializeRepositoryWrite(`${owner.toLowerCase()}/${repo.toLowerCase()}`, () => withRetry(async () => {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: storagePath,
                    message: 'Delete encrypted file',
                    sha: providerRef,
                });
                logger_1.logger.info('GitHub delete successful', { path: storagePath });
            }));
        }
        catch (error) {
            if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
                return;
            }
            throw this.mapProviderError(error);
        }
    }
    // ── GitHub-specific helpers (not part of IStorageProvider) ─────────────────
    async createRepository(accessToken, repoName) {
        const octokit = this.getClient(accessToken);
        return withRetry(async () => {
            const { data } = await octokit.repos.createForAuthenticatedUser({
                name: repoName,
                description: 'Encrypted file storage — contents are AES-256-GCM ciphertext',
                private: false,
                auto_init: true,
                gitignore_template: 'Node',
            });
            await this.updateReadme(accessToken, data.owner.login, repoName);
            return { name: data.name, owner: data.owner.login, url: data.html_url };
        });
    }
    async updateReadme(accessToken, owner, repo) {
        const octokit = this.getClient(accessToken);
        const content = Buffer.from('# Encrypted Storage Repository\n\n' +
            'This repository contains AES-256-GCM encrypted files managed by Free Store.\n\n' +
            'All `.enc` files are encrypted ciphertext. Without the decryption keys they are unreadable.\n\n' +
            '> Automatically managed — do not modify files manually.\n', 'utf8').toString('base64');
        try {
            const { data: current } = await octokit.repos.getContent({ owner, repo, path: 'README.md' });
            const sha = 'sha' in current ? current.sha : undefined;
            await octokit.repos.createOrUpdateFileContents({
                owner, repo, path: 'README.md',
                message: 'Initialize encrypted storage repository',
                content, sha,
            });
        }
        catch { /* non-critical */ }
    }
    async getRepository(accessToken, owner, repo) {
        const octokit = this.getClient(accessToken);
        return withRetry(async () => {
            const { data } = await octokit.repos.get({ owner, repo });
            return { name: data.name, owner: data.owner.login, url: data.html_url, size: data.size };
        });
    }
}
exports.GitHubStorageProvider = GitHubStorageProvider;
// Keep a named singleton for direct use by UserService (repo creation)
exports.githubStorageProvider = new GitHubStorageProvider();
exports.storageProvider = exports.githubStorageProvider;
