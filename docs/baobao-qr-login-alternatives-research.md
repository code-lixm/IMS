# 抱抱二维码登录替代方案深度调研

## 背景

当前实现位于 `packages/server/src/services/baobao-login.ts`，启动流程为：

1. 用 `playwright.chromium.launch({ headless: true })` 拉起内置 Chromium。
2. 打开 `https://baobao.getui.com/#/login`。
3. 等待 `.qr-code` 元素出现。
4. 读取该元素的 `background-image`，如果是远程图片再二次下载；失败则截图二维码元素。
5. 登录后从 `sessionStorage/localStorage/cookies` 提取 token，再调用 `/api/usercenter/user/getLoginInfo` 校验登录态。

这个方案的主要问题不是“能不能拿到二维码”，而是**打包桌面端时 Chromium 体积和分发复杂度高**。

用户目标很明确：

- 只要应用启动时能拿到二维码即可；
- 尽可能轻量；
- 不能简单放弃，要给出经过调研与验证的结论。

## 现状核实

### 代码侧现状

从 `packages/server/src/services/baobao-login.ts` 可以确认：

- 当前依赖的是 `playwright`，不是 Puppeteer；
- 真实抓码方式不是 OCR，而是：
  - 优先取 `.qr-code` 的 `computedStyle.backgroundImage`；
  - 如果拿到的是远程图片 URL，再直接 HTTP 拉图片；
  - 最后兜底才是元素截图。

这说明当前需求的关键并不是“图像识别二维码”，而是**让一个能执行页面 JS 的运行时把二维码 DOM 渲染出来，然后读取它的背景图**。

### 对目标站点的直接验证

对以下地址做了直接抓取：

- `https://baobao.getui.com/#/login`
- `https://baobao.getui.com/ghr/`

结果：

- 返回的只是 Vue SPA 的 HTML 壳；
- 页面主体只有 `<div id="app"></div>` 和若干 JS/CSS bundle；
- 首屏 HTML 中没有二维码内容、没有二维码图片 URL、也没有登录态 API 直出二维码数据。

这直接说明：

> **Cheerio / 正则 / 纯 HTML 抓取，在当前页面上不能直接拿到二维码。**

原因不是工具不够强，而是二维码本身并不在初始 HTML 里，而是需要前端 JS 运行后才出现。

## 方案候选

下面按“是否可行 / 轻量程度 / 打包复杂度 / 风险”进行分析。

---

## 方案 A：Cheerio / 纯 HTTP / 正则解析 HTML

### 思路

直接请求 `/#/login` 或 `/ghr/`，用 Cheerio、正则或简单 DOM 解析提取二维码链接。

### 验证结果

已直接抓取目标页面 HTML，只有 SPA 壳，没有二维码节点内容。

### 结论

**不可行。**

### 原因

- 二维码不是 SSR 输出；
- 需要前端 JS 执行后渲染；
- Cheerio 只能处理静态 HTML，不会执行浏览器环境脚本。

### 适用前提

只有在以下情况才成立：

- 站点后续改成服务端直接输出二维码 URL；
- 或找到未鉴权即可直取二维码的后端接口。

当前没有证据支持。

---

## 方案 B：jsdom / happy-dom 等“伪浏览器 DOM”执行前端代码

### 思路

加载页面 HTML 和 bundle，在 Node/Bun 环境里模拟 DOM，执行 JS 后等待二维码节点出现。

### 理论可行性

理论上可跑一部分前端逻辑，但对现代企业 SPA 基本不稳。

### 实际风险

- 目标站点是生产 Vue SPA，带 webpack 分包、样式、异步 chunk、浏览器 API 依赖；
- 登录页很可能依赖真实布局、Canvas、storage、history、定时器、跨域资源、CSS 计算；
- `background-image` 的生成依赖真实浏览器渲染链路，jsdom 不提供完整 CSSOM/布局/绘制能力；
- 一旦依赖某些浏览器特性，维护成本会远高于 headless browser。

