"use strict";
/**
 * GitHub Service Tests — all GitHub API calls are mocked
 */
Object.defineProperty(exports, "__esModule", { value: true });
const github_service_1 = require("../github/github.service");
// Mock @octokit/rest
jest.mock('@octokit/rest', () => {
    return {
        Octokit: jest.fn().mockImplementation(() => ({
            repos: {
                createForAuthenticatedUser: jest.fn(),
                getContent: jest.fn(),
                createOrUpdateFileContents: jest.fn(),
                deleteFile: jest.fn(),
                get: jest.fn(),
            },
        })),
    };
});
const rest_1 = require("@octokit/rest");
describe('GitHubService', () => {
    let service;
    let mockOctokit;
    beforeEach(() => {
        service = new github_service_1.GitHubService();
        jest.clearAllMocks();
        mockOctokit = {
            repos: {
                createForAuthenticatedUser: jest.fn(),
                getContent: jest.fn(),
                createOrUpdateFileContents: jest.fn(),
                deleteFile: jest.fn(),
                get: jest.fn(),
            },
        };
        rest_1.Octokit.mockImplementation(() => mockOctokit);
    });
    describe('uploadFile', () => {
        it('uploads encrypted buffer and returns sha', async () => {
            mockOctokit.repos.createOrUpdateFileContents.mockResolvedValueOnce({
                data: { content: { sha: 'abc123sha' } },
            });
            const encryptedBuffer = Buffer.from('encrypted bytes here');
            const result = await service.uploadFile('token', 'owner', 'repo', 'files/test.enc', encryptedBuffer);
            expect(result.sha).toBe('abc123sha');
            expect(result.path).toBe('files/test.enc');
            // Verify content was base64 encoded before sending
            const callArgs = mockOctokit.repos.createOrUpdateFileContents.mock.calls[0][0];
            expect(callArgs.content).toBe(encryptedBuffer.toString('base64'));
            expect(callArgs.path).toBe('files/test.enc');
        });
        it('throws when GitHub does not return SHA', async () => {
            mockOctokit.repos.createOrUpdateFileContents.mockResolvedValueOnce({
                data: { content: {} },
            });
            await expect(service.uploadFile('token', 'owner', 'repo', 'files/test.enc', Buffer.from('data'))).rejects.toThrow(/SHA/i);
        });
    });
    describe('deleteFile', () => {
        it('calls GitHub delete with correct params', async () => {
            mockOctokit.repos.deleteFile.mockResolvedValueOnce({ data: {} });
            await service.deleteFile('token', 'owner', 'repo', 'files/test.enc', 'sha123');
            const callArgs = mockOctokit.repos.deleteFile.mock.calls[0][0];
            expect(callArgs.owner).toBe('owner');
            expect(callArgs.repo).toBe('repo');
            expect(callArgs.path).toBe('files/test.enc');
            expect(callArgs.sha).toBe('sha123');
        });
    });
});
