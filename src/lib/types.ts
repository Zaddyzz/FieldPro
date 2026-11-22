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