### 结论

**不推荐。**

它“看起来轻”，但对这类 SPA 登录页通常是伪轻量：实现复杂、稳定性差、回归风险大。

---

## 方案 C：逆向页面接口，直接请求二维码 API

### 思路

不打开页面，直接找到登录页在加载二维码时调用的后端接口，然后用普通 HTTP 请求拿到二维码 URL 或图片数据。

### 为什么这是最值得优先尝试的轻量方案

如果能找到这个接口，那么：

- 不需要 Chromium；
- 不需要 WebView 自动化；
- 启动速度快；
- 打包最轻；
- 桌面端只需普通 HTTP + 状态轮询。

### 当前证据

最初只确认了登录成功后的用户态接口 `/api/usercenter/user/getLoginInfo`，但在后续补充的登录 HAR 里，已经抓到了完整的二维码状态接口链路。

### 风险

- 若二维码接口需要前置的匿名 cookie / nonce / 签名参数，仍要先模拟登录页初始化；
- 若前端用了加密签名或运行时计算参数，仍可能需要 JS 执行环境；
- 若二维码本身来自前端 SDK 或第三方登录桥，也未必能纯 HTTP 拿到。

### 结论

**这是当前最优方案，而且已经被 HAR 与本机 HTTP PoC 部分验证。**

已确认可直接调用：

- `POST /api/mainpart/qr_code/getUuid`
- `POST /api/mainpart/qr_code/getQrCodeStatus`
- `POST /api/mainpart/qr_code/delUuid`

并且本机已直接用 `curl` 成功拿到新的 `uuid`，再用该 `uuid` 成功轮询到 `status=no_scanned`。

---

## 方案 D：继续用 Playwright，但不打包浏览器，改为“连接系统 Chrome / 外部浏览器”

### 思路

保留现有稳定逻辑，但不再把 Chromium 二进制随桌面端一起分发。替代方式包括：

1. 使用系统已安装的 Chrome/Chromium；
2. 使用 `playwright-core`；
3. 或连接用户已启动浏览器的 CDP（Chrome DevTools Protocol）。

### 优点

- 对现有代码改动最小；
- 现有 `.qr-code -> backgroundImage -> screenshot fallback -> storage token` 这整套逻辑可以复用；
- 不需要重新逆向网站。

### 缺点

- 仍依赖真实浏览器；
- 要处理用户机器上“Chrome 路径是否存在”；
- macOS/Windows/Linux 路径差异要兜底；
- 若企业机器禁装 Chrome 或版本异常，会增加支持成本。

### 可落地形态

#### D1. `playwright-core + executablePath`

- 只安装 `playwright-core`；
- 运行时探测系统 Chrome 路径并启动；
- 不随应用打包浏览器。

这是**最现实的减重方案**。

#### D2. 连接已运行浏览器的 CDP

- 让用户本机 Chrome 以 `--remote-debugging-port` 启动；
- 应用通过 `connectOverCDP` 连接。

这更轻，但对最终用户体验较差：

- 需要额外启动参数；
- 产品化门槛高；
- 不适合普通桌面用户。

### 结论

**可行，且工程风险最低。**

如果“纯 HTTP 逆向二维码接口”失败，这是最推荐的保底替代方案。

---

## 方案 E：直接使用 Tauri 自带 WebView 展示登录页，并从 WebView 中提取二维码

### 思路

既然桌面应用本来就有系统 WebView（macOS WebKit / Windows WebView2），那就不再额外拉 Playwright/Chromium，而是：

1. 用一个隐藏或小窗的 Tauri WebView 打开抱抱登录页；
2. 页面 JS 正常执行，二维码自然渲染出来；
3. 通过 `evaluate_script` / 注入脚本读取 `.qr-code` 的 `backgroundImage`；
4. 登录后继续从页面 storage/cookie 提取 token。

### 优点

