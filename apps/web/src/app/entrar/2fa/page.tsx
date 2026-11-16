import type { MfaEnrollment } from '@condo/contracts';
import { ShieldCheck } from 'lucide-react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { COOKIES } from '@/lib/session';
import { verifyMfaAction } from '../actions';

/** Segundo fator: na primeira vez mostra o QR para cadastrar no aplicativo autenticador. */
export default async function DoisFatoresPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}) {
  const mfaToken = (await cookies()).get(COOKIES.mfa)?.value;
  if (!mfaToken) redirect('/entrar');
  const novo = (await searchParams).novo === '1';

  let qrSvg: string | null = null;
  let secret: string | null = null;
  if (novo) {
    const enrollment = await api<MfaEnrollment>('/auth/mfa/enroll', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { mfaToken },
    });
    qrSvg = await QRCode.toString(enrollment.otpauthUrl, { type: 'svg', margin: 1 });
    secret = enrollment.secret;
  }

  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <ShieldCheck aria-hidden /> Verificação em duas etapas
      </h1>
      {novo && qrSvg && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">1. Cadastre no aplicativo autenticador</h2>
          <p className="mb-4 text-text-muted">
            Abra o Google Authenticator, Microsoft Authenticator ou similar e leia o código abaixo.
          </p>
          <div
            className="mx-auto w-56 bg-white p-2"
            role="img"
            aria-label="QR code para cadastrar no aplicativo autenticador"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-4 text-sm text-text-muted">
            Sem câmera? Digite esta chave no aplicativo:{' '}
            <code className="break-all font-mono text-text">{secret}</code>
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Se o aplicativo já tiver outra entrada &quot;Gestão Condominial&quot; de uma tentativa
            anterior, apague-a e use só esta.
          </p>
        </Card>
      )}
      <Card>
        <h2 className="mb-4 text-xl font-bold">{novo ? '2. ' : ''}Digite o código de 6 números</h2>
        <ActionForm action={verifyMfaAction}>
          <Field
            label="Código do aplicativo"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            required
          />
          <SubmitButton>
            <ShieldCheck aria-hidden /> Confirmar
          </SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}
