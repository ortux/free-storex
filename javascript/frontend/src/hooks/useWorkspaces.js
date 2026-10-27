import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listWorkspaces, createWorkspace, deleteWorkspace, listMembers, inviteMember, updateMemberRole, removeMember, } from '../api/workspaces';
import toast from 'react-hot-toast';
export function useWorkspaces() {
    return useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces });
}
export function useWorkspaceMembers(workspaceId) {
    return useQuery({
        queryKey: ['workspace-members', workspaceId],
        queryFn: () => listMembers(workspaceId),
        enabled: !!workspaceId,
    });
}
export function useCreateWorkspace() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: createWorkspace,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspaces'] }); toast.success('Workspace created'); },
        onError: () => toast.error('Failed to create workspace'),
    });
}
export function useDeleteWorkspace() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteWorkspace(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspaces'] }); toast.success('Workspace deleted'); },
        onError: () => toast.error('Failed to delete workspace'),
    });
}
export function useInviteMember(workspaceId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (p) => inviteMember(workspaceId, p),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }); toast.success('Member invited'); },
        onError: (e) => toast.error(e.response?.data?.error?.message ?? 'Failed to invite member'),
    });
}
export function useUpdateMemberRole(workspaceId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, role }) => updateMemberRole(workspaceId, userId, role),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }); toast.success('Role updated'); },
        onError: () => toast.error('Failed to update role'),
    });
}
export function useRemoveMember(workspaceId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId) => removeMember(workspaceId, userId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }); toast.success('Member removed'); },
        onError: () => toast.error('Failed to remove member'),
    });
}
