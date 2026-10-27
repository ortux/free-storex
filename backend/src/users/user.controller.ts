import { Router } from 'express';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { userService } from './user.service';
import { githubStorageProvider } from '../storage/github-storage.provider';
import { storageRepositoryRepository } from '../storage/storage-repository.repository';
import type { User } from '../lib/models';

const router = Router();

function actorId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

// GET /api/v1/user
router.get('/', requireAuthOrApiKey, async (req, res, next) => {
  try {
    const user = await userService.getById(actorId(req)) as User | null;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      return;
    }
    const profile = await userService.getSafeProfile(user);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// GET /api/v1/user/repository
router.get('/repository', requireAuthOrApiKey, async (req, res, next) => {
  try {
    const user = await userService.getById(actorId(req)) as User;
    if (!user.repositoryName || !user.repositoryOwner) {
      res.status(404).json({ success: false, error: { code: 'NO_REPOSITORY', message: 'GitHub repository not yet created' } });
      return;
    }
    const storageRepositories = (await storageRepositoryRepository.listByUserId(user.id)).map((repository) => ({
      id: repository.id,
      name: repository.repositoryName,
      owner: repository.repositoryOwner,
      url: `https://github.com/${repository.repositoryOwner}/${repository.repositoryName}`,
      usedBytes: Number(repository.usedBytes),
      maxBytes: Number(repository.maxBytes),
      status: repository.status,
      isPrimary: Boolean(repository.isPrimary),
    }));
    try {
      const accessToken = userService.getAccessToken(user);
      const info = await githubStorageProvider.getRepository(accessToken, user.repositoryOwner, user.repositoryName);
      res.json({
        success: true,
        data: { ...info, visibility: 'public', encryption: 'AES-256-GCM', storageRepositories },
      });
    } catch {
      res.json({
        success: true,
        data: {
          name: user.repositoryName, owner: user.repositoryOwner,
          url: `https://github.com/${user.repositoryOwner}/${user.repositoryName}`,
          visibility: 'public', encryption: 'AES-256-GCM', storageRepositories,
        },
      });
    }
  } catch (err) { next(err); }
});

export default router;
