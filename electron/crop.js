(function () {
  const img = document.getElementById('img')
  const box = document.getElementById('box')
  let startX, startY, endX, endY
  let imageW, imageH, naturalW, naturalH

  window.cropAPI.onScreenshotData((base64) => {
    img.src = 'data:image/png;base64,' + base64
    img.onload = () => {
      naturalW = img.naturalWidth
      naturalH = img.naturalHeight
      const scale = Math.min(window.innerWidth / naturalW, window.innerHeight / naturalH)
      imageW = naturalW * scale
      imageH = naturalH * scale
    }
  })

  function clientToImage(clientX, clientY) {
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * naturalW
    const y = ((clientY - rect.top) / rect.height) * naturalH
    return [Math.max(0, Math.min(naturalW, x)), Math.max(0, Math.min(naturalH, y))]
  }

  img.addEventListener('mousedown', (e) => {
    const [x, y] = clientToImage(e.clientX, e.clientY)
    startX = endX = x
    startY = endY = y
    box.style.display = 'block'
    box.style.left = e.clientX + 'px'
    box.style.top = e.clientY + 'px'
    box.style.width = '0'
    box.style.height = '0'
  })

  window.addEventListener('mousemove', (e) => {
    if (startX == null) return
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
    box.style.left = (rect.left + l * scaleX) + 'px'
    box.style.top = (rect.top + t * scaleY) + 'px'
    box.style.width = (w * scaleX) + 'px'
    box.style.height = (h * scaleY) + 'px'
  })

  window.addEventListener('mouseup', () => {
    if (startX == null) return
    const l = Math.min(startX, endX)
    const t = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    if (w < 10 || h < 10) {
      startX = null
      box.style.display = 'none'
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, l, t, w, h, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    window.cropAPI.confirm(base64)
    startX = null
    box.style.display = 'none'
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.cropAPI.cancel()
    }
  })
})()
