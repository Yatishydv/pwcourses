import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Private Chat',
  description: 'A secure, end-to-end protected private messaging platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="app-container">
          {children}
        </main>
      </body>
    </html>
  );
}
