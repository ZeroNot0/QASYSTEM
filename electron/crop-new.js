let isSelecting = false;
let startX = 0, startY = 0;
let selection = null;
let sizeInfo = null;
let hint = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Crop tool loaded - transparent overlay mode');
  
  selection = document.getElementById('selection');
  sizeInfo = document.getElementById('size-info');
  hint = document.getElementById('hint');

  // 鼠标按下开始选择
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    console.log('Selection started at:', startX, startY);
    
    // 隐藏提示
    if (hint) hint.style.display = 'none';
    
    // 重置选择框
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.display = 'block';
    sizeInfo.style.display = 'none';
  });

  // 鼠标移动绘制选择框
  document.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

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

  // 鼠标释放完成选择
  document.addEventListener('mouseup', (e) => {
    if (!isSelecting || e.button !== 0) return;

    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    console.log('Selection completed:', { x, y, width, height });

    // 验证选区大小
    if (width < 10 || height < 10) {
      console.log('Selection too small, resetting');
      resetSelection();
      return;
    }

    // 确认选区
    const areaData = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };

    console.log('Confirming area:', areaData);
    window.cropAPI.confirm(areaData);
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
