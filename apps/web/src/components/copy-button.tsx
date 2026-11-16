'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Copia um texto (código Pix, linha digitável) com confirmação visível e falada. */
export function CopyButton({ value, label }: { value: string; label: string }) {
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
      className="inline-flex min-h-13 items-center justify-center gap-2 rounded-[14px] border-2 border-border bg-surface px-4 py-3 font-bold text-text hover:border-primary hover:text-primary"
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? 'Copiado!' : label}</span>
    </button>
  );
}
