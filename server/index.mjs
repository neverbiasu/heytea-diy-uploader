import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import net from "node:net";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const app = express();
const DEFAULT_PORT = 5969;
const allowedOrigins = ["http://localhost:3000"];
const HEYTEA_SMS_AREA_CODE = "86";
const HEYTEA_CLIENT_SOURCE = "app";
const HEYTEA_BRAND_ID = "1000001";
const HEYTEA_CHANNEL = "A";
const HEYTEA_TICKET_FROM = "min";
// Use the same key/iv bytes as the reference Python helper for parity
const HEYTEA_AES_KEY = "23290CFFBB5D39B8";
const HEYTEA_AES_IV = "HEYTEA1A2B3C4D5E";
const HEYTEA_DEVICE_ID = "";
const HEYTEA_USER_AGENT = "Mozilla/5.0 (Linux; Android 16; 2410DPN6CC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 XWEB/4433 MMWEBSDK/20220904 Mobile Safari/537.36 MMWEBID/5976 SAAASDK miniProgram Luggage/3.0.2 NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android";
const LOG_PREFIX = "[heytea-proxy]";

function logEvent(event, payload) {
  const timestamp = new Date().toISOString();
  console.log(LOG_PREFIX, timestamp, event, payload);
}

function maskMobile(mobile) {
  if (!mobile || typeof mobile !== "string") {
    return "";
  }
  if (mobile.length < 7) {
    return `${mobile.slice(0, 2)}***`;
  }
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function bufferFromSecret(secret) {
  if (!secret) {
    return Buffer.alloc(0);
  }
  const trimmed = secret.trim();
  // Only treat as hex when the length matches common key sizes in hex
  // (32 = 16 bytes, 48 = 24 bytes, 64 = 32 bytes). Otherwise use utf8.
  const isAllHex = /^[0-9a-fA-F]+$/.test(trimmed);
  const hexLengths = new Set([32, 48, 64]);
  const hexLike = isAllHex && hexLengths.has(trimmed.length);
  return Buffer.from(trimmed, hexLike ? "hex" : "utf8");
}

function encryptMobileNumber(mobile) {
  if (!HEYTEA_AES_KEY || !HEYTEA_AES_IV) {
    throw new Error("Missing HeyTea AES key or IV");
  }

  const key = bufferFromSecret(HEYTEA_AES_KEY);
  const iv = bufferFromSecret(HEYTEA_AES_IV);

  if (key.length !== 16 || iv.length !== 16) {
    throw new Error("HeyTea AES key and IV must each be 16 bytes");
  }

  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(String(mobile), "utf8"), cipher.final()]);
  return encrypted.toString("base64");
}

function sanitizeOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return {};
  }
  return overrides;
}

function buildHeyteaHeaders(extra = {}) {
  return {
    "User-Agent": HEYTEA_USER_AGENT,
    "Connection": "keep-alive",
    "Accept": "application/prs.heytea.v1+json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json",
    "charset": "utf-8",
    "accept-language": "zh-CN",
    "x-client-version": "4.0.1",
    "current-page": "/pages/login/login_app/index",
    "client-version": "4.0.1",
    "version": "4.0.1",
    "gmt-zone": "+08:00",
    "x-region-id": "10",
    "x-client": "app",
    "client": "2",
    "region": "1",
    "x-version": "4.0.1",
    "referer": "https://servicewechat.com/wx696a42df4f2456d3/400000137/page-frame.html",
    ...extra,
  };
}

