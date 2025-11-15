/* eslint-disable @next/next/no-img-element */
"use client";

import "cropperjs/dist/cropper.css";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper from "cropperjs";
import { removeBackground } from "@imgly/background-removal";
import {
  DEFAULT_SMS_AREA_CODE,
  buildUploadSignature,
  extractTokenFromPayload,
  extractUserMainIdFromPayload,
  getProxyBaseUrl,
  REQUIRED_DIMENSIONS,
} from "@/lib/heytea";

const BACKGROUND_COLOR = "#eeeeee";
const OUTPUT_WIDTH = REQUIRED_DIMENSIONS.width;
const OUTPUT_HEIGHT = REQUIRED_DIMENSIONS.height;
const OUTPUT_MIME_TYPE = "image/png";
const MAX_HISTORY = 8;

type AsyncState = {
  state: "idle" | "loading" | "success" | "error" | "info";
  message?: string;
};

const stateStyles: Record<AsyncState["state"], string> = {
  idle: "text-stone-500",
  loading: "text-amber-600",
  success: "text-green-600",
  error: "text-rose-600",
  info: "text-stone-500",
};

export default function Home() {
  const proxyBase = useMemo(() => getProxyBaseUrl(), []);
  const [token, setToken] = useState("");
  const [userMainId, setUserMainId] = useState("");
  const [width, setWidth] = useState(String(OUTPUT_WIDTH));
  const [height, setHeight] = useState(String(OUTPUT_HEIGHT));
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<AsyncState>({ state: "idle" });
  const [smsMobile, setSmsMobile] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsSendState, setSmsSendState] = useState<AsyncState>({ state: "idle" });
  const [smsLoginState, setSmsLoginState] = useState<AsyncState>({ state: "idle" });
  const [smsCountdown, setSmsCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const cropperImageRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cropperSrc, setCropperSrc] = useState("");
  const [showCropper, setShowCropper] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [history, setHistory] = useState<Array<{ blob: Blob; label: string }>>([]);
  const [rawFileName, setRawFileName] = useState("HeyTea-DIY.png");
  const [previewUrl, setPreviewUrl] = useState("");
  const [editorState, setEditorState] = useState<AsyncState>({ state: "idle" });
  const [editorBusy, setEditorBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!smsCountdown) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }
    countdownRef.current = setInterval(() => {
      setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [smsCountdown]);

  const destroyCropper = useCallback(() => {
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!showCropper || !cropperImageRef.current) {
      return undefined;
    }
    destroyCropper();
    cropperRef.current = new Cropper(cropperImageRef.current, {
      aspectRatio: OUTPUT_WIDTH / OUTPUT_HEIGHT,
      viewMode: 1,
      responsive: true,
      background: false,
      autoCropArea: 1,
    });
    return () => {
      destroyCropper();
    };
  }, [showCropper, cropperSrc, destroyCropper]);

  const resetHistory = useCallback((blob: Blob, label = "原始裁剪") => {
    setHistory([{ blob, label }]);
    setProcessedBlob(blob);
  }, []);

  const pushHistory = useCallback((label: string, blob: Blob) => {
    setHistory((prev) => {
      const next = [...prev, { blob, label }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setProcessedBlob(blob);
  }, []);

  useEffect(() => {
    if (!processedBlob) {
      setPreviewUrl("");
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    (async () => {
      const dataUrl = await blobToDataUrl(processedBlob);
      setPreviewUrl(dataUrl);
      const canvas = previewCanvasRef.current;
      if (canvas) {
        await drawBlobOnCanvas(processedBlob, canvas, BACKGROUND_COLOR);
      }
    })();
  }, [processedBlob]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFileError(null);
      return;
    }
    if (file.type !== OUTPUT_MIME_TYPE) {
      setFileError("仅支持 PNG 文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        destroyCropper();
        setCropperSrc(result);
        setShowCropper(true);
        setFileError(null);
        setEditorState({ state: "info", message: "请调整裁剪区域" });
        setProcessedBlob(null);
        setHistory([]);
        setPreviewUrl("");
        setRawFileName(file.name || "HeyTea-DIY.png");
      }
    };
    reader.onerror = () => {
      setFileError("无法读取图片");
    };
    reader.readAsDataURL(file);
  }, [destroyCropper]);

  const handleUpload = async () => {
    if (!token.trim() || !userMainId.trim() || !processedBlob) {
      setUploadState({ state: "error", message: "请完善 token、用户ID 与裁剪图片" });
      return;
    }

    setUploadState({ state: "loading", message: "正在上传..." });
    try {
      const { sign, timestamp } = buildUploadSignature(userMainId);
      const form = new FormData();
      const uploadFile = new File([processedBlob], rawFileName, { type: OUTPUT_MIME_TYPE });
      form.append("file", uploadFile);
      form.append("width", width.trim());
      form.append("height", height.trim());
      form.append("sign", sign);
      form.append("t", timestamp);
      form.append("token", token.trim());

      const response = await fetch(`${proxyBase}/upload`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!response.ok || payload?.code === 1) {
        throw new Error(payload?.message || "上传失败");
      }

      setUploadState({ state: "success", message: payload?.message || "上传成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setUploadState({ state: "error", message });
    }
  };

  const handleSendSms = async () => {
    if (!smsMobile.trim()) {
      setSmsSendState({ state: "error", message: "请输入手机号" });
      return;
    }
    setSmsSendState({ state: "loading", message: "发送中..." });
    try {
      const response = await fetch(`${proxyBase}/auth/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: smsMobile.trim(), areaCode: DEFAULT_SMS_AREA_CODE }),
      });
      const payload = await response.json();
      if (!response.ok || (typeof payload?.code === "number" && payload.code !== 0)) {
        throw new Error(payload?.message || payload?.msg || "短信发送失败");
      }
      setSmsSendState({ state: "success", message: "验证码已发送" });
      setSmsCountdown(60);
    } catch (error) {
      const message = error instanceof Error ? error.message : "短信发送失败";
      setSmsSendState({ state: "error", message });
    }
  };

  const handleSmsLogin = async () => {
    if (!smsMobile.trim() || !smsCode.trim()) {
      setSmsLoginState({ state: "error", message: "请输入手机号和验证码" });
      return;
    }
    setSmsLoginState({ state: "loading", message: "登录中..." });
    try {
      const response = await fetch(`${proxyBase}/auth/sms/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: smsMobile.trim(), code: smsCode.trim(), areaCode: DEFAULT_SMS_AREA_CODE }),
      });
      const payload = await response.json();
      if (!response.ok || (typeof payload?.code === "number" && payload.code !== 0)) {
        throw new Error(payload?.message || payload?.msg || "登录失败");
      }

      const derivedToken = extractTokenFromPayload(payload);
      if (derivedToken) {
        setToken(derivedToken);
      }
      const derivedUserMainId = extractUserMainIdFromPayload(payload);
      if (derivedUserMainId) {
        setUserMainId(derivedUserMainId);
      }

      setSmsLoginState({ state: "success", message: payload?.message || "登录成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      setSmsLoginState({ state: "error", message });
    }
  };

  const confirmCrop = () => {
    if (!cropperRef.current) {
      setEditorState({ state: "error", message: "裁剪器未准备好" });
      return;
    }
    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fillColor: BACKGROUND_COLOR,
      });
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) {
          setEditorState({ state: "error", message: "裁剪失败，请重试" });
          return;
        }
        resetHistory(blob);
        setShowCropper(false);
        destroyCropper();
        setEditorState({ state: "success", message: "裁剪完成，可继续处理" });
      }, OUTPUT_MIME_TYPE, 0.9);
    } catch (error) {
      const message = error instanceof Error ? error.message : "裁剪失败";
      setEditorState({ state: "error", message });
    }
  };

  const handleReCrop = async () => {
    const referenceBlob = processedBlob || history.at(-1)?.blob;
    if (!referenceBlob) {
      setEditorState({ state: "error", message: "没有可重新裁剪的图片" });
      return;
    }
    const dataUrl = await blobToDataUrl(referenceBlob);
    destroyCropper();
    setCropperSrc(dataUrl);
    setShowCropper(true);
    setEditorState({ state: "info", message: "重新裁剪中" });
  };

  const handleRemoveBackground = async () => {
    if (!processedBlob) {
      setEditorState({ state: "error", message: "请先完成裁剪" });
      return;
    }
    setEditorBusy("removeBg");
    setEditorState({ state: "loading", message: "加载 AI 模型中..." });
    try {
      const resultBlob = await removeBackground(processedBlob);
      pushHistory("去除背景", resultBlob);
      setEditorState({ state: "success", message: "背景去除成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 处理失败";
      setEditorState({ state: "error", message });
    } finally {
      setEditorBusy(null);
    }
  };

  const runCanvasPipeline = useCallback(
    async (
      label: string,
      transformer: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
    ) => {
      if (!processedBlob) {
        setEditorState({ state: "error", message: "请先完成裁剪" });
        return;
      }
      setEditorBusy(label);
      setEditorState({ state: "loading", message: `${label}处理中...` });
      try {
        const baseImage = await blobToImage(processedBlob);
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_WIDTH;
        canvas.height = OUTPUT_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("无法创建绘制上下文");
        }
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        ctx.drawImage(baseImage, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        transformer(ctx, canvas);
        const updatedBlob = await canvasToBlob(canvas, OUTPUT_MIME_TYPE);
        if (!updatedBlob) {
          throw new Error("无法生成图片");
        }
        pushHistory(label, updatedBlob);
        setEditorState({ state: "success", message: `${label}完成` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "处理失败";
        setEditorState({ state: "error", message });
      } finally {
        setEditorBusy(null);
      }
    },
    [processedBlob, pushHistory]
  );

  const applyGrayscale = () => {
    runCanvasPipeline("黑白效果", (ctx, canvas) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }
      ctx.putImageData(imageData, 0, 0);
    });
  };

  const applySketch = () => {
    runCanvasPipeline("简笔画", (ctx, canvas) => {
      const { width, height } = canvas;
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const gray = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = (y * width + x) * 4;
          gray[y * width + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }
      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          let gx = 0;
          let gy = 0;
          let kernelIndex = 0;
          for (let ky = -1; ky <= 1; ky += 1) {
            for (let kx = -1; kx <= 1; kx += 1) {
              const sample = gray[(y + ky) * width + (x + kx)];
              gx += sobelX[kernelIndex] * sample;
              gy += sobelY[kernelIndex] * sample;
              kernelIndex += 1;
            }
          }
          const magnitude = 255 - Math.min(255, Math.sqrt(gx * gx + gy * gy));
          const idx = (y * width + x) * 4;
          data[idx] = magnitude;
          data[idx + 1] = magnitude;
          data[idx + 2] = magnitude;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    });
  };

  const applyPixelize = () => {
    runCanvasPipeline("波点效果", (ctx, canvas) => {
      const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const dotCanvas = document.createElement("canvas");
      dotCanvas.width = canvas.width;
      dotCanvas.height = canvas.height;
      const dotCtx = dotCanvas.getContext("2d");
      if (!dotCtx) return;
      dotCtx.fillStyle = BACKGROUND_COLOR;
      dotCtx.fillRect(0, 0, dotCanvas.width, dotCanvas.height);
      const PIXEL_SIZE = 9;
      for (let y = 0; y < dotCanvas.height; y += PIXEL_SIZE) {
        for (let x = 0; x < dotCanvas.width; x += PIXEL_SIZE) {
          const sampleX = Math.min(x + PIXEL_SIZE / 2, dotCanvas.width - 1);
          const sampleY = Math.min(y + PIXEL_SIZE / 2, dotCanvas.height - 1);
          const idx = (sampleY * dotCanvas.width + sampleX) * 4;
          const r = sourceData.data[idx];
          const g = sourceData.data[idx + 1];
          const b = sourceData.data[idx + 2];
          const avg = (r + g + b) / 3;
          if (avg > 235) continue;
          const radius = (PIXEL_SIZE * (1 - avg / 255)) * 0.7;
          dotCtx.fillStyle = `rgb(${r},${g},${b})`;
          dotCtx.beginPath();
          dotCtx.arc(x + PIXEL_SIZE / 2, y + PIXEL_SIZE / 2, Math.max(1, radius), 0, Math.PI * 2);
          dotCtx.fill();
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(dotCanvas, 0, 0);
    });
  };

  const undoLastAction = () => {
    setHistory((prev) => {
      if (prev.length <= 1) {
        setEditorState({ state: "error", message: "没有可撤销的操作" });
        return prev;
      }
      const removed = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      const restored = next[next.length - 1];
      if (restored) {
        setProcessedBlob(restored.blob);
        setEditorState({ state: "success", message: `已撤销：${removed.label}` });
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 text-stone-900">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header className="space-y-4 border-b border-stone-200 pb-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-stone-400">HeyTea Tools</p>
            <h1 className="text-3xl font-semibold text-stone-900">HeyTea DIY Uploader</h1>
            <p className="text-sm text-stone-500">
              短信先拿 Token，再粘贴到下方输入框，最后一键把 596×832 PNG 上传到官方接口。
            </p>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Step 1</p>
                  <h2 className="text-lg font-semibold text-stone-900">短信验证码登录</h2>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">+{DEFAULT_SMS_AREA_CODE}</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <label className="text-stone-500">
                  手机号
                  <input
                    type="tel"
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus:border-stone-400 focus:outline-none"
                    value={smsMobile}
                    onChange={(event) => setSmsMobile(event.target.value)}
                    placeholder="例如 180xxxxxx"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
                    value={smsCode}
                    onChange={(event) => setSmsCode(event.target.value)}
                    placeholder="短信验证码"
                  />
                  <button
                    className="rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                    onClick={handleSendSms}
                    disabled={smsCountdown > 0 || smsSendState.state === "loading"}
                  >
                    {smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                  </button>
                </div>
                <button
                  className="w-full rounded-2xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                  onClick={handleSmsLogin}
                  disabled={smsLoginState.state === "loading"}
                >
                  {smsLoginState.state === "loading" ? "登录中..." : "使用短信登录"}
                </button>
                <div className="text-xs">
                  <p className={stateStyles[smsSendState.state]}>
                    {smsSendState.message || "等待发送验证码"}
                  </p>
                  <p className={stateStyles[smsLoginState.state]}>
                    {smsLoginState.message || "等待登录"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Step 2</p>
                  <h2 className="text-lg font-semibold text-stone-900">Token & 用户信息</h2>
                </div>
                <span className="text-xs text-stone-500">可直接粘贴 Bearer</span>
              </div>
              <p className="mt-3 text-xs text-stone-500">
                短信登录成功后会自动填充，当然也可以直接粘贴历史 Token。
              </p>
              <textarea
                className="mt-3 h-32 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Bearer xxx"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Step 3</p>
                <h2 className="text-lg font-semibold text-stone-900">上传 DIY 图片</h2>
              </div>
              <span className="text-xs text-stone-500">{REQUIRED_DIMENSIONS.width}×{REQUIRED_DIMENSIONS.height} PNG</span>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <label className="text-stone-500">
                user_main_id
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
                  value={userMainId}
                  onChange={(event) => setUserMainId(event.target.value)}
                  placeholder="例如 123456"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-stone-500">
                  宽度
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                  />
                </label>
                <label className="text-stone-500">
                  高度
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                </label>
              </div>

              <div>
                <label className="text-stone-500">PNG 图片</label>
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleFileChange}
                  className="mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-600"
                />
                <p className="mt-2 text-xs text-stone-500">
                  支持任意 PNG，裁剪后固定 {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}。
                </p>
                {fileError && <p className="mt-2 text-xs text-rose-600">{fileError}</p>}
              </div>

              {showCropper && (
                <div className="mt-4 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-medium text-stone-600">裁剪 {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}</p>
                  <div className="max-h-[420px] overflow-hidden rounded-xl border border-stone-200 bg-white">
                    <img ref={cropperImageRef} src={cropperSrc} alt="裁剪图片" className="block h-full max-h-[420px] w-full object-contain" />
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button
                      className="flex-1 rounded-xl bg-stone-900 px-4 py-2 font-semibold text-white transition hover:bg-stone-800"
                      onClick={confirmCrop}
                    >
                      确认裁剪
                    </button>
                    <button
                      className="flex-1 rounded-xl border border-stone-300 px-4 py-2 font-semibold text-stone-600 hover:bg-stone-100"
                      onClick={() => {
                        setShowCropper(false);
                        destroyCropper();
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {processedBlob && (
                <div className="mt-4 space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span className="font-semibold text-stone-700">预览 {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}</span>
                    <span>{rawFileName}</span>
                  </div>
                  <canvas
                    ref={previewCanvasRef}
                    width={OUTPUT_WIDTH}
                    height={OUTPUT_HEIGHT}
                    className="w-full rounded-xl border border-stone-200 bg-white"
                  />
                  {previewUrl && (
                    <p className="text-xs text-stone-500">{history.at(-1)?.label || "当前效果"}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                      onClick={handleReCrop}
                    >
                      重新裁剪
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                      onClick={handleRemoveBackground}
                      disabled={editorBusy !== null}
                    >
                      {editorBusy === "removeBg" ? "处理中..." : "去除背景"}
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                      onClick={applyGrayscale}
                      disabled={editorBusy !== null}
                    >
                      黑白效果
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                      onClick={applySketch}
                      disabled={editorBusy !== null}
                    >
                      简笔画
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                      onClick={applyPixelize}
                      disabled={editorBusy !== null}
                    >
                      波点效果
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                      onClick={undoLastAction}
                    >
                      撤销
                    </button>
                  </div>
                  <p className={`text-xs ${stateStyles[editorState.state]}`}>
                    {editorState.message || "等待处理"}
                  </p>
                </div>
              )}

              <button
                className="w-full rounded-2xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                onClick={handleUpload}
                disabled={uploadState.state === "loading"}
              >
                {uploadState.state === "loading" ? "上传中..." : "上传图片"}
              </button>
              <p className={`text-xs font-medium ${stateStyles[uploadState.state]}`}>
                {uploadState.message || "等待上传"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

async function drawBlobOnCanvas(blob: Blob, canvas: HTMLCanvasElement, fill = BACKGROUND_COLOR) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = await blobToImage(blob);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function blobToImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}
