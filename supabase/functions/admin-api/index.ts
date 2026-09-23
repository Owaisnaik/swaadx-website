import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClerkClient } from 'npm:@clerk/backend';
import { adminResponse, authenticateAdmin, serverRequestId, ADMIN_CORS_HEADERS } from '../_shared/admin-auth.ts';
import { recordAdminAuditEvent } from '../_shared/admin-audit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const clerkClient = createClerkClient({ secretKey: Deno.env.get('CLERK_SECRET_KEY') ?? '' });

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

const restaurantColumns = 'id,name,description,address,phone,created_at,cuisine,city,state,country,postal_code,landmark,latitude,longitude,is_available,lifecycle_status,archived_at,archived_by_admin_id,archive_reason,opening_hours,delivery_radius_km,preparation_time_minutes,cover_image';
const menuItemColumns = 'id,restaurant_id,name,description,price,image,veg,category,recommended,created_at,free_delivery,dietary_labels,spice_level,delivery_fee,preparation_time_minutes,available,discount_type,discount_percentage,discount_amount';
const orderListColumns = 'id,order_number,restaurant_id,customer_clerk_user_id,status,subtotal,delivery_fee,taxes,discount,total,payment_status,created_at,updated_at,restaurants:restaurant_id(name),deliveries(status,delivery_partner_id,assigned_at,picked_up_at,delivered_at,created_at,updated_at,delivery_partners:delivery_partner_id(full_name,status))';
const orderDetailColumns = `${orderListColumns},estimated_delivery,delivery_recipient_name,delivery_address,delivery_landmark,delivery_city,delivery_state,delivery_country,delivery_postal_code,delivery_phone,delivery_latitude,delivery_longitude,order_items(id,menu_item_id,name,quantity,price,selected_addons,created_at)`;
const paymentColumns = 'id,order_id,payment_status,cashfree_order_id,cashfree_payment_session_id,payment_reference,created_at,updated_at,orders!inner(id,order_number,customer_clerk_user_id,restaurant_id,status,total,payment_amount,payment_currency,restaurants:restaurant_id(name))';
const earningColumns = 'id,delivery_id,delivery_partner_id,amount,status,created_at,deliveries!delivery_earnings_delivery_id_fkey(order_id,status,delivered_at,created_at,updated_at,orders!inner(order_number,restaurant_id,restaurants:restaurant_id(name))),delivery_partners!inner(full_name,status)';
const payoutColumns = 'id,delivery_partner_id,settlement_id,payout_method_id,amount,currency,status,provider_name,provider_payout_id,provider_transaction_reference,failure_code,attempt_count,created_at,processing_at,completed_at,failed_at,delivery_partners!delivery_partner_payouts_delivery_partner_id_fkey(full_name,status),delivery_partner_settlements!delivery_partner_payouts_settlement_id_fkey(id,period_start,period_end,gross_amount,adjustments_amount,payable_amount,status,created_at,processed_at),delivery_partner_payout_methods!delivery_partner_payouts_payout_method_id_fkey(method_type,status,account_holder_name,bank_name,account_last4,masked_upi,is_default),delivery_partner_payout_items!delivery_partner_payout_items_payout_id_fkey(id,delivery_earning_id,amount,created_at,delivery_earnings!delivery_partner_payout_items_delivery_earning_id_fkey(id,delivery_id,amount,status,created_at,deliveries!delivery_earnings_delivery_id_fkey(order_id,status,delivered_at,orders!inner(id,order_number,restaurant_id,total,restaurants:restaurant_id(name)))))';

function parseRestaurantId(value: string) {
  return parseUuid(value, 'Invalid restaurant ID.');
}

function parseRestaurantMenuPage(url: URL) {
  const page = Number(url.searchParams.get('menuPage') ?? '1');
  const pageSize = Number(url.searchParams.get('menuPageSize') ?? String(pageSizeLimit));
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > pageSizeLimit) {
    throw new Error('Invalid restaurant menu pagination.');
  }
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function parseRestaurantReviewPage(url: URL) {
  const page = Number(url.searchParams.get('reviewPage') ?? '1');
  const pageSize = Number(url.searchParams.get('reviewPageSize') ?? String(pageSizeLimit));
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > pageSizeLimit) {
    throw new Error('Invalid restaurant review pagination.');
  }
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function safeRestaurant(row: Record<string, any>) {
  return {
    id: row.id, name: row.name, description: row.description, address: row.address, phone: row.phone,
    createdAt: row.created_at, cuisine: row.cuisine, city: row.city, state: row.state, country: row.country,
    postalCode: row.postal_code, landmark: row.landmark, latitude: row.latitude, longitude: row.longitude,
    isAvailable: row.is_available, lifecycleStatus: row.lifecycle_status, archivedAt: row.archived_at,
    archiveReason: row.archive_reason, openingHours: row.opening_hours, deliveryRadiusKm: row.delivery_radius_km,
    preparationTimeMinutes: row.preparation_time_minutes, coverImage: row.cover_image,
  };
}

function safeMenuItem(row: Record<string, any>) {
  return {
    id: row.id, restaurantId: row.restaurant_id, name: row.name, description: row.description,
    price: row.price, image: row.image, vegetarian: row.veg, category: row.category,
    recommended: row.recommended, createdAt: row.created_at, freeDelivery: row.free_delivery,
    dietaryLabels: row.dietary_labels, spiceLevel: row.spice_level, deliveryFee: row.delivery_fee,
    preparationTimeMinutes: row.preparation_time_minutes, available: row.available,
    discountType: row.discount_type, discountPercentage: row.discount_percentage, discountAmount: row.discount_amount,
  };
}

