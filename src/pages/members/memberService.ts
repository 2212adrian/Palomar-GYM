import type { 
  Member, 
  Subscription, 
  MemberCard, 
  Receipt, 
  OnlineRegistration, 
  ActivityLog, 
  MembershipSettings, 
  PaymentMethod,
  AttendanceRecord
} from '../../types/members';

export const STORAGE_KEYS = {
  MEMBERS: 'palomar_members',
  DELETED_MEMBERS: 'palomar_gym_members_deleted',
  SUBSCRIPTIONS: 'palomar_subscriptions',
  CARDS: 'palomar_cards',
  RECEIPTS: 'palomar_receipts',
  REGISTRATIONS: 'palomar_registration_queue',
  SETTINGS: 'palomar_membership_settings',
  LOGS: 'palomar_activity_logs',
  ATTENDANCE: 'palomar_attendance'
};

export const DEFAULT_SETTINGS: MembershipSettings = {
  gym_name: 'Wolf Palomar Fitness Gym',
  system_name: 'Wolf Management Console 2.0',
  currency: '₱',
  monthly_plan_price: 1000,
  yearly_plan_price: 500,
  regular_walkin_fee: 90,
  monthly_member_checkin_fee: 0,
  yearly_member_checkin_fee: 70,
  qr_card_enabled: true,
  manual_card_enabled: true,
  card_printing_fee: 50,
  card_replacement_fee: 100,
  gcash_fee: 10,
  receipt_prefix: 'RCPT-',
  receipt_starting_no: 100001,
  receipt_footer: 'Thank you for training with Wolf Palomar Gym!',
  registration_expiry_hours: 24,
  max_registrations_per_hour: 3,
  max_registrations_per_day: 5
};

export const prototypeStorage = {
  getCollection: <T>(key: string): T[] => {
    try {
      let raw = localStorage.getItem(key);
      if (!raw) {
        if (key === STORAGE_KEYS.MEMBERS) {
          raw = localStorage.getItem('palomar_gym_members');
        } else if (key === STORAGE_KEYS.DELETED_MEMBERS) {
          raw = localStorage.getItem('palomar_members_deleted');
        }
      }
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(`Error reading ${key} from storage:`, e);
      return [];
    }
  },
  getItem: <T>(key: string, defaultValue: T): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        localStorage.setItem(key, JSON.stringify(defaultValue));
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  },
  save: <T>(key: string, data: T): void => {
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(key, json);
      if (key === STORAGE_KEYS.MEMBERS) {
        localStorage.setItem('palomar_gym_members', json);
      } else if (key === STORAGE_KEYS.DELETED_MEMBERS) {
        localStorage.setItem('palomar_members_deleted', json);
      }
    } catch (e) {
      console.error(`Error saving ${key} to storage:`, e);
    }
  }
};

const generateUID = (prefix: string, list: any[]): string => {
  const numericIds = list
    .map(item => {
      const targetStr = item.member_id || item.receipt_number || item.id || '';
      const match = targetStr.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    })
    .filter(val => !isNaN(val));
  const nextNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
  return `${prefix}-${String(nextNum).padStart(6, '0')}`;
};

const writeAudit = (
  action: string,
  category: ActivityLog['category'],
  user: string,
  affectedId?: string,
  reason?: string,
  details?: string
) => {
  const logs = prototypeStorage.getCollection<ActivityLog>(STORAGE_KEYS.LOGS);
  const logId = generateUID('LOG', logs);
  const newLog: ActivityLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    action,
    category,
    performed_by: user,
    affected_id: affectedId,
    reason,
    details
  };
  prototypeStorage.save(STORAGE_KEYS.LOGS, [newLog, ...logs]);
};

