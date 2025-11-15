# HeyTea Uploader TODOs

## Context
- [ ] Base Next.js + Express proxy is aligned with FuQuan233/HeyTea_AutoUpload feature set.
- [ ] Reference repo cloned under `HeyTea_AutoUpload/` for payload + filter parity.
- [ ] Goal: SMS login parity + advanced image editor (crop, filters, undo) + zero-config proxy.

## Phase 1  API/Proxy Parity
- [ ] Diff `heytea_api_config.py` & `main.py` to capture exact request payloads/headers/captcha metadata.
- [ ] Port AES helper from `heytea_cryption.py` into a shared TypeScript module for client + proxy reuse.
- [ ] Mirror Python request builders inside `server/index.mjs`, including captcha ticket flow and device headers.
- [ ] Add structured logging for `/auth/sms/*` and `/upload` to surface payloads, masked mobile, and upstream status.
- [ ] Move shared constants (AES key/iv, brand id, ticket source, device id, UA) into a single source of truth.

## Phase 2  Image Workflow Foundations
- [ ] Select canvas/graphics toolkit (Fabric.js, Konva, or custom WebGL) based on filter requirements.
- [ ] Scaffold `/src/components/editor` with state store + undo/redo command stack.
- [ ] Implement base flow: upload image > aspect-constrained crop > confirm preview > pass to uploader.
- [ ] Wire initial filters (grayscale, sketch/edge detect) and background removal hook (worker or API).

## Phase 3  UI/UX Enhancements
- [ ] Build tool tray covering: reselect, background removal, monochrome, sketch, dots, hide detail, undo/redo, text tracing, geometric segmentation, particle, low-poly.
- [ ] Add loading states/toasts + skeleton previews while filters compute.
- [ ] Create guided steps (Login > Token preview > Editor > Upload) with local draft persistence.
- [ ] Ship accessibility upgrades: keyboard shortcuts, high-contrast theme, effect tooltips.

## Phase 4  Validation & Docs
- [ ] Add Jest/Vitest coverage for AES parity + signature helpers; Playwright smoke for SMS login.
- [ ] Refresh README to describe zero-config proxy + new editor controls + troubleshooting.
- [ ] Assemble release checklist (manual test matrix + lint/build gates).

## Immediate Action Items
- [ ] Capture live SMS login request/response via Python tool for baseline comparison.
- [ ] Port AES helper + payload builder into TypeScript and reuse in proxy + UI.
- [ ] Introduce structured logging in `server/index.mjs` to debug "手机号格式错误".
- [ ] Pick canvas library and spike crop-confirm flow.
- [ ] Update README once parity fixes land.
