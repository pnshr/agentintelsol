# Nebula Web

Next.js landing/dashboard page for a premium glassmorphism on-chain analytics interface.

## Setup

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:3000`.

The dashboard reads the backend URL from `NEXT_PUBLIC_API_BASE_URL`.
For local development this should normally be `http://127.0.0.1:3001`.

## Build

```powershell
npm.cmd run build
npm.cmd run preview
```

For Docker/nginx static export, the Dockerfile sets `NEXT_STATIC_EXPORT=true` and serves the generated `out` directory.
