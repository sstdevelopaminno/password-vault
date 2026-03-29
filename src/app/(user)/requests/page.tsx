import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ApprovalsClient } from '@/components/admin/approvals-client';

export default async function RequestsPage() {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) redirect('/login');

 const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
 const role = String(profile?.role ?? 'user');
 if (!['approver', 'admin', 'super_admin'].includes(role)) redirect('/home');

 return <ApprovalsClient />;
}

