/** Verificação de saúde do web (usada pelo healthcheck do container). */
export function GET(): Response {
  return Response.json({ ok: true });
}
