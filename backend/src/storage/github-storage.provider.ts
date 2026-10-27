/**
 * GitHubStorageProvider
 *
 * Wraps the existing GitHubService behind the IStorageProvider interface.
 * Handles all GitHub REST API operations for encrypted file storage.
 *
 * Security contract: only encrypted bytes are passed to/from GitHub.
 */

import { Octokit } from '@octokit/rest';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  StorageLimitError,
  StorageUnavailableError,
  type IStorageProvider,
  type StorageUploadParams,
  type StorageDownloadParams,
  type StorageDeleteParams,
  type StorageUploadResult,
} from './storage-provider.interface';
import { logger } from '../lib/logger';
import { userRepository } from '../users/user.repository';
import { storageRepositoryRepository } from './storage-repository.repository';
import { config } from '../config';
import { keyService } from '../encryption/key.service';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ProviderError = {
  status?: number;
  message?: string;
  code?: string;
  response?: { headers?: Record<string, string | number | undefined> };
};

function isRateLimited(value: ProviderError): boolean {
  if (value.status === 429) return true;
  if (value.status !== 403) return false;

  const headers = value.response?.headers ?? {};
  return Number(headers['x-ratelimit-remaining']) === 0 ||
    headers['retry-after'] !== undefined ||
    /rate limit/i.test(value.message ?? '');
}

function retryDelay(error: unknown, attempt: number): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = error as ProviderError;
  if (value.status && value.status < 500 && !isRateLimited(value)) return null;
  if (isRateLimited(value)) {
    const headers = value.response?.headers ?? {};
    const retryAfter = Number(headers['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
    const remaining = Number(headers['x-ratelimit-remaining']);
    const reset = Number(headers['x-ratelimit-reset']);
    if (remaining === 0 && Number.isFinite(reset)) return Math.max(1000, reset * 1000 - Date.now());
    return 60_000 * 2 ** (attempt - 1);
  }
  if (!value.status || value.status >= 500) return 1000 * 2 ** (attempt - 1);
  return null;
}

const REPOSITORY_TARGET_BYTES = 9 * 1024 * 1024 * 1024;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  const maxAttempts = Math.max(1, config.upload.maxRetries);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      last = err;
      const delay = retryDelay(err, attempt);
      if (delay === null) break;
      if (attempt < maxAttempts && delay !== null) {
        logger.warn('GitHub API request failed; retrying', { attempt, delayMs: delay });
        await sleep(delay);
      }
    }
  }
  throw last;
}

export class GitHubStorageProvider implements IStorageProvider {
  readonly providerName = 'GITHUB';
  private lastWriteByRepository = new Map<string, number>();
  private writeQueueByRepository = new Map<string, Promise<void>>();

  private getClient(accessToken: string): Octokit {
    return new Octokit({ auth: accessToken, request: { timeout: 30000 } });
  }

  private async repositoryFor(accountId: string, repositoryId?: string | null) {
    const user = await userRepository.findById(accountId);
    if (!user) throw new StorageUnavailableError('GitHub storage account is not configured');
    if (repositoryId) {
      const repository = await storageRepositoryRepository.findByIdForUser(repositoryId, accountId);
      if (!repository) throw new StorageUnavailableError('The file storage repository metadata is missing');
      return {
        owner: repository.repositoryOwner,
        repo: repository.repositoryName,
        repositoryId: repository.id,
        accessCredential: keyService.decryptToken(user.githubAccessTokenEncrypted),
      };
    }
    if (!user.repositoryOwner || !user.repositoryName) throw new StorageUnavailableError('GitHub storage repository is not configured');
    return {
      owner: user.repositoryOwner,
      repo: user.repositoryName,
      repositoryId: null,
      accessCredential: keyService.decryptToken(user.githubAccessTokenEncrypted),
    };
  }

