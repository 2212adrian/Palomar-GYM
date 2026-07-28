// src/types/members.ts

export type MemberStatus = 'Active' | 'Suspended';
export type SubscriptionStatus = 'Active' | 'Expired' | 'Inactive' | 'Voided';
export type CardStatus = 'Active' | 'Inactive';
export type RegistrationStatus = 'Pending' | 'Approved' | 'Rejected' | 'Expired';
export type PaymentStatus = 'Pending' | 'Paid' | 'Cancelled' | 'Refunded';
export type PaymentMethod = 'Cash' | 'GCash';

export interface Member {
  id: string;
  member_id: string;
  full_name: string;
  phone: string;
  email?: string;
  gender: string;
  birthday: string;
  emergency_contact_name: string;
  relationship: string;  
  emergency_contact_phone: string;
  address: string;
  avatar_url?: string | null;
  status: MemberStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  member_id: string;
  plan_name: 'Monthly Membership' | 'Yearly Membership';
  price: number;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  receipt_number: string;
  created_at: string;
  updated_at: string;

  // Void tracking metadata
  voided_at?: string;
  voided_by?: string;
  void_reason?: string;
  void_notes?: string;
}

export interface MemberCard {
  id: string;
  member_id: string;
  card_number: string;
  card_type: 'QR' | 'Manual' | 'None';
  status: CardStatus;
  version: number;
  issued_at: string;
  replaced_at?: string;
  replacement_reason?: string;
}

export interface Receipt {
  id: string;
  member_id?: string;
  customer_name: string;
  customer_type: 'Walk-In' | 'Existing Member' | 'New Membership';
  amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  item_description: string;
  created_at: string;
}

export interface OnlineRegistration {
  id: string;
  full_name: string;
  email?: string;             
  phone: string;
  gender: string;
  birthday: string;
  address: string;
  emergency_contact_name: string;
  relationship?: string;          
  emergency_contact_phone: string;
  preferred_plan: 'Monthly Membership' | 'Yearly Membership';
  status: 'Pending' | 'Approved' | 'Rejected';
  submitted_at: string;
  notes?: string;

  // Conditional Parental Consent Fields for Minors (< 18 Yrs)
  parent_consent_required?: boolean;
  parent_name?: string | null;
  parent_relationship?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  applicant_signature?: string | null;
  parent_signature?: string | null;
  consent_date?: string | null;
  guardian_consent?: boolean | null;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  category: 'Members' | 'Subscriptions' | 'Cards' | 'Receipts' | 'Registrations' | 'Attendance' | 'Settings' | 'System';
  performed_by: string;
  affected_id?: string;
  reason?: string;
  details?: string;
}

export interface MembershipSettings {
  gym_name: string;
  system_name: string;
  currency: string;
  monthly_plan_price: number;
  yearly_plan_price: number;
  regular_walkin_fee: number;
  monthly_member_checkin_fee: number;
  yearly_member_checkin_fee: number;
  qr_card_enabled: boolean;
  manual_card_enabled: boolean;
  card_printing_fee: number;
  card_replacement_fee: number;
  receipt_prefix: string;
  receipt_starting_no: number;
  receipt_footer: string;
  registration_expiry_hours: number;
  max_registrations_per_hour: number;
  max_registrations_per_day: number;
  gcash_fee?: number;
}

export interface AttendanceRecord {
  id: string;
  member_id?: string;
  customer_name: string;
  customer_type: 'Walk-In' | 'Existing Member' | 'New Membership';
  check_in_time: string;
  plan_name?: string;
  entry_fee: number;
  payment_method: PaymentMethod;
  receipt_number?: string;
  staff_name: string;
}