import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptText } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { pinActionSchema } from '@/lib/validators';
import { requirePinAssertion } from '@/lib/pin-guard';
import { enqueuePushNotification, processPushQueue } from '@/lib/push-queue';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const { searchParams } = new URL(req.url);
 const actionRaw = searchParams.get('action');
 const actionParsed = pinActionSchema.safeParse(actionRaw);

 if (actionParsed.success === false || ['view_secret', 'copy_secret'].includes(actionParsed.data) === false) {
 return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: auth } = await supabase.auth.getUser();
 if (auth.user == null) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const pinCheck = requirePinAssertion({
 request: req,
 userId: auth.user.id,
 action: actionParsed.data,
 targetItemId: id,
 });
 if (pinCheck.ok === false) {
 return pinCheck.response;
 }

 const { data: item, error } = await supabase
 .from('vault_items')
 .select('id,owner_user_id,title,secret_value_encrypted')
 .eq('id', id)
 .eq('owner_user_id', auth.user.id)
 .maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message, code: error.code ?? null }, { status: 400 });
 }
 if (item == null) {
 return NextResponse.json({ error: 'Item not found' }, { status: 404 });
 }

 void logAudit(actionParsed.data === 'copy_secret' ? 'vault_secret_copied' : 'vault_secret_viewed', {
 target_vault_item_id: id,
 }).catch(function () {});

 const copied = actionParsed.data === 'copy_secret';
 const itemTitle = String(item.title ?? 'vault item');
 void enqueuePushNotification({
 userId: auth.user.id,
 kind: 'vault',
 title: copied ? 'Sensitive data copied' : 'Sensitive data viewed',
 message: copied
 ? `A secret from "${itemTitle}" was copied.`
 : `A secret from "${itemTitle}" was viewed.`,
 href: '/vault/' + id,
 tag: copied ? 'vault-secret-copied' : 'vault-secret-viewed',
 priority: copied ? 8 : 7,
 payload: { requireInteraction: copied },
 }).then(function (queued) {
 if (!queued.ok) return;
 void processPushQueue({ batchSize: 10 }).catch(function (error) {
 console.error('Push process after vault secret action failed:', error);
 });
 }).catch(function (error) {
 console.error('Push enqueue for vault secret action failed:', error);
 });

 return NextResponse.json({ secret: decryptText(item.secret_value_encrypted) });
}
