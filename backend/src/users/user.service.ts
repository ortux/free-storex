import * as crypto from 'crypto';
import { userRepository } from './user.repository';
import { encryptionService } from '../encryption/encryption.service';
import { keyService } from '../encryption/key.service';
import { githubStorageProvider } from '../storage/github-storage.provider';
import { safeLog } from '../lib/logger';
import type { User } from '../lib/models';

function generateRepoName(): string {
  return `encrypted-store-${crypto.randomBytes(4).toString('hex')}`;
}

export class UserService {
  async findOrCreate(githubProfile: {
    id: string;
    username: string;
    email?: string | null;
    accessToken: string;
  }): Promise<User> {
    const existing = await userRepository.findByGithubId(githubProfile.id);

    if (existing) {
      const encryptedToken = keyService.encryptToken(githubProfile.accessToken);
      await userRepository.updateGithubToken(existing.id, encryptedToken);
      return userRepository.findById(existing.id) as Promise<User>;
    }

    const masterKey          = encryptionService.generateKey();
    const encryptedMasterKey = keyService.encryptMasterKey(masterKey);
    masterKey.fill(0);
    const encryptedToken = keyService.encryptToken(githubProfile.accessToken);

    const user = await userRepository.create({
      githubId:                   githubProfile.id,
      githubUsername:             githubProfile.username,
      email:                      githubProfile.email,
      githubAccessTokenEncrypted: encryptedToken,
      encryptedMasterKey,
    });

    try {
      const repoName = generateRepoName();
      const repo     = await githubStorageProvider.createRepository(githubProfile.accessToken, repoName);
      await userRepository.updateTokenAndRepo(user.id, {
        repositoryName:  repo.name,
        repositoryOwner: repo.owner,
      });
      safeLog.repoCreated(user.id, repo.name);
    } catch (err) {
      safeLog.error('Failed to create GitHub repository for new user', err);
    }

    safeLog.authLogin(user.id, githubProfile.username);
    return userRepository.findById(user.id) as Promise<User>;
  }

  async getById(id: string): Promise<User | null> {
    return userRepository.findById(id);
  }

  async getStats(userId: string) {
    return userRepository.getStats(userId);
  }

  getMasterKey(user: User): Buffer {
    return keyService.decryptMasterKey(user.encryptedMasterKey);
  }

  getAccessToken(user: User): string {
    return keyService.decryptToken(user.githubAccessTokenEncrypted);
  }

  async getSafeProfile(user: User) {
    const stats = await this.getStats(user.id);
    return {
      id:              user.id,
      githubUsername:  user.githubUsername,
      email:           user.email,
      repositoryName:  user.repositoryName,
      repositoryOwner: user.repositoryOwner,
      createdAt:       user.createdAt,
      stats,
    };
  }
}

export const userService = new UserService();
