import React from 'react';
import Image from 'next/image';
import styles from './download.module.css';

export const metadata = {
  title: 'Download Physics Wallah App',
  description: 'Download the official Physics Wallah app for Android.',
};

export default function DownloadPage() {
  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <Image 
          src="/pw-logo.png" 
          alt="Physics Wallah Logo" 
          width={150} 
          height={48} 
          className={styles.logo}
          style={{ objectFit: 'contain' }}
        />
      </header>

      {/* Hero Section */}
      <main>
        <section className={styles.hero}>
          <h1 className={styles.title}>
            Learn with <span>Physics Wallah</span>
          </h1>
          <p className={styles.subtitle}>
            India's top E-Learning Platform. Download the official app to access live classes, recorded lectures, study materials, and clear your doubts anytime, anywhere.
          </p>
          <a href="/mobile.apk" className={styles.downloadButton} download>
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download for Android
          </a>
        </section>

        {/* Features Section */}
        <section className={styles.features}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📚</span>
            <h3 className={styles.featureTitle}>Expert Faculty</h3>
            <p className={styles.featureDesc}>
              Learn from India's top educators with highly structured courses designed to help you excel.
            </p>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🎥</span>
            <h3 className={styles.featureTitle}>Live & Recorded Classes</h3>
            <p className={styles.featureDesc}>
              Never miss a lesson. Watch live streams or catch up later with full recorded sessions at your convenience.
            </p>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>💬</span>
            <h3 className={styles.featureTitle}>Doubt Sessions</h3>
            <p className={styles.featureDesc}>
              Connect with batchmates and teachers directly to resolve queries in private course chats.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Physics Wallah. All rights reserved.</p>
      </footer>
    </div>
  );
}
