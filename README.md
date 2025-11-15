## HeyTea DIY Uploader

Full-stack reference project that mirrors the unofficial HeyTea DIY image workflow. The Next.js App Router frontend keeps the UI minimal and human, while a separate Express proxy reproduces the Node script shared in the brief.

### Main Features

- Sign builder that hashes `user_main_id` with the official salt to produce `sign`/`timestamp` pairs.
- Client-side validation for 596×832 PNG files before upload.
- Express proxy that mirrors `/api`, `/upload`, and the newly added `/auth/sms/*` endpoints (SMS code + login), including automatic port discovery.
- Lightweight API console for sending arbitrary HeyTea requests without leaving the page.
- Minimal SMS 登录面板：输入手机号获取验证码，自动 AES 加密并向官方接口请求 Token。

### Prerequisites

- Node.js 18.18+ (Next.js 16 requirement)
- npm 9+

### Environment

Copy the sample file and adjust as needed:

```bash
cp .env.local.example .env.local
```

Key values:

- `NEXT_PUBLIC_PROXY_BASE_URL`: Browser-side proxy URL (defaults to `http://localhost:5969`).
- `NEXT_PUBLIC_HEYTEA_SMS_AREA_CODE`: Country/area code shown in the UI (defaults to `86`).
- `PROXY_PORT`: Preferred port for the Express proxy.
- `ALLOWED_ORIGINS`: Comma-separated list of origins allowed to call the proxy.
- `HEYTEA_SMS_AREA_CODE`: Server-side area code when forwarding SMS requests.
- `HEYTEA_AES_KEY` & `HEYTEA_AES_IV`: **Required** for短信登录; 16-byte AES-128-CBC key/IV that match the official script. Keep them private. The proxy also accepts `LOGIN_ENCRYPT_KEY`/`LOGIN_ENCRYPT_IV` for compatibility with原脚本.
- `HEYTEA_DEVICE_ID` (optional): Custom device identifier forwarded during login.
- `HEYTEA_USER_AGENT` (optional): Override the default proxy User-Agent string.

### Install Dependencies

```bash
npm install
```

### Run in Development

`npm run dev` launches both servers with `concurrently`:

```bash
npm run dev
```

- Next.js dev server → http://localhost:3000
- Express proxy → http://localhost:5969 (auto-shifts if the port is busy)

### Lint, Build, Start

```bash
npm run lint
npm run build
npm run start
```

The production `start` script again keeps the proxy and Next.js server alive in parallel.

### Proxy Endpoints

- `POST /api`: forwards generic HeyTea API calls; pass `{ url, method, headers, params, body }`.
- `POST /auth/sms/send`: encrypts手机号并调用官方验证码接口，可通过 body 覆盖 `areaCode` 或追加参数。
- `POST /auth/sms/login`: 使用手机号+验证码换取 Token，响应直接回传官方数据。
- `POST /upload`: wraps `multipart/form-data` upload to `https://app-go.heytea.com/api/service-cps/user/diy` with the required `sign`, `t`, `width`, `height`, and `token` fields.

Refer to `src/app/page.tsx` for the request shapes used by the UI.
