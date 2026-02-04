import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-200 text-sm p-4">
      <h1 className="text-2xl font-bold mb-4">Jp-Linker 客服助手</h1>
      <p className="mb-4">应用已加载成功！</p>
      <p className="text-cyan-400 mb-4">计数器: {count}</p>
      <button
        onClick={() => setCount(count + 1)}
        className="px-4 py-2 bg-cyan-600 rounded hover:bg-cyan-500"
      >
        点击增加
      </button>
      <p className="text-slate-400 text-xs mt-4">
        这是一个测试页面。如果您看到这个内容，说明 React 和 Tailwind 都正常工作了。
      </p>
    </div>
  )
}
