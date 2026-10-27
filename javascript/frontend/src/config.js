const env = import.meta.env;
const apiBaseUrl = '/api/v1';
export const config = {
    apiBaseUrl,
    authBaseUrl: '',
    githubLoginUrl: '/auth/github',
    maxFileSizeMb: Number(env.VITE_MAX_FILE_SIZE_MB ?? 1024),
    largeFileThresholdMb: Number(env.VITE_LARGE_FILE_THRESHOLD_MB ?? 20),
    chunkSizeMb: Number(env.VITE_CHUNK_SIZE_MB ?? 5),
    uploadConcurrency: Number(env.VITE_UPLOAD_CONCURRENCY ?? 3),
    uploadMaxRetries: Number(env.VITE_UPLOAD_MAX_RETRIES ?? 3),
    allowedMimeTypes: (env.VITE_ALLOWED_MIME_TYPES
        ? String(env.VITE_ALLOWED_MIME_TYPES).split(',').map((mimeType) => mimeType.trim()).filter(Boolean)
        : [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf',
            'video/mp4', 'video/webm', 'video/quicktime',
            'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
            'application/zip', 'application/octet-stream',
        ]),
};