- 不需要额外打包 Chromium；
- 依赖的是系统已存在的 WebView；
- 对 SPA 页面兼容性通常高于 jsdom；
- 仍能沿用“读取二维码背景图 + storage token”的思路。

### 风险与限制

- 你当前二维码逻辑在 server 侧 Bun 进程里，而 Tauri WebView 在 desktop 侧 Rust/前端层；
- 需要重构登录链路，把“抓码”和“登录态提取”从 server service 挪到桌面层，或通过命令桥接；
- 跨域脚本注入、cookie 获取、WebView API 限制需要逐平台验证；
- 登录页若带 CSP、iframe、复杂微前端隔离，注入可能受限；
- 实现比 D1 更重，因为是**架构迁移**，不是简单替换依赖。

### 结论

**从运行体积角度很优秀，但属于中等到偏高成本重构。**

如果你愿意把“登录态管理”变成桌面层能力，而不是 server service，这会是长期更优雅的方向。

---

## 方案 F：截图二维码 DOM，再本地二维码解码

### 思路

无论通过浏览器/WebView 还是别的方式，只要能截到二维码图片，再用本地二维码解码库拿到内容。

### 结论

这不是独立替代方案，只是辅助策略。

当前实现里其实已经能直接拿到二维码图片 data URL，根本不需要“解码二维码内容”才能展示给用户扫码登录。核心问题仍然是：

> **谁来把二维码渲染出来。**

---

## 方案 G：保留现有 Playwright，但把二维码获取改成外部服务 / 启动前预取

### 思路

单独做一个轻服务或运维脚本，在别处跑浏览器，桌面端只拿二维码结果。

### 结论

对本地桌面应用不合适。

因为登录态本身是用户本地上下文，放到外部服务会带来：

- 安全边界变化；
- token/cookie 归属问题；
- 多用户隔离问题。

不建议。

---

## 实测与证据归纳

### 已证实事实 1：目标站点是 SPA 壳

直接抓 `https://baobao.getui.com/ghr/` 返回内容可见：

- 只有 `div#app`；
- 依赖多个 `static/js/*.js` bundle；
- 没有现成二维码节点内容。

这已经排除掉：

- Cheerio 直抓 HTML；
- 正则从初始文档中提二维码 URL。

### 已证实事实 2：当前二维码不是 OCR 方案，而是 DOM/CSS 提取方案

从 `baobao-login.ts` 可见：

- `.qr-code` 元素出现后读取 `window.getComputedStyle(element).backgroundImage`；
- 如果背景图是 URL，就直接拉图；
- 否则兜底截图。

所以真正必要的能力是：

- 执行页面 JS；
- 让 CSS/DOM 成形；
- 能读页面 storage/cookies。

### 已证实事实 3：当前 server build 已经显式把 Playwright 排除在二进制外

`packages/server/package.json`：

```json
"build": "bun build --compile --target=bun-darwin-arm64 --external playwright --external playwright-core --outfile ./dist/server src/index.ts"
```

这说明现状本来就在规避把 Playwright 打进 server 单文件二进制，但实际桌面端分发时，浏览器运行依赖仍然是问题。

### 已证实事实 4：二维码登录状态机已可被纯 HTTP 复现

用户补充的 `baobao.getui.com-6.har` 暴露了真实接口：

1. `POST /api/usercenter/user/getLoginInfo?t=...`
   - 未登录时返回 `401 Authorization Required`
2. `POST /api/mainpart/qr_code/getUuid?t=...`
   - 空请求体
   - 返回 `data.uuid = login_xxx`
3. `POST /api/mainpart/qr_code/getQrCodeStatus?t=...`
   - 请求体：`{"uuid":"login_xxx"}`
   - 返回：`status=no_scanned, portrait=null, oauth2Info=null`
4. 前端 bundle 中还能确认存在 `POST /api/mainpart/qr_code/delUuid`

我已在本机直接验证：

