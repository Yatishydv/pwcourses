import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PW Courses Chat',
  description: 'Connect with your batchmates and teachers.',
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
