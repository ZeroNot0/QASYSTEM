import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Settings, Database, Mail } from 'lucide-react';

interface EmailConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  from: string;
  to: string; // 多个用逗号分隔
}

interface MonitorConfig {
  interval: number;
  area: { x: number; y: number; width: number; height: number } | null;
  alertKeywords: string[];
  email: EmailConfig;
}

interface Message {
  id: number;
  nickname: string;
  messageTime: string;
  content: string;
  extractedAt: string;
  sentimentScore?: number;
  isAlert: boolean;
  topic?: string;
  sentiment?: string;
}

export default function MonitorPanel() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [config, setConfig] = useState<MonitorConfig>({
    interval: 30,
    area: null,
    alertKeywords: ['BUG', 'bug', '不行', '问题', 'エラー', 'バグ'],
    email: {
      enabled: true,
      smtpHost: 'smtp.yeah.net',
      smtpPort: '465',
      smtpUser: 'broiswatchingu@yeah.net',
      smtpPass: 'AAaH8saYyBPX5CAh',
      from: 'broiswatchingu@yeah.net',
      to: 'a40793171@163.com'
    }
  });
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState({
    totalMessages: 0,
    alertCount: 0,
    lastScreenshot: null as string | null
  });
  const [lastCapture, setLastCapture] = useState<{ thumbnailBase64: string; time: string } | null>(null);
  const [excelStatus, setExcelStatus] = useState<{ type: 'ready' | 'stopped'; path: string } | null>(null);

  // 框选区域：与 OCR 截屏同一套框选流程，选完后对该区域定期截屏
  const selectArea = async () => {
    try {
      await window.electronAPI?.startMonitorAreaSelection?.();
    } catch (error: any) {
      console.error('Failed to start area selection:', error);
      alert('框选失败: ' + (error?.message || error));
    }
  };

  // 开始/停止监控
  const toggleMonitoring = async () => {
    if (!config.area) {
      alert('请先点击「框选区域」选择要监控的区域');
      return;
    }

    if (isMonitoring) {
      await window.electronAPI?.stopMonitor?.();
      setIsMonitoring(false);
    } else {
      await window.electronAPI?.startMonitor?.(config);
      setIsMonitoring(true);
    }
  };

  // 框选完成后主进程发来区域
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMonitorAreaSelected) return;
    const off = api.onMonitorAreaSelected((area: { x: number; y: number; width: number; height: number }) => {
      setConfig(c => ({ ...c, area }));
    });
    return () => off?.();
  }, []);

  // 监听消息、统计、最新截屏缩略图
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMonitorMessage || !api?.onMonitorStats) return;

    const handleNewMessage = (message: Message) => {
      setMessages(prev => [message, ...prev].slice(0, 50));
      setStats(prev => ({
        ...prev,
        totalMessages: prev.totalMessages + 1,
        alertCount: message.isAlert ? prev.alertCount + 1 : prev.alertCount
      }));
    };

    const handleStats = (newStats: any) => {
      setStats(prev => ({ ...prev, ...newStats }));
    };

    const offMessage = api.onMonitorMessage(handleNewMessage);
    const offStats = api.onMonitorStats(handleStats);
    return () => {
      offMessage?.();
      offStats?.();
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMonitorScreenshot) return;
    const off = api.onMonitorScreenshot((data: { thumbnailBase64: string; time: string }) => {
      setLastCapture(data);
    });
    return () => off?.();
  }, []);

  // 开始监控时建表、结束监控时提示表已保存
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMonitorExcelReady || !api?.onMonitorStopped) return;
    const offReady = api.onMonitorExcelReady((data: { path: string }) => {
      setExcelStatus({ type: 'ready', path: data.path });
    });
    const offStopped = api.onMonitorStopped((data: { excelPath: string }) => {
      setExcelStatus({ type: 'stopped', path: data.excelPath });
    });
    return () => {
      offReady?.();
      offStopped?.();
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 顶部控制栏 */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={selectArea}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Settings className="w-4 h-4" />
              框选区域
            </button>
            <button
              onClick={toggleMonitoring}
              className={`flex items-center gap-2 px-4 py-2 rounded ${
                isMonitoring
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
              disabled={!config.area}
            >
              {isMonitoring ? (
                <>
                  <Pause className="w-4 h-4" />
                  停止监控
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  开始监控
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">间隔:</label>
              <input
                type="number"
                min="10"
                max="300"
                value={config.interval}
                onChange={(e) => setConfig(c => ({ ...c, interval: parseInt(e.target.value) || 60 }))}
                className="w-20 px-2 py-1 border border-gray-300 rounded"
                disabled={isMonitoring}
              />
              <span className="text-sm text-gray-600">秒</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-gray-600">{isMonitoring ? 'Monitoring' : 'Stopped'}</span>
            </div>
          </div>
        </div>

        {config.area && (
          <div className="mt-2 px-3 py-2 rounded bg-green-50 border border-green-200 text-sm text-green-800">
            <span className="font-medium">已框选区域</span> {config.area.x}, {config.area.y} — {config.area.width}×{config.area.height}
            <br />
            <span className="text-xs text-green-600">点击「开始监控」将对该区域定期截屏、识别并归类，消极情绪时发邮件告警</span>
          </div>
        )}
        {excelStatus && (
          <div className="mt-2 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <Database className="w-4 h-4 inline mr-1" />
            {excelStatus.type === 'ready' ? '表已创建' : '表已保存'}：<span className="font-mono text-xs">{excelStatus.path.split(/[/\\]/).pop() || excelStatus.path}</span>
          </div>
        )}

        {/* 告警邮箱设置（消极情绪时发邮件） */}
        <div className="mt-2 border border-gray-200 rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setEmailPanelOpen(!emailPanelOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left text-sm font-medium text-gray-700"
          >
            <Mail className="w-4 h-4" />
            告警邮箱设置
            {config.email.enabled && config.email.smtpHost && (
              <span className="text-xs text-green-600">已配置</span>
            )}
          </button>
          {emailPanelOpen && (
            <div className="p-3 bg-white border-t border-gray-200 space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.email.enabled}
                  onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, enabled: e.target.checked } }))}
                />
                消极情绪时发送告警邮件
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="SMTP 主机" value={config.email.smtpHost} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, smtpHost: e.target.value } }))} className="px-2 py-1 border rounded" />
                <input placeholder="端口" value={config.email.smtpPort} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, smtpPort: e.target.value } }))} className="px-2 py-1 border rounded" />
                <input placeholder="用户名" value={config.email.smtpUser} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, smtpUser: e.target.value } }))} className="px-2 py-1 border rounded" />
                <input type="password" placeholder="密码/授权码" value={config.email.smtpPass} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, smtpPass: e.target.value } }))} className="px-2 py-1 border rounded" />
                <input placeholder="发件人（与用户名一致或留空）" value={config.email.from} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, from: e.target.value } }))} className="px-2 py-1 border rounded col-span-2" />
                <input placeholder="收件人（多个逗号分隔）" value={config.email.to} onChange={(e) => setConfig(c => ({ ...c, email: { ...c.email, to: e.target.value } }))} className="px-2 py-1 border rounded col-span-2" />
              </div>
              <div className="text-xs text-gray-500 border-t pt-2 mt-2 space-y-1">
                <p><strong>推荐：</strong>单独注册一个邮箱专门发告警，不暴露主邮箱；密码处填该邮箱的<strong>授权码/应用专用密码</strong>（不是登录密码）。</p>
                <p><strong>常见 SMTP：</strong>QQ 邮箱 smtp.qq.com:465；163 邮箱 smtp.163.com:465；<strong>yeah.net 用 smtp.yeah.net:465</strong>；Gmail smtp.gmail.com:587（需开启「应用专用密码」）。</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 统计信息 */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalMessages}</div>
            <div className="text-xs text-gray-500">Total Messages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.alertCount}</div>
            <div className="text-xs text-gray-500">Alerts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{config.interval}s</div>
            <div className="text-xs text-gray-500">Interval</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 truncate">
              {stats.lastScreenshot || 'Not Started'}
            </div>
            <div className="text-xs text-gray-500">Last Screenshot</div>
          </div>
        </div>
      </div>

      {/* 最新截屏：提示“截好屏了” */}
      {lastCapture && (
        <div className="bg-white border-b border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-2">最新截屏 {lastCapture.time}</div>
          <img
            src={`data:image/jpeg;base64,${lastCapture.thumbnailBase64}`}
            alt="最新截屏"
            className="max-h-48 rounded border border-gray-200 object-contain"
          />
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              {isMonitoring ? '等待消息识别…' : '先框选区域，再点击「开始监控」'}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg border ${
                  msg.isAlert
                    ? 'bg-red-50 border-red-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-800">{msg.nickname}</span>
                      <span className="text-xs text-gray-500">{msg.messageTime}</span>
                      {msg.isAlert && (
                        <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">
                          Alert
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span>提取: {msg.extractedAt}</span>
                      {msg.topic && <span>主题: {msg.topic}</span>}
                      {msg.sentiment && <span>情绪: {msg.sentiment}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
