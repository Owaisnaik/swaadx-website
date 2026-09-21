import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const blockedKeyConcepts = [
  'token',
  'authorization',
  'secret',
  'password',
  'servicerolekey',
  'storagepath',
  'signedurl',
  'accountnumber',
  'bankaccount',
  'upi',
  'rawupi',
  'apikey',
  'accesskey',
  'privatekey',
];

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return blockedKeyConcepts.some((concept) => normalized.includes(concept));
}

function safeObject(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(safeObject);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !isSensitiveKey(key))
    .slice(0, 50)
    .map(([key, item]) => [key, safeObject(item)]));
}

export async function recordAdminAuditEvent(event: {
  adminClerkUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
  requestId: string;
  metadata?: unknown;
}) {
  const { error } = await supabaseAdmin.from('admin_audit_logs').insert({
    admin_clerk_user_id: event.adminClerkUserId,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? null,
    previous_state: safeObject(event.previousState) ?? null,
    new_state: safeObject(event.newState) ?? null,
    reason: event.reason ?? null,
    request_id: event.requestId,
    metadata: safeObject(event.metadata) ?? null,
  });
  if (error) throw error;
}