export const memberService = {
  getAll: (): Member[] => {
    const list = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    return list.filter((m: any) => !m.deleted_at);
  },

  getById: (id: string): Member | undefined => {
    const list = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    return list.find((m: Member) => m.id === id || m.member_id === id);
  },
  
  create: (data: Omit<Member, 'id' | 'member_id' | 'created_at' | 'updated_at'>, user: string): Member => {
    const list = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    const m_id = generateUID('MEM', list);
    const newMember: Member = {
      ...data,
      id: `member-${Math.random().toString(36).substring(2, 9)}`,
      member_id: m_id,
      status: data.status || 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    prototypeStorage.save(STORAGE_KEYS.MEMBERS, [newMember, ...list]);
    writeAudit('MEMBER_CREATED', 'Members', user, m_id, undefined, `Registered profile for ${data.full_name}`);
    return newMember;
  },

  update: (id: string, updates: Partial<Member>, user: string): Member => {
    const list = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    const index = list.findIndex((m: Member) => m.id === id || m.member_id === id);
    if (index === -1) throw new Error('Member profile not found.');

    const old = list[index];
    const updated = { ...old, ...updates, updated_at: new Date().toISOString() };
    list[index] = updated;
    prototypeStorage.save(STORAGE_KEYS.MEMBERS, list);
    writeAudit('MEMBER_UPDATED', 'Members', user, old.member_id, undefined, `Updated parameters for ${old.full_name}`);
    return updated;
  },

  archive: (id: string, reason: string, user: string) => {
    const list = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    const subs = prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const index = list.findIndex((m: Member) => m.id === id || m.member_id === id);
    if (index === -1) throw new Error('Profile invalid.');

    const target = list[index];
    const activeSub = subs.find((s: Subscription) => s.member_id === target.member_id && s.status === 'Active');
    if (activeSub) {
      throw new Error(`Archiving rejected: ${target.full_name} has an active ${activeSub.plan_name} contract.`);
    }

    const archivedMember = {
      ...target,
      deleted_at: new Date().toISOString(),
      deleted_by: user,
      delete_reason: reason
    };

    list.splice(index, 1);
    prototypeStorage.save(STORAGE_KEYS.MEMBERS, list);

    const deletedList = prototypeStorage.getCollection<any>(STORAGE_KEYS.DELETED_MEMBERS);
    prototypeStorage.save(STORAGE_KEYS.DELETED_MEMBERS, [archivedMember, ...deletedList]);

    writeAudit('MEMBER_ARCHIVED', 'Members', user, target.member_id, reason, `Moved ${target.full_name} to Recycle Bin.`);
  },

  restore: (id: string, user: string): Member => {
    const deletedList = prototypeStorage.getCollection<any>(STORAGE_KEYS.DELETED_MEMBERS);
    const index = deletedList.findIndex((m: any) => m.id === id || m.member_id === id);
    if (index === -1) throw new Error('Item not found in Recycle Bin.');

    const target = deletedList[index];
    const restoredMember: Member = {
      ...target,
      status: target.status || 'Active',
      updated_at: new Date().toISOString()
    };

    delete (restoredMember as any).deleted_at;
    delete (restoredMember as any).deleted_by;
    delete (restoredMember as any).delete_reason;

    deletedList.splice(index, 1);
    prototypeStorage.save(STORAGE_KEYS.DELETED_MEMBERS, deletedList);

    const currentMembers = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    const updatedMembers = [restoredMember, ...currentMembers];
    prototypeStorage.save(STORAGE_KEYS.MEMBERS, updatedMembers);

    writeAudit('MEMBER_RESTORED', 'Members', user, restoredMember.member_id, undefined, `Restored profile for ${restoredMember.full_name}`);
    return restoredMember;
  }
};

export const subscriptionService = {
  getAll: (): Subscription[] => prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS),
  
  create: (
    memberId: string, 
    planName: 'Monthly Membership' | 'Yearly Membership', 
    paymentMethod: PaymentMethod,
    user: string,
    amountPaidOverride?: number,
    extraDetails?: {
      basePrice?: number;
      gcashFee?: number;
      cardFee?: number;
      gcashRefNo?: string;
    }
  ): Subscription => {
    const subs = prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const members = prototypeStorage.getCollection<Member>(STORAGE_KEYS.MEMBERS);
    const settings = prototypeStorage.getItem<MembershipSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    
    const m = members.find((item: Member) => item.member_id === memberId || item.id === memberId);
    if (!m) throw new Error('Member lookup missing.');
    if (m.status === 'Suspended') throw new Error(`Member is currently ${m.status}.`);

    const hasActive = subs.some((s: Subscription) => s.member_id === m.member_id && s.status === 'Active');
    if (hasActive) throw new Error('Member currently possesses an active subscription.');

    const price = planName === 'Monthly Membership' ? settings.monthly_plan_price : settings.yearly_plan_price;
    const basePrice = extraDetails?.basePrice ?? price;
    const gcashFee = extraDetails?.gcashFee ?? (paymentMethod === 'GCash' ? (settings.gcash_fee || 10) : 0);
    const cardFee = extraDetails?.cardFee ?? 0;
    const gcashRefNo = extraDetails?.gcashRefNo || '';

    const totalAmount = amountPaidOverride ?? (basePrice + gcashFee + cardFee);
    const durationDays = planName === 'Monthly Membership' ? 30 : 365;

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + durationDays);

    const receiptNo = `${settings.receipt_prefix}${settings.receipt_starting_no + subs.length}`;
    const newSub: Subscription = {
      id: generateUID('SUB', subs),
      member_id: m.member_id,
      plan_name: planName,
      price: totalAmount,
      base_price: basePrice,
      gcash_fee: gcashFee,
      card_fee: cardFee,
      gcash_ref_no: gcashRefNo,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'Active',
      payment_status: 'Paid',
      payment_method: paymentMethod,
      receipt_number: receiptNo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    prototypeStorage.save(STORAGE_KEYS.SUBSCRIPTIONS, [newSub, ...subs]);
    
    m.status = 'Active';
    prototypeStorage.save(STORAGE_KEYS.MEMBERS, members);

    // Save to receipts
    const receipts = prototypeStorage.getCollection<Receipt>(STORAGE_KEYS.RECEIPTS);
    receipts.push({
      id: receiptNo,
      member_id: m.member_id,
      customer_name: m.full_name,
      customer_type: 'New Membership',
      amount: totalAmount,
      base_price: basePrice,
      gcash_fee: gcashFee,
      card_fee: cardFee,
      gcash_ref_no: gcashRefNo,
      payment_method: paymentMethod,
      payment_status: 'Paid',
      item_description: `Subscribed under ${planName}`,
      created_at: new Date().toISOString()
    });
    prototypeStorage.save(STORAGE_KEYS.RECEIPTS, receipts);

    // Save to Attendance collection
    const attendance = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
    const nowIso = new Date().toISOString();
    const newAttendance: AttendanceRecord = {
      id: `att-sub-${Date.now()}`,
      member_id: m.member_id,
      customer_name: m.full_name,
      customer_type: 'New Membership',
      check_in_time: nowIso,
      plan_name: planName,
      entry_fee: totalAmount,
      base_price: basePrice,
      gcash_fee: gcashFee,
      card_fee: cardFee,
      gcash_ref_no: gcashRefNo,
      payment_method: paymentMethod,
      receipt_number: receiptNo,
      staff_name: user
    };
    prototypeStorage.save(STORAGE_KEYS.ATTENDANCE, [newAttendance, ...attendance]);

    // Dual-sync directly to palomar_gym_logbook LocalStorage
    try {
      const savedLogsRaw = localStorage.getItem('palomar_gym_logbook');
      const savedLogs = savedLogsRaw ? JSON.parse(savedLogsRaw) : [];
      const newLogRecord = {
        id: newAttendance.id,
        timestamp: nowIso,
        memberId: m.member_id,
        customerName: m.full_name,
        customerType: 'New Membership',
        categoryOrPlan: planName,
        paymentMethod: paymentMethod,
        amountPaid: totalAmount,
        basePrice: basePrice,
        gcashFee: gcashFee,
        cardFee: cardFee,
        gcashRefNo: gcashRefNo,
        receipt_no: receiptNo,
        paymentStatus: 'Paid',
        status: 'Active',
        isSubscription: true,
        deletable: false
      };
      localStorage.setItem('palomar_gym_logbook', JSON.stringify([newLogRecord, ...savedLogs]));
    } catch (e) {
      console.error('Error syncing subscription to logbook:', e);
    }

    writeAudit('SUBSCRIPTION_CREATED', 'Subscriptions', user, m.member_id, undefined, `Issued ${planName} Contract.`);
    return newSub;
  },

  void: (
    subscriptionId: string,
    reason: string,
    notes: string,
    user: string
  ): void => {
    const subs = prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const target = subs.find((s: Subscription) => s.id === subscriptionId);
    if (!target) throw new Error('Subscription record not found.');

    const filteredSubs = subs.filter((s: Subscription) => s.id !== subscriptionId);
    prototypeStorage.save(STORAGE_KEYS.SUBSCRIPTIONS, filteredSubs);

    if (target.receipt_number) {
      const receipts = prototypeStorage.getCollection<Receipt>(STORAGE_KEYS.RECEIPTS);
      const filteredReceipts = receipts.filter((r: Receipt) => r.id !== target.receipt_number);
      prototypeStorage.save(STORAGE_KEYS.RECEIPTS, filteredReceipts);
    }

    const attendance = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
    const filteredAttendance = attendance.filter((att: AttendanceRecord) => 
      att.receipt_number !== target.receipt_number && att.id !== subscriptionId
    );
    prototypeStorage.save(STORAGE_KEYS.ATTENDANCE, filteredAttendance);

    try {
      const savedLogsRaw = localStorage.getItem('palomar_gym_logbook');
      if (savedLogsRaw) {
        const savedLogs = JSON.parse(savedLogsRaw);
        const filteredLogs = savedLogs.filter((log: any) => 
          log.id !== subscriptionId && 
          log.receipt_no !== target.receipt_number &&
          !(log.memberId === target.member_id && log.isSubscription)
        );
        localStorage.setItem('palomar_gym_logbook', JSON.stringify(filteredLogs));
      }
    } catch (e) {
      console.error('Error purging voided subscription from logbook:', e);
    }

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    writeAudit(
      'SUBSCRIPTION_VOIDED',
      'Subscriptions',
      user,
      target.member_id,
      reason,
      `Voided & purged contract ${target.plan_name} (${target.id}) and receipt ${target.receipt_number}. Notes: ${notes || 'None'}.`
    );
  }
};

