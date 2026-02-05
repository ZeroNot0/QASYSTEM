let isSelecting = false;
let startX = 0, startY = 0;
let selection = null;
let sizeInfo = null;
let hint = null;
let screenshot = null;
let overlay = null;
let isMonitorMode = false; // 监控模式标志

document.addEventListener('DOMContentLoaded', () => {
  console.log('Crop tool loaded');
  
  screenshot = document.getElementById('screenshot');
  overlay = document.getElementById('overlay');
  selection = document.getElementById('selection');
  sizeInfo = document.getElementById('size-info');
  hint = document.getElementById('hint');

  if (!screenshot || !selection) {
    console.error('Crop: missing #screenshot or #selection');
    return;
  }

  if (window.cropAPI && window.cropAPI.onScreenshotData) {
    window.cropAPI.onScreenshotData((base64) => {
      console.log('Screenshot data received, length:', (base64 && base64.length) || 0);
      screenshot.src = 'data:image/png;base64,' + base64;
      if (overlay) overlay.style.display = 'block';
    });
  }

  // 监听模式设置（用于监控模式）
  if (window.cropAPI && window.cropAPI.onSetMode) {
    window.cropAPI.onSetMode((mode) => {
      console.log('Mode set to:', mode);
      isMonitorMode = (mode === 'monitor');
    });
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !selection) return;
    
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    if (hint) hint.style.display = 'none';
    
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.display = 'block';
    sizeInfo.style.display = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selection || !sizeInfo) return;

    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    // 更新选择框
    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';

    // 更新尺寸显示
    if (width > 10 || height > 10) {
      sizeInfo.textContent = `${Math.round(width)} × ${Math.round(height)}`;
      sizeInfo.style.display = 'block';
      
      // 定位尺寸信息（避免超出屏幕）
      let infoX = x + width + 10;
      let infoY = y;
      
      if (infoX + 100 > window.innerWidth) {
        infoX = x - 110;
      }
      if (infoY + 30 > window.innerHeight) {
        infoY = window.innerHeight - 35;
      }
      
      sizeInfo.style.left = infoX + 'px';
      sizeInfo.style.top = infoY + 'px';
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isSelecting || e.button !== 0 || !window.cropAPI || !window.cropAPI.confirm) return;

    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    if (width < 10 || height < 10) {
      resetSelection();
      return;
    }

    if (isMonitorMode) {
      const nw = screenshot.naturalWidth || window.innerWidth;
      const nh = screenshot.naturalHeight || window.innerHeight;
      const scale = Math.min(window.innerWidth / nw, window.innerHeight / nh) || 1;
      const displayedW = nw * scale;
      const displayedH = nh * scale;
      const offsetX = (window.innerWidth - displayedW) / 2;
      const offsetY = (window.innerHeight - displayedH) / 2;
      const imgX = Math.max(0, Math.min(nw, (x - offsetX) / scale));
      const imgY = Math.max(0, Math.min(nh, (y - offsetY) / scale));
      const imgW = Math.max(1, Math.min(nw - imgX, width / scale));
      const imgH = Math.max(1, Math.min(nh - imgY, height / scale));
      const areaData = {
        x: Math.round(imgX),
        y: Math.round(imgY),
        width: Math.round(imgW),
        height: Math.round(imgH)
      };
      window.cropAPI.confirm(areaData);
    } else if (screenshot && screenshot.complete) {
      console.log('OCR mode: cropping screenshot image');
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      
      // 从screenshot图片裁剪选中区域
      ctx.drawImage(
        screenshot,
        Math.round(x), Math.round(y), Math.round(width), Math.round(height),
        0, 0, Math.round(width), Math.round(height)
      );
      
      // 转换为base64
      const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
      console.log('Cropped image base64 length:', croppedBase64.length);
      window.cropAPI.confirm(croppedBase64);
    } else {
      console.log('No screenshot image and not monitor mode');
      // 如果没有screenshot也不是监控模式，发送区域坐标
      const areaData = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      };
      window.cropAPI.confirm(areaData);
    }
  });

  // ESC 取消
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      console.log('Selection cancelled by user');
      window.cropAPI.cancel();
    }
  });
});

function resetSelection() {
  isSelecting = false;
  selection.style.display = 'none';
  sizeInfo.style.display = 'none';
  if (hint) hint.style.display = 'block';
}