  private async reserveRepository(accountId: string, additionalBytes: number) {
    const user = await userRepository.findById(accountId);
    if (!user) throw new StorageUnavailableError('GitHub storage account is not configured');
    const accessCredential = keyService.decryptToken(user.githubAccessTokenEncrypted);

    const knownRepositories = await storageRepositoryRepository.listByUserId(accountId);
    if (knownRepositories.length === 0 && user.repositoryOwner && user.repositoryName) {
      let initialSizeBytes: number;
      try {
        const { data } = await withRetry(() => this.getClient(accessCredential).repos.get({
          owner: user.repositoryOwner!,
          repo: user.repositoryName!,
        }));
        initialSizeBytes = data.size * 1024;
      } catch (error) {
        throw this.mapProviderError(error);
      }
      await storageRepositoryRepository.registerPrimary(
        accountId,
        user.repositoryOwner,
        user.repositoryName,
        initialSizeBytes,
        REPOSITORY_TARGET_BYTES,
      );
    }

    try {
      const repository = await storageRepositoryRepository.reserveCapacity(
        accountId,
        additionalBytes,
        REPOSITORY_TARGET_BYTES,
        async () => {
          const repoName = `encrypted-store-${crypto.randomBytes(6).toString('hex')}`;
          let created: Awaited<ReturnType<typeof this.createRepository>>;
          try {
            created = await this.createRepository(accessCredential, repoName);
          } catch (error) {
            throw this.mapProviderError(error);
          }
          return { owner: created.owner, name: created.name, sizeBytes: created.size * 1024 + 1024 * 1024 };
        },
      );
      if (repository.isPrimary && (!user.repositoryName || !user.repositoryOwner)) {
        await userRepository.updateTokenAndRepo(accountId, {
          repositoryName: repository.repositoryName,
          repositoryOwner: repository.repositoryOwner,
        });
      }
      return {
        owner: repository.repositoryOwner,
        repo: repository.repositoryName,
        repositoryId: repository.id,
        accessCredential,
      };
    } catch (error) {
      if (error instanceof Error && /per-repository capacity|does not have enough capacity/.test(error.message)) {
        throw new StorageLimitError(error.message);
      }
      throw error;
    }
  }

