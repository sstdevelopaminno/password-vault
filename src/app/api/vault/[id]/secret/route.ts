import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptText } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { pinActionSchema } from '@/lib/validators';
import { requirePinAssertion } from '@/lib/pin-guard';

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
 .select('id,owner_user_id,secret_value_encrypted')
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

 return NextResponse.json({ secret: decryptText(item.secret_value_encrypted) });
}
