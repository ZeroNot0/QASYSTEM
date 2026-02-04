const { BrowserWindow, screen } = require('electron');
const screenshot = require('screenshot-desktop');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

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
    this.overlayWindow = null; // 红色边框窗口
    this.initDatabase();
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
        // 先截取全屏图片
        const screenshot = require('screenshot-desktop');
        const img = await screenshot({ format: 'png' });
        const base64 = img.toString('base64');

        // 创建全屏窗口显示截图
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

        cropWindow.webContents.on('ipc-message', (event, channel, data) => {
          if (channel === 'screenshot-selected') {
            console.log('Area selected:', data);
            cropWindow.close();
            
            // 监控模式返回的是区域坐标对象 {x, y, width, height}
            if (data && typeof data === 'object' && data.x !== undefined) {
              // 创建或更新红色边框窗口
              this.showOverlay(data);
              resolve(data);
            } else {
              console.error('Invalid area data:', data);
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

  showOverlay(area) {
    // 关闭旧的 overlay
    if (this.overlayWindow) {
      this.overlayWindow.close();
    }

    // 创建新的 overlay 窗口
    this.overlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width: screen.getPrimaryDisplay().bounds.width,
      height: screen.getPrimaryDisplay().bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
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

    // 开始定时截屏
    this.scheduleScreenshot();
  }

  stopMonitor() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    this.hideOverlay();
    console.log('Monitor stopped');
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

      // 截取全屏（指定PNG格式）
      console.log('Taking screenshot of area:', this.config.area);
      const fullScreenshot = await screenshot({ format: 'png' });
      
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

      // 更新统计信息
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('monitor-stats', {
          lastScreenshot: now.toLocaleTimeString('zh-CN')
        });
      }

      // OCR 识别消息
      const messages = await this.extractMessages(screenshotPath);
      
      if (messages && messages.length > 0) {
        console.log(`Extracted ${messages.length} messages`);
        
        // 保存到数据库
        for (const msg of messages) {
          const msgId = this.saveMessage(msg, screenshotPath);
          
          // 发送到前端显示
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('monitor-message', {
              id: msgId,
              ...msg
            });
          }

          // 检查是否需要报警
          if (msg.isAlert) {
            await this.handleAlert(msgId, msg);
          }
        }

        // 每小时生成 Excel
        await this.generateHourlyExcel();
      }

    } catch (error) {
      console.error('Capture and process error:', error);
    }
  }

  async extractMessages(imagePath) {
    try {
      // 读取图片并转为 base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log('Image buffer type:', typeof imageBuffer, 'Base64 type:', typeof base64Image, 'Base64 first 50 chars:', base64Image.substring(0, 50));

      // 调用 LM Studio VLM API（简化prompt，使用单个user消息）
      const requestBody = {
        model: 'allenai/olmocr-2-7b',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please recognize Japanese text in the image. Output only the recognized text without any explanation.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      };
      
      const response = await fetch('http://localhost:1234/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // 尝试解析 JSON
      let messages = [];
      try {
        // 提取 JSON 数组（可能在 markdown 代码块中）
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          messages = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Failed to parse messages JSON:', e);
        return [];
      }

      // 处理每条消息
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
          nickname: msg.nickname,
          messageTime: msg.messageTime,
          content: msg.content,
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
    const msg = {
      id: this.nextMessageId++,
      nickname: message.nickname,
      message_time: message.messageTime,
      content: message.content,
      extracted_at: message.extractedAt,
      screenshot_path: screenshotPath,
      sentiment_score: message.sentimentScore,
      is_alert: message.isAlert ? 1 : 0,
      created_at: new Date().toISOString()
    };

    this.messages.push(msg);
    this.saveMessages();

    return msg.id;
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
      const excelDir = path.join(__dirname, '../excel');
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
    // TODO: 实现邮件发送
    console.log('Email alert not yet implemented');
  }

  destroy() {
    this.stopMonitor();
    this.hideOverlay();
    // JSON 存储不需要关闭连接
  }
}

module.exports = MonitorManager;
