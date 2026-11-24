// Emails a quote or invoice PDF to the customer on file, through Brevo's transactional API.
// The recipient always comes from the database (never from the request), and the caller must be
// a manager of the business that owns the document (checked through RLS with the caller's own token).
// Secrets (Supabase website → Edge Functions → Secrets): BREVO_API_KEY, SENDER_EMAIL (a sender verified in Brevo).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const sender = Deno.env.get('SENDER_EMAIL');
  if (!apiKey || !sender) return json(503, { error: 'not_configured' });

  const auth = req.headers.get('Authorization') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json(401, { error: 'Sign in again.' });

  let body: { kind?: string; id?: string; message?: string; pdf_base64?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }); }
  const kind = body.kind === 'quote' ? 'quote' : body.kind === 'invoice' ? 'invoice' : null;
  if (!kind || !body.id || !/^[0-9a-f-]{36}$/.test(body.id)) return json(400, { error: 'Bad request' });
  const pdf = (body.pdf_base64 ?? '').replace(/^data:application\/pdf;base64,/, '');
  if (!pdf || pdf.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(pdf)) return json(400, { error: 'The PDF is missing or too large.' });
  const message = (body.message ?? '').slice(0, 2000);

  // RLS returns the row only if this user may see it.
  const table = kind === 'quote' ? 'quotations' : 'invoices';
  const { data: doc } = await db.from(table)
    .select('id, business_id, reference, customer:customers(name, email), business:businesses(name, email)')
    .eq('id', body.id).maybeSingle();
  if (!doc) return json(404, { error: 'Document not found.' });
  const { data: isManager } = await db.rpc('is_manager', { p_business: doc.business_id });
  if (!isManager) return json(403, { error: 'Not allowed' });

  const customer = doc.customer as { name: string; email: string | null } | null;
  const business = doc.business as { name: string; email: string | null } | null;
  if (!customer?.email) return json(400, { error: 'This customer has no email address.' });

  const label = kind === 'quote' ? 'Quotation' : 'Invoice';
  const subject = `${label} ${doc.reference} from ${business?.name ?? ''}`.trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#151216">
    ${esc(message).replace(/\n/g, '<br>')}
    <p style="margin-top:24px;font-size:13px;color:#6f656a">${esc(label)} ${esc(doc.reference)} is attached as a PDF.</p></div>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: business?.name || 'COVARO', email: sender },
      to: [{ email: customer.email, name: customer.name }],
      ...(business?.email ? { replyTo: { email: business.email, name: business.name } } : {}),
      subject,
      htmlContent: html,
      textContent: `${message}\n\n${label} ${doc.reference} is attached as a PDF.`,
      attachment: [{ name: `${doc.reference}.pdf`, content: pdf }],
    }),
  });
  if (!res.ok) {
    console.error('brevo', res.status, await res.text());
    return json(502, { error: 'The email service refused the message. Try again later.' });
  }
  return json(200, { ok: true, to: customer.email });
});
