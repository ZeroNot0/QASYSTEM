const { BrowserWindow, screen } = require('electron');
const screenshot = require('screenshot-desktop');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const fetch = require('node-fetch');

const isMac = process.platform === 'darwin';

/** 截取全屏，返回 Buffer (PNG) */
async function captureFullScreen() {
  if (isMac) {
    const tmpPath = path.join(os.tmpdir(), `monitor_${Date.now()}.png`);
    const result = spawnSync('screencapture', ['-x', tmpPath], { stdio: 'inherit', shell: false });
    if (result.status !== 0 || !fs.existsSync(tmpPath)) {
      throw new Error('macOS screencapture failed');
    }
    const buf = fs.readFileSync(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return buf;
  }
  const img = await screenshot({ format: 'png' });
  return Buffer.isBuffer(img) ? img : Buffer.from(img);
}

class MonitorManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isMonitoring = false;
    this.config = null;
    this.intervalId = null;
    this.dbPath = path.join(__dirname, '../data/messages.json');
    this.alertsPath = path.join(__dirname, '../data/alerts.json');
    this.messages = [];
    this.alerts = [];
    this.lastAlertTime = new Map(); // 用于防止重复报警
    this.nextMessageId = 1;
    this.nextAlertId = 1;
    this.overlayWindow = null;
    this.seenMessageKeys = new Set(); // 去重：发言玩家+发言时间+发言内容 均相同则不再入库
    this.alertSentKeys = new Set();   // 告警去重：同玩家+同时间+同内容只发一封邮件
    this.initDatabase();
  }

  /** 规范化字符串（去首尾、多空格压成单空格），便于去重 */
  normalizeForDedup(s) {
    return String(s || '').trim().replace(/\s+/g, ' ');
  }

  /** 生成去重 key：玩家|时间|内容 */
  messageDedupKey(nickname, messageTime, content) {
    return `${this.normalizeForDedup(nickname)}|${this.normalizeForDedup(messageTime)}|${this.normalizeForDedup(content)}`;
  }

  /** LLM 归类：讨论主题 + 谈论情绪，返回 { topic, sentiment } */
  async classifyMessage(content) {
    if (!content || !content.trim()) return { topic: '其他', sentiment: '中性' };
    const prompt = `Classify this game chat message (may be in Japanese). Output JSON only, no other text:
{"topic":"BUG|游戏玩法|抱怨|其他", "sentiment":"积极|中性|消极"}
Message: ${content.slice(0, 500)}`;
    try {
      const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'allenai/olmocr-2-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 120
        })
      });
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      const m = text.match(/\{[^}]+\}/);
      if (m) {
        const o = JSON.parse(m[0]);
        const topic = ['BUG', '游戏玩法', '抱怨', '其他'].includes(o.topic) ? o.topic : '其他';
        const sentiment = ['积极', '中性', '消极'].includes(o.sentiment) ? o.sentiment : '中性';
        return { topic, sentiment };
      }
    } catch (e) {
      console.error('Classify error:', e);
    }
    return { topic: '其他', sentiment: '中性' };
  }

  initDatabase() {
    const dataDir = path.dirname(this.dbPath);
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 加载现有数据
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.messages = data.messages || [];
        this.nextMessageId = data.nextId || 1;
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      this.messages = [];
      this.nextMessageId = 1;
    }

    try {
      if (fs.existsSync(this.alertsPath)) {
        const data = JSON.parse(fs.readFileSync(this.alertsPath, 'utf8'));
        this.alerts = data.alerts || [];
        this.nextAlertId = data.nextId || 1;
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
      this.alerts = [];
      this.nextAlertId = 1;
    }

    console.log('Database initialized with JSON storage');
  }

  saveMessages() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify({
        messages: this.messages,
        nextId: this.nextMessageId
      }, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save messages:', error);
    }
  }

  saveAlerts() {
    try {
      fs.writeFileSync(this.alertsPath, JSON.stringify({
        alerts: this.alerts,
        nextId: this.nextAlertId
      }, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save alerts:', error);
    }
  }

  async selectArea() {
    return new Promise(async (resolve) => {
      try {
        const buf = await captureFullScreen();
        const sharp = require('sharp');
        const maxWidth = 1920;
        const meta = await sharp(buf).metadata();
        const origW = meta.width || 1920;
        const origH = meta.height || 1080;
        const needResize = origW > maxWidth;
        const outW = needResize ? maxWidth : origW;
        const outH = needResize ? Math.round((origH * maxWidth) / origW) : origH;
        const outBuf = needResize
          ? await sharp(buf).resize(outW, outH).png().toBuffer()
          : buf;
        const base64 = outBuf.toString('base64');

        const cropWindow = new BrowserWindow({
          fullscreen: true,
          frame: false,
          transparent: false,
          alwaysOnTop: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-crop.js')
          }
        });

        cropWindow.loadFile(path.join(__dirname, 'crop.html'));
        
        cropWindow.webContents.on('did-finish-load', () => {
          cropWindow.webContents.send('screenshot-data', base64);
          cropWindow.webContents.send('set-mode', 'monitor');
        });

        cropWindow.webContents.on('ipc-message', (event, channel, ...args) => {
          const payload = args && args.length > 0 ? args[0] : undefined;
          if (channel === 'screenshot-selected') {
            console.log('Area selected:', payload);
            cropWindow.close();

            if (payload && typeof payload === 'object' && payload.x !== undefined) {
              // 选区坐标是缩小图上的，换算回全屏尺寸
              const scaleX = origW / outW;
              const scaleY = origH / outH;
              resolve({
                x: Math.round(payload.x * scaleX),
                y: Math.round(payload.y * scaleY),
                width: Math.round(payload.width * scaleX),
                height: Math.round(payload.height * scaleY)
              });
            } else {
              console.error('Invalid area data:', payload);
              resolve(null);
            }
          } else if (channel === 'screenshot-cancel') {
            cropWindow.close();
            resolve(null);
          }
        });
      } catch (error) {
        console.error('Area selection failed:', error);
        resolve(null);
      }
    });
  }

  showOverlay(area, showOverlay = false) {
    if (this.overlayWindow) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
    // 默认不显示红框 overlay，避免透明窗口在某些系统上黑屏；仅做区域持续截屏
    if (!showOverlay) {
      console.log('Overlay disabled, area saved for capture:', area);
      return;
    }

    this.overlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width: screen.getPrimaryDisplay().bounds.width,
      height: screen.getPrimaryDisplay().bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });

    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    this.overlayWindow.setIgnoreMouseEvents(true);
    this.overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

    this.overlayWindow.webContents.on('did-finish-load', () => {
      this.overlayWindow.webContents.send('set-bounds', area);
    });

    console.log('Overlay window created for area:', area);
  }

  hideOverlay() {
    if (this.overlayWindow) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
  }

  async startMonitor(config) {
    if (this.isMonitoring) {
      console.log('Monitor already running');
      return;
    }

    this.config = config;
    this.isMonitoring = true;
    console.log('Starting monitor with config:', config);

    // 点击「开始」时立即建表：当前小时的 Excel，若同名已存在则后续在其上追加
    const now = new Date();
    await this.ensureHourlySheetExists(now);
    const excelPath = this.getHourlyExcelPath(now);
    console.log('Excel table ready:', excelPath);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('monitor-excel-ready', { path: excelPath });
    }

    // 启动后先立即截一次，再按间隔定时
    setImmediate(() => {
      if (!this.isMonitoring) return;
      this.captureAndProcess().catch(err => console.error('First capture error:', err));
    });
    this.scheduleScreenshot();
  }

  stopMonitor() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    this.hideOverlay();
    // 表在每次有新消息时已写入磁盘，结束时刻提示保存位置
    const pathForLog = this.getHourlyExcelPath(new Date());
    console.log('Monitor stopped. Table saved at:', pathForLog);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('monitor-stopped', { excelPath: pathForLog });
    }
  }

  scheduleScreenshot() {
    if (!this.isMonitoring) return;

    this.intervalId = setTimeout(async () => {
      try {
        await this.captureAndProcess();
      } catch (error) {
        console.error('Screenshot processing error:', error);
      }

      // 继续下一次截屏
      this.scheduleScreenshot();
    }, this.config.interval * 1000);
  }

  async captureAndProcess() {
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      const screenshotDir = path.join(__dirname, '../screenshots');
      
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const screenshotPath = path.join(screenshotDir, `monitor_${timestamp}.png`);

      console.log('Taking screenshot of area:', this.config.area);
      const fullScreenshot = await captureFullScreen();

      // 使用 sharp 裁剪指定区域
      const sharp = require('sharp');
      await sharp(fullScreenshot)
        .extract({
          left: this.config.area.x,
          top: this.config.area.y,
          width: this.config.area.width,
          height: this.config.area.height
        })
        .png()
        .toFile(screenshotPath);
      
      console.log('Screenshot saved:', screenshotPath);

      await this.ensureHourlySheetExists(now);

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('monitor-stats', {
          lastScreenshot: now.toLocaleTimeString('zh-CN')
        });
        // 发缩略图到前端，在软件下方显示“截好屏了”
        try {
          const thumb = await sharp(fs.readFileSync(screenshotPath))
            .resize(400, null, { withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          this.mainWindow.webContents.send('monitor-screenshot', {
            thumbnailBase64: thumb.toString('base64'),
            time: now.toLocaleTimeString('zh-CN')
          });
        } catch (e) {
          console.error('Thumbnail send error:', e);
        }
      }

      const messages = await this.extractMessages(screenshotPath);
      if (!messages || messages.length === 0) return;

      const newRecords = [];

      try {
        for (const msg of messages) {
          const key = this.messageDedupKey(msg.nickname, msg.messageTime, msg.content);
          if (this.seenMessageKeys.has(key)) continue;
          this.seenMessageKeys.add(key);

          const { topic, sentiment } = await this.classifyMessage(msg.content);
          const isAlert = sentiment === '消极';
          const record = {
            ...msg,
            topic,
            sentiment,
            isAlert
          };

          const msgId = this.saveMessage(record, screenshotPath);
          const extractedAt = record.extractedAt || new Date().toLocaleString('zh-CN');
          newRecords.push({ id: msgId, ...record, extractedAt });

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('monitor-message', {
              id: msgId,
              ...record
            });
          }

          if (isAlert) {
            await this.handleAlert(msgId, record);
            const alertKey = this.messageDedupKey(record.nickname, record.messageTime, record.content);
            if (!this.alertSentKeys.has(alertKey)) {
              this.alertSentKeys.add(alertKey);
              await this.sendAlertEmail(msgId, record);
            } else {
              console.log('Duplicate alert skipped (same player+time+content):', alertKey.slice(0, 60));
            }
          }
        }
      } finally {
        if (newRecords.length > 0) {
          await this.appendToHourlyExcel(newRecords, now, screenshotPath);
        }
      }

    } catch (error) {
      console.error('Capture and process error:', error);
    }
  }

  async extractMessages(imagePath) {
    try {
      const sharp = require('sharp');
      const imageBuffer = fs.readFileSync(imagePath);
      const meta = await sharp(imageBuffer).metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      // 最长边 1024 + JPEG：降低 LM Studio / llama.cpp “failed to process image” 概率（显存/解码限制）
      const maxSide = 1024;
      const needResize = w > maxSide || h > maxSide;
      const resized = needResize
        ? await sharp(imageBuffer)
            .resize(w > h ? maxSide : null, w > h ? null : maxSide, { withoutEnlargement: true })
            .toBuffer()
        : imageBuffer;
      const bufForApi = await sharp(resized)
        .jpeg({ quality: 88 })
        .toBuffer();
      const base64Image = bufForApi.toString('base64');

      const today = new Date().toISOString().slice(0, 10);
      const promptText = `Extract ONLY Discord-style chat: nickname + time (HH:MM) + speech. Ignore game UI, status windows, buttons. Output JSON only: [{"nickname":"","messageTime":"HH:MM","content":""}]. Date ${today}. Keep original language.`;

      const requestBody = {
        model: 'allenai/olmocr-2-7b',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      };

      let response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      let data = await response.json();
      const errMsg = String((data && data.error && data.error.message) || data.message || '');
      if (!response.ok && (response.status === 400 || errMsg.includes('process image'))) {
        console.log('Retrying with smaller image (640px) after failed to process image');
        const smallBuf = await sharp(imageBuffer)
          .resize(w > h ? 640 : null, w > h ? null : 640, { withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        requestBody.messages[0].content[1].image_url.url = `data:image/jpeg;base64,${smallBuf.toString('base64')}`;
        response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        data = await response.json();
      }
      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status}`);
      }
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      const rawText = (typeof content === 'string' ? content : String(content)).trim();

      let messages = [];
      try {
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            messages = parsed;
          }
        }
      } catch (e) {
        console.error('Failed to parse messages JSON:', e);
      }

      // 若模型只返回纯文本（无 JSON），当作一条 OCR 结果展示
      if (messages.length === 0 && rawText) {
        const now = new Date();
        messages = [{
          nickname: 'OCR',
          messageTime: now.toTimeString().slice(0, 5),
          content: rawText
        }];
      }

      const now = new Date();
      return messages.map(msg => {
        // 检查是否包含警报关键词
        const alertKeywords = this.config.alertKeywords || [];
        const isAlert = alertKeywords.some(keyword => 
          msg.content.includes(keyword)
        );

        // 简单情感分析
        let sentimentScore = 0;
        if (msg.content.match(/好|不错|感谢|谢谢|完美|赞|OK/i)) {
          sentimentScore = 1;
        } else if (msg.content.match(/BUG|bug|错误|不行|问题|バグ|エラー/i)) {
          sentimentScore = -1;
        }

        return {
          nickname: msg.nickname || 'OCR',
          messageTime: msg.messageTime || msg.message_time || '',
          content: msg.content || '',
          extractedAt: now.toLocaleString('zh-CN'),
          sentimentScore,
          isAlert
        };
      });

    } catch (error) {
      console.error('Extract messages error:', error);
      return [];
    }
  }

  saveMessage(message, screenshotPath) {
    const extractedAt = message.extractedAt || new Date().toLocaleString('zh-CN');
    const msg = {
      id: this.nextMessageId++,
      nickname: message.nickname,
      message_time: message.messageTime,
      content: message.content,
      topic: message.topic || '其他',
      sentiment: message.sentiment || '中性',
      extracted_at: extractedAt,
      screenshot_path: screenshotPath,
      sentiment_score: message.sentimentScore,
      is_alert: message.isAlert ? 1 : 0,
      created_at: new Date().toISOString()
    };
    this.messages.push(msg);
    this.saveMessages();
    return msg.id;
  }

  /** 当前小时表路径 */
  getHourlyExcelPath(now) {
    const excelDir = path.join(__dirname, '../data/excel');
    if (!fs.existsSync(excelDir)) fs.mkdirSync(excelDir, { recursive: true });
    const dateStr = now.toISOString().split('T')[0];
    const hourStr = String(now.getHours()).padStart(2, '0');
    return path.join(excelDir, `${dateStr}_${hourStr}.xlsx`);
  }

  /** 首次截屏时创建当小时表（仅表头），之后有新消息再追加 */
  async ensureHourlySheetExists(now) {
    const filepath = this.getHourlyExcelPath(now);
    if (fs.existsSync(filepath)) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('消息记录');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: '发言玩家', key: 'nickname', width: 18 },
      { header: '发言时间', key: 'messageTime', width: 12 },
      { header: '发言内容', key: 'content', width: 48 },
      { header: '讨论主题', key: 'topic', width: 12 },
      { header: '谈论情绪', key: 'sentiment', width: 10 },
      { header: '是否告警', key: 'isAlert', width: 10 },
      { header: '提取时间', key: 'extractedAt', width: 20 },
      { header: '截图路径', key: 'screenshotPath', width: 36 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    await workbook.xlsx.writeFile(filepath);
  }

  /** 有新消息时追加到当小时表 */
  async appendToHourlyExcel(records, now, screenshotPath) {
    if (!records || records.length === 0) return;
    const filepath = this.getHourlyExcelPath(now);
    try {
      const workbook = new ExcelJS.Workbook();
      if (!fs.existsSync(filepath)) {
        await this.ensureHourlySheetExists(now);
      }
      await workbook.xlsx.readFile(filepath);
      const sheet = workbook.getWorksheet('消息记录') || workbook.addWorksheet('消息记录');

      for (const r of records) {
        sheet.addRow({
          id: r.id,
          nickname: r.nickname,
          messageTime: r.messageTime,
          content: r.content,
          topic: r.topic,
          sentiment: r.sentiment,
          isAlert: r.isAlert ? '是' : '否',
          extractedAt: r.extractedAt || new Date().toLocaleString('zh-CN'),
          screenshotPath
        });
      }
      await workbook.xlsx.writeFile(filepath);
      console.log('Excel 已写入:', filepath, '新增', records.length, '条');
    } catch (err) {
      console.error('Excel 写入失败:', filepath, err);
    }
  }

  async handleAlert(messageId, message) {
    const alertKey = `${message.nickname}-${message.messageTime}`;
    const now = Date.now();
    
    // 30分钟内不重复报警
    if (this.lastAlertTime.has(alertKey)) {
      const lastTime = this.lastAlertTime.get(alertKey);
      if (now - lastTime < 30 * 60 * 1000) {
        console.log('Duplicate alert suppressed:', alertKey);
        return;
      }
    }

    this.lastAlertTime.set(alertKey, now);

    // 记录警报
    const alert = {
      id: this.nextAlertId++,
      message_ids: String(messageId),
      alert_type: 'negative_content',
      summary: `${message.nickname} 提到了问题: ${message.content.substring(0, 50)}...`,
      email_sent: 0,
      created_at: new Date().toISOString()
    };

    this.alerts.push(alert);
    this.saveAlerts();

    console.log('Alert created for message:', messageId);

    // TODO: 发送邮件
    // await this.sendAlertEmail(messageId, message);
  }

  async generateHourlyExcel() {
    const now = new Date();
    const currentHour = now.getHours();
    
    // 检查是否需要生成（每小时开始时生成上一小时的数据）
    const lastGenerated = this.lastExcelGenerated || 0;
    if (now.getTime() - lastGenerated < 55 * 60 * 1000) {
      return; // 55分钟内不重复生成
    }

    try {
      const excelDir = path.join(__dirname, '../data/excel');
      if (!fs.existsSync(excelDir)) {
        fs.mkdirSync(excelDir, { recursive: true });
      }

      // 生成文件名: YYYY-MM-DD_HH.xlsx
      const dateStr = now.toISOString().split('T')[0];
      const hourStr = String(currentHour).padStart(2, '0');
      const filename = `${dateStr}_${hourStr}.xlsx`;
      const filepath = path.join(excelDir, filename);

      // 如果文件已存在，跳过
      if (fs.existsSync(filepath)) {
        return;
      }

      // 查询当前小时的消息
      const hourStart = `${dateStr} ${hourStr}`;

      const messages = this.messages.filter(msg => {
        const msgDate = new Date(msg.created_at);
        const msgHour = `${msgDate.toISOString().split('T')[0]} ${String(msgDate.getHours()).padStart(2, '0')}`;
        return msgHour === hourStart;
      });

      if (messages.length === 0) {
        console.log('No messages to export for hour:', hourStr);
        return;
      }

      // 创建 Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('消息记录');

      // 设置列
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: '昵称', key: 'nickname', width: 20 },
        { header: '消息时间', key: 'message_time', width: 15 },
        { header: '消息内容', key: 'content', width: 50 },
        { header: '提取时间', key: 'extracted_at', width: 20 },
        { header: '情感评分', key: 'sentiment_score', width: 12 },
        { header: '是否警报', key: 'is_alert', width: 12 },
        { header: '截图路径', key: 'screenshot_path', width: 40 },
      ];

      // 添加数据
      messages.forEach(msg => {
        worksheet.addRow({
          id: msg.id,
          nickname: msg.nickname,
          message_time: msg.message_time,
          content: msg.content,
          extracted_at: msg.extracted_at,
          sentiment_score: msg.sentiment_score,
          is_alert: msg.is_alert ? '是' : '否',
          screenshot_path: msg.screenshot_path
        });
      });

      // 设置样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // 保存
      await workbook.xlsx.writeFile(filepath);
      console.log('Excel generated:', filepath);
      
      this.lastExcelGenerated = now.getTime();

    } catch (error) {
      console.error('Generate Excel error:', error);
    }
  }

  async sendAlertEmail(messageId, message) {
    const email = this.config && this.config.email;
    if (!email || !email.enabled || !email.to || !email.smtpHost) {
      console.log('Email alert skipped: not configured');
      return;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: email.smtpHost,
        port: Number(email.smtpPort) || 587,
        secure: email.smtpPort === '465',
        auth: email.smtpUser ? { user: email.smtpUser, pass: email.smtpPass || '' } : undefined
      });
      const toList = Array.isArray(email.to) ? email.to : (email.to ? [email.to] : []);
      if (toList.length === 0) return;
      await transporter.sendMail({
        from: email.from || email.smtpUser || 'monitor@local',
        to: toList.join(', '),
        subject: `[监控告警] 消极情绪 - ${message.nickname} ${message.messageTime}`,
        text: `玩家: ${message.nickname}\n时间: ${message.messageTime}\n情绪: ${message.sentiment}\n主题: ${message.topic}\n内容:\n${message.content}`,
        html: `<p><b>玩家</b> ${message.nickname} | <b>时间</b> ${message.messageTime} | <b>情绪</b> ${message.sentiment} | <b>主题</b> ${message.topic}</p><pre>${message.content}</pre>`
      });
      console.log('Alert email sent for message', messageId);
    } catch (e) {
      console.error('Send alert email error:', e);
    }
  }

  destroy() {
    this.stopMonitor();
    this.hideOverlay();
    // JSON 存储不需要关闭连接
  }
}

module.exports = MonitorManager;
