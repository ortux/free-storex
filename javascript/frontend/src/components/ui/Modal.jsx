import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { X } from 'lucide-react';
export function Modal({ open, onClose, title, children, width = 'max-w-md' }) {
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [_jsx("div", { className: "absolute inset-0 bg-black/70 backdrop-blur-sm", onClick: onClose }), _jsxs("div", { className: `relative w-full ${width} card shadow-2xl shadow-black/50 animate-fade-in`, children: [title && (_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]", children: [_jsx("h2", { className: "text-sm font-semibold text-[#ededed]", children: title }), _jsx("button", { onClick: onClose, className: "btn-icon", children: _jsx(X, { className: "w-4 h-4" }) })] })), _jsx("div", { className: "p-5", children: children })] })] }));
}
