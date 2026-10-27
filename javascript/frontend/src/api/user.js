import { api } from './client';
export async function getUser() {
    const { data } = await api.get('/user');
    return data.data;
}
export async function getRepository() {
    const { data } = await api.get('/user/repository');
    return data.data;
}
