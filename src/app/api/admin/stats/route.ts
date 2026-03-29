import { NextResponse } from 'next/server'; 
import { requireAdminContext } from '@/lib/admin'; 
import { createAdminClient } from '@/lib/supabase/admin'; 
 
type StatsPayload = { 
  totalUsers: number; 
  activeUsers: number; 
  adminUsers: number; 
  pendingApprovals: number; 
  reviewedApprovals24h: number; 
  recentSensitiveActions24h: number; 
}; 
 
const STATS_CACHE_MS = 15_000; 
let statsCacheExpiresAt = 0; 
let statsCachePayload: StatsPayload = { 
  totalUsers: 0, 
  activeUsers: 0, 
  adminUsers: 0, 
  pendingApprovals: 0, 
  reviewedApprovals24h: 0, 
  recentSensitiveActions24h: 0, 
}; 
 
export async function GET() { 
  const ctx = await requireAdminContext(); 
  if ('error' in ctx) return ctx.error; 
 
  if (Date.now() < statsCacheExpiresAt) { 
    return NextResponse.json(statsCachePayload, { headers: { 'x-stats-cache': 'hit' } }); 
  } 
 
  const admin = createAdminClient(); 
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); 
 
  const [ 
    usersRes, 
    activeUsersRes, 
    adminsRes, 
    pendingApprovalsRes, 
    reviewedTodayRes, 
    logsRes, 
  ] = await Promise.all([ 
    admin.from('profiles').select('id', { count: 'exact', head: true }), 
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'), 
    admin.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'super_admin', 'approver']), 
    admin.from('approval_requests').select('id', { count: 'exact', head: true }).eq('request_status', 'pending'), 
    admin.from('approval_requests').select('id', { count: 'exact', head: true }).gte('reviewed_at', since24h), 
    admin.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', since24h), 
  ]); 
 
  statsCachePayload = { 
    totalUsers: usersRes.count ?? 0, 
    activeUsers: activeUsersRes.count ?? 0, 
    adminUsers: adminsRes.count ?? 0, 
    pendingApprovals: pendingApprovalsRes.count ?? 0, 
    reviewedApprovals24h: reviewedTodayRes.count ?? 0, 
    recentSensitiveActions24h: logsRes.count ?? 0, 
  }; 
  statsCacheExpiresAt = Date.now() + STATS_CACHE_MS; 
 
  return NextResponse.json(statsCachePayload, { headers: { 'x-stats-cache': 'miss' } }); 
}
