# 标签打印软件 (Tape Printer)

一款基于 Electron 的桌面端标签打印与库存管理软件，支持产品信息管理、条形码/二维码生成、标签打印、出入库管理等功能。

## 功能概览

- **标签打印** — 选择产品后自动生成含条形码/二维码的标签，支持大标签和小标签两种规格，可直接调用系统打印机打印
- **入库管理** — 搜索产品并录入入库数量和备注
- **出库管理** — 搜索产品并录入出库数量和备注，自动校验库存是否充足
- **库存查看** — 查看所有产品的实时库存数量，支持手动调整库存
- **数据管理** — 产品数据的增删改查，支持从 Excel（.xlsx / .xls / .csv）批量导入

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 框架 | Electron 22（兼容 Windows 7）+ electron-vite 5 |
| 前端 | React 19 + TypeScript 5.9 |
| UI 组件 | Ant Design 6 |
| 数据库 | SQLite（better-sqlite3） |
| 条形码 | JsBarcode |
| 二维码 | qrcode |
| Excel 解析 | SheetJS (xlsx) |
| 打包工具 | electron-builder |

## 跨平台支持

本软件**同时支持 macOS、Windows 和 Linux** 三个平台。`electron-builder.yml` 中已配置好各平台的打包目标：

| 平台 | 安装包格式 | 说明 |
| --- | --- | --- |
| macOS | `.dmg` | 标准 macOS 磁盘映像 |
| Windows | `.exe`（NSIS 安装器） | 支持自定义安装路径，**兼容 Windows 7**（Electron 22） |
| Linux | `.AppImage` | 免安装，双击即可运行 |

> 注意：打包时默认为**当前操作系统**生成安装包。如需交叉编译（如在 Mac 上打 Windows 包），需要额外配置，详见下文。

---

## 开发环境搭建

### 1. 前置要求

#### 所有平台通用

- **Node.js** >= 18（推荐 20 LTS）
- **npm** >= 9（随 Node.js 一同安装）
- **Git**（用于版本管理）

检查版本：

```bash
node -v    # 期望 v18.x 或更高
npm -v     # 期望 9.x 或更高
```

#### macOS 额外要求

- **Xcode Command Line Tools**（编译 `better-sqlite3` 原生模块需要）

```bash
xcode-select --install
```

#### Windows 额外要求

- **Visual Studio Build Tools** 或 **Visual Studio**（编译 `better-sqlite3` 原生模块需要 C++ 编译器）

最简单的安装方式：

```bash
# 以管理员身份运行 PowerShell
npm install -g windows-build-tools
```

或者手动安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，安装时勾选「使用 C++ 的桌面开发」工作负载。

- **Python 3**（编译 `better-sqlite3` 等原生模块时需要。若仅打包且不关心数据库功能，可在 `electron-builder.yml` 中保持 `npmRebuild: false` 跳过编译）

#### 打包为 Windows 7 可用安装包

当前项目已配置为 **Electron 22**（最后支持 Windows 7/8/8.1 的版本），直接执行 `npm run dist:win` 或 `npm run dist:win7` 即可生成兼容 Win7 的安装包，输出在 `dist/` 目录（如 `标签打印软件 Setup 1.0.0.exe`）。若需确保数据库功能在 Win7 上正常，请在本机安装 Python 与 Visual Studio Build Tools 后，将 `electron-builder.yml` 中的 `npmRebuild` 改为 `true` 或删除该配置，再执行 `npm install` 与 `npm run dist:win`。

#### Linux 额外要求

```bash
# Debian / Ubuntu
sudo apt-get install build-essential python3

# Fedora
sudo dnf groupinstall "Development Tools"
```

### 2. 安装依赖

```bash
# 克隆项目
git clone <仓库地址>
cd tapePrinter

# 安装依赖（会自动执行 postinstall 编译原生模块）
npm install
```

> `better-sqlite3` 是 C++ 原生模块，`npm install` 时会自动编译。如果编译失败，请确认上述平台编译工具已正确安装。

### 3. 启动开发模式

```bash
npm run dev
```

该命令使用 `electron-vite` 启动开发服务器，渲染进程支持热更新（HMR），修改前端代码后会自动刷新。

### 4. 构建与打包

