import { createHash } from 'crypto';
import { execute, transaction } from '../lib/db';
import {
  consumeHandoffToken,
  createHandoffToken,
  initializeHandoffTokenStore,
} from '../auth/auth-token.store';

jest.mock('../lib/db', () => ({
  execute: jest.fn(),
  transaction: jest.fn(),
}));

const mockExecute = execute as jest.Mock;
const mockTransaction = transaction as jest.Mock;

describe('OAuth handoff token store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes the persistent token table', async () => {
    await initializeHandoffTokenStore();

    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS oauth_handoff_tokens'));
  });

  it('creates a random token and stores only its hash', async () => {
    mockExecute.mockResolvedValue({});

    const token = await createHandoffToken('user-123');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO oauth_handoff_tokens'),
      [tokenHash, 'user-123', expect.any(Number)],
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM oauth_handoff_tokens WHERE expires_at <= ?',
      [expect.any(Number)],
    );
  });

  it('atomically deletes and returns an unexpired token owner', async () => {
    const executeInTransaction = jest.fn().mockResolvedValue([[
      { userId: 'user-123', expiresAt: Date.now() + 60_000 },
    ], []]);
    const connection = { execute: executeInTransaction };
    mockTransaction.mockImplementation((work) => work(connection));

    await expect(consumeHandoffToken('a'.repeat(64))).resolves.toBe('user-123');

    expect(executeInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [createHash('sha256').update('a'.repeat(64)).digest('hex')],
    );
    expect(executeInTransaction).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM oauth_handoff_tokens'),
      [createHash('sha256').update('a'.repeat(64)).digest('hex')],
    );
  });

  it('deletes expired tokens without returning their owner', async () => {
    const executeInTransaction = jest.fn().mockResolvedValue([[
      { userId: 'user-123', expiresAt: Date.now() - 1 },
    ], []]);
    mockTransaction.mockImplementation((work) => work({ execute: executeInTransaction }));

    await expect(consumeHandoffToken('b'.repeat(64))).resolves.toBeNull();
    expect(executeInTransaction).toHaveBeenCalledTimes(2);
  });

  it('returns null when a token is unknown', async () => {
    const executeInTransaction = jest.fn().mockResolvedValue([[], []]);
    mockTransaction.mockImplementation((work) => work({ execute: executeInTransaction }));

    await expect(consumeHandoffToken('c'.repeat(64))).resolves.toBeNull();
    expect(executeInTransaction).toHaveBeenCalledTimes(1);
  });
});