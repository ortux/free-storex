import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { User, Mail, Github, Calendar, Shield, Lock, Key, Cookie, CheckCircle, } from 'lucide-react';
import { useUser } from '../../hooks/useUser';
import { formatDate } from '../../utils/format';
import { Skeleton } from '../../components/ui/Skeleton';
import { Avatar } from '../../components/ui/Avatar';
export default function SettingsPage() {
    const { data: user, isLoading } = useUser();
    return (_jsxs("div", { className: "p-6 max-w-2xl mx-auto space-y-5", children: [_jsx("h1", { className: "text-base font-semibold text-[#ededed]", children: "Settings" }), _jsxs("div", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-[#1a1a1a] flex items-center gap-3", children: [user
                                ? _jsx(Avatar, { name: user.githubUsername, size: "lg" })
                                : _jsx(Skeleton, { className: "w-10 h-10 rounded-full" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-[#ededed]", children: isLoading ? _jsx(Skeleton, { className: "w-32 h-4" }) : user?.githubUsername }), _jsx("p", { className: "text-xs text-[#555] mt-0.5", children: isLoading ? _jsx(Skeleton, { className: "w-24 h-3 mt-1" }) : (user?.email ?? 'No email') })] })] }), _jsx("div", { children: [
                            { icon: User, label: 'Username', value: user?.githubUsername ? `@${user.githubUsername}` : null },
                            { icon: Mail, label: 'Email', value: user?.email ?? 'Not provided' },
                            { icon: Github, label: 'Repository', value: user?.repositoryName ?? 'Pending creation' },
                            { icon: Calendar, label: 'Member since', value: user?.createdAt ? formatDate(user.createdAt) : null },
                        ].map(({ icon: Icon, label, value }) => (_jsxs("div", { className: "flex items-center gap-3 px-5 py-3 border-b border-[#1a1a1a] last:border-0", children: [_jsx(Icon, { className: "w-3.5 h-3.5 text-[#555] shrink-0" }), _jsx("span", { className: "text-xs text-[#555] w-28 shrink-0", children: label }), isLoading
                                    ? _jsx(Skeleton, { className: "h-3 w-32" })
                                    : _jsx("span", { className: "text-xs text-[#ccc]", children: value ?? '—' })] }, label))) })] }), _jsxs("div", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-2", children: [_jsx(Shield, { className: "w-3.5 h-3.5 text-[#555]" }), _jsx("span", { className: "text-xs font-semibold text-[#888]", children: "Security" })] }), _jsx("div", { children: [
                            { icon: Lock, label: 'Encryption', value: 'AES-256-GCM' },
                            { icon: Key, label: 'Key derivation', value: 'HKDF-SHA256' },
                            { icon: Shield, label: 'Master key storage', value: 'Encrypted at rest' },
                            { icon: Github, label: 'GitHub token storage', value: 'Encrypted at rest' },
                            { icon: Key, label: 'API key storage', value: 'SHA-256 hash only' },
                            { icon: Cookie, label: 'Session cookies', value: 'HttpOnly · SameSite · Secure' },
                        ].map(({ icon: Icon, label, value }) => (_jsxs("div", { className: "flex items-center gap-3 px-5 py-2.5 border-b border-[#1a1a1a] last:border-0", children: [_jsx(Icon, { className: "w-3.5 h-3.5 text-[#444] shrink-0" }), _jsx("span", { className: "text-xs text-[#555] flex-1", children: label }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(CheckCircle, { className: "w-3 h-3 text-emerald-400" }), _jsx("span", { className: "text-xs text-emerald-400 font-medium", children: value })] })] }, label))) })] }), _jsxs("div", { className: "card p-5 border-red-500/10", children: [_jsx("p", { className: "text-xs font-semibold text-red-400 mb-1", children: "Danger zone" }), _jsx("p", { className: "text-xs text-[#555] mb-4", children: "Account deletion is not available in this version. Contact support if needed." }), _jsx("button", { disabled: true, className: "btn-danger btn-sm opacity-30 cursor-not-allowed", children: "Delete account" })] })] }));
}
