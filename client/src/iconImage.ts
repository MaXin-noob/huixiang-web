// 频道头像：把浏览器选中的图片等比裁成正方形并压成 PNG，再上传到服务器文件区。
// 服务器上的频道图标是 channel 0 里的 /icon_<id> 文件，尺寸越小越省流量，128 足够清晰。

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法读取'));
    img.src = url;
  });
}

/** 等比裁成 side×side 的 PNG。 */
export async function makeChannelIconPng(file: File, side = 128): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理这张图片');
    const scale = Math.max(side / img.naturalWidth, side / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('图片编码失败'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
