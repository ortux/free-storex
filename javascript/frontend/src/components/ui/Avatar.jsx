import { jsx as _jsx } from "react/jsx-runtime";
const sizes = { sm: 'w-6 h-6 text-[10px]', md: 'w-8 h-8 text-xs', lg: 'w-10 h-10 text-sm' };
const COLORS = [
    'bg-blue-600', 'bg-purple-600', 'bg-green-600',
    'bg-orange-600', 'bg-pink-600', 'bg-teal-600',
];
export function Avatar({ name, size = 'md', color }) {
    const bg = color ?? COLORS[name.charCodeAt(0) % COLORS.length];
    return (_jsx("div", { className: `${sizes[size]} ${bg} rounded-full flex items-center justify-center
      font-semibold text-white shrink-0 select-none`, children: name[0]?.toUpperCase() ?? '?' }));
}
