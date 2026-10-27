import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listFiles, uploadFile, deleteFile, getUploadStatus, renameFile, listFolders, createFolder, updateFolder, deleteFolder, listFileActivity, moveFile, reorderFiles, } from '../api/files';
import toast from 'react-hot-toast';
export function useFiles(params) {
    return useQuery({
        queryKey: ['files', params],
        queryFn: () => listFiles(params),
    });
}
export function useFolders() {
    return useQuery({ queryKey: ['folders'], queryFn: listFolders });
}
export function useFileActivity(limit = 20) {
    return useQuery({ queryKey: ['file-activity', limit], queryFn: () => listFileActivity(limit) });
}
export function useCreateFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: createFolder,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); toast.success('Folder created'); },
        onError: () => toast.error('Failed to create folder'),
    });
}
export function useUpdateFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...payload }) => updateFolder(id, payload),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); toast.success('Folder updated'); },
        onError: (err) => toast.error(err.response?.data?.error?.message ?? 'Failed to update folder'),
    });
}
export function useDeleteFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: deleteFolder,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); qc.invalidateQueries({ queryKey: ['files'] }); toast.success('Folder deleted; its contents were moved to My Drive'); },
        onError: () => toast.error('Failed to delete folder'),
    });
}
export function useMoveFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, folderId }) => moveFile(id, folderId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['files'] }); qc.invalidateQueries({ queryKey: ['file-activity'] }); toast.success('File moved'); },
        onError: () => toast.error('Failed to move file'),
    });
}
export function useReorderFiles() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ fileIds, folderId }) => reorderFiles(fileIds, folderId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['files'] }); qc.invalidateQueries({ queryKey: ['file-activity'] }); },
        onError: () => toast.error('Failed to save file order'),
    });
}
/**
 * Presigned upload mutation.
 * Internally does: POST /uploads/initiate → PUT presigned URL.
 */
export function useUploadFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ file, folderId, onProgress, signal }) => uploadFile(file, onProgress, signal, folderId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['files'] });
            qc.invalidateQueries({ queryKey: ['user'] });
            qc.invalidateQueries({ queryKey: ['file-activity'] });
            toast.success('File uploaded successfully');
        },
        onError: (err) => {
            // AbortError is intentional — don't show a toast
            if (err instanceof Error && err.name === 'AbortError')
                return;
            const msg = err
                .response?.data?.error?.message ??
                (err instanceof Error ? err.message : 'Upload failed');
            toast.error(msg);
        },
    });
}
/**
 * Poll an upload's status until it reaches a terminal state.
 * Used by the resumable upload UI.
 */
export function useUploadStatus(uploadId) {
    return useQuery({
        queryKey: ['upload-status', uploadId],
        queryFn: () => getUploadStatus(uploadId),
        enabled: !!uploadId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            // Stop polling once terminal
            if (status === 'complete' || status === 'failed' || status === 'deleted') {
                return false;
            }
            return 2000; // poll every 2s while in_progress / waiting
        },
    });
}
export function useDeleteFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteFile(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['files'] });
            qc.invalidateQueries({ queryKey: ['user'] });
            qc.invalidateQueries({ queryKey: ['file-activity'] });
            toast.success('File deleted');
        },
        onError: () => toast.error('Failed to delete file'),
    });
}
export function useRenameFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, filename }) => renameFile(id, filename),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['files'] });
            qc.invalidateQueries({ queryKey: ['file-activity'] });
            toast.success('File renamed');
        },
        onError: (err) => {
            const message = err.response?.data?.error?.message ?? 'Failed to rename file';
            toast.error(message);
        },
    });
}
