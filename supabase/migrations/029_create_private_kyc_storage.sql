-- Private storage for delivery-partner KYC documents.
-- Object paths must use the delivery-partner-kyc/ prefix.
insert into storage.buckets (id, name, public)
values ('delivery-partner-kyc-documents', 'delivery-partner-kyc-documents', false)
on conflict (id) do update set public = false;

-- Deliberately no public storage policies are created for this bucket.