- 纯 HTTP 调用 `getUuid` 能成功拿到新 uuid；
- 紧接着纯 HTTP 调用 `getQrCodeStatus` 能成功拿到 `no_scanned` 状态；
- 这说明“二维码登录主状态机”本身并不依赖浏览器自动化。

当前剩余未完全打通的是：

- 二维码图片如何从 `uuid` 变成前端可展示内容；
- 扫码确认后如何把 `oauth2Info` 兑换成最终 token/cookie。

但相较最初判断，现在已经可以明确说：

> **拿 uuid + 轮询扫码状态 这两步已经可以完全脱离 Playwright/Chromium。**

### 已证实事实 5：二维码/头像类 base64 图片由接口直接返回，前端大概率只是展示

用户补充的信息指出，二维码原始文本形如：

- `getui_login_fb59cb74770f4f8a8b9dfd2b3e4a6345`

结合后续扫码成功抓包 `baobao.getui.com-7.har`，可以确认：

- 在 `POST /api/mainpart/qr_code/getQrCodeStatus` 的成功响应中，`data.portrait` 直接返回了完整的 `data:image/png;base64,...`；
- 同一响应里，状态已经变成 `confirm_logined`；
- 响应头还出现了 `m_token`。

这说明：

1. 页面里的 base64 图片并不一定是前端用二维码库现算出来的；
2. 至少在扫码成功阶段，接口本身就会直接下发 `data URL`；
3. 前端更像是把接口返回值绑定到页面，而不是自己本地把 `uuid` 编码成二维码图片。

同时我对前端 bundle 做了静态搜索：

- 能确认存在 `getUuid / getQrCodeStatus / delUuid` 三个接口封装；
- 没有发现明确的 `QRCode`、`toDataURL`、canvas 二维码生成逻辑；
- 也没有发现清晰的前端本地二维码编码库痕迹。

因此当前最合理的推断是：

> **二维码展示链路大概率是“后端生成图片（或 data URL） -> 接口返回 -> 前端直接展示”，而不是“前端根据 uuid 本地生成二维码”。**

## 方案对比结论

| 方案 | 可行性 | 轻量程度 | 实现成本 | 稳定性 | 结论 |
|---|---:|---:|---:|---:|---|
| Cheerio / 纯 HTML | 低 | 高 | 低 | 低 | 不可行 |
| jsdom / happy-dom | 低 | 中 | 高 | 低 | 不推荐 |
| 逆向二维码接口（纯 HTTP） | 很高 | 最高 | 中 | 很高 | **第一优先实现** |
| Playwright-core + 系统 Chrome | 高 | 中高 | 低中 | 高 | **最现实保底方案** |
| 连接用户 Chrome CDP | 中 | 高 | 中 | 中 | 适合开发，不适合普通用户 |
| Tauri WebView 抓码 | 高 | 高 | 中高 | 中高 | **长期优雅方案** |

## 最终建议

### 推荐结论（按优先级）

#### 结论 1：**不要把 Cheerio 当主替代方案**

不是因为它轻量不好，而是因为当前目标站点的二维码根本不在静态 HTML 里。对这个站点，Cheerio 没有足够信息可抓。

#### 结论 2：**最佳技术路线是“两阶段策略”**

### 第一阶段：优先纯 HTTP 实现（最轻）

这一步已经不再是“研究接口是否存在”，而是直接进入实现与补齐阶段：

- 已确认匿名可调用的 `getUuid`；
- 已确认用 `uuid` 轮询 `getQrCodeStatus`；
- 已确认还存在 `delUuid` 清理接口；
- 下一步只需继续补出二维码展示形式和扫码完成后的 token/cookie 兑换链路。

如果这两步补齐，就可以完全去掉浏览器依赖。

### 第二阶段：如果找不到二维码接口，落到 `playwright-core + 系统 Chrome` 或 `Tauri WebView`

在工程落地上，我更推荐：

