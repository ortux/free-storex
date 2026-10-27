import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Key, Plus, Trash2, Copy, Eye, EyeOff, Terminal, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listApiKeys, createApiKey, deleteApiKey } from '../../api/apiKeys';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonRow } from '../../components/ui/Skeleton';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
export default function ApiPage() {
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [revealed, setRevealed] = useState(null);
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);
    const { data: keys = [], isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: listApiKeys });
    const create = useMutation({
        mutationFn: () => createApiKey(newName.trim()),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['api-keys'] });
            setRevealed(data.key);
            setShowKey(false);
            setCopied(false);
            setNewName('');
            setShowCreate(false);
        },
        onError: () => toast.error('Failed to create API key'),
    });
    const remove = useMutation({
        mutationFn: (id) => deleteApiKey(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API key deleted'); },
        onError: () => toast.error('Failed to delete key'),
    });
    const copyKey = (k) => {
        navigator.clipboard.writeText(k);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };
    return (_jsxs("div", { className: "p-6 max-w-4xl mx-auto space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-base font-semibold text-[#ededed]", children: "API Keys" }), _jsx("p", { className: "text-xs text-[#555] mt-0.5", children: "Programmatic access to your files" })] }), _jsxs("button", { onClick: () => setShowCreate(true), className: "btn-secondary btn-sm gap-1.5", children: [_jsx(Plus, { className: "w-3.5 h-3.5" }), " Create key"] })] }), revealed && (_jsxs("div", { className: "card border-amber-500/30 bg-amber-500/5 p-4 space-y-3 animate-fade-in", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-1.5 h-1.5 rounded-full bg-amber-400" }), _jsx("p", { className: "text-xs font-medium text-amber-400", children: "Save this key \u2014 it won't be shown again" })] }), _jsxs("div", { className: "flex items-center gap-2 bg-[#0a0a0a] rounded-md border border-[#2e2e2e] px-3 py-2", children: [_jsx("span", { className: "flex-1 font-mono text-xs text-[#ccc] break-all", children: showKey ? revealed : `${revealed.slice(0, 20)}${'•'.repeat(40)}` }), _jsx("button", { onClick: () => setShowKey(!showKey), className: "btn-icon shrink-0", children: showKey ? _jsx(EyeOff, { className: "w-3.5 h-3.5" }) : _jsx(Eye, { className: "w-3.5 h-3.5" }) }), _jsx("button", { onClick: () => copyKey(revealed), className: "btn-icon shrink-0", children: copied
                                    ? _jsx(CheckCircle, { className: "w-3.5 h-3.5 text-emerald-400" })
                                    : _jsx(Copy, { className: "w-3.5 h-3.5" }) })] }), _jsx("button", { onClick: () => setRevealed(null), className: "text-[10px] text-[#555] hover:text-[#888] transition-colors", children: "I've saved it \u2014 dismiss" })] })), _jsx("div", { className: "card overflow-hidden", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "table-header text-left", children: "Name" }), _jsx("th", { className: "table-header text-left", children: "Key" }), _jsx("th", { className: "table-header text-left hidden md:table-cell", children: "Created" }), _jsx("th", { className: "table-header text-left hidden md:table-cell", children: "Last used" }), _jsx("th", { className: "table-header text-right" })] }) }), _jsx("tbody", { children: isLoading ? (Array.from({ length: 3 }).map((_, i) => (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx(SkeletonRow, {}) }) }, i)))) : !keys.length ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, children: _jsx(EmptyState, { icon: Key, title: "No API keys", description: "Create a key to access the API programmatically" }) }) })) : (keys.map((k) => (_jsxs("tr", { className: "table-row", children: [_jsx("td", { className: "table-cell", children: _jsx("span", { className: "text-xs font-medium text-[#ccc]", children: k.name }) }), _jsx("td", { className: "table-cell", children: _jsxs("span", { className: "font-mono text-xs text-[#555]", children: [k.prefix, "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"] }) }), _jsx("td", { className: "table-cell hidden md:table-cell text-xs text-[#666]", children: formatDate(k.createdAt) }), _jsx("td", { className: "table-cell hidden md:table-cell text-xs text-[#666]", children: k.lastUsed ? formatDate(k.lastUsed) : _jsx("span", { className: "text-[#444]", children: "Never" }) }), _jsx("td", { className: "table-cell text-right", children: _jsx("button", { onClick: () => setConfirmDel(k.id), className: "btn-icon btn-sm hover:text-red-400", children: _jsx(Trash2, { className: "w-3.5 h-3.5" }) }) })] }, k.id)))) })] }) }), _jsxs("div", { className: "card p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Terminal, { className: "w-3.5 h-3.5 text-[#555]" }), _jsx("span", { className: "text-xs font-semibold text-[#888]", children: "Usage" })] }), _jsx("pre", { className: "code-block", children: `                                    # Upload a file (through the application proxy)
                                    curl -X POST ${window.location.origin}/api/v1/uploads/initiate \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"filename":"photo.png","mimeType":"image/png","fileSize":183920}'

# Then PUT the raw bytes to the returned uploadUrl
curl -X PUT <uploadUrl> \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: image/png" \\
  --data-binary @photo.png

# List files
curl ${window.location.origin}/api/v1/files \\
  -H "Authorization: Bearer sk_live_xxxx"` })] }), _jsx(Modal, { open: showCreate, onClose: () => setShowCreate(false), title: "Create API key", children: _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-[10px] text-[#555] uppercase tracking-wider block mb-1.5", children: "Key name" }), _jsx("input", { className: "input text-xs", placeholder: "Production, CI/CD, Mobile app\u2026", value: newName, onChange: (e) => setNewName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && newName.trim() && create.mutate(), autoFocus: true })] }), _jsxs("div", { className: "flex gap-2 justify-end pt-1", children: [_jsx("button", { onClick: () => setShowCreate(false), className: "btn-secondary btn-sm", children: "Cancel" }), _jsx("button", { className: "btn-primary btn-sm", disabled: !newName.trim() || create.isPending, onClick: () => create.mutate(), children: create.isPending ? 'Creating…' : 'Create key' })] })] }) }), _jsxs(Modal, { open: !!confirmDel, onClose: () => setConfirmDel(null), title: "Delete API key?", children: [_jsx("p", { className: "text-xs text-[#888] mb-4", children: "Any application using this key will immediately lose access." }), _jsxs("div", { className: "flex gap-2 justify-end", children: [_jsx("button", { onClick: () => setConfirmDel(null), className: "btn-secondary btn-sm", children: "Cancel" }), _jsx("button", { className: "btn-danger btn-sm", disabled: remove.isPending, onClick: () => remove.mutate(confirmDel, { onSuccess: () => setConfirmDel(null) }), children: remove.isPending ? 'Deleting…' : 'Delete key' })] })] })] }));
}
