// src/lib/changelog.ts

export interface ChangelogSection {
  type: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
  summary?: string;
}

/**
 * Structured changelog database storing all application release history.
 * v1.0.0 official production milestone release.
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-10-13',
    summary:
      'Official Production Release v1.0.0 of Palomar Gym Management System. Complete full-stack gym operating solution featuring secure terminal authentication, email-based password recovery, robust staff vs. administrator role boundaries, daily cash drawer shifts with float balancing, retail POS registers, attendance logbooks with walk-in guest passes, online pre-registration imports & plan renewals, executive performance dashboards, equipment & incident reporting, comprehensive settings & gym branding, and camera-based barcode/QR scanning.',
    sections: [
      {
        type: 'System Overview & Architecture',
        items: [
          'High-Performance Full-Stack Platform: Built on a modern React SPA stack with Vite, TypeScript, Tailwind CSS, Capacitor Android native distribution, and progressive web application (PWA) offline capabilities.',
          'Real-Time Cloud Synchronization: Powered by Supabase cloud storage and PostgreSQL database with live table subscriptions, ensuring immediate data sync across all front-desk terminals, mobile devices, and admin dashboards.',
          'Offline Continuity: Intelligently detects network status changes, safely caching local operations while enforcing security locks on transactions requiring cloud authentication.',
          'Audible & Visual Polish: Interactive audio feedback on barcode/QR scans, tactile button micro-interactions, responsive mobile drawers, and smooth light/dark high-contrast themes.',
        ],
      },
      {
        type: 'Authentication & Password Reset Workflow',
        items: [
          'Terminal Access & Session Management: Secure email and password authentication with encrypted Supabase auth tokens, active device session tracking, anti-hijack session claiming, and configurable terminal location locks (authorized counter Wi-Fi SSID, IP address, and GPS geofence radius).',
          'How Sending Email for Reset Password Works: When a staff member or administrator clicks "Forgot Password" on the login screen, they enter their registered account email address. The system contacts Supabase Auth to generate a secure, time-limited password recovery token and automatically dispatches an official recovery email directly to the user\'s inbox.',
          'Secure Credential Recovery Dialog: The user receives the email containing either a direct password reset link or a 6-digit verification code. Inside the recovery modal, entering the valid code verifies their identity with rate-limit protection and a live countdown timer. Once verified, the user establishes a new secure password and immediately regains system access.',
        ],
      },
      {
        type: 'Role-Based Access Control: Staff vs. Administrator',
        items: [
          'Administrator & Superadmin Scope: Full master authority over all gym operations—opening and closing daily cash drawer sessions with physical float setup and discrepancy balancing; configuring retail product catalogs, pricing, and batch supplier restocking; enrolling members from scratch; generating and regenerating encrypted QR access cards; configuring membership package pricing tiers (Rates & Payments); creating and managing staff login accounts; reviewing executive financial revenue analytics; and configuring Gym Profile branding.',
          'Staff (Front-Desk) Scope: Streamlined counter workspace designed for high-speed counter operations—ringing up retail POS sales (beverages, energy drinks, supplements, merchandise); checking in members via QR scan or name lookup; processing Daily Walk-In guest passes; importing online pre-registered members via ticket QR scans; processing subscription renewals; submitting facility maintenance and safety incident reports; and operating camera scanners.',
          'Clear Access Boundaries: To safeguard gym funds and maintain audit accountability, staff accounts are strictly prohibited from opening or closing cash drawer sessions, recording petty cash movements (Cash In / Cash Out), editing retail catalog prices, deleting historical attendance or audit logs, or accessing executive financial dashboards.',
        ],
      },
      {
        type: 'Cash Drawer & Session Management',
        items: [
          'Shift Initialization (Admin Only): Administrators start each business day or shift change by counting physical till currency and entering the starting float amount (e.g., ₱1,000), with quick float presets and previous closing balance carry-over.',
          'Live Transaction Ledger: Real-time recording of all cash inflows, GCash digital collections, and petty cash disbursements with live till balance calculation and session transaction counters.',
          'Petty Cash Controls (Admin Only): Dedicated Cash In (float replenishment) and Cash Out (authorized expenses such as drinking water refills or cleaning supplies) tracking with mandatory audit notes.',
          'End-of-Shift Reconciliation (Admin Only): Closing wizard prompts the administrator to count physical bills and coins, automatically compares counted cash against system-expected totals, flags balanced, overage, or shortage amounts, and archives the shift session.',
          'Offline Safety Guard: Automatically locks cash drawers when internet connectivity drops to prevent untracked cash drift or desynchronized financial records.',
        ],
      },
      {
        type: 'Sales Register & Retail Point of Sale (POS)',
        items: [
          'Instant Retail Cashier: Touch-optimized product catalog grid with category filters (Drinks, Supplements, Gear) and integrated barcode scanner search for ringing up counter purchases.',
          'Automated Change Calculation: Cash payment workflow computes exact customer change in real time as money tendered is typed, preventing counter math errors.',
          'GCash QR Integration: Displays front-desk GCash QR code for customer mobile wallet scanning and captures digital transaction reference numbers.',
          'Digital & Thermal Receipts: Automatically generates formatted official receipts with gym branding, itemized breakdowns, VAT/non-VAT summaries, and thermal print optimization.',
          'Live Shift Sales Timeline: Real-time scrollable sales history allowing counter staff to review and reprint receipts for any transaction completed during the active drawer session.',
        ],
      },
      {
        type: 'Logbook, Attendance & Guest Passes',
        items: [
          'Fast Member Check-In: Front-desk attendance logging via QR card camera scanning or instant name/phone search, displaying member headshot photos and real-time Active/Expired status.',
          'Daily Walk-In Guest Passes: Streamlined one-click issuance of daily workout passes for non-members, collecting door fees in cash or GCash with automatic shift revenue logging.',
          'Occupancy Counter: Live dashboard pill displaying active workout visitors currently inside the gym facility.',
          'Historical Audit Protection: Check-in records from closed sessions are permanently locked to maintain genuine attendance logs.',
        ],
      },
      {
        type: 'Subscription Plans & Online Pre-Registration',
        items: [
          'Flexible Membership Packages: Support for Regular Monthly, Student Discount, Multi-Month Promo, and VIP Annual membership tiers.',
          'Online Pre-Registration Import Mode: Prospective members scan a desk QR code on their own smartphones, complete the registration form with terms agreements, and generate a QR ticket. Front-desk staff scan this ticket to instantly import member data without manual typing.',
          'Duration-Preserving Renewals: Renewing an existing membership before expiration automatically appends new days to the end of the current cycle, ensuring members never lose prepaid days.',
          'Encrypted Access Passes: Instant generation and issuance of printable QR membership ID cards upon plan activation.',
        ],
      },
      {
        type: 'Executive Dashboard & Analytics',
        items: [
          'Real-Time KPI Cards: Admin-exclusive visibility into today’s gross revenue, active check-in visits, new subscriptions, and retail product units sold.',
          'Monthly Benchmark Pace Tracker: Set monthly revenue targets (e.g. ₱200,000) with visual run-rate progress bars indicating whether current revenue is ahead or behind target trajectory.',
          'Attendance Peak Hours Heatmap: Visual hourly traffic analysis identifying gym rush periods (typically 5:00 PM – 8:30 PM) for staff scheduling and trainer allocation.',
        ],
      },
      {
        type: 'Incident Reports & Facility Safety',
        items: [
          'Digital Incident Dispatch: Front-desk reporting system for equipment damage (frayed cables, cracked weight plates, treadmill motors), member disputes, accidents, and lost & found.',
          'Emergency Hub: Fast-dial telephone directory for local emergency services, building maintenance, and gym management hotlines.',
          'Administrative Resolution Lifecycle: Administrators review filed incident reports, update investigation statuses (Mark as Read, In Progress, Resolved), and archive completed repairs.',
        ],
      },
      {
        type: 'Camera Scanner for Barcodes & QR Codes',
        items: [
          'Universal Camera Scanning Modal: Global quick-access scanner accessible from the topbar or keyboard shortcuts on desktop, tablet, and mobile browsers.',
          'Dual Recognition Engine: Automatically identifies member QR badges for check-in or pre-registration import, and 1D/2D retail barcodes for immediate POS cart addition.',
          'Hardware Diagnostics & Switching: Seamlessly switches between front selfie cameras, rear autofocus cameras, and external USB webcams with torch/flashlight toggles.',
          'Hardware Scanner Compatibility: Plug-and-play support for physical handheld USB and Bluetooth laser barcode scanners without requiring camera mode.',
        ],
      },
      {
        type: 'System Settings & Gym Profile',
        items: [
          'Gym Profile Customization (Admin Only): Configure business name, street address, front-desk telephone directories, and login screen image carousel layouts.',
          'Live Login Preview: Interactive preview mode enabling administrators to review login screen branding directly from settings.',
          'Security & Terminal Permissions: Hardware diagnostic controls, camera device selection, and terminal location fencing (IP, Wi-Fi, and GPS).',
          'Rates & Payments (Admin Only): Membership pricing configuration and accepted payment method toggles.',
          'User Management (Admin Only): Create, update, and deactivate staff accounts with role assignments and password reset dispatch.',
          'Database Backup & Restore (Admin Only): One-click full JSON database snapshots, automated cloud backups, and emergency restoration verification.',
        ],
      },
    ],
  },
];

/**
 * Returns ALL versions in the changelog.
 */
export const getAllChangelogs = (): ChangelogEntry[] => {
  return CHANGELOG_ENTRIES;
};

/**
 * Returns ONLY ONE version (the latest release version).
 * Use this when the UI specifies "Only display one version only".
 */
export const getLatestChangelog = (): ChangelogEntry => {
  return CHANGELOG_ENTRIES[0];
};

/**
 * Returns a specific changelog entry by version string (e.g. "1.0.0" or "v1.0.0").
 * Falls back to the latest entry if version is not found.
 */
export const getChangelogForVersion = (versionStr?: string): ChangelogEntry => {
  if (!versionStr) return getLatestChangelog();
  const clean = versionStr.replace(/^v/i, '').trim();
  const match = CHANGELOG_ENTRIES.find((entry) => entry.version === clean);
  return match || getLatestChangelog();
};

/**
 * Formats a single changelog entry into concise bullet points
 * for "What's new in this release:" text areas.
 */
export const formatChangelogForReleaseNotes = (entry: ChangelogEntry): string => {
  const lines: string[] = [];
  for (const section of entry.sections) {
    lines.push(`[${section.type}]`);
    for (const item of section.items) {
      lines.push(`• ${item}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
};
