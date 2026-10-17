import { readFile } from 'node:fs/promises';

const PUBLIC_MPS_UPLOAD_URL = 'https://gateway.jeejio.com/im/openApi/mps/file';

export async function uploadMpsPackage({ archivePath, fileName, appId, token, onProgress = () => {} }) {
  if (!token) throw new Error('MPS token is not available');
  if (!appId) throw new Error('MPS ID is required');
  const data = await readFile(archivePath);
  const form = new FormData();
  form.append('secretKey', token);
  form.append('appId', appId);
  form.append('file', new Blob([data], { type: 'application/octet-stream' }), fileName);
  onProgress(`Uploading MPS package ${fileName} (${data.length} bytes)`);
  const response = await fetch(PUBLIC_MPS_UPLOAD_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text || '{}'); } catch { throw new Error(`MPS upload returned invalid JSON (HTTP ${response.status})`); }
  if (!response.ok || ![0, 200].includes(Number(result.code))) {
    const detail = result.message || result.errorInfo?.errorDetails || text || `HTTP ${response.status}`;
    throw new Error(`MPS upload failed: ${detail}`);
  }
  onProgress(`MPS package uploaded: ${fileName}`);
  return result;
}
