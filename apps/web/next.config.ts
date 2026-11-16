import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Imagem enxuta para o Docker (server.js + dependências mínimas). A raiz do rastreio é
  // o monorepo, para incluir @condo/contracts e @condo/ui.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
