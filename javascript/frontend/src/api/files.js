import axios from 'axios';
import { api } from './client';
import { config } from '../config';
// ── List ──────────────────────────────────────────────────────────────────────
export async function listFiles(params) {
    const { data } = await api.get('/files', { params });
    return data.data;
}
export async function listFolders() {
    const { data } = await api.get('/folders');
    return data.data.folders;
}
export async function createFolder(payload) {
    const { data } = await api.post('/folders', payload);
    return data.data.folder;
}
export async function updateFolder(id, payload) {
    const { data } = await api.patch(`/folders/${id}`, payload);
    return data.data.folder;
}
export async function deleteFolder(id) {
    await api.delete(`/folders/${id}`);
}
export async function listFileActivity(limit = 20) {
    const { data } = await api.get('/activity', { params: { limit } });
    return data.data.activities;
}
export async function moveFile(id, folderId) {
    const { data } = await api.patch(`/files/${id}/move`, { folderId });
    return data.data.file;
}
export async function reorderFiles(fileIds, folderId) {
    await api.put('/files/reorder', { fileIds, folderId });
}
export async function createUpload(file, folderId = null) {
    const { data } = await api.post('/uploads', {
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        folderId,
    });
    return {
        ...data.data.upload,
        chunkUploadUrl: data.data.chunkUploadUrl,
        chunkUploadToken: data.data.chunkUploadToken,
    };
}
export async function getResumableUploadStatus(uploadId) {
    const { data } = await api.get(`/uploads/${uploadId}/status`);
    return data.data;
}
export async function listResumableUploads() {
    const { data } = await api.get('/uploads');
    return data.data.uploads;
}
export async function uploadChunk(chunkUploadUrl, token, index, chunk, signal) {
    await axios.put(`${chunkUploadUrl}/${index}`, chunk, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
        },
        signal,
        withCredentials: false,
    });
}
export async function completeUpload(uploadId) {
    const { data } = await api.post(`/uploads/${uploadId}/complete`);
    return data.data.file;
}
/**
 * Step 1 — ask the backend for a signed upload token + URL.
 * Requests a short-lived upload token and URL from the GitHub-backed API.
 */
export async function initiateUpload(file, folderId = null) {
    const { data } = await api.post('/uploads/initiate', {
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        folderId,
    });
    return data.data;
}
/**
 * Step 2 — PUT raw file bytes to the presigned URL using the upload token.
 * Sends raw file bytes to the temporary upload URL.
 *
 * The token is sent as Authorization: Bearer <token> — NOT the session cookie.
 * Progress is reported via onProgress(0–100).
 */
export async function executeUpload(uploadUrl, token, file, onProgress, signal) {
    const { data } = await axios.put(uploadUrl, file, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': file.type || 'application/octet-stream',
            'Content-Length': String(file.size),
        },
        onUploadProgress: (e) => {
            if (e.total)
                onProgress?.(Math.round((e.loaded / e.total) * 100));
        },
        signal,
        // Axios default withCredentials does not apply here — auth is via Bearer token
        withCredentials: false,
    });
    return data.data.file;
}
/**
 * Combined helper — initiates then executes in one call.
 * Use this for simple uploads. Use initiate + execute separately
 * if you need to store the token for resumable behaviour.
 */
export async function uploadFile(file, onProgress, signal, folderId = null) {
    // Phase 1: get presigned token (0–5% of progress bar)
    onProgress?.(0);
    const initiated = await initiateUpload(file, folderId);
    onProgress?.(5);
    // Phase 2: PUT raw bytes to presigned URL (5–100%)
    const scaledProgress = (pct) => onProgress?.(5 + Math.round(pct * 0.95));
    return executeUpload(initiated.uploadUrl, initiated.token, file, scaledProgress, signal);
}
/**
 * Abort a pending upload that hasn't been executed yet.
 * Aborts a pending upload.
 */
export async function abortUpload(uploadId) {
    await api.delete(`/uploads/${uploadId}`);
}
/**
 * Poll upload status — useful for resumable UI.
 * Reads the current upload status.
 */
export async function getUploadStatus(uploadId) {
    const { data } = await api.get(`/uploads/${uploadId}/status`);
    return data.data;
}
// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteFile(id) {
    await api.delete(`/files/${id}`);
}
export async function renameFile(id, filename) {
    const { data } = await api.patch(`/files/${id}`, { filename });
    return data.data.file;
}
// ── URL helpers ───────────────────────────────────────────────────────────────
export function getImageUrl(id) {
    return `${config.apiBaseUrl}/images/${id}`;
}
export function getDownloadUrl(id) {
    return `${config.apiBaseUrl}/files/${id}`;
}