function handleProxyError(label, error, res) {
  console.error(`${label}:`, error.message);
  return res.status(error.response?.status || 500).json({
    error: label,
    message: error.message,
    details: error.response?.data || null,
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort, maxPort = startPort + 100) {
  for (let port = startPort; port <= maxPort; port += 1) {
    if (await checkPort(port)) {
      return port;
    }
  }
  throw new Error(`Unable to find open port between ${startPort} and ${maxPort}`);
}

app.get("/test", (_req, res) => {
  res.json({ status: "ok", message: "HeyTea proxy running" });
});

app.post("/api", async (req, res) => {
  const { url, method = "POST", headers = {}, params = {}, body = {} } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: "Missing url", message: "Provide the HeyTea API path." });
  }

  try {
    const response = await axios({
      method,
      url: `https://app-go.heytea.com${url}`,
      headers,
      params,
      data: body,
      timeout: 20000,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleProxyError("API Proxy Error", error, res);
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { width = 596, height = 832, sign, t, token } = req.body || {};
    if (!req.file || !sign || !t || !token) {
      return res.status(400).json({ code: 1, message: "Missing file, sign, timestamp, or token" });
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: `${t}.png`,
      contentType: req.file.mimetype || "image/png",
    });
    form.append("width", width);
    form.append("height", height);

    const url = `https://app-go.heytea.com/api/service-cps/user/diy?sign=${sign}&t=${t}`;
    const response = await axios.post(url, form, {
      headers: {
        Authorization: token,
        ...form.getHeaders(),
      },
      timeout: 20000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleProxyError("Upload Proxy Error", error, res);
  }
});

app.post("/auth/sms/send", async (req, res) => {
  const { mobile, areaCode, captchaTicket, captchaRandStr, overrides = {} } = req.body || {};

  if (!mobile) {
    return res.status(400).json({ error: "Missing mobile", message: "Provide a phone number" });
  }

  try {
    const resolvedAreaCode = areaCode || HEYTEA_SMS_AREA_CODE;
    const payload = {
      mobile: encryptMobileNumber(mobile),
      zone: resolvedAreaCode,
      client: HEYTEA_CLIENT_SOURCE,
      brandId: HEYTEA_BRAND_ID,
      brand: HEYTEA_BRAND_ID,
      ticketFrom: HEYTEA_TICKET_FROM,
      cryptoLevel: 2,
      type: 1,
      ...sanitizeOverrides(overrides),
    };

    if (captchaTicket) {
      payload.ticket = captchaTicket;
    }
    if (captchaRandStr) {
      payload.randstr = captchaRandStr;
    }

    logEvent("sms.send.request", {
      maskedMobile: maskMobile(mobile),
      areaCode: resolvedAreaCode,
      overrides: Object.keys(overrides || {}),
    });

    const outboundHeaders = buildHeyteaHeaders();
    // log a short preview of the encrypted mobile for parity checking
    logEvent("sms.send.forward", {
      encryptedMobilePreview: `${payload.mobile.slice(0,6)}...${payload.mobile.slice(-4)}`,
      headers: Object.keys(outboundHeaders),
    });

    const response = await axios.post(
      "https://app-go.heytea.com/api/service-member/openapi/vip/user/sms/verifiyCode/send",
      payload,
      {
        headers: outboundHeaders,
        timeout: 20000,
      }
    );
    logEvent("sms.send.response", {
      maskedMobile: maskMobile(mobile),
      status: response.status,
      code: response.data?.code,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    logEvent("sms.send.error", {
      maskedMobile: maskMobile(mobile),
      message: error.message,
      status: error.response?.status,
    });
    return handleProxyError("SMS Send Error", error, res);
  }
});

app.post("/auth/sms/login", async (req, res) => {
  const { mobile, code, areaCode, overrides = {} } = req.body || {};

  if (!mobile || !code) {
    return res.status(400).json({ error: "Missing mobile or code" });
  }

  try {
    const resolvedAreaCode = areaCode || HEYTEA_SMS_AREA_CODE;
    const payload = {
      phone: encryptMobileNumber(mobile),
      smsCode: code,
      zone: resolvedAreaCode,
      client: HEYTEA_CLIENT_SOURCE,
      brand: HEYTEA_BRAND_ID,
      channel: HEYTEA_CHANNEL,
      ticketFrom: HEYTEA_TICKET_FROM,
      loginType: "APP_CODE",
      cryptoLevel: 2,
      email: null,
      ...sanitizeOverrides(overrides),
    };

    logEvent("sms.login.request", {
      maskedMobile: maskMobile(mobile),
      areaCode: resolvedAreaCode,
      hasCode: Boolean(code),
      overrides: Object.keys(overrides || {}),
    });

    const response = await axios.post(
      "https://app-go.heytea.com/api/service-login/openapi/vip/user/login_v1",
      payload,
      {
        headers: buildHeyteaHeaders(),
        timeout: 20000,
      }
    );
    logEvent("sms.login.response", {
      maskedMobile: maskMobile(mobile),
      status: response.status,
      code: response.data?.code,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    logEvent("sms.login.error", {
      maskedMobile: maskMobile(mobile),
      message: error.message,
      status: error.response?.status,
    });
    return handleProxyError("SMS Login Error", error, res);
  }
});

export async function startServer() {
  try {
    const port = (await checkPort(DEFAULT_PORT))
      ? DEFAULT_PORT
      : await findAvailablePort(DEFAULT_PORT + 1);

    app.listen(port, () => {
      console.log("\nHeyTea Proxy ready");
      console.log(`Local endpoint: http://localhost:${port}`);
      console.log("Do not close this window while the proxy is running.\n");
    });
  } catch (error) {
    console.error("Failed to boot proxy:", error.message);
    process.exit(1);
  }
}

const isMain = Boolean(process.argv[1]) && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  startServer();
}

export { app };