1. **短期可交付**：`playwright-core + executablePath(system Chrome)`
   - 改动最小；
   - 复用现有全部逻辑；
   - 不再随应用分发 Chromium。

2. **中长期更优雅**：Tauri WebView 登录桥
   - 不依赖外部 Chrome；
   - 直接复用桌面系统 WebView；
   - 但要把登录链路从 server service 迁到 desktop/frontend bridge。

## 最终结论（一句话）

> **对抱抱这个登录页，Cheerio 级别的静态解析方案仍然不可行；但基于新的登录 HAR 和本机 PoC，纯 HTTP 方案已经被进一步打通——`getUuid` + `getQrCodeStatus` 可直接调用，而 `portrait` 也已证明会由接口直接返回 base64，因此当前最优路线已经是“继续完成纯 HTTP 登录链路”，只有在扫码确认后的登录态兑换这一步无法打通时，才退回 `playwright-core + 系统 Chrome`。**

## 建议的下一步验证任务

1. 从前端 bundle 或页面样式继续定位“二维码图片如何由 uuid 生成”；
2. 用 `delUuid` 验证二维码生命周期与刷新逻辑；
3. 抓一次“扫码成功后的 HAR”，重点看 `oauth2Info` 变化和 token/cookie 落地；
4. 完成纯 HTTP 登录 PoC；
5. 若第 1 或第 3 步卡死，再退回 `playwright-core + system Chrome`。

## 扫码成功后如何拿到有效登录凭据

基于 `baobao.getui.com-7.har` 与前端 bundle 反向分析，可以把登录凭据链路拆成下面几步：

### 1）轮询 `getQrCodeStatus`，等待状态从 `no_scanned` 变成 `confirm_logined`

关键接口：

- `POST /api/mainpart/qr_code/getQrCodeStatus`

请求体：

```json
{"uuid":"login_xxx"}
```

未扫码时返回：

```json
{
  "data": {
    "status": "no_scanned",
    "portrait": null,
    "oauth2Info": null
  }
}
```

扫码确认后返回：

```json
{
  "data": {
    "status": "confirm_logined",
    "portrait": "data:image/png;base64,...",
    "oauth2Info": null
  }
}
```

### 2）扫码确认成功的同一个响应头里，已经下发了第一阶段凭据：`m_token`

HAR 明确显示，在 `confirm_logined` 这次 `getQrCodeStatus` 响应头里出现了：

```http
m_token: node01vua1wz1albuw1i9kt337tm8tn15478
```

这意味着：

- 扫码成功并不是只靠页面内状态变化通知；
- 服务端在状态轮询接口返回成功时，已经把会话级凭据下发出来了。

### 3）随后请求 `getLoginInfo`，登录态已经变成有效

紧接着 HAR 里：

- `POST /api/usercenter/user/getLoginInfo`

从之前的 `401` 变成了 `200`，并返回完整用户信息。

这说明：

> **拿到 `m_token` 之后，当前会话已经足以让服务端识别“用户已登录”。**

### 4）前端最终持久化使用的业务凭据并不是 `m_token`，而是 `ghr-token`

从前端 bundle 里可以看到登录后的状态管理逻辑：

- 先调用 `getLoginInfo()` 取用户信息；
- 紧接着调用另一个函数；
- 返回值会被直接写入：

```js
sessionStorage.setItem("ghr-token", a)
```

也就是说，前端真正持续使用的业务 token 是：

- `ghr-token`

并且它被持久化在：

- `sessionStorage`

### 5）`ghr-token` 的来源，高概率是 `/usercenter/ghr/authentication`

同一个 bundle 模块中可以确认存在以下接口：

- `/usercenter/user/getLoginInfo`
- `/usercenter/ghr/authentication`
- `/mainpart/qr_code/getUuid`
- `/mainpart/qr_code/getQrCodeStatus`
- `/mainpart/qr_code/delUuid`
- `/push/device/getToken`

