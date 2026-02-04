export default function App() {
  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      background: '#1e293b',
      color: 'white',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Jp-Linker 测试页面</h1>
      <p style={{ marginBottom: '10px' }}>✓ React 正在运行</p>
      <p style={{ marginBottom: '10px' }}>✓ 页面已加载</p>
      <p style={{ marginBottom: '10px' }}>✓ 样式已应用</p>
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        background: '#334155',
        borderRadius: '8px'
      }}>
        <p>如果您看到这个内容，说明基本的 React 渲染工作正常。</p>
        <p style={{ marginTop: '10px' }}>接下来需要检查完整应用的加载问题。</p>
      </div>
    </div>
  )
}
