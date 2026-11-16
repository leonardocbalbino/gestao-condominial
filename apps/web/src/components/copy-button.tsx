'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { buttonClass, type ButtonStyle } from './ui';

/** Copia um texto (código Pix, linha digitável) com confirmação visível e falada. */
export function CopyButton({
  value,
  label,
  size,
  fullWidth,
}: { value: string; label: string } & Pick<ButtonStyle, 'size' | 'fullWidth'>) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        });
      }}
      className={buttonClass({ variant: 'secondary', size, fullWidth })}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? 'Copiado!' : label}</span>
    </button>
  );
}
