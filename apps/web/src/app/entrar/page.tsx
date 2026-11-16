import { KeyRound, Mail } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Field } from '@/components/ui';
import { loginAction, requestMagicLinkAction } from './actions';

export default function EntrarPage() {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Entrar</h1>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Mail aria-hidden /> Receber link no e-mail
        </h2>
        <p className="mb-4 text-text-muted">Sem senha: enviamos um link que vale por 15 minutos.</p>
        <ActionForm action={requestMagicLinkAction}>
          <Field label="Seu e-mail" name="email" type="email" autoComplete="email" required />
          <SubmitButton>
            <Mail aria-hidden /> Enviar link
          </SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <KeyRound aria-hidden /> Entrar com senha
        </h2>
        <p className="mb-4 text-text-muted">
          Gestora, síndico e conselho confirmam com o código do aplicativo autenticador.
        </p>
        <ActionForm action={loginAction}>
          <Field label="E-mail" name="email" type="email" autoComplete="username" required />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <SubmitButton>
            <KeyRound aria-hidden /> Entrar
          </SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}
