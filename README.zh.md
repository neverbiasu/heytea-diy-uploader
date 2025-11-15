# HeyTea DIY Uploader（中文说明）

[English](./README.md) · [中文](./README.zh.md)

此项目为 HeyTea 非官方 DIY 图片工作流的参考实现。前端使用 Next.js App Router，提供简洁的 UI；后端包含一个用于转发与加密的 Express 代理（`server/index.mjs`），用于与 HeyTea 官方接口交互以完成短信验证与图片上传。

---

## 一键部署（Vercel）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/<GITHUB_OWNER>/<REPO>)

该项目在代码中内置默认值，因此本地运行无需环境变量。关于托管与生产部署的详细操作不包含在此文档内。

---

## 本地快速运行

```bash
npm install
npm run dev
```

开发服务器：

- Next.js: http://localhost:3000
- 代理: http://localhost:5969

常用命令：

```bash
npm run lint
npm run build
npm run start
```

---

## 代理端点（参考）

- `POST /auth/sms/send` — 对手机号加密并转发到 HeyTea 的短信发送接口。
- `POST /auth/sms/login` — 使用手机号与验证码换取登录 Token。
- `POST /upload` — 将图片以 `multipart/form-data` 上传到 HeyTea DIY 上传接口，附带 `sign` 和 `t` 等字段。

详情请参见 `src/app/page.tsx` 与 `server/index.mjs`。

---

如果你需要，我可以帮你把代理迁移为 serverless 路由或准备独立部署的脚本与说明。