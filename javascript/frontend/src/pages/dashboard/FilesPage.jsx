import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Trash2, Copy, Share2, Eye, Files, X, FileText, Grid2X2, List, CheckSquare, Square, Folder, Upload, ArrowUpRight, HardDrive, FileImage, Sparkles, FolderPlus, Pencil, FolderMinus, Globe, Link2, Users, RotateCw, } from 'lucide-react';
import { useFiles, useDeleteFile, useRenameFile, useFolders, useFileActivity, useCreateFolder, useUpdateFolder, useDeleteFolder, useMoveFile, useReorderFiles, } from '../../hooks/useFiles';
import { useShareFile, useSharesForFile, useRevokeShare, useSharedWithMe, usePublicFileLink, useCreatePublicFileLink, useRevokePublicFileLink, } from '../../hooks/useShares';
import { getImageUrl, getDownloadUrl } from '../../api/files';
import { formatBytes, formatDate, isImage } from '../../utils/format';
import { Modal } from '../../components/ui/Modal';
import { Avatar } from '../../components/ui/Avatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonRow } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';
const PERM_BADGE = {
    VIEW: 'badge-gray',
    EDIT: 'badge-amber',
    MANAGE: 'badge-blue',
};
const FILTER_TABS = [
    { id: 'all', label: 'All files' },
    { id: 'images', label: 'Images' },
    { id: 'pdfs', label: 'PDFs' },
    { id: 'recent', label: 'Recent' },
];
function isPdf(mimeType) {
    return mimeType === 'application/pdf';
}
function getFileIcon(file) {
    if (isImage(file.mimeType))
        return _jsx(FileImage, { className: "w-4 h-4 text-sky-400" });
    if (isPdf(file.mimeType))
        return _jsx(FileText, { className: "w-4 h-4 text-red-400" });
    return _jsx(Files, { className: "w-4 h-4 text-[#666]" });
}
export default function FilesPage() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [mime, setMime] = useState('');
    const [sort, setSort] = useState('sortOrder:asc');
    const [viewMode, setViewMode] = useState('grid');
    const [activeTab, setActiveTab] = useState('all');
    const [selectedIds, setSelectedIds] = useState([]);
    const [preview, setPreview] = useState(null);
    const [delId, setDelId] = useState(null);
    const [shareId, setShareId] = useState(null);
    const [shareMode, setShareMode] = useState('restricted');
    const [linkExpiryDays, setLinkExpiryDays] = useState('');
    const [recipient, setRecipient] = useState('');
    const [perm, setPerm] = useState('VIEW');
    const [renameTarget, setRenameTarget] = useState(null);
    const [folderTarget, setFolderTarget] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [currentFolderId, setCurrentFolderId] = useState('root');
    const { data: sharedWithMe = [] } = useSharedWithMe();
    const [sortBy, sortOrder] = sort.split(':');
    const activeFolderId = activeTab === 'recent' ? undefined : currentFolderId;
    const { data, isLoading } = useFiles({ search, mimeType: mime, folderId: activeFolderId, sortBy, sortOrder, limit: 1000 });
    const { data: folders = [] } = useFolders();
    const { data: recentActivity = [] } = useFileActivity(8);
    const deleteFile = useDeleteFile();
    const renameFileMutation = useRenameFile();
    const createFolder = useCreateFolder();
    const updateFolder = useUpdateFolder();
    const deleteFolder = useDeleteFolder();
    const moveFile = useMoveFile();
    const reorderFiles = useReorderFiles();
    const shareFile = useShareFile(shareId ?? '');
    const { data: shares = [] } = useSharesForFile(shareId ?? '');
    const revokeShare = useRevokeShare();
    const { data: publicLink, isLoading: publicLinkLoading } = usePublicFileLink(shareId ?? '');
    const createPublicLink = useCreatePublicFileLink(shareId ?? '');
    const revokePublicLink = useRevokePublicFileLink(shareId ?? '');
    const files = data?.files ?? [];
    const orderedFolders = useMemo(() => {
        const byParent = new Map();
        for (const folder of folders) {
            const siblings = byParent.get(folder.parentId) ?? [];
            siblings.push(folder);
            byParent.set(folder.parentId, siblings);
        }
        for (const siblings of byParent.values()) {
            siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        }
        const result = [];
        const visit = (parentId) => {
            for (const folder of byParent.get(parentId) ?? []) {
                result.push(folder);
                visit(folder.id);
            }
        };
        visit(null);
        return result;
    }, [folders]);
    const visibleFiles = useMemo(() => {
        const base = [...files].filter((file) => {
            const matchesTab = (() => {
                if (activeTab === 'images')
                    return isImage(file.mimeType);
                if (activeTab === 'pdfs')
                    return isPdf(file.mimeType);
                if (activeTab === 'recent')
                    return new Date(file.createdAt).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 7;
                return true;
            })();
            if (!matchesTab)
                return false;
            if (!search.trim())
                return true;
            const query = search.toLowerCase();
            return file.filename.toLowerCase().includes(query) || file.mimeType.toLowerCase().includes(query);
        });
        base.sort((a, b) => {
            if (sortBy === 'sortOrder')
                return a.sortOrder - b.sortOrder;
            const direction = sortOrder === 'asc' ? 1 : -1;
            if (sortBy === 'fileSize')
                return (a.size - b.size) * direction;
            if (sortBy === 'originalFilename')
                return a.filename.localeCompare(b.filename) * direction;
            const aDate = new Date(a.createdAt).getTime();
            const bDate = new Date(b.createdAt).getTime();
            return (aDate - bDate) * direction;
        });
        return base;
    }, [activeTab, files, search, sortBy, sortOrder]);
    const filteredFiles = visibleFiles;
    const totalStorage = files.reduce((sum, file) => sum + file.size, 0);
    const imageCount = files.filter((file) => isImage(file.mimeType)).length;
    const pdfCount = files.filter((file) => isPdf(file.mimeType)).length;
    const toggleSelection = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    };
    const toggleSelectAll = () => {
        if (selectedIds.length === filteredFiles.length) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(filteredFiles.map((file) => file.id));
    };
    const bulkDeleteSelected = async () => {
        if (!selectedIds.length)
            return;
        const ids = [...selectedIds];
        for (const id of ids) {
            await deleteFile.mutateAsync(id);
        }
        setSelectedIds([]);
    };
    const copyUrl = async (id) => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/api/v1/images/${id}`);
            toast.success('Public image URL copied');
        }
        catch {
            toast.error('Unable to copy URL');
        }
    };
    const copyShareLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Share link copied');
        }
        catch {
            toast.error('Unable to copy share link');
        }
    };
    const displayedFileIds = filteredFiles.map((file) => file.id);
    const canReorder = sortBy === 'sortOrder' && activeTab === 'all' && !search.trim() && !mime;
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const handleFileDrop = (event, targetId) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData('application/file-id');
        const fromIndex = displayedFileIds.indexOf(draggedId);
        const toIndex = displayedFileIds.indexOf(targetId);
        if (!draggedId || fromIndex < 0 || toIndex < 0 || draggedId === targetId)
            return;
        const nextOrder = [...displayedFileIds];
        nextOrder.splice(fromIndex, 1);
        nextOrder.splice(toIndex, 0, draggedId);
        reorderFiles.mutate({ fileIds: nextOrder, folderId: currentFolderId === 'root' ? null : currentFolderId });
    };
    const handleDropOnFolder = (event, folderId) => {
        event.preventDefault();
        const fileId = event.dataTransfer.getData('application/file-id');
        const draggedFolderId = event.dataTransfer.getData('application/folder-id');
        if (fileId) {
            moveFile.mutate({ id: fileId, folderId });
        }
        else if (draggedFolderId && draggedFolderId !== folderId) {
            updateFolder.mutate({ id: draggedFolderId, parentId: folderId });
        }
    };
    return (_jsxs("div", { className: "p-6 max-w-7xl mx-auto space-y-5", children: [_jsxs("div", { className: "flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.2em] text-[#555]", children: "Drive" }), _jsx("h1", { className: "text-xl font-semibold text-[#ededed]", children: "My files" })] }), _jsxs("div", { className: "flex items-center gap-2 self-start xl:self-auto", children: [_jsxs("button", { className: "btn-secondary btn-sm", onClick: () => navigate('/dashboard/upload'), children: [_jsx(Upload, { className: "w-3.5 h-3.5" }), "Upload"] }), _jsxs("button", { className: "btn-primary btn-sm", onClick: () => navigate('/dashboard/upload'), children: [_jsx(ArrowUpRight, { className: "w-3.5 h-3.5" }), "New upload"] })] })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-3", children: [_jsxs("div", { className: "stat-card", children: [_jsxs("div", { className: "stat-label", children: [_jsx(Files, { className: "w-3.5 h-3.5" }), "Files"] }), _jsx("div", { className: "stat-value", children: files.length }), _jsx("div", { className: "stat-sub", children: "Across your secure GitHub storage" })] }), _jsxs("div", { className: "stat-card", children: [_jsxs("div", { className: "stat-label", children: [_jsx(HardDrive, { className: "w-3.5 h-3.5" }), "Storage used"] }), _jsx("div", { className: "stat-value", children: formatBytes(totalStorage) }), _jsx("div", { className: "stat-sub", children: "Encrypted and synced to GitHub" })] }), _jsxs("div", { className: "stat-card", children: [_jsxs("div", { className: "stat-label", children: [_jsx(Sparkles, { className: "w-3.5 h-3.5" }), "Previewable"] }), _jsx("div", { className: "stat-value", children: imageCount + pdfCount }), _jsxs("div", { className: "stat-sub", children: [imageCount, " images \u00B7 ", pdfCount, " PDFs"] })] })] }), _jsxs("div", { className: "card p-3", children: [_jsxs("div", { className: "flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between", children: [_jsx("div", { className: "flex flex-wrap gap-2", children: FILTER_TABS.map(({ id, label }) => (_jsx("button", { onClick: () => setActiveTab(id), className: activeTab === id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm', children: label }, id))) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "relative min-w-[220px]", children: [_jsx(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555]" }), _jsx("input", { className: "input pl-8 text-xs", placeholder: "Search files\u2026", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsxs("select", { className: "select text-xs w-[150px]", value: mime, onChange: (e) => setMime(e.target.value), children: [_jsx("option", { value: "", children: "All types" }), _jsx("option", { value: "image/jpeg", children: "JPEG" }), _jsx("option", { value: "image/png", children: "PNG" }), _jsx("option", { value: "image/webp", children: "WebP" }), _jsx("option", { value: "image/gif", children: "GIF" }), _jsx("option", { value: "application/pdf", children: "PDF" })] }), _jsxs("select", { className: "select text-xs w-[160px]", value: sort, onChange: (e) => setSort(e.target.value), children: [_jsx("option", { value: "sortOrder:asc", children: "Manual order" }), _jsx("option", { value: "createdAt:desc", children: "Newest first" }), _jsx("option", { value: "createdAt:asc", children: "Oldest first" }), _jsx("option", { value: "fileSize:desc", children: "Largest first" }), _jsx("option", { value: "fileSize:asc", children: "Smallest first" }), _jsx("option", { value: "originalFilename:asc", children: "Name A\u2192Z" })] }), _jsxs("div", { className: "inline-flex rounded-md border border-[#2e2e2e] bg-[#0a0a0a] p-0.5", children: [_jsx("button", { onClick: () => setViewMode('grid'), className: viewMode === 'grid' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm', children: _jsx(Grid2X2, { className: "w-3.5 h-3.5" }) }), _jsx("button", { onClick: () => setViewMode('list'), className: viewMode === 'list' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm', children: _jsx(List, { className: "w-3.5 h-3.5" }) })] })] })] }), selectedIds.length > 0 && (_jsxs("div", { className: "mt-3 flex items-center justify-between rounded-md border border-[#2e2e2e] bg-[#0d0d0d] px-3 py-2", children: [_jsxs("p", { className: "text-[10px] uppercase tracking-[0.2em] text-[#666]", children: [selectedIds.length, " selected"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { className: "btn-secondary btn-sm", onClick: () => setSelectedIds([]), children: "Clear" }), _jsxs("button", { className: "btn-secondary btn-sm", onClick: bulkDeleteSelected, children: [_jsx(Trash2, { className: "w-3.5 h-3.5" }), "Delete"] })] })] }))] }), _jsxs("div", { className: "grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_300px]", children: [_jsxs("aside", { className: "card p-3 h-fit", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("span", { className: "text-[10px] uppercase tracking-[0.2em] text-[#555]", children: "Folders" }), _jsx("button", { className: "btn-ghost btn-sm", title: "Create folder", onClick: () => { setFolderTarget(null); setNewFolderName(''); setCreatingFolder(true); }, children: _jsx(FolderPlus, { className: "w-3.5 h-3.5" }) })] }), _jsx("div", { className: "space-y-1", children: [
                                    { id: 'root', name: 'My Drive', icon: Folder },
                                    { id: 'recent', name: 'Recent', icon: Sparkles },
                                    { id: 'shared', name: 'Shared with me', icon: Share2 },
                                ].map(({ id, name, icon: Icon }) => (_jsxs("button", { onClick: () => {
                                        if (id === 'shared')
                                            navigate('/dashboard/shared');
                                        else if (id === 'recent')
                                            setActiveTab('recent');
                                        else {
                                            setActiveTab('all');
                                            setCurrentFolderId('root');
                                        }
                                    }, className: currentFolderId === id ? 'sidebar-item-active' : 'sidebar-item', onDragOver: (event) => event.preventDefault(), onDrop: (event) => id === 'root' && handleDropOnFolder(event, null), children: [_jsx(Icon, { className: "w-4 h-4" }), name] }, id))) }), _jsx("div", { className: "divider my-3" }), _jsx("div", { className: "space-y-1", children: orderedFolders.map((folder) => {
                                    let depth = 0;
                                    let parentId = folder.parentId;
                                    while (parentId) {
                                        depth += 1;
                                        parentId = folderById.get(parentId)?.parentId ?? null;
                                    }
                                    return (_jsxs("div", { className: "flex items-center gap-1 group", style: { paddingLeft: `${Math.min(depth, 5) * 12}px` }, children: [_jsxs("button", { onClick: () => { setActiveTab('all'); setCurrentFolderId(folder.id); }, className: `sidebar-item flex-1 min-w-0 ${currentFolderId === folder.id ? 'sidebar-item-active' : ''}`, draggable: canReorder, onDragStart: (event) => event.dataTransfer.setData('application/folder-id', folder.id), onDragOver: (event) => event.preventDefault(), onDrop: (event) => handleDropOnFolder(event, folder.id), children: [_jsx(Folder, { className: "w-4 h-4 shrink-0" }), _jsx("span", { className: "truncate", children: folder.name })] }), _jsx("button", { className: "btn-icon btn-sm opacity-0 group-hover:opacity-100", title: "Rename folder", onClick: () => { setFolderTarget(folder); setNewFolderName(folder.name); }, children: _jsx(Pencil, { className: "w-3 h-3" }) }), _jsx("button", { className: "btn-icon btn-sm opacity-0 group-hover:opacity-100 hover:text-red-400", title: "Delete folder", onClick: () => deleteFolder.mutate(folder.id, { onSuccess: () => { if (currentFolderId === folder.id)
                                                        setCurrentFolderId('root'); } }), children: _jsx(FolderMinus, { className: "w-3 h-3" }) })] }, folder.id));
                                }) })] }), _jsx("div", { className: "space-y-4", children: isLoading ? (_jsx("div", { className: "card p-4", children: _jsx(SkeletonRow, {}) })) : filteredFiles.length === 0 ? (_jsx("div", { className: "card p-10", children: _jsx(EmptyState, { icon: Folder, title: "No files match your filters", description: "Try another search, switch tabs, or upload a new file." }) })) : viewMode === 'grid' ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3", children: filteredFiles.map((file) => {
                                const selected = selectedIds.includes(file.id);
                                return (_jsxs("div", { className: "card hover:border-[#444] transition-colors overflow-hidden group", draggable: true, onDragStart: (event) => {
                                        event.dataTransfer.setData('application/file-id', file.id);
                                    }, onDragOver: (event) => event.preventDefault(), onDrop: (event) => handleFileDrop(event, file.id), children: [_jsxs("div", { className: "relative", children: [_jsx("div", { className: "absolute left-2 top-2 z-10", children: _jsx("button", { onClick: () => toggleSelection(file.id), className: "bg-black/60 rounded p-1 border border-[#2e2e2e]", children: selected ? _jsx(CheckSquare, { className: "w-3.5 h-3.5 text-white" }) : _jsx(Square, { className: "w-3.5 h-3.5 text-[#d0d0d0]" }) }) }), _jsx("div", { className: "h-36 border-b border-[#2e2e2e] bg-[#0a0a0a] cursor-pointer overflow-hidden", onClick: () => (isImage(file.mimeType) || isPdf(file.mimeType)) && setPreview(file), children: isImage(file.mimeType) ? (_jsx("img", { src: getImageUrl(file.id), alt: file.filename, className: "w-full h-full object-cover" })) : (_jsx("div", { className: "flex h-full items-center justify-center", children: isPdf(file.mimeType) ? (_jsxs("div", { className: "flex flex-col items-center gap-2 text-red-400", children: [_jsx(FileText, { className: "w-8 h-8" }), _jsx("span", { className: "text-[10px] uppercase tracking-[0.18em]", children: "PDF" })] })) : (_jsxs("div", { className: "flex flex-col items-center gap-2 text-[#666]", children: [_jsx(Files, { className: "w-8 h-8" }), _jsx("span", { className: "text-[10px] uppercase tracking-[0.18em]", children: "File" })] })) })) })] }), _jsxs("div", { className: "p-3 space-y-3", children: [_jsx("div", { className: "flex items-start justify-between gap-2", children: _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium text-[#ededed]", children: file.filename }), _jsxs("div", { className: "mt-1 flex items-center gap-1 text-[10px] text-[#555]", children: [getFileIcon(file), _jsx("span", { children: file.mimeType })] })] }) }), _jsxs("div", { className: "flex items-center justify-between text-[10px] text-[#555]", children: [_jsx("span", { children: formatBytes(file.size) }), _jsx("span", { children: formatDate(file.createdAt) })] }), _jsxs("div", { className: "flex items-center justify-between gap-2", children: [(isImage(file.mimeType) || isPdf(file.mimeType)) && (_jsxs("button", { className: "btn-secondary btn-sm flex-1", onClick: () => setPreview(file), children: [_jsx(Eye, { className: "w-3.5 h-3.5" }), "Preview"] })), _jsxs("a", { href: getDownloadUrl(file.id), download: true, className: "btn-secondary btn-sm flex-1", children: [_jsx(Download, { className: "w-3.5 h-3.5" }), "Save"] })] }), _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx("button", { className: "btn-icon btn-sm", onClick: () => setRenameTarget({ id: file.id, name: file.filename }), title: "Rename", children: _jsx(FileText, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm", onClick: () => copyUrl(file.id), title: "Copy URL", children: _jsx(Copy, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm", onClick: () => { setShareId(file.id); setShareMode('restricted'); }, title: "Share", children: _jsx(Share2, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm hover:text-red-400", onClick: () => setDelId(file.id), title: "Delete", children: _jsx(Trash2, { className: "w-3.5 h-3.5" }) })] })] })] }, file.id));
                            }) })) : (_jsx("div", { className: "card overflow-hidden", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "table-header w-10", children: _jsx("button", { onClick: toggleSelectAll, className: "flex items-center justify-center w-full", children: selectedIds.length === filteredFiles.length && filteredFiles.length > 0 ? _jsx(CheckSquare, { className: "w-3.5 h-3.5 text-white" }) : _jsx(Square, { className: "w-3.5 h-3.5 text-[#666]" }) }) }), _jsx("th", { className: "table-header text-left", children: "Name" }), _jsx("th", { className: "table-header text-left hidden md:table-cell", children: "Type" }), _jsx("th", { className: "table-header text-left hidden lg:table-cell", children: "Size" }), _jsx("th", { className: "table-header text-left hidden xl:table-cell", children: "Modified" }), _jsx("th", { className: "table-header text-right", children: "Actions" })] }) }), _jsx("tbody", { children: filteredFiles.map((file) => {
                                            const selected = selectedIds.includes(file.id);
                                            return (_jsxs("tr", { className: "table-row", draggable: canReorder, onDragStart: (event) => { event.dataTransfer.setData('application/file-id', file.id); }, onDragOver: (event) => event.preventDefault(), onDrop: (event) => handleFileDrop(event, file.id), children: [_jsx("td", { className: "table-cell w-10", children: _jsx("button", { onClick: () => toggleSelection(file.id), className: "flex items-center justify-center w-full", children: selected ? _jsx(CheckSquare, { className: "w-3.5 h-3.5 text-white" }) : _jsx(Square, { className: "w-3.5 h-3.5 text-[#666]" }) }) }), _jsx("td", { className: "table-cell", children: _jsxs("div", { className: "flex items-center gap-2.5 min-w-0", children: [_jsx("div", { className: "w-8 h-8 rounded bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center shrink-0", children: getFileIcon(file) }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-xs font-medium text-[#ccc]", children: file.filename }), _jsx("p", { className: "text-[10px] text-[#555]", children: file.status })] })] }) }), _jsx("td", { className: "table-cell hidden md:table-cell text-xs text-[#666]", children: file.mimeType }), _jsx("td", { className: "table-cell hidden lg:table-cell text-xs text-[#666]", children: formatBytes(file.size) }), _jsx("td", { className: "table-cell hidden xl:table-cell text-xs text-[#666]", children: formatDate(file.createdAt) }), _jsx("td", { className: "table-cell", children: _jsxs("div", { className: "flex items-center justify-end gap-1", children: [_jsx("button", { className: "btn-icon btn-sm", onClick: () => setRenameTarget({ id: file.id, name: file.filename }), title: "Rename", children: _jsx(FileText, { className: "w-3.5 h-3.5" }) }), (isImage(file.mimeType) || isPdf(file.mimeType)) && (_jsx("button", { className: "btn-icon btn-sm", onClick: () => setPreview(file), title: "Preview", children: _jsx(Eye, { className: "w-3.5 h-3.5" }) })), _jsx("a", { href: getDownloadUrl(file.id), download: true, className: "btn-icon btn-sm", title: "Download", children: _jsx(Download, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm", onClick: () => copyUrl(file.id), title: "Copy URL", children: _jsx(Copy, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm", onClick: () => { setShareId(file.id); setShareMode('restricted'); }, title: "Share", children: _jsx(Share2, { className: "w-3.5 h-3.5" }) }), _jsx("button", { className: "btn-icon btn-sm hover:text-red-400", onClick: () => setDelId(file.id), title: "Delete", children: _jsx(Trash2, { className: "w-3.5 h-3.5" }) })] }) })] }, file.id));
                                        }) })] }) })) }), _jsxs("aside", { className: "card p-3 h-fit", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("span", { className: "text-[10px] uppercase tracking-[0.2em] text-[#555]", children: "Recent activity" }), _jsx("button", { className: "btn-ghost btn-sm", onClick: () => setActiveTab('recent'), children: "View all" })] }), _jsx("div", { className: "space-y-2", children: recentActivity.length === 0 ? _jsx("p", { className: "text-xs text-[#555]", children: "No activity yet." }) : recentActivity.map((item) => (_jsxs("div", { className: "rounded-md border border-[#222] bg-[#0c0c0c] p-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-[10px] uppercase tracking-[0.18em] text-[#666]", children: item.action.toLowerCase() }), _jsx("span", { className: "text-[10px] text-[#555]", children: formatDate(item.createdAt) })] }), _jsx("p", { className: "mt-1 text-xs text-[#d0d0d0] truncate", children: item.fileName })] }, item.id))) }), _jsx("div", { className: "divider my-3" }), _jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.2em] text-[#555]", children: "Shared with me" }), sharedWithMe.length === 0 && _jsx("p", { className: "text-xs text-[#555]", children: "No files shared with you." }), sharedWithMe.slice(0, 3).map((share) => (_jsxs("div", { className: "rounded-md border border-[#222] bg-[#0c0c0c] p-2", children: [_jsx("p", { className: "text-xs text-[#d0d0d0] truncate", children: share.file?.originalFilename ?? share.fileId }), _jsxs("p", { className: "text-[10px] text-[#555]", children: ["Shared by @", share.sharedBy?.githubUsername ?? 'team', " \u00B7 ", share.permission] })] }, share.id)))] })] })] }), preview && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4", onClick: () => setPreview(null), children: _jsxs("div", { className: "card max-w-4xl w-full max-h-[90vh] overflow-hidden animate-fade-in", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-[#2e2e2e]", children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [getFileIcon(preview), _jsx("span", { className: "text-xs font-medium text-[#ccc] truncate", children: preview.filename })] }), _jsx("button", { onClick: () => setPreview(null), className: "btn-icon", children: _jsx(X, { className: "w-4 h-4" }) })] }), isPdf(preview.mimeType) ? (_jsx("iframe", { title: preview.filename, src: `${getDownloadUrl(preview.id)}?inline=1`, className: "w-full h-[70vh] bg-white" })) : (_jsx("img", { src: getImageUrl(preview.id), alt: preview.filename, className: "max-h-[70vh] w-auto mx-auto" })), _jsxs("div", { className: "px-4 py-2 border-t border-[#2e2e2e] flex items-center gap-3 text-[10px] text-[#555]", children: [_jsx("span", { children: formatBytes(preview.size) }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: preview.mimeType }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: formatDate(preview.createdAt) })] })] }) })), renameTarget && (_jsx(Modal, { open: !!renameTarget, onClose: () => setRenameTarget(null), title: "Rename file", children: _jsxs("div", { className: "space-y-3", children: [_jsx("input", { className: "input text-xs", value: renameTarget.name, onChange: (e) => setRenameTarget((prev) => prev ? { ...prev, name: e.target.value } : prev), autoFocus: true }), _jsxs("div", { className: "flex gap-2 justify-end pt-1", children: [_jsx("button", { onClick: () => setRenameTarget(null), className: "btn-secondary btn-sm", children: "Cancel" }), _jsx("button", { className: "btn-primary btn-sm", onClick: async () => {
                                        const clean = renameTarget.name.trim();
                                        if (!clean)
                                            return;
                                        await renameFileMutation.mutateAsync({ id: renameTarget.id, filename: clean });
                                        setRenameTarget(null);
                                    }, children: "Save" })] })] }) })), _jsx(Modal, { open: creatingFolder || !!folderTarget, onClose: () => { setCreatingFolder(false); setFolderTarget(null); }, title: folderTarget ? 'Rename folder' : 'Create folder', children: _jsxs("form", { className: "space-y-3", onSubmit: (event) => {
                        event.preventDefault();
                        const name = newFolderName.trim();
                        if (!name)
                            return;
                        if (folderTarget) {
                            updateFolder.mutate({ id: folderTarget.id, name }, { onSuccess: () => setFolderTarget(null) });
                        }
                        else {
                            createFolder.mutate({ name, parentId: currentFolderId === 'root' ? null : currentFolderId }, { onSuccess: () => setCreatingFolder(false) });
                        }
                    }, children: [_jsx("input", { className: "input text-xs", value: newFolderName, onChange: (event) => setNewFolderName(event.target.value), placeholder: "Folder name", autoFocus: true, maxLength: 255 }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: "btn-secondary btn-sm", onClick: () => { setCreatingFolder(false); setFolderTarget(null); }, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn-primary btn-sm", disabled: !newFolderName.trim() || createFolder.isPending || updateFolder.isPending, children: "Save" })] })] }) }), _jsxs(Modal, { open: !!shareId, onClose: () => { setShareId(null); setRecipient(''); }, title: "Share file", children: [_jsxs("div", { className: "flex gap-1 border-b border-[#252525] pb-3 mb-4", children: [_jsxs("button", { onClick: () => setShareMode('restricted'), className: `btn-sm ${shareMode === 'restricted' ? 'btn-primary' : 'btn-secondary'}`, children: [_jsx(Users, { className: "w-3.5 h-3.5" }), "Restricted"] }), _jsxs("button", { onClick: () => setShareMode('link'), className: `btn-sm ${shareMode === 'link' ? 'btn-primary' : 'btn-secondary'}`, children: [_jsx(Globe, { className: "w-3.5 h-3.5" }), "Anyone with the link"] })] }), shareMode === 'restricted' ? (_jsxs("div", { className: "space-y-3", children: [shares.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsx("p", { className: "text-[10px] text-[#555] uppercase tracking-wider mb-2", children: "People with access" }), _jsx("div", { className: "space-y-1.5", children: shares.map((s) => (_jsxs("div", { className: "flex items-center gap-2.5 p-2 bg-[#0a0a0a] rounded-md border border-[#222]", children: [_jsx(Avatar, { name: s.sharedWith?.githubUsername ?? '?', size: "sm" }), _jsxs("span", { className: "text-xs text-[#888] flex-1", children: ["@", s.sharedWith?.githubUsername] }), _jsx("span", { className: `${PERM_BADGE[s.permission]} text-[10px]`, children: s.permission }), _jsx("button", { onClick: () => revokeShare.mutate(s.id), className: "text-[#444] hover:text-red-400 transition-colors", title: "Remove access", children: _jsx(X, { className: "w-3.5 h-3.5" }) })] }, s.id))) }), _jsx("div", { className: "my-4 divider" })] })), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] text-[#555] uppercase tracking-wider block mb-1.5", children: "Recipient User ID" }), _jsx("input", { className: "input text-xs", placeholder: "user-uuid-here", value: recipient, onChange: (e) => setRecipient(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] text-[#555] uppercase tracking-wider block mb-1.5", children: "Permission" }), _jsxs("select", { className: "select text-xs", value: perm, onChange: (e) => setPerm(e.target.value), children: [_jsx("option", { value: "VIEW", children: "VIEW \u2014 read only" }), _jsx("option", { value: "EDIT", children: "EDIT \u2014 can modify" }), _jsx("option", { value: "MANAGE", children: "MANAGE \u2014 full control" })] })] }), _jsx("p", { className: "text-[10px] text-[#555] leading-relaxed", children: "Restricted shares require the recipient to sign in. Their file key is wrapped for their account." }), _jsxs("div", { className: "flex gap-2 justify-end pt-1", children: [_jsx("button", { onClick: () => setShareId(null), className: "btn-secondary btn-sm", children: "Done" }), _jsx("button", { className: "btn-primary btn-sm", disabled: !recipient.trim() || shareFile.isPending, onClick: () => shareFile.mutate({ recipientId: recipient.trim(), permission: perm }, { onSuccess: () => setRecipient('') }), children: shareFile.isPending ? 'Sharing…' : 'Share with person' })] })] })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Globe, { className: "w-4 h-4 mt-0.5 text-emerald-400 shrink-0" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-medium text-[#ddd]", children: "Anyone with the link can view" }), _jsx("p", { className: "mt-1 text-[10px] leading-relaxed text-[#666]", children: "No sign-in required. The link grants view and download access only. Revoke it any time." })] })] }), publicLinkLoading ? (_jsx("div", { className: "h-9 rounded border border-[#252525] bg-[#101010] animate-pulse" })) : publicLink ? (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { className: "input min-w-0 text-xs", value: publicLink.url, readOnly: true, "aria-label": "Public share link" }), _jsx("button", { className: "btn-secondary btn-sm shrink-0", title: "Copy link", onClick: () => copyShareLink(publicLink.url), children: _jsx(Copy, { className: "w-3.5 h-3.5" }) })] }), _jsx("p", { className: "text-[10px] text-[#666]", children: publicLink.expiresAt ? `Expires ${formatDate(publicLink.expiresAt)}` : 'No expiration' })] })) : null, _jsxs("div", { className: "flex items-end gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "text-[10px] text-[#555] uppercase tracking-wider block mb-1.5", children: "Link expiration" }), _jsxs("select", { className: "select text-xs", value: linkExpiryDays, onChange: (event) => setLinkExpiryDays(event.target.value), children: [_jsx("option", { value: "", children: "Never" }), _jsx("option", { value: "7", children: "7 days" }), _jsx("option", { value: "30", children: "30 days" })] })] }), publicLink ? (_jsxs("button", { className: "btn-secondary btn-sm", disabled: createPublicLink.isPending || revokePublicLink.isPending, onClick: () => {
                                            const expiresAt = linkExpiryDays ? new Date(Date.now() + Number(linkExpiryDays) * 86400000).toISOString() : null;
                                            createPublicLink.mutate(expiresAt);
                                        }, title: "Rotate the link and apply the selected expiry", children: [_jsx(RotateCw, { className: "w-3.5 h-3.5" }), "Replace link"] })) : (_jsxs("button", { className: "btn-primary btn-sm", disabled: createPublicLink.isPending || publicLinkLoading, onClick: () => {
                                            const expiresAt = linkExpiryDays ? new Date(Date.now() + Number(linkExpiryDays) * 86400000).toISOString() : null;
                                            createPublicLink.mutate(expiresAt);
                                        }, children: [_jsx(Link2, { className: "w-3.5 h-3.5" }), createPublicLink.isPending ? 'Creating…' : 'Create link'] }))] }), publicLink && (_jsx("div", { className: "flex justify-end border-t border-[#252525] pt-3", children: _jsx("button", { className: "btn-danger btn-sm", disabled: revokePublicLink.isPending, onClick: () => revokePublicLink.mutate(), children: revokePublicLink.isPending ? 'Revoking…' : 'Revoke link' }) }))] }))] }), _jsxs(Modal, { open: !!delId, onClose: () => setDelId(null), title: "Delete file?", children: [_jsx("p", { className: "text-xs text-[#888] mb-4 leading-relaxed", children: "This permanently removes the file from GitHub and the database. This action cannot be undone." }), _jsxs("div", { className: "flex gap-2 justify-end", children: [_jsx("button", { onClick: () => setDelId(null), className: "btn-secondary btn-sm", children: "Cancel" }), _jsx("button", { className: "btn-danger btn-sm", disabled: deleteFile.isPending, onClick: () => deleteFile.mutate(delId, { onSuccess: () => setDelId(null) }), children: deleteFile.isPending ? 'Deleting…' : 'Delete' })] })] })] }));
}
