import { api } from './client';
import { config } from '../config';
export async function getPublicFileLink(fileId) {
    const { data } = await api.get(`/shares/file/${fileId}/link`);
    return data.data.link;
}
export async function createPublicFileLink(fileId, expiresAt) {
    const { data } = await api.post(`/shares/file/${fileId}/link`, { expiresAt });
    return data.data.link;
}
export async function revokePublicFileLink(fileId) {
    await api.delete(`/shares/file/${fileId}/link`);
}
export async function getPublicFile(token) {
    const { data } = await api.get(`/public-links/${token}`);
    return data.data.file;
}
export function getPublicFileContentUrl(token) {
    return `${config.apiBaseUrl}/public-links/${encodeURIComponent(token)}/content`;
}
export async function listSharedByMe() {
    const { data } = await api.get('/shares/by-me');
    return data.data;
}
export async function listSharedWithMe() {
    const { data } = await api.get('/shares/with-me');
    return data.data;
}
export async function listSharesForFile(fileId) {
    const { data } = await api.get(`/shares/file/${fileId}`);
    return data.data;
}
export async function shareFile(fileId, payload) {
    const { data } = await api.post(`/shares/file/${fileId}`, payload);
    return data.data;
}
export async function updateShare(shareId, payload) {
    const { data } = await api.patch(`/shares/${shareId}`, payload);
    return data.data;
}
export async function revokeShare(shareId) {
    await api.delete(`/shares/${shareId}`);
}
