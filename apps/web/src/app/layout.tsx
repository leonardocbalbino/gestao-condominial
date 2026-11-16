import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { themeStyle } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gestão Condominial',
  description: 'Cobrança, prestação de contas e comunicação do seu condomínio.',
};

/** Inter servida pelo próprio app (sem requisição ao Google no navegador). */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} style={await themeStyle()}>
      <body className="min-h-screen">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:p-3">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
