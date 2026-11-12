import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/features/auth';
import { ToastProvider } from '@/context/ToastContext';

export const metadata: Metadata = {
  title: 'OnusFit Admin',
  description: 'Administrative console for the OnusFit fitness platform.',
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
      className="h-full antialiased dark"
    >
      <body className="flex min-h-full flex-col bg-ink-950 text-ink-100">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
