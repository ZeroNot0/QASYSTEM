import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Settings, Database, Mail } from 'lucide-react';

interface MonitorConfig {
  interval: number; // 截屏间隔（秒）
  area: { x: number; y: number; width: number; height: number } | null;
  alertKeywords: string[];
  emailRecipients: string[];
}

interface Message {
  id: number;
  nickname: string;
  messageTime: string;
  content: string;
  extractedAt: string;
  sentimentScore: number;
  isAlert: boolean;
}

export default function MonitorPanel() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [config, setConfig] = useState<MonitorConfig>({
    interval: 60,
    area: null,
    alertKeywords: ['BUG', 'bug', '不行', '问题', 'エラー', 'バグ'],
    emailRecipients: []
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState({
    totalMessages: 0,
    alertCount: 0,
    lastScreenshot: null as string | null
  });

  // 选择监控区域
  const selectArea = async () => {
    try {
      const area = await window.electronAPI.selectMonitorArea();
      if (area) {
        setConfig({ ...config, area });
        console.log('Area selected:', area);
      }
    } catch (error) {
      console.error('Failed to select area:', error);
      alert('Failed to select area: ' + error.message);
    }
  };

  // 开始/停止监控
  const toggleMonitoring = async () => {
    if (!config.area) {
      alert('Please select monitoring area first!');
      return;
    }

    if (isMonitoring) {
      // 停止监控
      await window.electronAPI.stopMonitor();
      setIsMonitoring(false);
    } else {
      // 开始监控
      await window.electronAPI.startMonitor(config);
      setIsMonitoring(true);
    }
  };

  // 监听消息更新
  useEffect(() => {
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

    if (window.electronAPI.onMonitorMessage) {
      window.electronAPI.onMonitorMessage(handleNewMessage);
    }
    if (window.electronAPI.onMonitorStats) {
      window.electronAPI.onMonitorStats(handleStats);
    }
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
              Select Area
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
                  Stop Monitor
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Monitor
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Interval:</label>
              <input
                type="number"
                min="30"
                max="300"
                value={config.interval}
                onChange={(e) => setConfig({ ...config, interval: parseInt(e.target.value) })}
                className="w-20 px-2 py-1 border border-gray-300 rounded"
                disabled={isMonitoring}
              />
              <span className="text-sm text-gray-600">seconds</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-gray-600">{isMonitoring ? 'Monitoring' : 'Stopped'}</span>
            </div>
          </div>
        </div>

        {/* 配置区域信息 */}
        {config.area && (
          <div className="mt-2 text-xs text-gray-500">
            Monitor Area: {config.area.x}, {config.area.y} - {config.area.width}x{config.area.height}
          </div>
        )}
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              {isMonitoring ? 'Waiting for messages...' : 'Click "Start Monitor" to begin'}
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
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Extracted: {msg.extractedAt}</span>
                      <span>Sentiment: {msg.sentimentScore > 0 ? 'Positive' : msg.sentimentScore < 0 ? 'Negative' : 'Neutral'}</span>
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
