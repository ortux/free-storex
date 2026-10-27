import { StorageRepositoryRepository } from '../storage/storage-repository.repository';
import { transaction } from '../lib/db';

jest.mock('../lib/db', () => ({
  execute: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn(),
}));

const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

describe('StorageRepositoryRepository capacity allocation', () => {
  let repository: StorageRepositoryRepository;
  let connection: { execute: jest.Mock };

  beforeEach(() => {
    repository = new StorageRepositoryRepository();
    connection = { execute: jest.fn() };
    mockTransaction.mockImplementation(async (work) => work(connection as never) as never);
    jest.clearAllMocks();
  });

  it('reserves space in the newest active repository while it remains under its cap', async () => {
    connection.execute
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([[
        {
          id: 'repo-1',
          userId: 'user-1',
          repositoryOwner: 'owner',
          repositoryName: 'store-1',
          usedBytes: 900,
          maxBytes: 1000,
          isPrimary: 1,
          status: 'ACTIVE',
        },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const createRepository = jest.fn();
    const result = await repository.reserveCapacity('user-1', 50, 1000, createRepository);

    expect(result.usedBytes).toBe(950);
    expect(result.id).toBe('repo-1');
    expect(createRepository).not.toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledTimes(3);
  });

  it('creates and records a new repository when all existing repositories are full', async () => {
    connection.execute
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([[
        {
          id: 'repo-1',
          userId: 'user-1',
          repositoryOwner: 'owner',
          repositoryName: 'store-1',
          usedBytes: 990,
          maxBytes: 1000,
          isPrimary: 1,
          status: 'ACTIVE',
        },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const createRepository = jest.fn().mockResolvedValue({
      owner: 'owner',
      name: 'store-2',
      sizeBytes: 10,
    });

    const result = await repository.reserveCapacity('user-1', 50, 1000, createRepository);

    expect(result.repositoryName).toBe('store-2');
    expect(result.usedBytes).toBe(60);
    expect(result.isPrimary).toBe(false);
    expect(createRepository).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[3][0]).toContain('INSERT INTO storage_repositories');
  });

  it('rejects an object that cannot fit into any repository', async () => {
    const createRepository = jest.fn();

    await expect(repository.reserveCapacity('user-1', 1001, 1000, createRepository))
      .rejects.toThrow('per-repository capacity');

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });
});
