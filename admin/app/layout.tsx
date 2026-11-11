import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/features/auth';
import { ToastProvider } from '@/context/ToastContext';

const geistSans = {
  variable: '--font-geist-sans',
};

const geistMono = {
  variable: '--font-geist-mono',
};

export const metadata: Metadata = {
  title: 'OnusFit Admin Portal | Management & Security',
  description: 'Administrative portal for OnusFit fitness platform - Phase 1 & 2 management.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
