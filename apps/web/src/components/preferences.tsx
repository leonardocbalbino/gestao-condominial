import { Contrast, LogOut, Minus, Plus } from 'lucide-react';
import { changeFontSize, toggleHighContrast } from '@/app/preferences-actions';
import { logoutAction } from '@/app/entrar/actions';
import { buttonClass } from './ui';

/**
 * Tamanho da letra, alto contraste e sair (sempre ícone + texto). A preferência fica
 * salva em cookie e vale para todo o sistema.
 * - `buttons`: botões lado a lado (página "Mais" do morador).
 * - `menu`: lista vertical do menu do usuário no topo do painel.
 */
export function PreferenceControls({ layout = 'buttons' }: { layout?: 'buttons' | 'menu' }) {
  if (layout === 'menu') {
    const row =
      'flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-background';
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2 px-3 py-1">
          <span className="text-label font-medium">Tamanho da letra</span>
          <div className="flex gap-1">
            <form action={changeFontSize.bind(null, 'down')}>
              <button
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
                aria-label="Diminuir letra"
              >
                <Minus aria-hidden size={16} /> A
              </button>
            </form>
            <form action={changeFontSize.bind(null, 'up')}>
              <button
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
                aria-label="Aumentar letra"
              >
                <Plus aria-hidden size={16} /> A
              </button>
            </form>
          </div>
        </div>
        <form action={toggleHighContrast}>
          <button className={row}>
            <Contrast aria-hidden size={18} /> Contraste
          </button>
        </form>
        <form action={logoutAction}>
          <button className={`${row} text-danger`}>
            <LogOut aria-hidden size={18} /> Sair
          </button>
        </form>
      </div>
    );
  }

  const button = buttonClass({ variant: 'secondary' });
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
