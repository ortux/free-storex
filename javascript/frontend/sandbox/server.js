const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');

const port = Number(process.env.SANDBOX_PORT || 4174);
const sandboxKey = 'sk_test_sandbox';
const files = [
    {
        id: 'file_demo_image',
        filename: 'demo-image.png',
        mimeType: 'image/png',
        size: 183920,
        status: 'ACTIVE',
        createdAt: '2026-10-01T12:00:00.000Z',
    },
    {
        id: 'file_demo_document',
        filename: 'demo-document.pdf',
        mimeType: 'application/pdf',
        size: 482304,
        status: 'ACTIVE',
        createdAt: '2026-10-02T12:00:00.000Z',
    },
];
const apiKeys = [];

function sendJson(res, status, payload) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
    return req.headers.authorization === `Bearer ${sandboxKey}`;
}

const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
        sendJson(res, 200, { success: true });
        return;
    }
    if (url.pathname.startsWith('/auth/')) {
        sendJson(res, 501, { success: false, error: { code: 'SANDBOX_UNSUPPORTED', message: 'Authentication is disabled in the local sandbox' } });
        return;
    }
    if (!url.pathname.startsWith('/api/v1/')) {
        sendJson(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Sandbox route not found' } });
        return;
    }
    if (!isAuthorized(req)) {
        sendJson(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Use the sandbox API key' } });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/user') {
        sendJson(res, 200, {
            success: true,
            data: {
                id: 'sandbox-user',
                githubUsername: 'sandbox-user',
                email: 'sandbox@example.test',
                repositoryName: 'sandbox-encrypted-store',
                repositoryOwner: 'sandbox-user',
                stats: { fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) },
            },
        });
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/files') {
        const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, 100));
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        sendJson(res, 200, {
            success: true,
            data: { files: files.slice(offset, offset + limit), total: files.length, limit, offset },
        });
        return;
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/api-keys') {
        sendJson(res, 200, { success: true, data: apiKeys });
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/api-keys') {
        let body = '';
        let bodyTooLarge = false;
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            if (bodyTooLarge) return;
            body += chunk;
            if (body.length > 16_384) {
                bodyTooLarge = true;
                sendJson(res, 413, { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 16 KB' } });
            }
        });
        req.on('end', () => {
            if (bodyTooLarge) return;
            let input;
            try {
                input = JSON.parse(body);
            } catch {
                sendJson(res, 400, { success: false, error: { code: 'INVALID_JSON', message: 'Request body must be JSON' } });
                return;
            }
            if (typeof input.name !== 'string' || !input.name.trim()) {
                sendJson(res, 400, { success: false, error: { code: 'INVALID_NAME', message: 'Key name is required' } });
                return;
            }
            const key = `sk_test_${randomUUID().replaceAll('-', '')}`;
            const record = { id: randomUUID(), name: input.name.trim(), prefix: key.slice(0, 12), createdAt: new Date().toISOString() };
            apiKeys.push(record);
            sendJson(res, 201, { success: true, data: { ...record, key } });
        });
        return;
    }
    const deleteKeyMatch = url.pathname.match(/^\/api\/v1\/api-keys\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteKeyMatch) {
        const index = apiKeys.findIndex((key) => key.id === deleteKeyMatch[1]);
        if (index < 0) {
            sendJson(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
            return;
        }
        apiKeys.splice(index, 1);
        sendJson(res, 200, { success: true });
        return;
    }
    const fileMatch = url.pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
    if (fileMatch && req.method === 'GET') {
        const file = files.find((item) => item.id === fileMatch[1]);
        sendJson(res, file ? 200 : 404, file
            ? { success: true, data: { file } }
            : { success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
        return;
    }
    if (fileMatch && req.method === 'DELETE') {
        const index = files.findIndex((item) => item.id === fileMatch[1]);
        if (index < 0) {
            sendJson(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
            return;
        }
        files.splice(index, 1);
        sendJson(res, 200, { success: true });
        return;
    }

    sendJson(res, 501, {
        success: false,
        error: { code: 'SANDBOX_UNSUPPORTED', message: 'This endpoint is not implemented in the local sandbox' },
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`In-memory API sandbox listening on http://127.0.0.1:${port}`);
    console.log(`Sandbox API key: ${sandboxKey}`);
});
