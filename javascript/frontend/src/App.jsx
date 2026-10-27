import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUser } from './hooks/useUser';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import OverviewPage from './pages/dashboard/OverviewPage';
import FilesPage from './pages/dashboard/FilesPage';
import UploadPage from './pages/dashboard/UploadPage';
import SharedPage from './pages/dashboard/SharedPage';
import WorkspacesPage from './pages/dashboard/WorkspacesPage';
import ApiPage from './pages/dashboard/ApiPage';
import RepositoryPage from './pages/dashboard/RepositoryPage';
import StoragePage from './pages/dashboard/StoragePage';
import SettingsPage from './pages/dashboard/SettingsPage';
import PublicSharePage from './pages/PublicSharePage';
function ProtectedRoute({ children }) {
    const { data: user, isLoading, isError } = useUser();
    if (isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center h-screen bg-black", children: _jsx("div", { className: "w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" }) }));
    }
    if (isError || !user) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
export default function App() {
    return (_jsx(BrowserRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true }, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LandingPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/share/:token", element: _jsx(PublicSharePage, {}) }), _jsxs(Route, { path: "/dashboard", element: _jsx(ProtectedRoute, { children: _jsx(DashboardLayout, {}) }), children: [_jsx(Route, { index: true, element: _jsx(OverviewPage, {}) }), _jsx(Route, { path: "files", element: _jsx(FilesPage, {}) }), _jsx(Route, { path: "upload", element: _jsx(UploadPage, {}) }), _jsx(Route, { path: "shared", element: _jsx(SharedPage, {}) }), _jsx(Route, { path: "workspaces", element: _jsx(WorkspacesPage, {}) }), _jsx(Route, { path: "api", element: _jsx(ApiPage, {}) }), _jsx(Route, { path: "repository", element: _jsx(RepositoryPage, {}) }), _jsx(Route, { path: "storage", element: _jsx(StoragePage, {}) }), _jsx(Route, { path: "settings", element: _jsx(SettingsPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
