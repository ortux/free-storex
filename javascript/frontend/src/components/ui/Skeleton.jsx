import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Skeleton({ className = '' }) {
    return (_jsx("div", { className: `bg-gradient-to-r from-[#1a1a1a] via-[#222] to-[#1a1a1a]
        bg-[length:200%_100%] animate-shimmer rounded ${className}` }));
}
export function SkeletonRow() {
    return (_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-[#1a1a1a]", children: [_jsx(Skeleton, { className: "w-8 h-8 rounded" }), _jsxs("div", { className: "flex-1 space-y-1.5", children: [_jsx(Skeleton, { className: "h-3 w-48" }), _jsx(Skeleton, { className: "h-2.5 w-32" })] }), _jsx(Skeleton, { className: "h-3 w-16" }), _jsx(Skeleton, { className: "h-3 w-20" })] }));
}
export function SkeletonCard() {
    return (_jsxs("div", { className: "card p-4 space-y-3", children: [_jsx(Skeleton, { className: "h-3 w-24" }), _jsx(Skeleton, { className: "h-7 w-16" }), _jsx(Skeleton, { className: "h-2.5 w-32" })] }));
}
