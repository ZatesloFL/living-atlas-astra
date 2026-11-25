const MAX_ORIGINAL = 16 * 1024 * 1024;
const MAX_PREVIEW = 512 * 1024;
const PREVIEW_EDGE = 640;
const HOLDER = /^[a-f0-9]{64}$/i;
const contentTypes = new Map([
  ['image/jpeg', 'image/jpeg'], ['image/png', 'image/png'], ['image/webp', 'image/webp'],
  ['text/plain', 'text/plain'], ['text/markdown', 'text/plain'], ['text/csv', 'text/plain'],
  ['audio/mpeg', 'audio/mpeg'], ['audio/wav', 'audio/wav'], ['audio/x-wav', 'audio/wav'],
  ['audio/flac', 'audio/flac'], ['audio/x-flac', 'audio/flac'],
  ['audio/ogg', 'audio/ogg'], ['audio/aac', 'audio/aac'], ['audio/mp4', 'audio/mp4'],
  ['audio/m4a', 'audio/mp4'], ['audio/x-m4a', 'audio/mp4'], ['audio/opus', 'audio/ogg'],
]);
const extensions = new Map([
  ['jpeg','image/jpeg'], ['jpg','image/jpeg'], ['png','image/png'], ['webp','image/webp'],
  ['txt','text/plain'], ['md','text/plain'], ['csv','text/plain'],
  ['mp3','audio/mpeg'], ['wav','audio/wav'], ['flac','audio/flac'], ['ogg','audio/ogg'],
  ['opus','audio/ogg'], ['aac','audio/aac'], ['m4a','audio/mp4'],
]);

export const uploadAccept = '.jpg,.jpeg,.png,.webp,.txt,.md,.csv,.mp3,.wav,.flac,.ogg,.opus,.aac,.m4a';
export const uploadLimitLabel = '16 MiB';

const messages = {
  UNAUTHORIZED: 'This browser’s dev upload access is unavailable.',
  ORIGIN_DENIED: 'Hosted uploads are unavailable from this page.',
  ALLOTMENT_EXCEEDED: 'This file and its preview would exceed your upload allotment.',
  BAD_MEDIA: 'Choose a supported still photo, text or audio file.',
  BAD_REQUEST: 'The upload details are invalid. Review the file and try again.',
  NOT_FOUND: 'This upload is unavailable.',
  UPLOAD_NOT_FOUND: 'This upload is unavailable.',
  MEDIA_UNAVAILABLE: 'This file is unavailable.',
  PREVIEW_UNAVAILABLE: 'A sized preview is unavailable for this file.',
  IMAGE_PREVIEW_REQUIRED: 'This photo needs a sized preview. Re-select the file and try again.',
  PAYLOAD_TOO_LARGE: 'The file exceeds the size limit for a single upload.',
  SIZE_MISMATCH: 'The upload was incomplete. Retry the selected file.',
  TRANSFER_PENDING: 'The transfer is still being checked. Refresh storage usage before retrying.',
  UPLOAD_CONFLICT: 'A saved upload already uses this request. Refresh storage usage.',
  UPLOAD_STATE_CONFLICT: 'The state of this upload changed. Refresh storage usage and try again.',
  VIDEO_REFERENCE_REQUIRED: 'Add a YouTube or Vimeo reference for video.',
  PHOTO_ASSESSMENT_REQUIRED: 'Request a live image assessment before confirming this photo.',
  PHOTO_ASSESSMENT_MISMATCH: 'The assessment Receipt does not match this photo. Request its live assessment again.',
  AUDIO_ASSESSMENT_UNAVAILABLE: 'Audio transcription is unavailable. This audio copy stays unpublished.',
  AUDIO_ASSESSMENT_REQUIRED: 'Request a live transcript assessment before confirming the audio.',
  AUDIO_ASSESSMENT_MISMATCH: 'The assessment Receipts do not match this audio. Request its live assessment again.',
};

export function directUploadType(file) {
  const mime = String(file?.type ?? '').split(';')[0].toLowerCase();
  const extension = String(file?.name ?? '').split('.').at(-1).toLowerCase();
  return contentTypes.get(mime) ?? ((!mime || mime === 'application/octet-stream') ? extensions.get(extension) : null) ?? null;
}

export async function imagePreview(file) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PREVIEW_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not create an image preview.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const preview = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (preview?.type === 'image/jpeg' && preview.size > 0 && preview.size <= MAX_PREVIEW) return preview;
    }
    throw new Error('The browser could not create a small preview for this photo.');
  } finally {
    image.close();
  }
}

export class UploadClient {
  constructor({endpoint, getHolder, fetch: fetchImpl = (...args) => globalThis.fetch(...args), preview = imagePreview, enabled = () => true} = {}) {
    this.endpoint = endpoint?.replace(/\/+$/, '');
    this.getHolder = getHolder;
    this.fetch = fetchImpl;
    this.preview = preview;
    this.enabled = enabled;
  }

  available() {
    return !!this.endpoint && typeof this.getHolder === 'function' && this.enabled();
  }

  async request(action, body, {signal, contentType = 'application/json', headers = {}, binary = false} = {}) {
    if (!this.available()) throw new Error('Hosted uploads are unavailable in this session.');
    const holder = await this.getHolder({signal});
    if (!HOLDER.test(holder ?? '')) throw new Error(messages.UNAUTHORIZED);
    const response = await this.fetch(this.endpoint + '/' + action, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(action === 'upload' ? 90000 : 30000),
      cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: {...headers, 'Content-Type': contentType, Authorization: 'Bearer ' + holder},
      body: contentType === 'application/json' ? JSON.stringify(body) : body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = typeof payload?.code === 'string' ? payload.code : '';
      const message = messages[code] ?? (response.status === 413
        ? 'The file exceeds the size limit for a single upload.'
        : 'The hosted upload request could not be completed.');
      throw Object.assign(new Error(message), {status: response.status, code});
    }
    return binary ? response.blob() : response.json();
  }

  list(options) {
    return this.request('list', {}, options);
  }

  async upload({placeId, file, id = crypto.randomUUID()}, {signal} = {}) {
    const type = directUploadType(file);
    if (!type) throw new Error('Choose a JPEG, PNG, WebP, text or audio file. Add video by link.');
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_ORIGINAL) {
      throw new Error('Choose a non-empty file of ' + uploadLimitLabel + ' or less.');
    }
    const preview = type.startsWith('image/') ? await this.preview(file) : null;
    if (type.startsWith('image/') && (!preview || preview.type !== 'image/jpeg' || !preview.size || preview.size > MAX_PREVIEW)) {
      throw new Error('The photo preview exceeds the supported size.');
    }
    const metadata = {id, placeId, filename: file.name, originalBytes: file.size, previewBytes: preview?.size ?? 0};
    return this.request('upload', new Blob(preview ? [file, preview] : [file], {type}), {
      signal, contentType: type, headers: {'X-Atlas-Upload': encodeURIComponent(JSON.stringify(metadata))},
    });
  }

  publish(id, scores, {proposalReceiptId,...options} = {}) {
    return this.request('publish', {id, scores, ...(proposalReceiptId?{proposalReceiptId}:{})}, options);
  }

  remove(id, options) {
    return this.request('delete', {id}, options);
  }

  media(id, variant = 'preview', options) {
    return this.request('media', {id, variant}, {...options, binary: true});
  }
}