  private isDefinitiveRejection(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('status' in error)) return false;
    const status = Number((error as ProviderError).status);
    return status >= 400 && status < 500;
  }

  private async serializeRepositoryWrite<T>(repository: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueueByRepository.get(repository) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.writeQueueByRepository.set(repository, current);
    await previous;
    try {
      const lastWrite = this.lastWriteByRepository.get(repository) ?? 0;
      const wait = config.github.writeIntervalMs - (Date.now() - lastWrite);
      if (wait > 0) await sleep(wait);
      this.lastWriteByRepository.set(repository, Date.now());
      return await operation();
    } finally {
      release();
      if (this.writeQueueByRepository.get(repository) === current) this.writeQueueByRepository.delete(repository);
    }
  }

  private mapProviderError(error: unknown): Error {
    if (typeof error !== 'object' || error === null) {
      logger.error('GitHub storage request failed', { error: String(error) });
      return new StorageUnavailableError('GitHub storage request failed');
    }
    const value = error as ProviderError;
    const status = value.status;
    const headers = value.response?.headers ?? {};
    logger.error('GitHub storage request failed', {
      status,
      code: value.code,
      message: value.message,
      requestId: headers['x-github-request-id'],
      rateLimitRemaining: headers['x-ratelimit-remaining'],
      rateLimitReset: headers['x-ratelimit-reset'],
      retryAfter: headers['retry-after'],
    });
    if (isRateLimited(value)) return new StorageUnavailableError('GitHub rate limit reached; retry after the provider reset window');
    if (status === 403) return new StorageUnavailableError('GitHub denied access to the storage repository; check the GitHub connection and repository permissions');
    if (status === 413 || status === 422) return new StorageLimitError('GitHub rejected this object or repository write');
    if (status && status >= 500) return new StorageUnavailableError(`GitHub storage is temporarily unavailable (HTTP ${status})`);
    return new StorageUnavailableError('GitHub storage request failed; check the backend logs for provider details');
  }

  async uploadObject(params: StorageUploadParams): Promise<StorageUploadResult> {
    const { account, storagePath, encryptedBuffer } = params;
    if (!account?.accountId) throw new Error('Storage upload requires an account context');
    if (encryptedBuffer.length > config.github.contentsMaxObjectBytes) {
      throw new StorageLimitError(`Encrypted object exceeds configured GitHub object limit (${config.github.contentsMaxObjectBytes} bytes)`);
    }
    const repositoryContext = await this.reserveRepository(account.accountId, encryptedBuffer.length);
    const { owner, repo, repositoryId, accessCredential } = repositoryContext;
    const repository = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const octokit = this.getClient(accessCredential);

    try {
      const result = await this.serializeRepositoryWrite(repository, () => withRetry(async () => {
      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner, repo, path: storagePath, message: 'Upload encrypted file', content: encryptedBuffer.toString('base64'),
      });

      if (!data.content?.sha) {
        throw new Error('GitHub did not return a SHA after upload');
      }

      logger.info('GitHub upload successful', { path: storagePath });
      return { storagePath, providerRef: data.content.sha, repositoryId };
      }));
      return result;
    } catch (error) {
      if (this.isDefinitiveRejection(error)) {
        await storageRepositoryRepository.releaseReservation(repositoryId, encryptedBuffer.length);
      }
      if (error instanceof StorageLimitError) throw error;
      throw this.mapProviderError(error);
    }
  }

  async downloadObject(params: StorageDownloadParams): Promise<Buffer> {
    const { account, storagePath, repositoryId } = params;
    if (!account?.accountId) throw new Error('Storage download requires an account context');
    const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId, repositoryId);

    try {
      return await withRetry(async () => {
      // Use raw.githubusercontent.com with arraybuffer — avoids Octokit string
      // encoding which corrupts bytes > 0x7F in binary encrypted data
      for (const branch of ['main', 'master']) {
        try {
          const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${storagePath}`;
          const response = await axios.get<ArrayBuffer>(url, {
            responseType: 'arraybuffer',
            headers: { Authorization: `Bearer ${accessCredential}`, Accept: 'application/octet-stream' },
            timeout: 30000,
          });
          logger.info('GitHub download successful', { path: storagePath, branch });
          return Buffer.from(response.data);
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) continue;
          throw err;
        }
      }
      throw new Error(`File not found in GitHub repository: ${storagePath}`);
      });
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async deleteObject(params: StorageDeleteParams): Promise<void> {
    const { account, storagePath, providerRef, repositoryId } = params;
    if (!account?.accountId) throw new Error('Storage delete requires an account context');
    if (!providerRef) {
      throw new Error('GitHub delete requires providerRef (blob SHA)');
    }

    const { owner, repo, accessCredential } = await this.repositoryFor(account.accountId, repositoryId);
    const octokit = this.getClient(accessCredential);

    try {
      // GitHub deletion adds a commit; its earlier blob still counts toward repository history.
      await this.serializeRepositoryWrite(`${owner.toLowerCase()}/${repo.toLowerCase()}`, () => withRetry(async () => {
      await octokit.repos.deleteFile({
        owner,
        repo,
        path: storagePath,
        message: 'Delete encrypted file',
        sha: providerRef,
      });
      logger.info('GitHub delete successful', { path: storagePath });
      }));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 404) {
        return;
      }
      throw this.mapProviderError(error);
    }
  }

  // ── GitHub-specific helpers (not part of IStorageProvider) ─────────────────

  async createRepository(
    accessToken: string,
    repoName: string
  ): Promise<{ name: string; owner: string; url: string; size: number }> {
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
      return { name: data.name, owner: data.owner.login, url: data.html_url, size: data.size };
    });
  }

  private async updateReadme(accessToken: string, owner: string, repo: string): Promise<void> {
    const octokit = this.getClient(accessToken);
    const content = Buffer.from(
      '# Encrypted Storage Repository\n\n' +
      'This repository contains AES-256-GCM encrypted files managed by Free Store.\n\n' +
      'All `.enc` files are encrypted ciphertext. Without the decryption keys they are unreadable.\n\n' +
      '> Automatically managed — do not modify files manually.\n',
      'utf8'
    ).toString('base64');

    try {
      const { data: current } = await octokit.repos.getContent({ owner, repo, path: 'README.md' });
      const sha = 'sha' in current ? (current as { sha: string }).sha : undefined;
      await octokit.repos.createOrUpdateFileContents({
        owner, repo, path: 'README.md',
        message: 'Initialize encrypted storage repository',
        content, sha,
      });
    } catch { /* non-critical */ }
  }

  async getRepository(
    accessToken: string,
    owner: string,
    repo: string
  ): Promise<{ name: string; owner: string; url: string; size: number }> {
    const octokit = this.getClient(accessToken);
    return withRetry(async () => {
      const { data } = await octokit.repos.get({ owner, repo });
      return { name: data.name, owner: data.owner.login, url: data.html_url, size: data.size };
    });
  }
}

// Keep a named singleton for direct use by UserService (repo creation)
export const githubStorageProvider = new GitHubStorageProvider();
export const storageProvider: IStorageProvider = githubStorageProvider;