function safeRestaurantReview(row: Record<string, any>) {
  return { id: row.id, restaurantId: row.restaurant_id, orderId: row.order_id, rating: row.rating, reviewText: row.review_text, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function listRestaurants(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  const availability = url.searchParams.get('availability');
  const lifecycle = url.searchParams.get('lifecycle');
  if (availability && !['available', 'unavailable'].includes(availability)) throw new Error('Invalid restaurant availability.');
  if (lifecycle && !['active', 'archived'].includes(lifecycle)) throw new Error('Invalid restaurant lifecycle.');
  let query = supabaseAdmin.from('restaurants').select(restaurantColumns, { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (availability) query = query.eq('is_available', availability === 'available');
  if (lifecycle) query = query.eq('lifecycle_status', lifecycle);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%,cuisine.ilike.%${search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => safeRestaurant(row)), count, pagination.page, pagination.pageSize);
}

function parseBoundedReason(body: unknown) {
  if (!body || typeof body !== 'object' || !('reason' in body)) return null;
  if (typeof body.reason !== 'string' || body.reason.length > 500) throw new Error('Invalid restaurant archive reason.');
  return body.reason.trim() || null;
}

async function readOptionalReason(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return null;
  try {
    return parseBoundedReason(await request.json());
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid restaurant archive reason.') throw error;
    throw new Error('Invalid restaurant archive reason.');
  }
}

async function changeRestaurantLifecycle(id: string, action: string, adminClerkUserId: string, requestId: string, request: Request) {
  const restaurantId = parseRestaurantId(id);
  if (!['archive', 'reactivate'].includes(action)) throw new Error('Invalid restaurant lifecycle action.');
  const reason = action === 'archive' ? await readOptionalReason(request) : null;
  const { data: current, error: currentError } = await supabaseAdmin.from('restaurants')
    .select('id,name,lifecycle_status,archived_at,archived_by_admin_id,archive_reason')
    .eq('id', restaurantId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  const nextStatus = action === 'archive' ? 'archived' : 'active';
  if (current.lifecycle_status === nextStatus) return { conflict: true, current: { id: current.id, lifecycleStatus: current.lifecycle_status } };
  const now = new Date().toISOString();
  const update = action === 'archive'
    ? { lifecycle_status: 'archived', archived_at: now, archived_by_admin_id: adminClerkUserId, archive_reason: reason }
    : { lifecycle_status: 'active', archived_at: null, archived_by_admin_id: null, archive_reason: null };
  const { data: updated, error: updateError } = await supabaseAdmin.from('restaurants')
    .update(update).eq('id', restaurantId).eq('lifecycle_status', current.lifecycle_status)
    .select('id,name,lifecycle_status,archived_at,archived_by_admin_id,archive_reason').maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { conflict: true, current: { id: current.id, lifecycleStatus: current.lifecycle_status } };
  try {
    await recordAdminAuditEvent({
      adminClerkUserId, action: action === 'archive' ? 'restaurant_archived' : 'restaurant_reactivated',
      resourceType: 'restaurant', resourceId: restaurantId,
      previousState: { lifecycleStatus: current.lifecycle_status, archivedAt: current.archived_at, archiveReason: current.archive_reason },
      newState: { lifecycleStatus: updated.lifecycle_status, archivedAt: updated.archived_at, archiveReason: updated.archive_reason },
      reason, requestId,
    });
  } catch (auditError) {
    let rollbackQuery = supabaseAdmin.from('restaurants').update({
      lifecycle_status: current.lifecycle_status, archived_at: current.archived_at,
      archived_by_admin_id: current.archived_by_admin_id, archive_reason: current.archive_reason,
    }).eq('id', restaurantId).eq('lifecycle_status', updated.lifecycle_status);
    rollbackQuery = updated.archived_at
      ? rollbackQuery.eq('archived_at', updated.archived_at)
      : rollbackQuery.is('archived_at', null);
    const { error: rollbackError } = await rollbackQuery;
    if (rollbackError) console.error('admin-api restaurant lifecycle rollback failed after audit failure', rollbackError.message);
    console.error('admin-api restaurant lifecycle audit failed', auditError instanceof Error ? auditError.message : 'unknown error');
    throw new Error('Restaurant lifecycle change could not be completed.');
  }
  return { id: updated.id, name: updated.name, lifecycleStatus: updated.lifecycle_status, previousLifecycleStatus: current.lifecycle_status };
}

async function changeMenuItemAvailability(restaurantIdValue: string, menuItemIdValue: string, action: string, adminClerkUserId: string, requestId: string) {
  const restaurantId = parseRestaurantId(restaurantIdValue);
  const menuItemId = parseUuid(menuItemIdValue, 'Invalid menu item ID.');
  if (!['deactivate', 'reactivate'].includes(action)) throw new Error('Invalid menu item action.');
  const { data: current, error: currentError } = await supabaseAdmin.from('menu_items')
    .select('id,restaurant_id,name,available').eq('id', menuItemId).eq('restaurant_id', restaurantId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  const nextAvailable = action === 'reactivate';
  if (current.available === nextAvailable) return { conflict: true, current: { id: current.id, available: current.available } };
  const { data: updated, error: updateError } = await supabaseAdmin.from('menu_items')
    .update({ available: nextAvailable }).eq('id', menuItemId).eq('restaurant_id', restaurantId).eq('available', current.available)
    .select('id,restaurant_id,name,available').maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { conflict: true, current: { id: current.id, available: current.available } };
  try {
    await recordAdminAuditEvent({
      adminClerkUserId, action: action === 'deactivate' ? 'menu_item_deactivated' : 'menu_item_reactivated',
      resourceType: 'menu_item', resourceId: menuItemId,
      previousState: { restaurantId, available: current.available },
      newState: { restaurantId, available: updated.available }, requestId,
      metadata: { restaurantId, menuItemId },
    });
  } catch (auditError) {
    const { error: rollbackError } = await supabaseAdmin.from('menu_items').update({ available: current.available })
      .eq('id', menuItemId).eq('restaurant_id', restaurantId).eq('available', updated.available);
    if (rollbackError) console.error('admin-api menu item availability rollback failed after audit failure', rollbackError.message);
    console.error('admin-api menu item availability audit failed', auditError instanceof Error ? auditError.message : 'unknown error');
    throw new Error('Menu item availability change could not be completed.');
  }
  return { id: updated.id, restaurantId: updated.restaurant_id, name: updated.name, available: updated.available };
}

async function listRestaurantMenus(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  let query = supabaseAdmin.from('restaurants').select('id,name,created_at,is_available,lifecycle_status', { count: 'exact' })
    .order('name', { ascending: true }).order('id', { ascending: true }).range(pagination.from, pagination.to);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data: restaurants, count, error } = await query;
  if (error) throw error;
  const ids = (restaurants ?? []).map((row) => row.id);
  const { data: items, error: itemsError } = ids.length
    ? await supabaseAdmin.from('menu_items').select('id,restaurant_id,available').in('restaurant_id', ids)
    : { data: [], error: null };
  if (itemsError) throw itemsError;
  const itemsByRestaurant = new Map<string, { total: number; available: number }>();
  for (const item of items ?? []) {
    const summary = itemsByRestaurant.get(item.restaurant_id) ?? { total: 0, available: 0 };
    summary.total += 1;
    if (item.available) summary.available += 1;
    itemsByRestaurant.set(item.restaurant_id, summary);
  }
  return safePage((restaurants ?? []).map((row) => {
    const summary = itemsByRestaurant.get(row.id) ?? { total: 0, available: 0 };
    return { id: row.id, name: row.name, createdAt: row.created_at, isAvailable: row.is_available, lifecycleStatus: row.lifecycle_status, menuItemCount: summary.total, availableItemCount: summary.available };
  }), count, pagination.page, pagination.pageSize);
}

async function getRestaurant(id: string, url: URL) {
  const restaurantId = parseRestaurantId(id);
  const menuPagination = parseRestaurantMenuPage(url);
  const reviewPagination = parseRestaurantReviewPage(url);
  const { data: restaurant, error } = await supabaseAdmin.from('restaurants').select(restaurantColumns).eq('id', restaurantId).maybeSingle();
  if (error) throw error;
  if (!restaurant) return null;
  const [{ data: menuItems, error: menuError }, { count: menuItemCount, error: menuCountError }, { data: reviews, error: reviewError }, { count: reviewCount, error: reviewCountError }] = await Promise.all([
    supabaseAdmin.from('menu_items').select(menuItemColumns).eq('restaurant_id', restaurantId).order('category', { ascending: true }).order('name', { ascending: true }).range(menuPagination.from, menuPagination.to),
    supabaseAdmin.from('menu_items').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    supabaseAdmin.from('restaurant_reviews').select('id,restaurant_id,order_id,rating,review_text,created_at,updated_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).range(reviewPagination.from, reviewPagination.to),
    supabaseAdmin.from('restaurant_reviews').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
  ]);
  if (menuError) throw menuError;
  if (menuCountError) throw menuCountError;
  if (reviewError) throw reviewError;
  if (reviewCountError) throw reviewCountError;
  return {
    ...safeRestaurant(restaurant),
    menuItems: (menuItems ?? []).map((row) => safeMenuItem(row)),
    reviews: (reviews ?? []).map((row) => safeRestaurantReview(row)),
    menuItemCount: menuItemCount ?? 0,
    menuPage: menuPagination.page,
    menuPageSize: menuPagination.pageSize,
    menuTotalPages: Math.ceil((menuItemCount ?? 0) / menuPagination.pageSize),
    menuHasMore: menuPagination.page < Math.ceil((menuItemCount ?? 0) / menuPagination.pageSize),
    reviewCount: reviewCount ?? 0,
    reviewPage: reviewPagination.page,
    reviewPageSize: reviewPagination.pageSize,
    reviewTotalPages: Math.ceil((reviewCount ?? 0) / reviewPagination.pageSize),
    reviewHasMore: reviewPagination.page < Math.ceil((reviewCount ?? 0) / reviewPagination.pageSize),
  };
}

async function listRestaurantModeration(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  let query = supabaseAdmin.from('restaurants').select('id,name,description,cover_image,created_at,is_available,menu_items(count),restaurant_reviews(count)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data: restaurants, count, error } = await query;
  if (error) throw error;
  return safePage((restaurants ?? []).map((row) => ({
    id: row.id, name: row.name, description: row.description, coverImage: row.cover_image,
    createdAt: row.created_at, isAvailable: row.is_available,
    menuItemCount: Array.isArray(row.menu_items) ? row.menu_items[0]?.count ?? 0 : 0,
    reviewCount: Array.isArray(row.restaurant_reviews) ? row.restaurant_reviews[0]?.count ?? 0 : 0,
  })), count, pagination.page, pagination.pageSize);
}

function relationValue(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, any> | undefined) ?? null;
  return value && typeof value === 'object' ? value as Record<string, any> : null;
}

const customerNameCache = new Map<string, string>();

function customerDisplayName(user: Record<string, any>) {
  const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;
  if (typeof user.fullName === 'string' && user.fullName.trim()) return user.fullName.trim();
  const metadataName = user.unsafeMetadata?.fullName;
  if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim();
  return 'Customer';
}

async function resolveCustomerNames(rows: Array<Record<string, any>>) {
  const customerIds = [...new Set(rows.map((row) => typeof row.customer_clerk_user_id === 'string' ? row.customer_clerk_user_id.trim() : '').filter(Boolean))]
    .slice(0, pageSizeLimit);
  const unresolvedIds = customerIds.filter((id) => !customerNameCache.has(id));
  if (unresolvedIds.length) {
    try {
      const result = await clerkClient.users.getUserList({ userId: unresolvedIds });
      const usersById = new Map(result.data.map((user) => [user.id, user]));
      for (const customerId of unresolvedIds) {
        customerNameCache.set(customerId, customerDisplayName(usersById.get(customerId) ?? {}));
      }
    } catch (error) {
      console.error('admin-api customer profile batch lookup failed', error instanceof Error ? error.message : 'unknown error');
      for (const customerId of unresolvedIds) customerNameCache.set(customerId, 'Customer');
    }
  }
  return new Map(customerIds.map((id) => [id, customerNameCache.get(id) ?? 'Customer']));
}

function safeOrderSummary(row: Record<string, any>, customerName: string) {
  const restaurant = relationValue(row.restaurants);
  const delivery = relationValue(row.deliveries);
  const partner = delivery ? relationValue(delivery.delivery_partners) : null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    restaurantId: row.restaurant_id,
    restaurantName: restaurant?.name ?? null,
    customerName,
    subtotal: row.subtotal,
    taxes: row.taxes,
    discount: row.discount,
    deliveryFee: row.delivery_fee,
    totalAmount: row.total,
    paymentStatus: row.payment_status,
    deliveryStatus: delivery?.status ?? null,
    deliveryPartner: partner ? { name: partner.full_name, status: partner.status } : null,
    deliveryTimestamps: delivery ? {
      assignedAt: delivery.assigned_at,
      pickedUpAt: delivery.picked_up_at,
      deliveredAt: delivery.delivered_at,
      updatedAt: delivery.updated_at,
    } : null,
  };
}

function parseOrderDate(value: string | null, field: string) {
  if (!value) return null;
  if (field === 'end date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T23:59:59.999Z';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid order ${field}.`);
  return new Date(parsed).toISOString();
}

function parseOrderFilter(value: string | null, field: string) {
  const normalized = value?.trim() ?? '';
  if (normalized.length > 100 || (normalized && !/^[a-zA-Z0-9_ -]+$/.test(normalized))) {
    throw new Error(`Invalid order ${field}.`);
  }
  return normalized || null;
}

async function listOrders(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  const status = parseOrderFilter(url.searchParams.get('status'), 'status');
  const paymentStatus = parseOrderFilter(url.searchParams.get('paymentStatus'), 'payment status');
  const restaurantId = url.searchParams.get('restaurantId')?.trim() || null;
  const from = parseOrderDate(url.searchParams.get('from'), 'start date');
  const to = parseOrderDate(url.searchParams.get('to'), 'end date');
  if (restaurantId) parseUuid(restaurantId, 'Invalid order restaurant ID.');
  if (from && to && from > to) throw new Error('Invalid order date range.');

  let query = supabaseAdmin.from('orders').select(orderListColumns, { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(pagination.from, pagination.to);
  if (search) query = query.ilike('order_number', `%${search}%`);
  if (status) query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, count, error } = await query;
  if (error) throw error;
  const customerNames = await resolveCustomerNames(data ?? []);
  return safePage((data ?? []).map((row) => safeOrderSummary(row, customerNames.get(row.customer_clerk_user_id) ?? 'Customer')), count, pagination.page, pagination.pageSize);
}

async function getOrder(id: string) {
  const orderId = parseUuid(id, 'Invalid order ID.');
  const { data, error } = await supabaseAdmin.from('orders').select(orderDetailColumns).eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const customerNames = await resolveCustomerNames([data]);
  const summary = safeOrderSummary(data, customerNames.get(data.customer_clerk_user_id) ?? 'Customer');
  const restaurant = relationValue(data.restaurants);
  const delivery = relationValue(data.deliveries);
  const partner = delivery ? relationValue(delivery.delivery_partners) : null;
  return {
    ...summary,
    estimatedDelivery: data.estimated_delivery,
    restaurant: restaurant ? { id: data.restaurant_id, name: restaurant.name } : { id: data.restaurant_id, name: null },
    pricing: { subtotal: data.subtotal, taxes: data.taxes, discount: data.discount, deliveryFee: data.delivery_fee, total: data.total },
    deliveryAddress: {
      recipientName: data.delivery_recipient_name,
      address: data.delivery_address,
      landmark: data.delivery_landmark,
      city: data.delivery_city,
      state: data.delivery_state,
      country: data.delivery_country,
      postalCode: data.delivery_postal_code,
      phone: data.delivery_phone,
      latitude: data.delivery_latitude,
      longitude: data.delivery_longitude,
    },
    delivery: delivery ? {
      status: delivery.status,
      partner: partner ? { name: partner.full_name, status: partner.status } : null,
      assignedAt: delivery.assigned_at,
      pickedUpAt: delivery.picked_up_at,
      deliveredAt: delivery.delivered_at,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    } : null,
    items: (Array.isArray(data.order_items) ? data.order_items : []).map((item: Record<string, any>) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      selectedAddons: item.selected_addons ?? [],
      createdAt: item.created_at,
    })),
  };
}

function parsePaymentDate(value: string | null, field: string) {
  if (!value) return null;
  if (field === 'end date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T23:59:59.999Z';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid payment ${field}.`);
  return new Date(parsed).toISOString();
}

function parsePaymentFilter(value: string | null, field: string) {
  const normalized = value?.trim() ?? '';
  if (normalized.length > 100 || (normalized && !/^[a-zA-Z0-9_ -]+$/.test(normalized))) {
    throw new Error(`Invalid payment ${field}.`);
  }
  return normalized || null;
}

function safePaymentSummary(row: Record<string, any>, order: Record<string, any> | null, customerName: string) {
  const restaurant = order ? relationValue(order.restaurants) : null;
  const hasGatewayData = Boolean(row.cashfree_order_id || row.cashfree_payment_session_id);
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: order?.order_number ?? null,
    customerName,
    restaurantName: restaurant?.name ?? null,
    amount: order?.payment_amount ?? order?.total ?? null,
    currency: order?.payment_currency ?? 'INR',
    paymentStatus: row.payment_status,
    paymentMethod: null,
    gatewayStatus: hasGatewayData ? 'Cashfree' : null,
    referenceStatus: row.payment_reference ? 'present' : 'not_available',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPayments(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  const paymentStatus = parsePaymentFilter(url.searchParams.get('paymentStatus'), 'status');
  const restaurantId = url.searchParams.get('restaurantId')?.trim() || null;
  const from = parsePaymentDate(url.searchParams.get('from'), 'start date');
  const to = parsePaymentDate(url.searchParams.get('to'), 'end date');
  if (restaurantId) parseUuid(restaurantId, 'Invalid payment restaurant ID.');
  if (from && to && from > to) throw new Error('Invalid payment date range.');

  let query = supabaseAdmin.from('payment_attempts').select(paymentColumns, { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(pagination.from, pagination.to);
  if (search) query = query.ilike('orders.order_number', `%${search}%`);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (restaurantId) query = query.eq('orders.restaurant_id', restaurantId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, count, error } = await query;
  if (error) throw error;
  const paymentRows = data ?? [];
  const orderRows = paymentRows.map((row) => relationValue(row.orders) ?? {});
  const customerNames = await resolveCustomerNames(orderRows);
  return safePage(paymentRows.map((row, index) => {
    const order = relationValue(row.orders);
    return safePaymentSummary(row, order, customerNames.get(order?.customer_clerk_user_id) ?? 'Customer');
  }), count, pagination.page, pagination.pageSize);
}

async function getPayment(id: string) {
  const paymentId = parseUuid(id, 'Invalid payment ID.');
  const { data, error } = await supabaseAdmin.from('payment_attempts').select(paymentColumns).eq('id', paymentId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const order = relationValue(data.orders);
  const customerNames = await resolveCustomerNames([order ?? {}]);
  return {
    ...safePaymentSummary(data, order, customerNames.get(order?.customer_clerk_user_id) ?? 'Customer'),
    order: order ? {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      customerName: customerNames.get(order.customer_clerk_user_id) ?? 'Customer',
      restaurant: relationValue(order.restaurants) ? { name: relationValue(order.restaurants)?.name ?? null } : null,
      total: order.total,
    } : null,
  };
}

function parseEarningDate(value: string | null, field: string) {
  if (!value) return null;
  if (field === 'end date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T23:59:59.999Z';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid earning ${field}.`);
  return new Date(parsed).toISOString();
}

function parseEarningFilter(value: string | null, field: string) {
  const normalized = value?.trim() ?? '';
  if (normalized.length > 100 || (normalized && !/^[a-zA-Z0-9_ -]+$/.test(normalized))) {
    throw new Error(`Invalid earning ${field}.`);
  }
  return normalized || null;
}

function safeEarning(row: Record<string, any>) {
  const delivery = relationValue(row.deliveries);
  const order = delivery ? relationValue(delivery.orders) : null;
  const restaurant = order ? relationValue(order.restaurants) : null;
  const partner = relationValue(row.delivery_partners);
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    orderNumber: order?.order_number ?? null,
    restaurantName: restaurant?.name ?? null,
    deliveryPartner: partner ? { name: partner.full_name, status: partner.status } : null,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    deliveryStatus: delivery?.status ?? null,
    deliveredAt: delivery?.delivered_at ?? null,
  };
}

async function listEarnings(url: URL) {
  const pagination = parsePage(url);
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  const partnerId = url.searchParams.get('deliveryPartnerId')?.trim() || null;
  const restaurantId = url.searchParams.get('restaurantId')?.trim() || null;
  const status = parseEarningFilter(url.searchParams.get('status'), 'status');
  const from = parseEarningDate(url.searchParams.get('from'), 'start date');
  const to = parseEarningDate(url.searchParams.get('to'), 'end date');
  if (partnerId) parseUuid(partnerId, 'Invalid earning delivery partner ID.');
  if (restaurantId) parseUuid(restaurantId, 'Invalid earning restaurant ID.');
  if (from && to && from > to) throw new Error('Invalid earning date range.');

  let query = supabaseAdmin.from('delivery_earnings').select(earningColumns, { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(pagination.from, pagination.to);
  if (search) query = query.ilike('deliveries.orders.order_number', `%${search}%`);
  if (partnerId) query = query.eq('delivery_partner_id', partnerId);
  if (restaurantId) query = query.eq('deliveries.orders.restaurant_id', restaurantId);
  if (status) query = query.eq('status', status);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => safeEarning(row)), count, pagination.page, pagination.pageSize);
}

async function getEarning(id: string) {
  const earningId = parseUuid(id, 'Invalid earning ID.');
  const { data, error } = await supabaseAdmin.from('delivery_earnings').select(earningColumns).eq('id', earningId).maybeSingle();
  if (error) throw error;
  return data ? safeEarning(data) : null;
}

function safePayoutMethod(method: Record<string, any> | null) {
  if (!method) return null;
  return {
    methodType: method.method_type,
    status: method.status,
    accountHolderName: method.account_holder_name,
    bankName: method.bank_name,
    accountLast4: method.account_last4,
    maskedUpi: method.masked_upi,
    isDefault: method.is_default,
  };
}

function safePayout(row: Record<string, any>) {
  const partner = relationValue(row.delivery_partners);
  const settlement = relationValue(row.delivery_partner_settlements);
  const method = safePayoutMethod(relationValue(row.delivery_partner_payout_methods));
  const items = Array.isArray(row.delivery_partner_payout_items) ? row.delivery_partner_payout_items : [];
  return {
    id: row.id,
    deliveryPartner: partner ? { name: partner.full_name, status: partner.status } : null,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    processingAt: row.processing_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    providerName: row.provider_name,
    providerPayoutId: row.provider_payout_id,
    providerTransactionReference: row.provider_transaction_reference,
    failureCode: row.failure_code,
    attemptCount: row.attempt_count,
    settlement: settlement ? {
      id: settlement.id, periodStart: settlement.period_start, periodEnd: settlement.period_end,
      grossAmount: settlement.gross_amount, adjustmentsAmount: settlement.adjustments_amount,
      payableAmount: settlement.payable_amount, status: settlement.status,
      createdAt: settlement.created_at, processedAt: settlement.processed_at,
    } : null,
    payoutMethod: method,
    itemCount: items.length,
    items: items.map((item) => {
      const earning = relationValue(item.delivery_earnings);
      const delivery = earning ? relationValue(earning.deliveries) : null;
      const order = delivery ? relationValue(delivery.orders) : null;
      const restaurant = order ? relationValue(order.restaurants) : null;
      return {
        id: item.id, earningId: item.delivery_earning_id, amount: item.amount, createdAt: item.created_at,
        earning: earning ? {
          id: earning.id, amount: earning.amount, status: earning.status, createdAt: earning.created_at,
          order: order ? { id: order.id, orderNumber: order.order_number, status: order.status, total: order.total, restaurantName: restaurant?.name ?? null } : null,
        } : null,
      };
    }),
  };
}

function parsePayoutDate(value: string | null, field: string) {
  if (!value) return null;
  if (field === 'end date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T23:59:59.999Z';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid payout ${field}.`);
  return new Date(parsed).toISOString();
}

async function listPayoutsAdmin(url: URL) {
  const pagination = parsePage(url);
  const normalizedStatus = url.searchParams.get('status')?.trim() ?? '';
  if (normalizedStatus.length > 100 || (normalizedStatus && !/^[a-zA-Z0-9_ -]+$/.test(normalizedStatus))) throw new Error('Invalid payout status.');
  const status = normalizedStatus || null;
  const partnerId = url.searchParams.get('deliveryPartnerId')?.trim() || null;
  const settlementId = url.searchParams.get('settlementId')?.trim() || null;
  const from = parsePayoutDate(url.searchParams.get('from'), 'start date');
  const to = parsePayoutDate(url.searchParams.get('to'), 'end date');
  if (partnerId) parseUuid(partnerId, 'Invalid payout delivery partner ID.');
  if (settlementId) parseUuid(settlementId, 'Invalid payout settlement ID.');
  if (from && to && from > to) throw new Error('Invalid payout date range.');
  let query = supabaseAdmin.from('delivery_partner_payouts').select(payoutColumns, { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (status) query = query.eq('status', status);
  if (partnerId) query = query.eq('delivery_partner_id', partnerId);
  if (settlementId) query = query.eq('settlement_id', settlementId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => {
    const payout = safePayout(row);
    return { ...payout, items: undefined };
  }), count, pagination.page, pagination.pageSize);
}

async function getPayout(id: string) {
  const payoutId = parseUuid(id, 'Invalid payout ID.');
  const { data, error } = await supabaseAdmin.from('delivery_partner_payouts').select(payoutColumns).eq('id', payoutId).maybeSingle();
  if (error) throw error;
  return data ? safePayout(data) : null;
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
  const documents = Array.isArray(row.delivery_partner_kyc_documents) ? row.delivery_partner_kyc_documents : [];
  return {
    id: row.id, deliveryPartnerId: row.delivery_partner_id, verificationStatus: row.verification_status,
    legalName: row.legal_name, dateOfBirth: row.date_of_birth, panLast4: row.pan_last4,
    submittedAt: row.submitted_at, verifiedAt: row.verified_at, rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    documentSummary: {
      total: documents.length,
      byStatus: documents.reduce((summary: Record<string, number>, document: Record<string, unknown>) => {
        const status = typeof document.verification_status === 'string' ? document.verification_status : 'unknown';
        summary[status] = (summary[status] ?? 0) + 1;
        return summary;
      }, {}),
    },
    partner: partner ? { id: partner.id, fullName: partner.full_name, phone: partner.phone, email: partner.email, status: partner.status } : null,
  };
}

async function listKyc(url: URL) {
  const pagination = parsePage(url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search')?.trim().replace(/[%(),]/g, '');
  if (status && !kycStatuses.includes(status)) throw new Error('Invalid KYC status.');
  let query = supabaseAdmin.from('delivery_partner_kyc_profiles')
    .select('id,delivery_partner_id,verification_status,legal_name,date_of_birth,pan_last4,submitted_at,verified_at,rejected_at,rejection_reason,delivery_partners(id,full_name,phone,email,status),delivery_partner_kyc_documents(id,verification_status)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(pagination.from, pagination.to);
  if (status) query = query.eq('verification_status', status);
  if (search) query = query.or(`legal_name.ilike.%${search}%,delivery_partners.full_name.ilike.%${search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return safePage((data ?? []).map((row) => safeKycProfile(row)), count, pagination.page, pagination.pageSize);
}

async function getKycProfile(id: string) {
  const { data, error } = await supabaseAdmin.from('delivery_partner_kyc_profiles')
    .select('id,delivery_partner_id,verification_status,legal_name,date_of_birth,pan_last4,submitted_at,verified_at,rejected_at,rejection_reason,delivery_partners(id,full_name,phone,email,status),delivery_partner_kyc_documents(id,verification_status)')
    .eq('id', parseUuid(id, 'Invalid KYC profile ID.')).maybeSingle();
  if (error) throw error;
  return data ? safeKycProfile(data) : null;
}

const kycTransitions: Record<string, { from: string[]; to: string }> = {
  start_review: { from: ['submitted', 'rejected'], to: 'under_review' },
  approve: { from: ['under_review'], to: 'verified' },
  reject: { from: ['under_review'], to: 'rejected' },
};

async function changeKycStatus(id: string, action: string, adminClerkUserId: string, requestId: string, request: Request) {
  const transition = kycTransitions[action];
  if (!transition) throw new Error('Invalid KYC action.');
  const profileId = parseUuid(id, 'Invalid KYC profile ID.');
  let reason: string | null = null;
  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new Error('Invalid KYC decision reason.');
    }
    if (body && typeof body === 'object' && 'reason' in body) {
      if (typeof body.reason !== 'string' || body.reason.length > 500) throw new Error('Invalid KYC decision reason.');
      reason = body.reason.trim() || null;
    }
  }
  if (action === 'reject' && !reason) throw new Error('A rejection reason is required.');
  const { data: current, error: currentError } = await supabaseAdmin.from('delivery_partner_kyc_profiles')
    .select('id,delivery_partner_id,verification_status,legal_name,verified_at,rejected_at,rejection_reason').eq('id', profileId).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (!transition.from.includes(current.verification_status)) {
    return { conflict: true, current: { id: current.id, status: current.verification_status } };
  }
  const now = new Date().toISOString();
  const update = action === 'approve'
    ? { verification_status: transition.to, verified_at: now, rejected_at: null, rejection_reason: null, updated_at: now }
    : action === 'reject'
      ? { verification_status: transition.to, verified_at: null, rejected_at: now, rejection_reason: reason, updated_at: now }
      : { verification_status: transition.to, verified_at: null, rejected_at: null, rejection_reason: null, updated_at: now };
  const { data: updated, error: updateError } = await supabaseAdmin.from('delivery_partner_kyc_profiles')
    .update(update).eq('id', profileId).eq('verification_status', current.verification_status)
    .select('id,delivery_partner_id,verification_status,legal_name').maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { conflict: true, current: { id: current.id, status: current.verification_status } };
  try {
    await recordAdminAuditEvent({
      adminClerkUserId, action: `kyc_${action}`, resourceType: 'kyc_profile', resourceId: profileId,
      previousState: { status: current.verification_status }, newState: { status: updated.verification_status },
      reason, requestId,
    });
  } catch (auditError) {
    const { error: rollbackError } = await supabaseAdmin.from('delivery_partner_kyc_profiles')
      .update({
        verification_status: current.verification_status,
        verified_at: current.verified_at,
        rejected_at: current.rejected_at,
        rejection_reason: current.rejection_reason,
        updated_at: new Date().toISOString(),
      }).eq('id', profileId).eq('verification_status', updated.verification_status);
    if (rollbackError) console.error('admin-api KYC status rollback failed after audit failure', rollbackError.message);
    console.error('admin-api KYC status audit failed', auditError instanceof Error ? auditError.message : 'unknown error');
    throw new Error('KYC decision could not be completed.');
  }
  return { id: updated.id, deliveryPartnerId: updated.delivery_partner_id, legalName: updated.legal_name, previousStatus: current.verification_status, status: updated.verification_status };
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

async function getKycDocumentStorageMetadata(storagePath: string) {
  const pathParts = storagePath.split('/');
  const fileName = pathParts.pop() ?? '';
  const folderPath = pathParts.join('/');
  if (!fileName || !folderPath) return { fileName, mimeType: null as string | null };

  try {
    const { data, error } = await supabaseAdmin.storage.from(privateKycBucket).list(folderPath, {
      limit: 10,
      search: fileName,
    });
    if (error) throw error;
    const file = (data ?? []).find((entry) => entry.id && entry.name === fileName);
    const candidate = typeof file?.metadata?.mimetype === 'string' ? file.metadata.mimetype.toLowerCase() : null;
    const mimeType = candidate && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(candidate)
      ? candidate
      : null;
    return { fileName, mimeType };
  } catch (error) {
    console.warn('Unable to load KYC document storage metadata:', error instanceof Error ? error.message : 'unknown error');
    return { fileName, mimeType: null as string | null };
  }
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
  const storageMetadata = await getKycDocumentStorageMetadata(data.storage_path);
  await recordAdminAuditEvent({
    adminClerkUserId, action: 'document_viewed', resourceType: 'kyc_document', resourceId: data.id,
    requestId, metadata: { documentType: data.document_type, kycProfileId: data.kyc_profile_id },
  });
  return {
    signedUrl: signed.signedUrl, expiresInSeconds: 60, document: {
      id: data.id, documentType: data.document_type, verificationStatus: data.verification_status,
      expiryDate: data.expiry_date, mimeType: storageMetadata.mimeType, fileName: storageMetadata.fileName,
      inlinePreviewAvailable: Boolean(storageMetadata.mimeType),
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
    if (request.method === 'POST') {
      const restaurantLifecycleMatch = path.match(/\/restaurants\/([^/]+)\/(archive|reactivate)$/);
      if (restaurantLifecycleMatch) {
        const changed = await changeRestaurantLifecycle(restaurantLifecycleMatch[1], restaurantLifecycleMatch[2], auth.clerkUserId, requestId, request);
        if (!changed) return adminResponse({ error: { message: 'Restaurant not found.' } }, 404);
        if ('conflict' in changed) return adminResponse({ error: { message: `Restaurant is already ${changed.current?.lifecycleStatus ?? 'in the requested state'}. Refresh before trying again.` } }, 409);
        return adminResponse({ data: changed }, 200);
      }
      const menuItemActionMatch = path.match(/\/restaurants\/([^/]+)\/menu-items\/([^/]+)\/(deactivate|reactivate)$/);
      if (menuItemActionMatch) {
        const changed = await changeMenuItemAvailability(menuItemActionMatch[1], menuItemActionMatch[2], menuItemActionMatch[3], auth.clerkUserId, requestId);
        if (!changed) return adminResponse({ error: { message: 'Menu item not found for this restaurant.' } }, 404);
        if ('conflict' in changed) return adminResponse({ error: { message: 'Menu item is already in the requested availability state. Refresh before trying again.' } }, 409);
        return adminResponse({ data: changed }, 200);
      }
      if (partnerActionMatch) {
        const changed = await changePartnerStatus(partnerActionMatch[1], partnerActionMatch[2], auth.clerkUserId, requestId, request);
        if (!changed) return adminResponse({ error: { message: 'Delivery partner not found.' } }, 404);
        if ('conflict' in changed) {
          if (!changed.current) return adminResponse({ error: { message: 'Partner status changed. Refresh before trying again.' } }, 409);
          return adminResponse({ error: { message: `Partner is currently ${changed.current.status}. Refresh before trying again.` } }, 409);
        }
        return adminResponse({ data: changed }, 200);
      }
      const kycActionMatch = path.match(/\/kyc\/([^/]+)\/(start-review|approve|reject)$/);
      if (kycActionMatch) {
        const changed = await changeKycStatus(kycActionMatch[1], kycActionMatch[2], auth.clerkUserId, requestId, request);
        if (!changed) return adminResponse({ error: { message: 'KYC profile not found.' } }, 404);
        if ('conflict' in changed) {
          if (!changed.current) return adminResponse({ error: { message: 'KYC profile status changed. Refresh before trying again.' } }, 409);
          return adminResponse({ error: { message: `KYC profile is currently ${changed.current.status}. Refresh before trying again.` } }, 409);
        }
        return adminResponse({ data: changed }, 200);
      }
      return adminResponse({ error: { message: 'Method not allowed.' } }, 405);
    }
    if (path.endsWith('/audit')) return adminResponse({ data: await listAuditLogs(url) }, 200);
    const orderMatch = path.match(/\/orders\/([^/]+)$/);
    if (orderMatch) {
      const order = await getOrder(orderMatch[1]);
      return order ? adminResponse({ data: order }, 200) : adminResponse({ error: { message: 'Order not found.' } }, 404);
    }
    if (path.endsWith('/orders')) return adminResponse({ data: await listOrders(url) }, 200);
    const paymentMatch = path.match(/\/payments\/([^/]+)$/);
    if (paymentMatch) {
      const payment = await getPayment(paymentMatch[1]);
      return payment ? adminResponse({ data: payment }, 200) : adminResponse({ error: { message: 'Payment attempt not found.' } }, 404);
    }
    if (path.endsWith('/payments')) return adminResponse({ data: await listPayments(url) }, 200);
    const earningMatch = path.match(/\/earnings\/([^/]+)$/);
    if (earningMatch) {
      const earning = await getEarning(earningMatch[1]);
      return earning ? adminResponse({ data: earning }, 200) : adminResponse({ error: { message: 'Earning not found.' } }, 404);
    }
    if (path.endsWith('/earnings')) return adminResponse({ data: await listEarnings(url) }, 200);
    const payoutMatch = path.match(/\/payouts\/([^/]+)$/);
    if (payoutMatch) {
      const payout = await getPayout(payoutMatch[1]);
      return payout ? adminResponse({ data: payout }, 200) : adminResponse({ error: { message: 'Payout not found.' } }, 404);
    }
    if (path.endsWith('/payouts')) return adminResponse({ data: await listPayoutsAdmin(url) }, 200);
    if (path.endsWith('/restaurants/applications')) {
      return adminResponse({ data: { supported: false, reason: 'Restaurant applications are not represented in the current database schema.' } }, 200);
    }
    if (path.endsWith('/restaurants/suspended')) {
      return adminResponse({ data: { supported: false, reason: 'Restaurant suspension status is not represented in the current database schema.' } }, 200);
    }
    if (path.endsWith('/restaurants/menus')) return adminResponse({ data: await listRestaurantMenus(url) }, 200);
    if (path.endsWith('/restaurants/moderation')) return adminResponse({ data: await listRestaurantModeration(url) }, 200);
    const restaurantMatch = path.match(/\/restaurants\/([^/]+)$/);
    if (restaurantMatch) {
      const restaurant = await getRestaurant(restaurantMatch[1], url);
      return restaurant ? adminResponse({ data: restaurant }, 200) : adminResponse({ error: { message: 'Restaurant not found.' } }, 404);
    }
    if (path.endsWith('/restaurants')) return adminResponse({ data: await listRestaurants(url) }, 200);
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
    if (error instanceof Error && ['Invalid pagination.', 'Invalid partner status.', 'Invalid delivery partner ID.', 'Invalid KYC status.', 'Invalid KYC profile ID.', 'Invalid document ID.', 'Invalid delivery partner action.', 'Invalid action reason.', 'Invalid KYC action.', 'Invalid KYC decision reason.', 'A rejection reason is required.', 'Invalid restaurant availability.', 'Invalid restaurant lifecycle.', 'Invalid restaurant ID.', 'Invalid restaurant lifecycle action.', 'Invalid restaurant archive reason.', 'Invalid menu item ID.', 'Invalid menu item action.', 'Invalid restaurant menu pagination.', 'Invalid restaurant review pagination.', 'Invalid order status.', 'Invalid order payment status.', 'Invalid order restaurant ID.', 'Invalid order start date.', 'Invalid order end date.', 'Invalid order date range.', 'Invalid order ID.', 'Invalid payment status.', 'Invalid payment restaurant ID.', 'Invalid payment start date.', 'Invalid payment end date.', 'Invalid payment date range.', 'Invalid payment ID.', 'Invalid earning status.', 'Invalid earning delivery partner ID.', 'Invalid earning restaurant ID.', 'Invalid earning start date.', 'Invalid earning end date.', 'Invalid earning date range.', 'Invalid earning ID.', 'Invalid payout status.', 'Invalid payout delivery partner ID.', 'Invalid payout settlement ID.', 'Invalid payout start date.', 'Invalid payout end date.', 'Invalid payout date range.', 'Invalid payout ID.'].includes(error.message)) {
      return adminResponse({ error: { message: error.message } }, 400);
    }
    console.error('admin-api read failed', error instanceof Error ? error.message : 'unknown error');
    return adminResponse({ error: { message: path.includes('/orders') ? 'Unable to load order data.' : path.includes('/payments') ? 'Unable to load payment data.' : path.includes('/earnings') ? 'Unable to load earnings data.' : 'Unable to load admin data.' } }, 500);
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
