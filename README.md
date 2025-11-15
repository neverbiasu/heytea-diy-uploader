## HeyTea DIY Uploader

[English](./README.md) · [中文](./README.zh.md)

Repository: https://github.com/neverbiasu/heytea-diy-uploader
Full-stack reference project that mirrors the unofficial HeyTea DIY image workflow. The Next.js App Router frontend keeps the UI minimal and human, while a separate Express proxy reproduces the Node script used to interact with the HeyTea endpoints.

---

## One-click Vercel Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/neverbiasu/heytea-diy-uploader)

This project embeds sane defaults so it runs locally without environment variables. The repository includes an Express proxy (`server/index.mjs`) used for local development; production hosting choices are intentionally out of scope for this README.

---

## Quick local setup

Install and run locally:

```bash
npm install
npm run dev
```

Dev servers:
- Next.js: http://localhost:3000
- Proxy: http://localhost:5969

### Useful commands

```bash
npm run lint
npm run build
npm run start
```

---

## Proxy Endpoints

- `POST /auth/sms/send` — encrypts the phone number and forwards to HeyTea’s SMS send endpoint.
- `POST /auth/sms/login` — exchange phone+code for token.
- `POST /upload` — file upload wrapper that posts to HeyTea’s DIY upload API with `sign` and `t`.

See `src/app/page.tsx` and `server/index.mjs` for request/response shapes.
