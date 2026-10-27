"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const file_repository_1 = require("../files/file.repository");
const db_1 = require("../lib/db");
jest.mock('../lib/db', () => ({ execute: jest.fn(), query: jest.fn(), transaction: jest.fn() }));
const mockQuery = db_1.query;
describe('FileRepository access scoping', () => {
    let repository;
    beforeEach(() => { repository = new file_repository_1.FileRepository(); jest.clearAllMocks(); });
    it('scopes owned-file lookup by both file and user IDs', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await expect(repository.findByIdAndUserId('file-B', 'user-A')).resolves.toBeNull();
        const [sql, values] = mockQuery.mock.calls[0];
        expect(sql).toContain('id = ? AND user_id = ?');
        expect(values).toEqual(['file-B', 'user-A']);
    });
    it('does not disclose a deleted file to an owner lookup', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await expect(repository.findByIdAndUserId('deleted-file', 'user-A')).resolves.toBeNull();
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain("status <> 'DELETED'");
    });
    it('checks ownership first and permits only active non-expired recipient shares', async () => {
        mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{
                id: 'file-1', userId: 'user-B', workspaceId: null, folderId: null, sortOrder: 0,
                originalFilename: 'shared.pdf', storedFilename: 'opaque.enc', storagePath: 'files/opaque.enc', providerRef: 'sha',
                mimeType: 'application/pdf', fileSize: 12, encryptedFileKey: 'wrapped', encryptionVersion: 1,
                storageType: 'GITHUB_SINGLE', chunkSize: null, totalChunks: null, checksum: 'sum', status: 'ACTIVE',
                createdAt: new Date(), updatedAt: new Date(), recipientEncryptedFileKey: 'recipient-wrap',
            }]);
        const access = await repository.findByIdAndAccessor('file-1', 'user-A');
        expect(access?.isOwner).toBe(false);
        expect(access?.recipientEncryptedFileKey).toBe('recipient-wrap');
        const [shareSql, values] = mockQuery.mock.calls[1];
        expect(shareSql).toContain('shared_with_id = ?');
        expect(shareSql).toContain('s.expires_at > UTC_TIMESTAMP()');
        expect(values).toEqual(['file-1', 'user-A']);
    });
});
