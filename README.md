# Private Chat Platform

A complete, production-quality private messaging platform built with privacy and protection as the core concepts.

## Features

- **Dual-Layer Security**: Users must authenticate with their Username and Personal PIN. Conversations require a separate Chat PIN to unlock.
- **Web Application**: Next.js (App Router) with a pure Vanilla CSS Premium Design System.
- **Mobile Application**: React Native (Expo) app optimized for Android.
- **Real-Time Communication**: Socket.io integration for instant messaging and online status.
- **Secure Backend**: Node.js, Express, PostgreSQL, Prisma, with secure Argon2 hashing and HttpOnly cookies.

## Running Locally

### Prerequisites
- Node.js (v24+)
- Docker & Docker Compose
- Expo CLI

### 1. Database
```bash
docker-compose up -d
```

### 2. Backend
```bash
cd backend
npm install
npx prisma db push
npm run dev
```
Runs on `http://localhost:5000`

### 3. Web Application
```bash
cd web
npm install
npm run dev
```
Runs on `http://localhost:3000`

### 4. Mobile Application
```bash
cd mobile
npm install
npm run android
```
Uses `http://10.0.2.2:5000` for the Android Emulator to connect to the local backend.

## Security Architecture
- The Personal PIN is hashed with Argon2 and never stored in plain text.
- The Chat PIN generates an ephemeral access token that is required to fetch or send messages in that specific conversation.
- Chat Tokens are stored strictly in memory on the client side. Once a user locks the chat or refreshes the app, access is immediately revoked.