export const cardService = {
  getAll: (): MemberCard[] => prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS),

  issue: (memberId: string, type: 'QR' | 'Manual' | 'None', user: string): MemberCard | null => {
    if (type === 'None') return null;
    const cards = prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS);
    
    const existingIndex = cards.findIndex((c: MemberCard) => c.member_id === memberId);
    if (existingIndex !== -1) {
      return cardService.replace(memberId, 'Lost card upgrade', user);
    }

    const isQr = type === 'QR';
    const newCard: MemberCard = {
      id: `card-${Math.random().toString(36).substring(2, 9)}`,
      member_id: memberId,
      card_number: `${isQr ? 'CARD-QR' : 'CARD-MAN'}-${Math.floor(100000 + Math.random() * 900000)}`,
      card_type: type,
      status: 'Active',
      version: 1,
      issued_at: new Date().toISOString()
    };

    prototypeStorage.save(STORAGE_KEYS.CARDS, [newCard, ...cards]);
    writeAudit('CARD_ISSUED', 'Cards', user, memberId, undefined, `Assigned new ${type} security token.`);
    return newCard;
  },

  replace: (memberId: string, reason: string, user: string): MemberCard => {
    const cards = prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS);
    const index = cards.findIndex((c: MemberCard) => c.member_id === memberId);
    if (index === -1) throw new Error('Original card registry entry not found.');

    const old = cards[index];
    old.status = 'Inactive';
    old.replacement_reason = old.replacement_reason || 'Deactivated due to replacement.';

    const newCard: MemberCard = {
      ...old,
      id: `card-${Math.random().toString(36).substring(2, 9)}`,
      card_number: `${old.card_type === 'QR' ? 'CARD-QR' : 'CARD-MAN'}-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'Active',
      version: old.version + 1,
      issued_at: new Date().toISOString(),
      replaced_at: new Date().toISOString(),
      replacement_reason: reason
    };

    cards[index] = old;
    prototypeStorage.save(STORAGE_KEYS.CARDS, [newCard, ...cards]);
    writeAudit('CARD_REPLACED', 'Cards', user, memberId, reason, `Reissued card version ${newCard.version}.`);
    return newCard;
  }
};

export const registrationService = {
  getQueue: (): OnlineRegistration[] => prototypeStorage.getCollection<OnlineRegistration>(STORAGE_KEYS.REGISTRATIONS),

  submit: (reg: OnlineRegistration) => {
    const list = prototypeStorage.getCollection<OnlineRegistration>(STORAGE_KEYS.REGISTRATIONS);
    prototypeStorage.save(STORAGE_KEYS.REGISTRATIONS, [reg, ...list]);
  },

  reject: (regId: string, reason: string, user: string) => {
    const list = prototypeStorage.getCollection<OnlineRegistration>(STORAGE_KEYS.REGISTRATIONS);
    const index = list.findIndex((r: OnlineRegistration) => r.id === regId);
    if (index === -1) throw new Error('Pre-registration ticket invalid.');

    list[index].status = 'Rejected';
    prototypeStorage.save(STORAGE_KEYS.REGISTRATIONS, list);
    writeAudit('PRE_REG_REJECTED', 'Registrations', user, regId, reason, `Denied onboarding parameters.`);
  }
};

export const settingsService = {
  load: (): MembershipSettings => prototypeStorage.getItem<MembershipSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  save: (data: MembershipSettings, user: string): void => {
    prototypeStorage.save(STORAGE_KEYS.SETTINGS, data);
    writeAudit('SETTINGS_SAVED', 'Settings', user, undefined, undefined, 'Saved configuration options.');
  }
};