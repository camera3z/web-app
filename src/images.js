export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function validateImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error('Ảnh phải nhỏ hơn hoặc bằng 5 MB.');
}
export async function prepareImage(file) {
  validateImage(file);
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Không đọc được ảnh. Hãy chọn một ảnh JPG, PNG hoặc WebP khác.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000)
      throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 40 megapixel.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh WebP. Hãy cập nhật trình duyệt.');
    validateImage(blob);
    return blob;
  } finally { bitmap.close(); }
}
export function imageDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(blob);
  });
}
