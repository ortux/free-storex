export interface StorageAccountContext {
  accountId: string;
}

export interface StorageUploadParams {
  storagePath: string;
  encryptedBuffer: Buffer;
  account: StorageAccountContext;
}

export interface StorageDownloadParams {
  storagePath: string;
  repositoryId?: string | null;
  account: StorageAccountContext;
}

export interface StorageDeleteParams {
  storagePath: string;
  repositoryId?: string | null;
  providerRef?: string;
  account: StorageAccountContext;
}

export interface StorageUploadResult {
  storagePath: string;
  providerRef: string;
  repositoryId: string;
}

export interface IStorageProvider {
  readonly providerName: string;
  uploadObject(params: StorageUploadParams): Promise<StorageUploadResult>;
  downloadObject(params: StorageDownloadParams): Promise<Buffer>;
  deleteObject(params: StorageDeleteParams): Promise<void>;
}

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageLimitError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Storage provider is temporarily unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}
