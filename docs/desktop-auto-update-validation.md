# 桌面端自动更新验证清单

这份文档对应 IMS 当前的 Tauri v2 自动更新链路，目标是把“代码已接线”变成“可以反复执行的升级验证流程”。

## 先决条件

在开始前，先确认以下条件：

1. 运行 `pnpm desktop:update:verify`
2. 输出中至少要满足：
   - `apps/desktop/tauri.conf.json` 存在 `plugins.updater`
   - `apps/desktop/capabilities/default.json` 包含 `updater:default`
   - `apps/web/src/views/SettingsView.vue` 已接入检查 / 安装 / 重启按钮
   - 远端 `latest.json` 可访问

如果脚本有 `FAIL`，先修复后再继续升级验证。

---

## 一、标准线上验证流程

这是最接近真实用户环境的验证方式。

### Step 1：准备一个旧版本应用

先保留当前线上版本的安装包，并安装到 `/Applications/IMS.app`。

如果你已经有旧版本，直接跳过；如果没有，可以从 GitHub Releases 下载历史包安装。

### Step 2：提升版本号

把以下文件的版本统一改成新版本号，例如 `1.0.3`：

- `package.json`
- `apps/web/package.json`
- `apps/desktop/package.json`
- `packages/server/package.json`
- `packages/shared/package.json`
- `apps/desktop/tauri.conf.json`
- `apps/desktop/Cargo.toml`

建议先跑一次：

```bash
pnpm release:check
```

### Step 3：构建正式桌面包

> 不要使用 `build:desktop:local`，因为 `tauri.local.conf.json` 明确禁用了 updater artifacts。

```bash
pnpm build:desktop
```

这一步必须生成 updater artifacts。

### Step 4：触发 GitHub Release

```bash
git add .
git commit -m "release: v1.0.3"
git tag v1.0.3
git push origin HEAD
git push origin v1.0.3
```

GitHub Actions 会执行 `.github/workflows/release-desktop.yml`，产出新安装包和 `latest.json`。

### Step 5：在旧版本里检查更新

打开旧版本 IMS：

1. 进入 **设置页**
2. 点击 **检查更新**
3. 应显示检测到新版本
4. 点击 **安装更新**
5. 安装完成后点击 **立即重启**

### Step 6：验证升级结果

验证点：

1. 应用能正常重启
2. 版本号已经变为新版本
3. 主流程（登录 / 候选人列表 / 导入 / LUI）能正常打开
4. 再次点击“检查更新”时应提示已是最新版本

---

## 二、本地升级演练方式

如果你不想每次都发正式 release，可以做“本地演练”，目标是验证：

- 权限是否放通
- Settings 页按钮是否正常 invoke
- 构建产物是否包含 updater 元数据

### 方式 A：本机构建链路排查

适合快速确认项目本身有没有断链。

```bash
pnpm desktop:update:verify
pnpm build:desktop
```

然后检查：

1. `apps/desktop/target/release/bundle/` 下是否有打包产物
2. 对应 release 目录里是否包含 updater 相关元数据
3. 桌面端 Settings 页里的 3 个按钮是否都能触发，不会出现权限报错

这一步不能完整模拟“旧版本检测到新版本”，但能快速确认本地构建和 invoke 链路。

### 方式 B：staging 仓库 / staging release 演练

如果你想完整走一遍“旧版本 → 检查更新 → 安装 → 重启”，但又不想污染正式发布，建议：

1. 使用一个 staging 仓库，或者
2. 使用独立的 staging release/tag 约定

然后把 updater endpoint 指向 staging 的 `latest.json`，这样可以重复演练完整升级流程。

---

## 三、常见失败点

### 1. 点击“检查更新”直接报错

先检查：

- `apps/desktop/capabilities/default.json` 是否包含 `updater:default`
- Settings 页是否运行在桌面环境而不是纯浏览器环境

### 2. 本地 build 成功，但没有 updater 产物

通常是用了：

```bash
pnpm build:desktop:local
```

这条命令会走 `tauri.local.conf.json`，其中：

```json
"createUpdaterArtifacts": false
```

所以它不会生成自动更新所需产物。

### 3. 远端 `latest.json` 404

说明新的 release 还没有正确生成 updater manifest，或者 GitHub Actions 未完成。

### 4. 检测到更新但安装失败

重点检查：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- 发布产物签名是否成功

---

## 四、推荐命令清单

```bash
# 先做静态验证
pnpm desktop:update:verify

# 做正式桌面构建（会生成 updater artifacts）
pnpm build:desktop

# 发布前再做一致性检查
pnpm release:check
```

如果你后面想继续把“本地完整升级演练”自动化，我建议下一步再补一个 staging updater 配置和一套专门的 `desktop:update:staging` 脚本。这样就能在不碰正式 release 的前提下，完整演练升级路径。
