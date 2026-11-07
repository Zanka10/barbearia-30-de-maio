// Seletor de foto de perfil: pré-visualização redonda, recorte quadrado central e
// redimensionamento no navegador (fotos de celular de vários MB viram ~100-200 KB).
import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Avatar } from './ui.jsx';

const MAX_SIDE = 640;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Recorta o centro da imagem em quadrado e devolve um JPEG de até 640x640. */
export async function preparePhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível ler esta imagem. Use uma foto JPG, PNG ou WEBP.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(MAX_SIDE, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
}

/**
 * onSelect(file) recebe a foto já tratada; onRemove() remove a atual.
 * Ambos podem ser assíncronos — o componente mostra "Enviando..." enquanto isso.
 */
export default function PhotoPicker({ name, src, onSelect, onRemove, onError, size = 88, hint = 'JPG, PNG ou WEBP. A foto é recortada em formato quadrado.' }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await onSelect(await preparePhoto(file));
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="photo-picker">
      <button type="button" className="photo-picker-avatar" onClick={() => fileRef.current.click()} disabled={busy} aria-label="Escolher foto de perfil">
        <Avatar name={name || '?'} src={src} size={size} />
        <span className="photo-picker-badge">
          <Camera />
        </span>
      </button>
      <div className="stack" style={{ gap: 6 }}>
        <div className="strong small">Foto de perfil</div>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => handle(e.target.files[0])} />
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current.click()} disabled={busy}>
            <Camera /> {busy ? 'Enviando...' : src ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {src && onRemove && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRemove();
                } catch (err) {
                  onError?.(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 /> Remover
            </button>
          )}
        </div>
        <span className="xs muted">{hint}</span>
      </div>
    </div>
  );
}
