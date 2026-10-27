import { api } from './client';
export async function listWorkspaces() {
    const { data } = await api.get('/workspaces');
    return data.data;
}
export async function getWorkspace(id) {
    const { data } = await api.get(`/workspaces/${id}`);
    return data.data;
}
export async function createWorkspace(payload) {
    const { data } = await api.post('/workspaces', payload);
    return data.data;
}
export async function updateWorkspace(id, payload) {
    const { data } = await api.patch(`/workspaces/${id}`, payload);
    return data.data;
}
export async function deleteWorkspace(id) {
    await api.delete(`/workspaces/${id}`);
}
export async function listMembers(workspaceId) {
    const { data } = await api.get(`/workspaces/${workspaceId}/members`);
    return data.data;
}
export async function inviteMember(workspaceId, payload) {
    const { data } = await api.post(`/workspaces/${workspaceId}/members`, payload);
    return data.data;
}
export async function updateMemberRole(workspaceId, userId, role) {
    const { data } = await api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role });
    return data.data;
}
export async function removeMember(workspaceId, userId) {
    await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
}
export async function leaveWorkspace(workspaceId) {
    await api.delete(`/workspaces/${workspaceId}/members/me`);
}
