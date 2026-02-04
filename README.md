# Jp-Linker 游戏海外客服 AI 助手

截屏/粘贴图片 → 本地识别/梳理 → 本地知识库注入 → 中文输入 → 本地日文翻译（含敬语控制） → 本地释义/意图/回复建议。

## 环境要求

- Node.js 18+
- Windows / macOS（已支持粘贴图片）

## 首次使用

1. 安装依赖：`npm install`
2. 开发模式（先起 Vite，再起 Electron）：
   - 终端一：`npm run dev`
   - 终端二：`APP_DEV=1 npm run electron`  
   或一条命令：`npm run app`
3. 生产运行（先构建再打开）：`npm run start`

## 操作说明

- **截屏**：按 `Alt+Q`，框选玩家提问区域后松开鼠标确认，Esc 取消。
- **粘贴图片**：点击顶栏「粘贴图片」或 `Cmd+Shift+V / Ctrl+Shift+V`，可直接粘贴 Snipaste 等截图。
- **知识库**：点击「选择文件夹」指定存放 `.xlsx` 的目录，支持「刷新」重新加载。
- **翻译**：右侧输入中文，约 500ms 防抖后用本地模型生成日文；可切换语气（丁寧 / 謙譲 / 親密），日文预览下方可「一键复制」。
- **OCR 梳理**：顶栏选择「OCR 梳理」可把错行/乱序的识别结果用 AI 整理成通顺日文：
  - **关**：不梳理，直接显示原始 OCR。
  - **本地 Ollama**：用本机 Ollama 做梳理（无需 API、延迟低）。选此项后需填写 Ollama 地址（默认 `http://localhost:11434`）和模型名。
  - **LM Studio**：用 LM Studio 文字模型做梳理（同样本地）。

## 本地模型建议（M3 Max 64G）

若使用「OCR 梳理：本地 Ollama」，建议先安装 [Ollama](https://ollama.com)，再拉取一款日文/多语小模型，例如：

- **qwen2.5:7b**：多语与日文表现好，显存占用适中。
- **llama3.2:3b**：体积小、速度快，适合先出结果。
- **gemma2:9b**：质量与速度折中。

安装示例：`ollama run qwen2.5:7b`。在顶栏「模型名」中填写 `qwen2.5:7b` 即可。

## 当前已完成

- 本地图片识别：Tesseract / Ollama VLM / LM Studio VLM
- 本地 OCR 梳理：Ollama / LM Studio
- 本地翻译：Ollama / LM Studio（中→日，带语气）
- 本地深度分析：中文释义 / 意图 / 回复建议（Ollama / LM Studio）
- LM Studio 模型检测：`/v1/models` 拉取并在下拉框选择
- 粘贴图片输入：按钮 + `Cmd+Shift+V / Ctrl+Shift+V`
- 知识库：仅支持 `.xlsx`，可刷新加载

## 未完成 / 待优化

- 翻译风格细化：严格直译、游戏名原名 + 平假名标注
- 深度分析意图分类的可配置标签体系
- 质量评估与置信度提示（避免错误回复）
- 截屏稳定性（跨平台一致体验）

## 项目结构

- `electron/`：Electron 主进程、截屏选区窗口、IPC。
- `src/`：React 前端与本地模型/知识库调用。

## 技术栈

- Electron + Vite + React + TypeScript + Tailwind
- 本地推理：LM Studio / Ollama（可选 VLM + 文字模型）
- 知识库仅支持 `.xlsx`（首版）
