import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Files, Upload, Share2, Users, Key, Github, Database, Settings, LogOut, Shield, Menu, ChevronRight, } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../hooks/useUser';
import { authApi } from '../../api/client';
import { Avatar } from '../../components/ui/Avatar';
import toast from 'react-hot-toast';
const NAV = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/dashboard/files', icon: Files, label: 'Files' },
    { to: '/dashboard/upload', icon: Upload, label: 'Upload' },
    { to: '/dashboard/shared', icon: Share2, label: 'Shared' },
    { to: '/dashboard/workspaces', icon: Users, label: 'Workspaces' },
    { to: '/dashboard/api', icon: Key, label: 'API Keys' },
    { to: '/dashboard/repository', icon: Github, label: 'Repository' },
    { to: '/dashboard/storage', icon: Database, label: 'Storage' },
    { to: '/dashboard/settings', icon: Settings, label: 'Settings' },
];
function SidebarContent({ onNav }) {
    const { data: user } = useUser();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const logout = async () => {
        try {
            await authApi.post('/auth/logout');
            qc.clear();
            navigate('/login');
        }
        catch {
            toast.error('Failed to sign out');
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "px-4 py-4 border-b border-[#1a1a1a]", children: _jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("div", { className: "w-6 h-6 bg-white rounded flex items-center justify-center shrink-0", children: _jsx(Shield, { className: "w-3.5 h-3.5 text-black" }) }), _jsx("span", { className: "text-sm font-semibold text-[#ededed]", children: "Free Store" })] }) }), _jsx("nav", { className: "flex-1 px-2 py-3 space-y-0.5 overflow-y-auto", children: NAV.map(({ to, icon: Icon, label, end }) => (_jsxs(NavLink, { to: to, end: end, onClick: onNav, className: ({ isActive }) => isActive ? 'sidebar-item-active' : 'sidebar-item', children: [_jsx(Icon, { className: "w-4 h-4 shrink-0" }), label] }, to))) }), _jsx("div", { className: "border-t border-[#1a1a1a] p-2", children: user && (_jsxs("div", { className: "flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-[#1a1a1a] transition-colors group", children: [_jsx(Avatar, { name: user.githubUsername, size: "sm" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-medium text-[#ededed] truncate", children: user.githubUsername }), _jsx("p", { className: "text-[10px] text-[#555] truncate", children: user.email ?? 'GitHub user' })] }), _jsx("button", { onClick: logout, className: "opacity-0 group-hover:opacity-100 p-1 text-[#555] hover:text-red-400 rounded transition-all", title: "Sign out", children: _jsx(LogOut, { className: "w-3.5 h-3.5" }) })] })) })] }));
}
export default function DashboardLayout() {
    const [mobileOpen, setMobileOpen] = useState(false);
    return (_jsxs("div", { className: "flex h-screen overflow-hidden bg-black", children: [_jsx("aside", { className: "hidden lg:flex w-[220px] shrink-0 flex-col border-r border-[#1a1a1a] bg-black", children: _jsx(SidebarContent, {}) }), mobileOpen && (_jsxs("div", { className: "fixed inset-0 z-50 lg:hidden", children: [_jsx("div", { className: "absolute inset-0 bg-black/80 backdrop-blur-sm", onClick: () => setMobileOpen(false) }), _jsx("aside", { className: "absolute left-0 top-0 bottom-0 w-[220px] bg-black border-r border-[#1a1a1a] flex flex-col animate-slide-in", children: _jsx(SidebarContent, { onNav: () => setMobileOpen(false) }) })] })), _jsxs("div", { className: "flex-1 flex flex-col min-w-0 overflow-hidden", children: [_jsxs("header", { className: "h-12 border-b border-[#1a1a1a] flex items-center justify-between px-4 shrink-0", children: [_jsx("button", { className: "lg:hidden btn-icon", onClick: () => setMobileOpen(true), children: _jsx(Menu, { className: "w-4 h-4" }) }), _jsxs("div", { className: "flex items-center gap-1 text-xs text-[#555]", children: [_jsx("span", { children: "Free Store" }), _jsx(ChevronRight, { className: "w-3 h-3" }), _jsx("span", { className: "text-[#888]", children: "Dashboard" })] }), _jsx("div", { className: "w-8" })] }), _jsx("main", { className: "flex-1 overflow-y-auto", children: _jsx(Outlet, {}) })] })] }));
}
