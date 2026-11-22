import type { DateFormat } from './countries';

export type Role = 'owner' | 'admin' | 'dispatcher' | 'technician' | 'customer';
export type JobStatus = 'new' | 'scheduled' | 'assigned' | 'in_progress' | 'awaiting_parts' | 'completed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Category = 'installation' | 'repair' | 'maintenance' | 'survey' | 'other';

export interface Business {
  id: string; name: string; industry: string; country: string; currency: string;
  time_zone: string; date_format: DateFormat; tax_label: string; phone: string | null; email: string | null;
  address_line1: string | null; city: string | null; region: string | null; postal_code: string | null; status: string;
}

export interface Membership { id: string; business_id: string; role: Role; status: string; business: Business }

export interface Customer {
  id: string; business_id: string; kind: 'individual' | 'company'; name: string; contact_person: string | null;
  phone: string; email: string | null; address_line1: string | null; address_line2: string | null; city: string | null;
  region: string | null; postal_code: string | null; country: string | null; notes: string | null;
  status: 'active' | 'archived'; created_at: string;
}

export interface Job {
  id: string; business_id: string; number: number; reference: string; customer_id: string; title: string;
  description: string | null; category: Category; priority: Priority; status: JobStatus; scheduled_at: string | null;
  address: string | null; map_link: string | null; internal_notes: string | null; work_done: string | null;
  completed_at: string | null; archived: boolean; created_at: string;
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'address_line1' | 'city'> | null;
  job_assignments?: { user_id: string }[];
}

export interface Member {
  id: string; user_id: string; role: Role; status: string; created_at: string;
  profile: { full_name: string; phone: string | null; email: string | null } | null;
}

export interface Activity {
  id: string; kind: string; from_value: string | null; to_value: string | null; note: string | null;
  created_at: string; actor_id: string | null;
}

export const isOverdue = (j: Pick<Job, 'scheduled_at' | 'status'>) =>
  !!j.scheduled_at && new Date(j.scheduled_at).getTime() < Date.now() && j.status !== 'completed' && j.status !== 'cancelled';

export interface Equipment {
  id: string; business_id: string; customer_id: string; category_id: string | null; name: string; manufacturer: string | null;
  model: string | null; serial_number: string | null; installed_on: string | null; warranty_expires_on: string | null;
  location: string | null; installed_by: string | null; condition: 'good' | 'fair' | 'faulty' | 'replaced'; notes: string | null;
  status: 'active' | 'archived'; created_at: string;
  customer?: { id: string; name: string } | null; category?: { id: string; name: string } | null;
}

export interface Contract {
  id: string; business_id: string; customer_id: string; title: string; starts_on: string; ends_on: string | null;
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual'; next_service_on: string; price_minor: number; notes: string | null;
  status: 'active' | 'cancelled'; created_at: string; customer?: { id: string; name: string } | null;
}

export type DocKind = 'quote' | 'invoice';
export interface DocItem { id?: string; kind: 'labour' | 'material' | 'other'; description: string; quantity: number; unit_price_minor: number; line_total_minor?: number; position: number }
export interface Doc {
  id: string; business_id: string; number: number; reference: string; customer_id: string; job_id: string | null; status: string;
  issue_date: string; currency: string; discount_type: 'none' | 'amount' | 'percent'; discount_value: number; tax_rate: number;
  tax_inclusive: boolean; subtotal_minor: number; discount_minor: number; tax_minor: number; total_minor: number; notes: string | null;
  created_at: string; valid_until?: string | null; invoice_id?: string | null; due_date?: string | null; quotation_id?: string | null;
  amount_paid_minor?: number; balance_minor?: number;
  customer?: { id: string; name: string; phone: string; email: string | null; address_line1: string | null; city: string | null } | null;
}
export interface Payment {
  id: string; invoice_id: string; amount_minor: number; paid_on: string; method: string; reference: string | null; notes: string | null;
  reverses_payment_id: string | null; created_at: string; invoice?: { id: string; reference: string; currency: string; customer?: { name: string } | null } | null;
}

export const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export const isInvoiceOverdue = (d: Pick<Doc, 'status' | 'due_date' | 'balance_minor'>, today: string) =>
  (d.status === 'sent' || d.status === 'partially_paid') && !!d.due_date && d.due_date < today && (d.balance_minor ?? 0) > 0;
