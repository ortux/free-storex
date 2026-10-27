import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Github, ExternalLink, Lock, Eye, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { getRepository } from '../../api/user';
import { formatBytes } from '../../utils/format';
import { SkeletonCard } from '../../components/ui/Skeleton';
export default function RepositoryPage() {
    const { data: repo, isLoading } = useQuery({
        queryKey: ['repository'],
        queryFn: getRepository,
    });
    return (_jsxs("div", { className: "p-6 max-w-3xl mx-auto space-y-5", children: [_jsx("h1", { className: "text-base font-semibold text-[#ededed]", children: "Repository" }), isLoading ? (_jsx("div", { className: "grid grid-cols-2 gap-3", children: Array.from({ length: 4 }).map((_, i) => _jsx(SkeletonCard, {}, i)) })) : !repo ? (_jsx("div", { className: "card p-6 text-center text-xs text-[#555]", children: "Repository not yet created. Sign out and sign back in to provision one." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card p-5", children: [_jsxs("div", { className: "flex items-start justify-between gap-4 mb-5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center", children: _jsx(Github, { className: "w-5 h-5 text-[#666]" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-[#ededed]", children: repo.name }), _jsx("p", { className: "text-xs text-[#555]", children: repo.owner })] })] }), _jsxs("a", { href: repo.url, target: "_blank", rel: "noopener noreferrer", className: "btn-secondary btn-sm gap-1.5 shrink-0", children: [_jsx(ExternalLink, { className: "w-3.5 h-3.5" }), " Open"] })] }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: [
                                    { label: 'Owner', value: repo.owner, icon: Github },
                                    { label: 'Visibility', value: repo.visibility, icon: Eye },
                                    { label: 'Encryption', value: repo.encryption, icon: Lock },
                                    { label: 'Size', value: repo.size ? formatBytes(repo.size * 1024) : 'Unknown', icon: HardDrive },
                                ].map(({ label, value, icon: Icon }) => (_jsxs("div", { className: "bg-[#0a0a0a] rounded-md border border-[#1e1e1e] p-3", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-[#555] mb-1.5", children: [_jsx(Icon, { className: "w-3 h-3" }), _jsx("span", { className: "text-[10px] uppercase tracking-wider", children: label })] }), _jsx("p", { className: "text-xs font-medium text-[#ccc] font-mono", children: value })] }, label))) })] }), _jsxs("div", { className: "card p-5", children: [_jsx("p", { className: "text-xs font-semibold text-[#888] mb-3", children: "Privacy model" }), _jsx("div", { className: "space-y-2", children: [
                                    { ok: true, text: 'All files encrypted with AES-256-GCM before commit — only ciphertext on GitHub' },
                                    { ok: true, text: 'Random filenames used (.enc) — original names stored only in database' },
                                    { ok: true, text: 'Per-file encryption keys, wrapped with your master key' },
                                    { ok: false, text: 'GitHub can see: owner, repo name, file sizes, timestamps, and ciphertext' },
                                ].map(({ ok, text }, i) => (_jsxs("div", { className: "flex items-start gap-2.5", children: [ok
                                            ? _jsx(CheckCircle, { className: "w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" })
                                            : _jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" }), _jsx("p", { className: "text-xs text-[#666] leading-relaxed", children: text })] }, i))) })] }), _jsxs("div", { className: "card p-5", children: [_jsx("p", { className: "text-xs font-semibold text-[#888] mb-3", children: "Repository structure" }), _jsx("pre", { className: "code-block", children: `${repo.name}/
├── README.md
└── files/
    ├── 7f91a8b2.enc   ← AES-256-GCM ciphertext
    ├── 91ab32cd.enc   ← AES-256-GCM ciphertext
    └── a182ccef.enc   ← AES-256-GCM ciphertext` })] })] }))] }));
}
