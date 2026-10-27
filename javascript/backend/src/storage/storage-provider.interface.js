"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageUnavailableError = exports.StorageLimitError = void 0;
class StorageLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StorageLimitError';
    }
}
exports.StorageLimitError = StorageLimitError;
class StorageUnavailableError extends Error {
    constructor(message = 'Storage provider is temporarily unavailable') {
        super(message);
        this.name = 'StorageUnavailableError';
    }
}
exports.StorageUnavailableError = StorageUnavailableError;
