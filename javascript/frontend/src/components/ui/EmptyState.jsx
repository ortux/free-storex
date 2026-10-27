import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function EmptyState({ icon: Icon, title, description, action }) {
    return (_jsxs("div", { className: "empty-state", children: [_jsx("div", { className: "w-12 h-12 rounded-xl bg-[#111] border border-[#2e2e2e] flex items-center justify-center", children: _jsx(Icon, { className: "w-5 h-5 text-[#444]" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-[#666]", children: title }), description && _jsx("p", { className: "text-xs text-[#444] mt-0.5", children: description })] }), action] }));
}
