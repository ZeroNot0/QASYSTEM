(function () {
  const img = document.getElementById('img')
  const box = document.getElementById('box')
  const sizeInfo = document.getElementById('size-info')
  const actions = document.getElementById('actions')
  const hint = document.getElementById('hint')
  
  let startX, startY, endX, endY
  let naturalW, naturalH
  let isDrawing = false
  let hasSelection = false

  // 接收截图数据
  window.cropAPI.onScreenshotData((base64) => {
    img.src = 'data:image/png;base64,' + base64
    img.onload = () => {
      naturalW = img.naturalWidth
      naturalH = img.naturalHeight
    }
  })

  // 客户端坐标转图片坐标
  function clientToImage(clientX, clientY) {
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * naturalW
    const y = ((clientY - rect.top) / rect.height) * naturalH
    return [
      Math.max(0, Math.min(naturalW, x)), 
      Math.max(0, Math.min(naturalH, y))
    ]
  }

  // 更新尺寸显示
  function updateSizeInfo(w, h, boxX, boxY, boxW, boxH) {
    if (w < 10 || h < 10) {
      sizeInfo.style.display = 'none'
      return
    }
    sizeInfo.style.display = 'block'
    sizeInfo.textContent = `${Math.round(w)} × ${Math.round(h)} px`
    
    // 智能定位：优先右上角，避免遮挡
    const infoX = boxX + boxW + 10
    const infoY = boxY - 5
    
    sizeInfo.style.left = infoX + 'px'
    sizeInfo.style.top = infoY + 'px'
  }

  // 更新操作按钮
  function updateActions(boxX, boxY, boxW, boxH) {
    if (boxW < 50 || boxH < 50) {
      actions.style.display = 'none'
      return
    }
    actions.style.display = 'flex'
    
    // 定位在选区下方居中
    const actionsX = boxX + boxW / 2 - 80
    const actionsY = boxY + boxH + 12
    
    actions.style.left = actionsX + 'px'
    actions.style.top = actionsY + 'px'
  }

  // 鼠标按下 - 开始选择
  img.addEventListener('mousedown', (e) => {
    const [x, y] = clientToImage(e.clientX, e.clientY)
    startX = x
    startY = y
    endX = x
    endY = y
    isDrawing = true
    hasSelection = false
    
    box.style.display = 'block'
    box.style.left = e.clientX + 'px'
    box.style.top = e.clientY + 'px'
    box.style.width = '0'
    box.style.height = '0'
    
    sizeInfo.style.display = 'none'
    actions.style.display = 'none'
    hint.style.display = 'none'
  })

  // 鼠标移动 - 更新选区
  window.addEventListener('mousemove', (e) => {
    if (!isDrawing) return
    
    const [x, y] = clientToImage(e.clientX, e.clientY)
    endX = x
    endY = y
    
    const l = Math.min(startX, endX)
    const t = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    
    const rect = img.getBoundingClientRect()
    const scaleX = rect.width / naturalW
    const scaleY = rect.height / naturalH
    
    const boxX = rect.left + l * scaleX
    const boxY = rect.top + t * scaleY
    const boxW = w * scaleX
    const boxH = h * scaleY
    
    box.style.left = boxX + 'px'
    box.style.top = boxY + 'px'
    box.style.width = boxW + 'px'
    box.style.height = boxH + 'px'
    
    updateSizeInfo(w, h, boxX, boxY, boxW, boxH)
  })

  // 鼠标松开 - 完成选择
  window.addEventListener('mouseup', () => {
    if (!isDrawing) return
    isDrawing = false
    
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    
    // 选区太小，取消
    if (w < 10 || h < 10) {
      resetSelection()
      return
    }
    
    hasSelection = true
    
    const rect = img.getBoundingClientRect()
    const scaleX = rect.width / naturalW
    const scaleY = rect.height / naturalH
    const l = Math.min(startX, endX)
    const t = Math.min(startY, endY)
    const boxX = rect.left + l * scaleX
    const boxY = rect.top + t * scaleY
    const boxW = w * scaleX
    const boxH = h * scaleY
    
    updateActions(boxX, boxY, boxW, boxH)
  })

  // 重置选择
  function resetSelection() {
    isDrawing = false
    hasSelection = false
    startX = null
    box.style.display = 'none'
    sizeInfo.style.display = 'none'
    actions.style.display = 'none'
    hint.style.display = 'block'
  }

  // 确认选择
  window.confirmSelection = function() {
    if (!hasSelection) return
    
    const l = Math.min(startX, endX)
    const t = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    
    // 创建画布并裁剪
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, l, t, w, h, 0, 0, w, h)
    
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    window.cropAPI.confirm(base64)
  }

  // 取消选择（重新框选）
  window.cancelSelection = function() {
    resetSelection()
  }

  // 键盘快捷键
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.cropAPI.cancel()
    } else if (e.key === 'Enter' && hasSelection) {
      window.confirmSelection()
    }
  })
})()
