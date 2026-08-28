"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './lock.module.css';

export default function LockScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !pin) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Authentication failed');
      }

      // Secure session cookie is set by the backend.
      // Redirect to the dashboard.
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.lockContainer}>
      <form onSubmit={handleSubmit} className={`${styles.lockCard} animate-fade-in`}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img 
            src="/pw-logo.png" 
            alt="PW Logo" 
            style={{ width: '80px', height: '80px', objectFit: 'contain', margin: '0 auto' }} 
          />
        </div>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 className={styles.title}>Physics Wallah</h1>
          <p className={styles.subtitle}>India's Top E-Learning Platform.</p>
        </div>

        <div className={styles.inputGroup}>
          <input
            type="text"
            className={styles.input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
          <input
            type="password"
            className={styles.input}
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            disabled={loading}
          />
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
        </button>

        <div 
          className={styles.link}
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
        </div>
      </form>
    </div>
  );
}
