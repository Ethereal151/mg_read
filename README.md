<div align="center">

<img src="./assets/branding/mg_read_logo.png" width="120" alt="MgRead Logo">

# MgRead

### 阅读，自由一点。

**一个本地优先、可安装数据源、面向多种内容形态的跨平台阅读器。**

小说 · 漫画 · 音频 · 视频 · Android · Windows · macOS

<br>

[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![Dart](https://img.shields.io/badge/Dart-3.x-0175C2?logo=dart&logoColor=white)](https://dart.dev/)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js%2024-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Windows%20%7C%20macOS-4F7CFF)](#-支持平台)
[![GitHub stars](https://img.shields.io/github/stars/lingy-Mg/mg_read?style=flat&logo=github)](https://github.com/lingy-Mg/mg_read/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/lingy-Mg/mg_read)](https://github.com/lingy-Mg/mg_read/commits/main)

[快速开始](#-快速开始) · [核心能力](#-核心能力) · [数据源](#-数据源与扩展) · [开发文档](#-开发入口) · [GitHub](https://github.com/lingy-Mg/mg_read)

</div>

---

## ✨ MgRead 是什么？

MgRead 是一款 **本地优先（Local-first）** 的 Flutter 阅读应用。

它不把在线内容入口固定在主应用里，而是通过 **可安装数据源** 扩展内容来源。主应用负责统一的书架、搜索、详情、阅读、播放与本地持久化，数据源负责连接不同内容服务。

> **一个应用，统一管理小说、漫画、音频和视频。**

### 为什么做 MgRead？

- **本地优先**：书架、阅读进度和业务数据由本地应用掌控。
- **数据源可扩展**：内容入口不写死，可以按需安装和开发数据源。
- **多内容形态**：小说、漫画、音频、视频使用独立阅读器/播放器。
- **跨平台**：面向 Android、Windows 和 macOS，其中 Android 优先。
- **开放开发**：Runtime、阅读器、播放器和数据源均按独立模块维护。

---

## 🚀 快速开始

### 普通用户

MgRead 的使用流程很简单：

```text
安装 MgRead
    ↓
安装 / 启用数据源
    ↓
搜索或发现内容
    ↓
加入书架
    ↓
开始阅读 / 收听 / 播放
```

> 当前仓库仍处于持续开发阶段。正式安装包发布后会通过 GitHub Releases 提供。

### 开发者本地运行

确保本机已配置 Flutter 环境：

```powershell
flutter pub get
flutter run
```

---

## 🌟 核心能力

| 能力 | 说明 |
| --- | --- |
| 📚 **统一书架** | 管理内容、阅读进度和本地业务数据 |
| 🧩 **可安装数据源** | 通过独立数据源扩展在线内容入口 |
| 🔎 **搜索与发现** | 数据源提供发现、搜索、详情和目录能力 |
| 📖 **小说阅读** | 独立小说阅读器与阅读进度模型 |
| 🖼️ **漫画阅读** | 独立漫画阅读体验与图片资源代理 |
| 🎧 **音频播放** | 支持独立音频播放器与后台播放能力 |
| 🎬 **视频播放** | 独立视频播放器与按需播放资源解析 |
| 💾 **本地优先** | 主应用拥有书架、目录、进度等业务权威 |
| 🔄 **局域网同步** | 支持可信设备之间的前台点对点同步 |
| 🖥️ **跨平台** | Android / Windows / macOS |

---

## 🧩 数据源与扩展

MgRead 的核心设计之一是 **主应用与内容来源解耦**。

```text
数据源
  │
  ├─ discover
  ├─ search
  ├─ getDetail
  ├─ getChapters
  └─ getContent
       │
       ▼
MgRead Runtime
       │
       ▼
Flutter 主应用
       │
       ├─ 书架
       ├─ 小说阅读器
       ├─ 漫画阅读器
       ├─ 音频播放器
       └─ 视频播放器
```

数据源采用 Node.js 24 ESM 项目形式，`package.json.mgread` 作为 MgRead 元数据入口。

数据源发布为单个 `.mgplugin.js`，或包含单个 JS、元数据与图标的 `.mgplugin` 压缩包。开发时使用的第三方
npm 包必须在构建时打入 JS，发布后只使用 Node.js 内置模块，不需要下载或安装 npm 依赖。

`main` 分支的数据源或共享 Source 包变化后，
[数据源合集工作流](https://github.com/lingy-Mg/mg_read/actions/workflows/source-collection.yml)会生成可直接下载的
`mgread-sources.mgplugins` 合集。它包含仓库中可发布的 Node 数据源，不包含原生数据源。在 App 的
“添加数据源”中选择“导入数据源合集”，即可勾选要新增或覆盖更新的来源；现有来源会显示版本供确认。

仓库中的真实数据源位于：

```text
plugins/sources/
```

默认参考实现：

```text
plugins/sources/aisishuwu/
```

开发期可以使用纯 Node.js 测试工具直接验证数据源：

👉 [mg_read_source_testkit](packages/mg_read_source_testkit/README.md)

---

## 💻 支持平台

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| **Android** | 🟢 主要平台 | 当前优先开发与验证 |
| **Windows** | 🟢 支持 | 桌面 Runtime、阅读器与播放器 |
| **macOS** | 🟢 支持 | arm64 Runtime 与桌面能力 |
| **iOS** | ⚪ 暂未作为首发平台 | 后续可继续适配 |

---

## 🏗️ 项目结构

```text
mg_read/
├─ lib/                                Flutter 主应用
│
├─ packages/
│  ├─ mg_read_node_runtime/            Node.js Runtime Core
│  ├─ mgread_plugin_runtime/           Flutter Runtime Facade / 平台宿主
│  ├─ mg_read_reader_ui/               小说 / 漫画阅读器
│  ├─ mg_read_audio_player/            音频播放器
│  ├─ mg_read_video_player/            视频播放器
│  └─ mg_read_source_testkit/          数据源开发测试工具
│
├─ plugins/
│  └─ sources/                         数据源项目
│
├─ assets/                             Logo、插图及应用资源
├─ docs/                               核心开发规范
├─ android/
├─ windows/
└─ macos/
```

整体依赖方向：

```text
Flutter App
    │
    ├── Reader UI
    ├── Audio Player
    ├── Video Player
    │
    ▼
Runtime Facade
    │
    ▼
Node.js Runtime
    │
    ▼
Installed Sources
```

---

## 🧪 Windows 数据源自检

Windows App 内置正式 Runtime 数据源检测能力，可在：

**我的 → 管理数据源**

中检测全部已启用来源，也可以进入单个数据源详情执行检测。

自动化场景可以通过发布 bundle 中的 CLI 入口调用：

```powershell
.\mg_read_cli.exe --source-check=org.mgread.aisishuwu
.\mg_read_cli.exe --source-check-all
```

退出码：

| Code | 含义 |
| ---: | --- |
| `0` | 全部通过 |
| `1` | 检测完成，但包含失败 |
| `2` | 内部错误 |
| `3` | 需要人工交互 |
| `4` | 参数错误或平台不支持 |

<details>
<summary><strong>自检说明</strong></summary>

CLI 会等待完整链路测试结束后退出。

检测过程会经过正式 Runtime，覆盖发现、搜索、详情、完整目录、首/中/末内容和资源代理，不依赖 Flutter 测试框架。

`stdout` 输出普通测试过程、完整解码结果与日志，`stderr` 输出错误。

</details>

---

## 📖 开发入口

如果你准备参与 MgRead 开发，建议从以下入口开始：

| 文档 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 仓库开发与 AI Agent 入口规范 |
| [docs/development/README.md](docs/development/README.md) | 开发文档最小路由 |
| [docs/core.md](docs/core.md) | 跨模块核心规范 |
| [Source Testkit](packages/mg_read_source_testkit/README.md) | 数据源测试工具 |

当前实现事实以 **公开类型、源码文件头和直接测试** 为准。

---

## 🤝 参与项目

欢迎通过 GitHub 参与 MgRead：

- ⭐ 如果项目对你有帮助，可以点一个 Star
- 🐛 发现问题可以提交 [Issue](https://github.com/lingy-Mg/mg_read/issues)
- 💡 新功能建议也可以通过 Issue 讨论
- 🔧 欢迎提交 Pull Request
- 🧩 也欢迎开发新的数据源与扩展能力

---

## ⚠️ 说明

MgRead 的定位是 **阅读应用、运行时与数据源扩展平台**。

不同数据源所连接的内容、服务和访问权限由对应数据源及其目标服务决定。使用者应自行确认相关内容来源、服务条款与当地法律要求。

---

<div align="center">

### MgRead

**阅读，自由一点。**

[回到顶部](#mgread)

</div>
