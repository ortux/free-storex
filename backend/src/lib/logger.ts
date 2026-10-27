import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'free-store' },
  transports: [
    new winston.transports.Console({
      format: isDev
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
  ],
});

// Safe log helpers — never log secrets, keys, tokens
export const safeLog = {
  userUpload: (userId: string, fileId: string) =>
    logger.info(`User ${userId} uploaded file ${fileId}`),

  userDownload: (userId: string, fileId: string) =>
    logger.info(`User ${userId} downloaded file ${fileId}`),

  userDelete: (userId: string, fileId: string) =>
    logger.info(`User ${userId} deleted file ${fileId}`),

  githubUpload: (fileId: string, path: string) =>
    logger.info(`GitHub upload successful`, { fileId, path }),

  githubDelete: (fileId: string) =>
    logger.info(`GitHub delete successful`, { fileId }),

  encryptionSuccess: (fileId: string) =>
    logger.info(`File encryption successful`, { fileId }),

  decryptionSuccess: (fileId: string) =>
    logger.info(`File decryption successful`, { fileId }),

  authLogin: (userId: string, username: string) =>
    logger.info(`User logged in`, { userId, username }),

  authLogout: (userId: string) =>
    logger.info(`User logged out`, { userId }),

  repoCreated: (userId: string, repoName: string) =>
    logger.info(`GitHub repository created`, { userId, repoName }),

  error: (message: string, err?: unknown) => {
    if (err instanceof Error) {
      logger.error(message, { message: err.message, stack: err.stack });
    } else {
      logger.error(message);
    }
  },
};
