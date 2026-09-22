import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminResponse, authenticateAdmin, serverRequestId, ADMIN_CORS_HEADERS } from '../_shared/admin-auth.ts';
import { recordAdminAuditEvent } from '../_shared/admin-audit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const navigation = [
  { label: 'Dashboard', href: 'dashboard.html', key: 'dashboard' },
  { label: 'Delivery Partners', key: 'delivery-partners', children: [
    { label: 'Applications', href: 'delivery-partners/applications.html' },
    { label: 'All Partners', href: 'delivery-partners/index.html' },
    { label: 'KYC Reviews', href: 'kyc/index.html' },
    { label: 'Suspended', href: 'delivery-partners/suspended.html' },
  ] },
  { label: 'Restaurants', key: 'restaurants', children: [
    { label: 'Applications', href: 'restaurants/applications.html' },
    { label: 'All Restaurants', href: 'restaurants/index.html' },
    { label: 'Menus', href: 'restaurants/menus.html' },
    { label: 'Content Moderation', href: 'restaurants/moderation.html' },
    { label: 'Suspended', href: 'restaurants/suspended.html' },
  ] },
  { label: 'Orders', key: 'orders', children: [
    { label: 'All Orders', href: 'orders/index.html' },
    { label: 'Active', href: 'orders/active.html' },
    { label: 'Completed', href: 'orders/completed.html' },
    { label: 'Cancelled', href: 'orders/cancelled.html' },
  ] },
  { label: 'Payments', href: 'payments/index.html', key: 'payments' },
  { label: 'Earnings', href: 'earnings/index.html', key: 'earnings' },
  { label: 'Payouts', href: 'payouts/index.html', key: 'payouts' },
  { label: 'Reviews / Reports', href: 'reviews/index.html', key: 'reviews' },
  { label: 'Audit Log', href: 'audit/index.html', key: 'audit' },
  { label: 'Settings', href: 'settings/index.html', key: 'settings' },
];

async function countRows(table: string) {
  const { count, error } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

const partnerColumns = 'id,clerk_user_id,full_name,phone,email,status,is_online,vehicle_type,vehicle_registration_number,application_submitted_at,onboarding_completed_at,created_at,date_of_birth,address,driving_license_number,driving_license_expiry,rc_number';
const pageSizeLimit = 50;

function parsePage(url: URL) {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > pageSizeLimit) {
    throw new Error('Invalid pagination.');
  }
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function parsePartnerId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid delivery partner ID.');
  }
  return value;
}

function safePartner(row: Record<string, unknown>) {
  return {
    id: row.id, clerkUserId: row.clerk_user_id, fullName: row.full_name, phone: row.phone, email: row.email,
    status: row.status, isOnline: row.is_online, vehicleType: row.vehicle_type,
    vehicleRegistrationNumber: row.vehicle_registration_number, applicationSubmittedAt: row.application_submitted_at,
    onboardingCompletedAt: row.onboarding_completed_at, createdAt: row.created_at, dateOfBirth: row.date_of_birth,
    address: row.address, drivingLicenseNumber: row.driving_license_number,
    drivingLicenseExpiry: row.driving_license_expiry, rcNumber: row.rc_number,
  };
}

function safePage<T>(rows: T[], count: number | null, page: number, pageSize: number) {
  return { items: rows, page, pageSize, total: count ?? rows.length, totalPages: Math.ceil((count ?? rows.length) / pageSize) };
}

