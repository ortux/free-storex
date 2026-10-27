import { api } from './client';
export async function listApiKeys() {
    const { data } = await api.get('/api-keys');
    return data.data;
}
export async function createApiKey(name, expiresAt) {
    const { data } = await api.post('/api-keys', { name, expiresAt });
    return data.data;
}
export async function deleteApiKey(id) {
    await api.delete(`/api-keys/${id}`);
}