```bash
# 仅构建（不打包安装器）
npm run build

# 构建并生成未打包的可执行文件（用于测试）
npm run pack

# 构建并生成安装包（.dmg / .exe / .AppImage）
npm run dist
```

---

## 在不同操作系统上运行

### macOS

1. 安装 Node.js 和 Xcode Command Line Tools
2. `npm install` → `npm run dev` 即可启动开发环境
3. `npm run dist` 生成 `.dmg` 安装包，双击挂载后拖入「应用程序」文件夹即可使用

### Windows

1. 安装 Node.js 和 Visual Studio Build Tools（或运行 `npm install -g windows-build-tools`）
2. `npm install` → `npm run dev` 即可启动开发环境
3. `npm run dist` 生成 NSIS `.exe` 安装器，运行后按向导安装

> **Windows 常见问题**：
> - 如果 `npm install` 报 `node-gyp` 相关错误，说明 C++ 编译环境未配置好，请检查 Visual Studio Build Tools 是否安装
> - 如果遇到 PowerShell 执行策略限制，可尝试以管理员身份运行：`Set-ExecutionPolicy RemoteSigned`

### Linux

1. 安装 Node.js 和编译工具（`build-essential`、`python3`）
2. `npm install` → `npm run dev` 即可启动开发环境
3. `npm run dist` 生成 `.AppImage` 文件，添加执行权限后即可运行：

```bash
chmod +x dist/标签打印软件-1.0.0.AppImage
./dist/标签打印软件-1.0.0.AppImage
```

---

## 项目结构

```
tapePrinter/
├── electron-builder.yml        # electron-builder 打包配置
├── electron.vite.config.ts     # electron-vite 构建配置
├── package.json
├── tsconfig.json
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 应用入口，创建窗口
│   │   ├── database.ts         # SQLite 数据库操作（产品、库存、出入库记录）
│   │   └── ipc-handlers.ts     # IPC 通信处理器（主进程 API）
│   ├── preload/                # 预加载脚本
│   │   ├── index.ts            # contextBridge 暴露 API 给渲染进程
│   │   └── index.d.ts          # 类型声明
│   └── renderer/               # 渲染进程（前端 React 应用）
│       ├── index.html
│       └── src/
│           ├── App.tsx          # 应用根组件（侧边栏导航 + 页面路由）
│           ├── main.tsx         # React 入口
│           ├── pages/
│           │   ├── PrintPage.tsx     # 标签打印页
│           │   ├── StockInPage.tsx   # 入库页
│           │   ├── StockOutPage.tsx  # 出库页
│           │   ├── StockPage.tsx     # 库存查看页
│           │   └── DataPage.tsx      # 数据管理页
│           ├── components/
│           │   ├── LabelLarge.tsx    # 大标签组件
│           │   ├── LabelSmall.tsx    # 小标签组件
│           │   ├── ProductForm.tsx   # 产品表单组件
│           │   └── ImportModal.tsx   # Excel 导入弹窗
│           ├── styles/
│           │   ├── global.css       # 全局样式
│           │   └── label-print.css  # 标签打印样式
│           └── assets/              # 静态资源（logo、印章图片等）
```

## 数据存储

- 数据库文件：SQLite 数据库自动存储在系统用户数据目录下
  - macOS：`~/Library/Application Support/tape-printer/tape-printer.db`
  - Windows：`%APPDATA%/tape-printer/tape-printer.db`
  - Linux：`~/.config/tape-printer/tape-printer.db`
- 数据库采用 WAL 模式以提升读写性能
- 首次启动时自动创建数据库和表结构，无需手动配置

## NPM 脚本说明

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（支持热更新） |
| `npm run build` | 构建生产版本到 `out/` 目录 |
| `npm run pack` | 构建 + 打包为可执行文件（不生成安装器，用于快速测试） |
| `npm run dist` | 构建 + 生成平台对应的安装包 |

## 注意事项

1. **原生模块编译**：`better-sqlite3` 需要 C++ 编译器，请确保开发环境中已安装对应平台的编译工具
2. **Electron 版本**：项目使用 Electron 40，如需升级请注意 API 兼容性
3. **交叉编译**：electron-builder 支持在一个平台上为其他平台打包，但 `better-sqlite3` 等原生模块需要对应平台的预编译二进制文件。建议在目标平台上直接打包
4. **打印功能**：标签打印依赖系统打印服务，请确保已连接并配置好打印机