其中登录完成后立刻执行、并把结果写入 `sessionStorage.setItem("ghr-token", a)` 的那条调用，从命名和调用时机看，高概率就是：

- `POST /usercenter/ghr/authentication`

它最像“把扫码会话兑换成业务 JWT / 正式 API token”的接口。

### 6）因此，纯 HTTP 登录的最合理实现路径应该是

1. `POST /api/mainpart/qr_code/getUuid` → 得到 `uuid`
2. 轮询 `POST /api/mainpart/qr_code/getQrCodeStatus`
3. 当状态变成 `confirm_logined` 时，从响应头读取 `m_token`
4. 带着 `m_token` 调 `POST /api/usercenter/user/getLoginInfo`，验证登录成功
5. 再调用 `POST /api/usercenter/ghr/authentication`，换取最终 `ghr-token`
6. 用 `ghr-token` 作为后续业务接口里的 `x-token`

### 7）当前可以确认的“有效登录凭据”是两层结构

#### 第一层：扫码成功即生效的会话凭据

- `m_token`

来源：

- `getQrCodeStatus(confirm_logined)` 的响应头

作用：

- 让 `getLoginInfo` 从 401 变成 200
- 表示服务端已承认该扫码登录成功

#### 第二层：业务 API 使用的正式凭据

- `ghr-token`

来源：

- 登录成功后前端调用的后续认证接口（高概率是 `/usercenter/ghr/authentication`）

作用：

- 被写入 `sessionStorage`
- 后续业务 API 通过 `x-token` 使用
- 这也是 IMS 侧最适合持久化和复用的 token 形态

## 针对“如何实现登录”的最终结论

> **拿到二维码后，实现最终登录的关键不是只盯着二维码本身，而是：轮询到 `confirm_logined` → 抓取响应头里的 `m_token` → 用它打通 `getLoginInfo` → 再调用后续认证接口换出 `ghr-token` → 之后所有业务请求都走 `x-token: ghr-token`。**

## 下一步最关键的实证动作

 为了把"高概率推断"变成"完全证实"，下一步 PoC 应该是：

 1. 纯 HTTP 轮询到 `confirm_logined`
 2. 捕获响应头里的 `m_token`
 3. 带着同会话上下文调用 `getLoginInfo`
 4. 继续调用 `usercenter/ghr/authentication`
 5. 验证是否拿到可复用的 `ghr-token`

 只要第 4 步验证通过，纯 HTTP 登录链路就闭环了。

## 实现状态（2026-04-14）

 已完成 `packages/server/src/services/baobao-http-login.ts`：

 - `fetchQrUuid()` → UUID 获取
 - `pollQrStatus()` → 轮询直到确认（可配置超时）
 - `startHttpQrLogin()` → Phase 1：非阻塞获取 QR（立即返回）
 - `checkHttpLoginStatus()` → Phase 2：检查状态 + 4 策略 token 换取
 - `exchangeMTokenForGhrToken()` → 4 种策略尝试（Cookie m_token / JSESSIONID / Bearer / 无认证）
 - `getQrCodeText(uuid)` → 生成 `getui_{uuid}` 二维码文本

 已集成到 `baobao-login.ts`：

 - `fetchBaobaoLoginQrCode()` → 三层降级：DB 有效 token → HTTP QR → Playwright
 - `getBaobaoLoginSessionStatus()` → HTTP 状态检查 → Playwright fallback
 - `clearBaobaoLoginSession()` → 同时清理 HTTP 和 Playwright 状态

 **关键未知**：由于 `m_token` 是 Kong 下发的 HTTP-only cookie，Bun fetch 无法接收/发送，导致 `exchangeMTokenForGhrToken()` 在 Strategy 1-3 均可能失败。Strategy 4（无认证）在 HAR 中成功过，但 curl 测试返回 401（可能 session 已过期）。需要用真实扫码重新验证。
