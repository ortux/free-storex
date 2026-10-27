import { ApiKeyService } from '../api-keys/api-key.service';
import { execute, query } from '../lib/db';

jest.mock('../lib/db', () => ({ execute: jest.fn(), query: jest.fn() }));
const mockExecute = execute as jest.MockedFunction<typeof execute>;
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('ApiKeyService using MySQL', () => {
  let service: ApiKeyService;
  beforeEach(() => { service = new ApiKeyService(); jest.clearAllMocks(); });

  it('returns a plaintext key once while storing only its hash', async () => {
    mockQuery.mockResolvedValueOnce([{
      id: 'uuid-1', userId: 'user-1', name: 'test key', keyHash: 'stored-hash', prefix: 'sk_live_test',
      lastUsed: null, createdAt: new Date(), expiresAt: null,
    }] as never);
    const { key, record } = await service.create('user-1', 'test key');
    expect(key).toMatch(/^sk_live_[0-9a-f]{64}$/);
    expect(record.id).toBe('uuid-1');
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO api_keys');
    expect(params?.[3]).not.toBe(key);
    expect(String(params?.[3])).toHaveLength(64);
  });

  it('does not query MySQL for invalid key prefixes', async () => {
    await expect(service.validate('invalid_key')).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects expired stored keys', async () => {
    mockQuery.mockResolvedValueOnce([{
      id: 'id', userId: 'user-1', name: 'expired', keyHash: 'hash', prefix: 'sk_live_x',
      lastUsed: null, createdAt: new Date(), expiresAt: new Date('2020-01-01'),
    }] as never);
    await expect(service.validate(`sk_live_${'a'.repeat(64)}`)).resolves.toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
