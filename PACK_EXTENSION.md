# 如何将 Chrome 扩展打包为 .crx 文件

## 方法 1: 使用 Chrome 浏览器（推荐，最简单）

### 步骤：

1. **打开 Chrome 扩展管理页面**
   - 在 Chrome 地址栏输入：`chrome://extensions/`
   - 或者：菜单 → 更多工具 → 扩展程序

2. **启用开发者模式**
   - 在页面右上角，打开"开发者模式"开关

3. **打包扩展**
   - 点击"打包扩展程序"按钮
   - **扩展程序根目录**：选择 `/Users/liangqin/Downloads/lace-wallet/`
   - **私有密钥文件（可选）**：留空（首次打包会自动生成）
   - 点击"打包扩展程序"

4. **获取 .crx 文件**
   - 打包完成后，会在扩展目录的**上一级目录**（即 `/Users/liangqin/Downloads/`）生成：
     - `lace-wallet.crx` - 扩展文件
     - `lace-wallet.pem` - 私钥文件（保存好，用于后续更新）

5. **使用打包好的 .crx 文件**
   ```bash
   EXTENSIONS=/Users/liangqin/Downloads/lace-wallet.crx node dist/index.js https://sm.midnight.gd/wizard/mine
   ```

## 方法 2: 使用命令行工具（需要 Node.js）

### 安装 crx 打包工具

```bash
npm install -g crx
```

### 打包扩展

```bash
cd /Users/liangqin/Downloads
crx pack lace-wallet -o lace-wallet.crx
```

### 如果需要指定私钥（用于更新扩展）

```bash
# 首次打包（会自动生成私钥）
crx pack lace-wallet -o lace-wallet.crx

# 使用已有私钥打包
crx pack lace-wallet -o lace-wallet.crx -p lace-wallet.pem
```

## 方法 3: 使用 Chrome 命令行工具（需要 Chrome 浏览器）

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --pack-extension=/Users/liangqin/Downloads/lace-wallet --pack-extension-key=/path/to/key.pem
```

如果没有指定 `--pack-extension-key`，Chrome 会在扩展目录生成一个新的私钥。

## 注意事项

1. **私钥文件（.pem）**：首次打包会自动生成，请妥善保存。后续更新扩展时必须使用同一个私钥，否则会被 Chrome 视为不同的扩展。

2. **扩展 ID**：使用 .crx 文件安装后，扩展会有固定的 ID。如果重新打包（不使用原私钥），ID 会改变。

3. **Manifest V3**：确保扩展使用 Manifest V3（lace-wallet 应该已经是 V3）。

## 使用打包后的 .crx 文件

打包完成后，可以使用以下命令运行自动化脚本：

```bash
# 使用单个 .crx 文件
EXTENSIONS=/Users/liangqin/Downloads/lace-wallet.crx node dist/index.js https://sm.midnight.gd/wizard/mine

# 或者使用 npm 命令
EXTENSIONS=/Users/liangqin/Downloads/lace-wallet.crx npm start -- https://sm.midnight.gd/wizard/mine
```

## 验证 .crx 文件

可以在 Chrome 中手动安装 .crx 文件来验证：
1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 将 .crx 文件拖拽到 Chrome 窗口中
4. 确认扩展安装成功

