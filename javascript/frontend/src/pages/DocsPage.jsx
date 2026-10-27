import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
const BASE = window.location.origin;
export default function DocsPage() {
    return (_jsxs("div", { className: "min-h-screen bg-slate-950 text-slate-100", children: [_jsx("nav", { className: "border-b border-slate-800 px-6 py-4", children: _jsxs("div", { className: "max-w-4xl mx-auto flex items-center gap-4", children: [_jsxs(Link, { to: "/", className: "text-slate-400 hover:text-slate-100 flex items-center gap-2 text-sm", children: [_jsx(ArrowLeft, { className: "w-4 h-4" }), "Back"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Shield, { className: "w-5 h-5 text-brand-400" }), _jsx("span", { className: "font-semibold", children: "API Documentation" })] })] }) }), _jsxs("div", { className: "max-w-4xl mx-auto px-6 py-12 space-y-12", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold mb-3", children: "Free Store API" }), _jsx("p", { className: "text-slate-400", children: "All API endpoints require authentication via session cookie or Bearer API key. Files are encrypted server-side before being stored in GitHub." })] }), _jsxs(Section, { title: "Authentication", children: [_jsxs("p", { className: "text-slate-400 text-sm mb-4", children: ["Use ", _jsx("code", { className: "text-brand-400", children: "Authorization: Bearer sk_live_..." }), " header or a valid session cookie obtained via GitHub OAuth."] }), _jsx(CodeBlock, { children: `Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` })] }), _jsx(Section, { title: "Endpoints", children: _jsxs("div", { className: "space-y-8", children: [_jsx(Endpoint, { method: "GET", path: "/api/v1/user", description: "Get current authenticated user profile and storage stats.", response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "githubUsername": "octocat",
    "email": "octocat@github.com",
    "repositoryName": "encrypted-store-827391",
    "repositoryOwner": "octocat",
    "stats": {
      "fileCount": 12,
      "totalBytes": 4823040
    }
  }
}` }), _jsx(Endpoint, { method: "GET", path: "/api/v1/files", description: "List all files. Supports ?search=, ?mimeType=, ?limit=, ?offset=, ?sortBy=, ?sortOrder=", response: `{
  "success": true,
  "data": {
    "files": [
      {
        "id": "f_8f92kd71",
        "filename": "photo.png",
        "mimeType": "image/png",
        "size": 183920,
        "status": "ACTIVE",
        "createdAt": "2026-09-24T10:00:00Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}` }), _jsx(Endpoint, { method: "POST", path: "/api/v1/files", description: "Upload a file. Multipart/form-data with field name 'file'.", request: `curl -X POST ${BASE}/api/v1/files \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -F "file=@photo.png"`, response: `{
  "success": true,
  "data": {
    "file": {
      "id": "f_8f92kd71",
      "filename": "photo.png",
      "size": 183920,
      "mimeType": "image/png",
      "url": "${BASE}/api/v1/images/f_8f92kd71"
    }
  }
}` }), _jsx(Endpoint, { method: "GET", path: "/api/v1/files/:id", description: "Download and decrypt a file. Returns the original file with correct Content-Type.", request: `curl -o photo.png \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  ${BASE}/api/v1/files/f_8f92kd71` }), _jsx(Endpoint, { method: "GET", path: "/api/v1/images/:id", description: "Serve a decrypted image. Use directly in <img> src after authenticating via cookie.", request: `<img src="${BASE}/api/v1/images/f_8f92kd71" />` }), _jsx(Endpoint, { method: "DELETE", path: "/api/v1/files/:id", description: "Delete a file from GitHub and the database.", request: `curl -X DELETE \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  ${BASE}/api/v1/files/f_8f92kd71`, response: `{ "success": true }` }), _jsx(Endpoint, { method: "GET", path: "/api/v1/api-keys", description: "List your API keys (hashes and raw keys are never returned, only prefix/metadata)." }), _jsx(Endpoint, { method: "POST", path: "/api/v1/api-keys", description: "Create a new API key. The plaintext key is returned once \u2014 store it immediately.", request: `{
  "name": "Production",
  "expiresAt": "2027-01-01T00:00:00Z"  // optional
}`, response: `{
  "success": true,
  "data": {
    "key": "sk_live_xxxx",  // shown only once
    "id": "uuid",
    "name": "Production",
    "prefix": "sk_live_ab12",
    "createdAt": "2026-09-24T10:00:00Z"
  }
}` }), _jsx(Endpoint, { method: "DELETE", path: "/api/v1/api-keys/:id", description: "Revoke an API key." })] }) }), _jsxs(Section, { title: "Error format", children: [_jsx(CodeBlock, { children: `{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found"
  }
}` }), _jsx("div", { className: "mt-4 space-y-2 text-sm", children: [
                                    ['UNAUTHORIZED', '401 — Missing or invalid authentication'],
                                    ['NOT_FOUND', '404 — Resource not found'],
                                    ['FILE_TOO_LARGE', '413 — File exceeds maximum size'],
                                    ['UNSUPPORTED_MEDIA_TYPE', '415 — File type not allowed'],
                                    ['RATE_LIMITED', '429 — Too many requests'],
                                    ['INTERNAL_ERROR', '500 — Server error'],
                                    ['DECRYPTION_FAILED', '500 — File could not be decrypted'],
                                ].map(([code, desc]) => (_jsxs("div", { className: "flex gap-3", children: [_jsx("code", { className: "text-brand-400 text-xs w-48 shrink-0", children: code }), _jsx("span", { className: "text-slate-400 text-xs", children: desc })] }, code))) })] })] })] }));
}
function Section({ title, children }) {
    return (_jsxs("section", { children: [_jsx("h2", { className: "text-xl font-semibold mb-4 pb-2 border-b border-slate-800", children: title }), children] }));
}
function Endpoint({ method, path, description, request, response, }) {
    const colors = {
        GET: 'text-emerald-400 bg-emerald-500/10',
        POST: 'text-brand-400 bg-brand-500/10',
        DELETE: 'text-red-400 bg-red-500/10',
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("span", { className: `text-xs font-mono font-bold px-2 py-0.5 rounded ${colors[method]}`, children: method }), _jsx("code", { className: "text-slate-200 font-mono text-sm", children: path })] }), _jsx("p", { className: "text-slate-400 text-sm mb-3", children: description }), request && _jsx(CodeBlock, { label: "Request", children: request }), response && _jsx(CodeBlock, { label: "Response", children: response })] }));
}
function CodeBlock({ children, label }) {
    return (_jsxs("div", { className: "mb-3", children: [label && _jsx("p", { className: "text-xs text-slate-500 mb-1", children: label }), _jsx("pre", { className: "bg-slate-900 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto font-mono border border-slate-800", children: children })] }));
}
