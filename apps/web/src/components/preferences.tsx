import { Contrast, LogOut, Minus, Plus } from 'lucide-react';
import { changeFontSize, toggleHighContrast } from '@/app/preferences-actions';
import { logoutAction } from '@/app/entrar/actions';

const tones = {
  light: 'border-2 border-border bg-surface text-text hover:border-primary hover:text-primary',
  /** Sobre o menu lateral escuro do painel. */
  dark: 'border border-on-sidebar/30 bg-transparent text-on-sidebar hover:bg-sidebar-active',
} as const;

/**
 * Tamanho da letra, alto contraste e sair (sempre ícone + texto, alvo ≥ 48px).
 * Ficam juntos para a pessoa achar tudo de "ajustar a tela" num lugar só.
 */
export function PreferenceControls({ tone = 'light' }: { tone?: keyof typeof tones }) {
  const button = `inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-xl px-3 font-semibold ${tones[tone]}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={changeFontSize.bind(null, 'down')}>
        <button className={button} aria-label="Diminuir letra">
          <Minus aria-hidden size={18} /> A
        </button>
      </form>
      <form action={changeFontSize.bind(null, 'up')}>
        <button className={button} aria-label="Aumentar letra">
          <Plus aria-hidden size={18} /> A
        </button>
      </form>
      <form action={toggleHighContrast}>
        <button className={button}>
          <Contrast aria-hidden size={18} /> Contraste
        </button>
      </form>
      <form action={logoutAction}>
        <button className={button}>
          <LogOut aria-hidden size={18} /> Sair
        </button>
      </form>
    </div>
  );
}
