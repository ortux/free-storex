"use strict";
/**
 * GitHub Service
 *
 * Handles all GitHub REST API operations.
 * This service operates ONLY on encrypted bytes — it never receives
 * or stores plaintext file contents, master keys, or file keys.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubService = exports.GitHubService = void 0;
const rest_1 = require("@octokit/rest");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../lib/logger");
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, retries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            const details = typeof err === 'object' && err !== null
                ? err
                : {};
            const headers = details.response?.headers ?? {};
            const retryAfter = Number(headers['retry-after']);
            const remaining = Number(headers['x-ratelimit-remaining']);
            const reset = Number(headers['x-ratelimit-reset']);
            const rateLimited = (details.status === 403 || details.status === 429) && (remaining === 0 || Number.isFinite(retryAfter) || /rate limit/i.test(details.message ?? ''));
            const transientStatus = details.status !== undefined && details.status >= 500;
            const transientNetwork = axios_1.default.isAxiosError(err) && !err.response;
            const networkCode = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes(details.code ?? '');
            const retryable = rateLimited || transientStatus || transientNetwork || networkCode;
            if (!retryable || attempt >= retries)
                break;
            const delay = Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : remaining === 0 && Number.isFinite(reset)
                    ? Math.max(1000, reset * 1000 - Date.now())
                    : rateLimited
                        ? Math.max(60_000, delayMs * 2 ** (attempt - 1))
                        : delayMs * 2 ** (attempt - 1);
            logger_1.logger.warn('GitHub API request failed; retrying transient failure', { attempt, delayMs: delay });
            await sleep(delay);
        }
    }
    throw lastError;
}
class GitHubService {
    getClient(accessToken) {
        return new rest_1.Octokit({
            auth: accessToken,
            request: { timeout: 30000 },
        });
    }
    /**
     * Create a public repository for a user.
     * Repository name is randomized to avoid exposing user identity.
     */
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
            // Add a README explaining the repo purpose
            await this.createReadme(accessToken, data.owner.login, repoName);
            return {
                name: data.name,
                owner: data.owner.login,
                url: data.html_url,
            };
        });
    }
    async createReadme(accessToken, owner, repo) {
        const octokit = this.getClient(accessToken);
        const content = Buffer.from(`# Encrypted Storage Repository\n\nThis repository contains AES-256-GCM encrypted files managed by [Free Store](https://github.com).\n\nAll files in this repository are encrypted ciphertext (\`.enc\` format).\nWithout the decryption keys (stored separately), these files are unreadable.\n\n> This repository is automatically managed. Do not modify files manually.\n`, 'utf8').toString('base64');
        try {
            // Get current README SHA first (auto_init creates one)
            const { data: current } = await octokit.repos.getContent({
                owner,
                repo,
                path: 'README.md',
            });
            const sha = 'sha' in current ? current.sha : undefined;
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: 'README.md',
                message: 'Initialize encrypted storage repository',
                content,
                sha,
            });
        }
        catch {
            // README update is non-critical
        }
    }
    /**
     * Upload an encrypted file buffer to the repository.
     * The buffer must be already encrypted — this method does not encrypt.
     */
    async uploadFile(accessToken, owner, repo, path, encryptedBuffer) {
        const octokit = this.getClient(accessToken);
        return withRetry(async () => {
            const { data } = await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path,
                message: `Upload encrypted file`,
                content: encryptedBuffer.toString('base64'),
            });
            if (!data.content?.sha) {
                throw new Error('GitHub did not return a SHA after upload');
            }
            return { sha: data.content.sha, path };
        });
    }
    /**
     * Download an encrypted file from the repository.
     * Returns raw Buffer of the encrypted contents.
     *
     * Uses the GitHub raw URL via axios with responseType:'arraybuffer' to
     * guarantee byte-perfect binary retrieval. Octokit's getContent with
     * mediaType:'raw' can corrupt binary data above 0x7F via string encoding.
     */
    async downloadFile(accessToken, owner, repo, path) {
        return withRetry(async () => {
            // Try 'main' branch first, fall back to 'master'
            const branches = ['main', 'master'];
            let lastError;
            for (const branch of branches) {
                try {
                    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
                    const response = await axios_1.default.get(url, {
                        responseType: 'arraybuffer',
                        headers: {
                            Authorization: `token ${accessToken}`,
                            Accept: 'application/octet-stream',
                        },
                        timeout: 30000,
                    });
                    return Buffer.from(response.data);
                }
                catch (err) {
                    // 404 = wrong branch, try next
                    if (axios_1.default.isAxiosError(err) &&
                        err.response?.status === 404) {
                        lastError = err;
                        continue;
                    }
                    throw err;
                }
            }
            throw lastError;
        });
    }
    /**
     * Delete an encrypted file from the repository.
     * Requires the file's current SHA.
     */
    async deleteFile(accessToken, owner, repo, path, sha) {
        const octokit = this.getClient(accessToken);
        return withRetry(async () => {
            await octokit.repos.deleteFile({
                owner,
                repo,
                path,
                message: `Delete encrypted file`,
                sha,
            });
        });
    }
    /**
     * Get repository info and stats.
     */
    async getRepository(accessToken, owner, repo) {
        const octokit = this.getClient(accessToken);
        return withRetry(async () => {
            const { data } = await octokit.repos.get({ owner, repo });
            return {
                name: data.name,
                owner: data.owner.login,
                url: data.html_url,
                size: data.size,
            };
        });
    }
    /**
     * List files in the /files directory of the repository.
     */
    async listFiles(accessToken, owner, repo) {
        const octokit = this.getClient(accessToken);
        try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: 'files' });
            if (!Array.isArray(data))
                return [];
            return data.map((f) => ({
                name: f.name,
                path: f.path,
                sha: f.sha,
                size: f.size ?? 0,
            }));
        }
        catch {
            return [];
        }
    }
}
exports.GitHubService = GitHubService;
exports.githubService = new GitHubService();
