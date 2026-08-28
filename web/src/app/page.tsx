"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Basic redirect to auth/lock screen logic
    // We will build the lock screen at /lock or /login
    router.push('/lock');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Loading Secure Environment...
        </h1>
      </div>
    </div>
  );
}
