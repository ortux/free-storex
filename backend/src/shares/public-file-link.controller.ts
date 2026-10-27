import { Router } from 'express';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import { fileService } from '../files/file.service';
import { publicFileLinkService, PublicLinkNotFoundError } from './public-file-link.service';
import { resumableUploadService } from '../uploads/resumable-upload.service';

const router = Router();

router.get('/:token', authRateLimit, async (req, res, next) => {
  try {
    const file = await publicFileLinkService.getPublicMetadata(req.params.token);
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({ success: true, data: { file } });
  } catch (error) {
    if (error instanceof PublicLinkNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'LINK_UNAVAILABLE', message: error.message } });
      return;
    }
    next(error);
  }
});

router.get('/:token/content', authRateLimit, async (req, res, next) => {
  try {
    const { file, owner } = await publicFileLinkService.resolve(req.params.token);
    const inline = file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/');
    const disposition = inline ? 'inline' : 'attachment';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.originalFilename)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });

    if (file.storageType === 'GITHUB_CHUNKED') {
      const rangeHeader = req.headers.range;
      let range: { start: number; end: number } | undefined;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        const start = match?.[1] ? Number(match[1]) : Math.max(file.fileSize - Number(match?.[2] ?? 0), 0);
        const end = match?.[2] ? Number(match[2]) : file.fileSize - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= file.fileSize) {
          res.status(416).set('Content-Range', `bytes */${file.fileSize}`).end();
          return;
        }
        range = { start, end: Math.min(end, file.fileSize - 1) };
        res.status(206);
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? file.fileSize - 1;
      res.set({
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        ...(range && { 'Content-Range': `bytes ${start}-${end}/${file.fileSize}` }),
      });
      await resumableUploadService.stream(owner, file.id, async (chunk) => {
        if (!res.write(chunk)) await new Promise<void>((resolve) => res.once('drain', resolve));
      }, range);
      res.end();
      return;
    }

    const { buffer } = await fileService.download(owner, file.id);
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (error) {
    if (error instanceof PublicLinkNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'LINK_UNAVAILABLE', message: error.message } });
      return;
    }
    next(error);
  }
});

export default router;