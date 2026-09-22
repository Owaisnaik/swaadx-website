import { verifyToken } from 'npm:@clerk/backend';

export const ADMIN_CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://swaadx.in',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-correlation-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function adminResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: ADMIN_CORS_HEADERS });
}

export async function authenticateAdmin(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return { error: adminResponse({ error: { message: 'Authentication is required.' } }, 401) };
  }

  const clerkSecretKey = Deno.env.get('CLERK_SECRET_KEY') ?? '';
  const adminUserId = Deno.env.get('ADMIN_USER_ID') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!clerkSecretKey || !adminUserId || !supabaseUrl || !serviceRoleKey) {
    return { error: adminResponse({ error: { message: 'Admin backend is not configured.' } }, 503) };
  }

  try {
    const token = authorization.slice('Bearer '.length).trim();
    const verified = await verifyToken(token, { secretKey: clerkSecretKey });
    const clerkUserId = verified.sub;
    if (!clerkUserId) {
      return { error: adminResponse({ error: { message: 'Authentication is required.' } }, 401) };
    }
    if (clerkUserId !== adminUserId) {
      return { error: adminResponse({ error: { message: 'Admin access is not authorized.' } }, 403) };
    }
    return { clerkUserId };
  } catch {
    return { error: adminResponse({ error: { message: 'Authentication is required.' } }, 401) };
  }
}

export function serverRequestId() {
  return crypto.randomUUID();
}
