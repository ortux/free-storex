import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const sandboxEnabled = env.VITE_API_SANDBOX === 'true';
    const apiTarget = sandboxEnabled ? 'http://127.0.0.1:4174' : 'http://localhost:3000';

    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                    configure: (proxy) => {
                        if (sandboxEnabled) {
                            proxy.on('proxyReq', (proxyReq) => {
                                proxyReq.setHeader('authorization', 'Bearer sk_test_sandbox');
                            });
                        } else if (env.PROXY_SHARED_SECRET) {
                            proxy.on('proxyReq', (proxyReq, req) => {
                                proxyReq.setHeader('x-proxy-secret', env.PROXY_SHARED_SECRET);
                                proxyReq.setHeader('x-forwarded-host', req.headers.host || '');
                                proxyReq.setHeader('x-forwarded-proto', 'http');
                            });
                        }
                    },
                },
                '/auth': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
        build: {
            outDir: 'dist',
            sourcemap: false,
        },
    };
});
