CREATE INDEX IF NOT EXISTS mera_order_history ON mera_records(organization_id,branch_id,(data->>'createdAt') DESC,id DESC) WHERE kind='order';
CREATE INDEX IF NOT EXISTS mera_guest_order_history ON mera_records(organization_id,branch_id,(data->>'guestId'),(data->>'createdAt') DESC,id DESC) WHERE kind='order';
CREATE INDEX IF NOT EXISTS mera_record_order_links ON mera_records(organization_id,branch_id,kind,(data->>'orderId'));
CREATE INDEX IF NOT EXISTS mera_open_visits ON mera_records(organization_id,branch_id,(data->>'status')) WHERE kind='visit';
CREATE INDEX IF NOT EXISTS mera_operational_status ON mera_records(organization_id,branch_id,kind,(data->>'status')) WHERE kind IN ('reservation','shift','bill');
CREATE INDEX IF NOT EXISTS mera_record_reservation_links ON mera_records(organization_id,branch_id,kind,(data->>'reservationId'));