async function listPartners(url: URL) {
  const pagination = parsePage(url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search')?.trim();
  const allowedStatuses = ['pending', 'approved', 'suspended', 'rejected'];
  if (status && !allowedStatuses.includes(status)) throw new Error('Invalid partner status.');
  let query = supabaseAdmin.from('delivery_partners').select(partnerColumns, { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (status) query = query.eq('status', status);
  if (search) {
    const safeSearch = search.replace(/[%(),]/g, '');
    if (safeSearch) {
      const idFilter = /^[0-9a-f-]{36}$/i.test(safeSearch) ? `,id.eq.${safeSearch}` : '';
      query = query.or(`full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,clerk_user_id.ilike.%${safeSearch}%${idFilter}`);
    }
  }
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => safePartner(row)), count, pagination.page, pagination.pageSize);
}

async function getPartner(id: string) {
  const partnerId = parsePartnerId(id);
  const { data, error } = await supabaseAdmin.from('delivery_partners').select(partnerColumns).eq('id', partnerId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [{ data: kycProfile, error: kycError }, { data: activeDelivery, error: deliveryError }] = await Promise.all([
    supabaseAdmin.from('delivery_partner_kyc_profiles')
      .select('id,verification_status,legal_name,date_of_birth,pan_last4,submitted_at,verified_at,rejected_at,rejection_reason')
      .eq('delivery_partner_id', partnerId).maybeSingle(),
    supabaseAdmin.from('deliveries')
      .select('id,order_id,status,assigned_at,picked_up_at,delivered_at,created_at,updated_at,orders(order_number)')
      .eq('delivery_partner_id', partnerId)
      .in('status', ['assigned', 'at_restaurant', 'picked_up', 'delivering'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (kycError) throw kycError;
  if (deliveryError) throw deliveryError;
  const partner = safePartner(data) as Record<string, unknown>;
  partner.kyc = kycProfile ? {
    id: kycProfile.id, verificationStatus: kycProfile.verification_status, legalName: kycProfile.legal_name,
    dateOfBirth: kycProfile.date_of_birth, panLast4: kycProfile.pan_last4, submittedAt: kycProfile.submitted_at,
    verifiedAt: kycProfile.verified_at, rejectedAt: kycProfile.rejected_at, rejectionReason: kycProfile.rejection_reason,
  } : null;
  partner.activeDelivery = activeDelivery ? {
    id: activeDelivery.id, orderId: activeDelivery.order_id, orderNumber: activeDelivery.orders?.[0]?.order_number ?? null,
    status: activeDelivery.status, assignedAt: activeDelivery.assigned_at, pickedUpAt: activeDelivery.picked_up_at,
    deliveredAt: activeDelivery.delivered_at,
  } : null;
  return partner;
}

const statusTransitions: Record<string, { from: string[]; to: string }> = {
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  suspend: { from: ['approved'], to: 'suspended' },
  reactivate: { from: ['suspended'], to: 'approved' },
};

async function changePartnerStatus(id: string, action: string, adminClerkUserId: string, requestId: string, request: Request) {
  const transition = statusTransitions[action];
  if (!transition) throw new Error('Invalid delivery partner action.');
  const partnerId = parsePartnerId(id);
  let reason: string | null = null;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new Error('Invalid action reason.');
    }
    if (body && typeof body === 'object' && 'reason' in body) {
      if (typeof body.reason !== 'string' || body.reason.length > 500) throw new Error('Invalid action reason.');
      reason = body.reason.trim() || null;
    }
  }
  const { data: current, error: currentError } = await supabaseAdmin.from('delivery_partners')
    .select('id,full_name,status').eq('id', partnerId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (!transition.from.includes(current.status)) {
    return { conflict: true, current: { id: current.id, fullName: current.full_name, status: current.status } };
  }
  const { data: updated, error: updateError } = await supabaseAdmin.from('delivery_partners')
    .update({ status: transition.to, updated_at: new Date().toISOString() })
    .eq('id', partnerId).eq('status', current.status)
    .select('id,full_name,status').maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { conflict: true, current: { id: current.id, fullName: current.full_name, status: current.status } };
  try {
    await recordAdminAuditEvent({
      adminClerkUserId, action: `delivery_partner_${action}`, resourceType: 'delivery_partner', resourceId: partnerId,
      previousState: { status: current.status }, newState: { status: updated.status }, reason, requestId,
    });
  } catch (auditError) {
    const { error: rollbackError } = await supabaseAdmin.from('delivery_partners')
      .update({ status: current.status, updated_at: new Date().toISOString() })
      .eq('id', partnerId).eq('status', updated.status);
    if (rollbackError) {
      console.error('admin-api partner status rollback failed after audit failure', rollbackError.message);
    }
    console.error('admin-api partner status audit failed', auditError instanceof Error ? auditError.message : 'unknown error');
    throw new Error('Delivery partner status change could not be completed.');
  }
  return { id: updated.id, fullName: updated.full_name, previousStatus: current.status, status: updated.status };
}

async function listPartnerDeliveries(id: string, url: URL) {
  const pagination = parsePage(url);
  const partnerId = parsePartnerId(id);
  const { data, count, error } = await supabaseAdmin.from('deliveries').select('id,order_id,status,assigned_at,picked_up_at,delivered_at,created_at,updated_at,orders(order_number)', { count: 'exact' }).eq('delivery_partner_id', partnerId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (error) throw error;
  return safePage((data ?? []).map((row: Record<string, any>) => ({
    id: row.id, orderId: row.order_id, orderNumber: row.orders?.order_number ?? null, status: row.status,
    assignedAt: row.assigned_at, pickedUpAt: row.picked_up_at, deliveredAt: row.delivered_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  })), count, pagination.page, pagination.pageSize);
}

async function listPartnerEarnings(id: string, url: URL) {
  const pagination = parsePage(url);
  const partnerId = parsePartnerId(id);
  const { data, count, error } = await supabaseAdmin.from('delivery_earnings').select('id,delivery_id,amount,status,created_at', { count: 'exact' }).eq('delivery_partner_id', partnerId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (error) throw error;
  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return { ...safePage(rows.map((row) => ({ id: row.id, deliveryId: row.delivery_id, amount: row.amount, status: row.status, createdAt: row.created_at })), count, pagination.page, pagination.pageSize), pageTotalAmount: total };
}

async function listPayoutMethods(id: string) {
  const { data, error } = await supabaseAdmin.from('delivery_partner_payout_methods').select('id,method_type,status,account_holder_name,bank_name,ifsc,account_last4,masked_upi,is_default,verified_at,created_at,updated_at').eq('delivery_partner_id', parsePartnerId(id)).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id, methodType: row.method_type, status: row.status, accountHolderName: row.account_holder_name,
    bankName: row.bank_name, ifsc: row.ifsc, accountLast4: row.account_last4, maskedUpi: row.masked_upi,
    isDefault: row.is_default, verifiedAt: row.verified_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

async function listPayouts(id: string, url: URL) {
  const pagination = parsePage(url);
  const partnerId = parsePartnerId(id);
  const { data, count, error } = await supabaseAdmin.from('delivery_partner_payouts').select('id,settlement_id,amount,currency,status,created_at,completed_at,failed_at,processing_at', { count: 'exact' }).eq('delivery_partner_id', partnerId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (error) throw error;
  return safePage((data ?? []).map((row) => ({ id: row.id, settlementId: row.settlement_id, amount: row.amount, currency: row.currency, status: row.status, createdAt: row.created_at, completedAt: row.completed_at, failedAt: row.failed_at, processingAt: row.processing_at })), count, pagination.page, pagination.pageSize);
}

const kycStatuses = ['draft', 'submitted', 'under_review', 'verified', 'rejected'];
const privateKycBucket = 'delivery-partner-kyc-documents';
const privateKycPrefix = 'delivery-partner-kyc/';

function parseUuid(value: string, message: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(message);
  return value;
}

function safeKycProfile(row: Record<string, any>) {
  const partner = row.delivery_partners;
  return {
    id: row.id, deliveryPartnerId: row.delivery_partner_id, verificationStatus: row.verification_status,
    legalName: row.legal_name, dateOfBirth: row.date_of_birth, panLast4: row.pan_last4,
    submittedAt: row.submitted_at, verifiedAt: row.verified_at, rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    partner: partner ? { id: partner.id, fullName: partner.full_name, phone: partner.phone, email: partner.email, status: partner.status } : null,
  };
}

async function listKyc(url: URL) {
  const pagination = parsePage(url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  if (status && !kycStatuses.includes(status)) throw new Error('Invalid KYC status.');
  let query = supabaseAdmin.from('delivery_partner_kyc_profiles')
    .select('id,delivery_partner_id,verification_status,legal_name,date_of_birth,pan_last4,submitted_at,verified_at,rejected_at,rejection_reason,delivery_partners(id,full_name,phone,email,status)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (status) query = query.eq('verification_status', status);
  if (search) query = query.or(`legal_name.ilike.%${search}%,delivery_partners.full_name.ilike.%${search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => safeKycProfile(row)), count, pagination.page, pagination.pageSize);
}

async function getKycProfile(id: string) {
  const { data, error } = await supabaseAdmin.from('delivery_partner_kyc_profiles')
    .select('id,delivery_partner_id,verification_status,legal_name,date_of_birth,pan_last4,submitted_at,verified_at,rejected_at,rejection_reason,delivery_partners(id,full_name,phone,email,status)')
    .eq('id', parseUuid(id, 'Invalid KYC profile ID.')).maybeSingle();
  if (error) throw error;
  return data ? safeKycProfile(data) : null;
}

async function listKycDocuments(profileId: string) {
  const { data, error } = await supabaseAdmin.from('delivery_partner_kyc_documents')
    .select('id,document_type,verification_status,expiry_date,submitted_at,verified_at,rejected_at,rejection_reason')
    .eq('kyc_profile_id', parseUuid(profileId, 'Invalid KYC profile ID.')).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id, documentType: row.document_type, verificationStatus: row.verification_status,
    expiryDate: row.expiry_date, submittedAt: row.submitted_at, verifiedAt: row.verified_at,
    rejectedAt: row.rejected_at, rejectionReason: row.rejection_reason,
  }));
}

async function viewKycDocument(documentId: string, adminClerkUserId: string, requestId: string) {
  const { data, error } = await supabaseAdmin.from('delivery_partner_kyc_documents')
    .select('id,document_type,verification_status,expiry_date,submitted_at,verified_at,rejected_at,rejection_reason,storage_path,kyc_profile_id,delivery_partner_id')
    .eq('id', parseUuid(documentId, 'Invalid document ID.')).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: kycProfile, error: profileError } = await supabaseAdmin
    .from('delivery_partner_kyc_profiles')
    .select('delivery_partner_id')
    .eq('id', data.kyc_profile_id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!kycProfile || kycProfile.delivery_partner_id !== data.delivery_partner_id) return null;
  if (!data.storage_path || !data.storage_path.startsWith(privateKycPrefix)) throw new Error('Document storage is not configured for private access.');
  const { data: signed, error: signedError } = await supabaseAdmin.storage.from(privateKycBucket).createSignedUrl(data.storage_path, 60);
  if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Unable to create document preview.');
  await recordAdminAuditEvent({
    adminClerkUserId, action: 'document_viewed', resourceType: 'kyc_document', resourceId: data.id,
    requestId, metadata: { documentType: data.document_type, kycProfileId: data.kyc_profile_id },
  });
  return {
    signedUrl: signed.signedUrl, expiresInSeconds: 60, document: {
      id: data.id, documentType: data.document_type, verificationStatus: data.verification_status,
      expiryDate: data.expiry_date,
    },
  };
}

async function listAuditLogs(url: URL) {
  const pagination = parsePage(url);
  const action = url.searchParams.get('action');
  const resourceType = url.searchParams.get('resourceType');
  const resourceId = url.searchParams.get('resourceId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  let query = supabaseAdmin.from('admin_audit_logs')
    .select('id,admin_clerk_user_id,action,resource_type,resource_id,reason,request_id,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (action) query = query.eq('action', action.slice(0, 100));
  if (resourceType) query = query.eq('resource_type', resourceType.slice(0, 100));
  if (resourceId) query = query.eq('resource_id', resourceId.slice(0, 200));
  if (from && !Number.isNaN(Date.parse(from))) query = query.gte('created_at', from);
  if (to && !Number.isNaN(Date.parse(to))) query = query.lte('created_at', to);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => ({
    id: row.id, adminClerkUserId: row.admin_clerk_user_id, action: row.action,
    resourceType: row.resource_type, resourceId: row.resource_id, reason: row.reason,
    requestId: row.request_id, createdAt: row.created_at,
  })), count, pagination.page, pagination.pageSize);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ADMIN_CORS_HEADERS });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return adminResponse({ error: { message: 'Method not allowed.' } }, 405);
  }

  const auth = await authenticateAdmin(request);
  if ('error' in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const requestId = serverRequestId();
  if (path.endsWith('/me')) return adminResponse({ data: { clerkUserId: auth.clerkUserId } }, 200);
  if (path.endsWith('/navigation')) return adminResponse({ data: { navigation } }, 200);
  try {
    const partnerActionMatch = path.match(/\/delivery-partners\/([^/]+)\/(approve|reject|suspend|reactivate)$/);
    if (request.method === 'POST' && partnerActionMatch) {
      const changed = await changePartnerStatus(partnerActionMatch[1], partnerActionMatch[2], auth.clerkUserId, requestId, request);
      if (!changed) return adminResponse({ error: { message: 'Delivery partner not found.' } }, 404);
      if ('conflict' in changed) {
        if (!changed.current) return adminResponse({ error: { message: 'Partner status changed. Refresh before trying again.' } }, 409);
        return adminResponse({ error: { message: `Partner is currently ${changed.current.status}. Refresh before trying again.` } }, 409);
      }
      return adminResponse({ data: changed }, 200);
    }
    if (request.method !== 'GET') return adminResponse({ error: { message: 'Method not allowed.' } }, 405);
    if (path.endsWith('/audit')) return adminResponse({ data: await listAuditLogs(url) }, 200);
    const documentViewMatch = path.match(/\/kyc\/documents\/([^/]+)\/view$/);
    if (documentViewMatch) {
      const viewed = await viewKycDocument(documentViewMatch[1], auth.clerkUserId, requestId);
      return viewed ? adminResponse({ data: viewed }, 200) : adminResponse({ error: { message: 'KYC document not found.' } }, 404);
    }
    const kycDocumentMatch = path.match(/\/kyc\/([^/]+)\/documents$/);
    if (kycDocumentMatch) return adminResponse({ data: await listKycDocuments(kycDocumentMatch[1]) }, 200);
    const kycProfileMatch = path.match(/\/kyc\/([^/]+)$/);
    if (kycProfileMatch) {
      const profile = await getKycProfile(kycProfileMatch[1]);
      return profile ? adminResponse({ data: profile }, 200) : adminResponse({ error: { message: 'KYC profile not found.' } }, 404);
    }
    if (path.endsWith('/kyc')) return adminResponse({ data: await listKyc(url) }, 200);
    if (path.endsWith('/delivery-partners')) return adminResponse({ data: await listPartners(url) }, 200);
    const partnerMatch = path.match(/\/delivery-partners\/([^/]+)(?:\/([^/]+))?$/);
    if (partnerMatch) {
      const partner = await getPartner(partnerMatch[1]);
      if (!partner) return adminResponse({ error: { message: 'Delivery partner not found.' } }, 404);
      const subresource = partnerMatch[2];
      if (!subresource) return adminResponse({ data: partner }, 200);
      if (subresource === 'deliveries') return adminResponse({ data: await listPartnerDeliveries(partnerMatch[1], url) }, 200);
      if (subresource === 'earnings') return adminResponse({ data: await listPartnerEarnings(partnerMatch[1], url) }, 200);
      if (subresource === 'payout-methods') return adminResponse({ data: await listPayoutMethods(partnerMatch[1]) }, 200);
      if (subresource === 'payouts') return adminResponse({ data: await listPayouts(partnerMatch[1], url) }, 200);
    }
  } catch (error) {
    if (error instanceof Error && ['Invalid pagination.', 'Invalid partner status.', 'Invalid delivery partner ID.', 'Invalid KYC status.', 'Invalid KYC profile ID.', 'Invalid document ID.', 'Invalid delivery partner action.', 'Invalid action reason.'].includes(error.message)) {
      return adminResponse({ error: { message: error.message } }, 400);
    }
    console.error('admin-api delivery partner read failed', error instanceof Error ? error.message : 'unknown error');
    return adminResponse({ error: { message: 'Unable to load delivery partner data.' } }, 500);
  }
  if (!path.endsWith('/dashboard-summary')) return adminResponse({ error: { message: 'Not found.' } }, 404);

  try {
    const [deliveryPartners, kycProfiles, restaurants, orders] = await Promise.all([
      countRows('delivery_partners'),
      countRows('delivery_partner_kyc_profiles'),
      countRows('restaurants'),
      countRows('orders'),
    ]);

    return adminResponse({
      data: {
        deliveryPartners,
        kycProfiles,
        restaurants,
        orders,
        generatedAt: new Date().toISOString(),
      },
    }, 200);
  } catch (error) {
    console.error('admin-api dashboard summary failed', error instanceof Error ? error.message : 'unknown error');
    return adminResponse({ error: { message: 'Unable to load the dashboard summary.' } }, 500);
  }
});
