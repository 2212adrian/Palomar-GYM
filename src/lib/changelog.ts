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
    version: '1.0.5',
    date: '2026-11-10',
    summary:
      'Cash drawer integrity overhaul, admin authorization workflow for staff manual movements, transaction void reversal, 13-digit digital payment validation on exports, official reports auditing enhancements, member profile workspace redesign with responsive transitions and quick actions, auto-scroll focus, and SuperAdmin legacy data migration (Beta).',
    sections: [
      {
        type: 'Member Management & Staff Workflow',
        items: [
          'Staff Landing Page: Routed staff logins directly to Cash Management upon entering the system.',
          'Minor Demographics Tag: Added visual "Minor (12–17 yrs)" badges across table and mobile card views.',
          'Parent Consent & Signatures: Fixed intake wizard to display and lock existing parent details, rendering signatures read-only with high-contrast white backgrounds.',
          'On-Demand Signature Caching: Enabled click-to-view minor signatures with local storage caching to prevent redundant database fetches.',
          'Search & Category Toolbar: Replaced crowded filter buttons with an integrated category dropdown and added a "Recently Subscribed" filter.',
          'Auto-Scroll Center Focus: Added smooth automatic centering scroll on desktop table rows and mobile card lists when selecting or switching focus between members.',
        ],
      },
      {
        type: 'Member Profile Workspace Redesign',
        items: [
          'Responsive Pull Handle & Transitions: Added a fluid pull-to-adjust sheet handle for mobile touchscreens while completely hiding pull triggers on PC desktop and switching to a smooth horizontal right-to-left drawer slide-in transition.',
          'Low-Profile Quick Actions Bar: Replaced tall, stacked full-width banners in the Overview tab with a compact 2-column Quick Actions bar for instant plan renewals and physical card handovers.',
          'Form-Focused Edit Mode: Automatically hides non-editable subscription and card widgets during profile editing, displaying only the editable bio and emergency contact form inputs.',
          'Clean Card Credential Management: Removed confidential database token strings from view and added clear "IN USE" active format badges for Digital QR vs Manual cards.',
          'Combined Attendance & Notes Tab: Consolidated facility check-in logs and internal medical/staff remarks into a single unified workspace.',
          'Spacious Name Breakdown: Re-architected the name breakdown grid on PC with weighted column distribution and word wrapping to eliminate name compression and text clipping.',
        ],
      },
      {
        type: 'Cash Management & Approval Workflow',
        items: [
          'Anti-Structuring Admin Approval Guard: Required administrator authorization for all staff-initiated manual Cash In and Cash Out movements, eliminating loopholes where staff could split transactions to bypass oversight.',
          'Real-Time Sidebar Approval Notification: Dynamic pulsing badge on the Cash Management navigation tab alerting on-duty administrators to pending cash requests.',
          'Pending Cash Approvals Action Banner: Interactive administrative banner in Cash Management allowing instant inspection, approval, or rejection of pending cash movements with permanent audit logs.',
          'Close Session Pending Guard: Added strict validation blocking cash session closure whenever unresolved pending cash requests remain in the active shift.',
          'Mandatory Discrepancy Justification: Required detailed explanations (minimum 5 characters, 300 characters max) whenever a cash drawer shift closes with a variance (overage or shortage).',
        ],
      },
      {
        type: 'Drawer Integrity & Void Controls',
        items: [
          'Admin Transaction Void & Reversal: Enabled administrators to void accidental or mistyped manual drawer entries with mandatory reasons, updating drawer balances and marking entries with visual audit badges.',
          'Negative Balance Prevention: Hard-capped Cash Out inputs against current physical drawer funds, preventing the register from reaching negative balances.',
          'Structured Cash In Categorization: Enforced structured categories (Change Fund Replenishment, Petty Cash Return, Owner Injection) with anti-bypass reminders directing customer payments to Logbook and POS registers.',
          'Thermal Print & Receipt Sanitization: Updated shift summary receipts and reports to explicitly identify voided and rejected transactions, preventing false reconciliation totals.',
          'Centavo Precision Formatting: Standardized two-decimal currency precision across all live drawer KPI cards, eliminating rounding discrepancies.',
          'Table Overflow & Character Caps: Enforced a 300-character ceiling on transaction notes and implemented ellipsis truncation with hover tooltips on the ledger table.',
        ],
      },
      {
        type: 'Official Reports & Export Compliance',
        items: [
          'Full 13-Digit Reference Code Printing: Widened payment method columns and removed character clipping across all PDF export reports (BIR Register, Attendance Log, and Membership Contracts) so complete 13-digit GCash transaction codes display without truncation.',
          'Expected Cash Drawer Column: Added the missing Expected Cash (PHP) audit metric to the Cash Drawer Sessions report, displaying full mathematical reconciliation between opening floats and final counted amounts.',
          'In-Progress Session Status Accuracy: Corrected active drawer shifts in PDF and CSV reports to explicitly show "In Progress" rather than a misleading 0.00 counted cash or false balanced discrepancy.',
          'Expanded Denomination Breakdown: Increased character capacity for physical currency breakdowns on shift export tables, preventing bill and coin summaries from being cut off.',
        ],
      },
      {
        type: 'Features & UI Improvements',
        items: [
          'Added three switchable display modes: Timeline View, Compact List View, and Grid View for Logbook and Sales registers.',
          'Redesigned Compact List View on mobile with a two-tier identity row to prevent name truncation and gesture-based swipe actions.',
          'Enabled a space-efficient 2-column mobile Grid View with unified identity headers and enlarged touch hitboxes.',
          'Distinguished subscription and renewal payments in the logbook with a dedicated "Paid" badge and removed redundant collection buttons.',
          'Introduced an interactive live update notice badge beside the app version in the sidebar across desktop, mini-sidebar, and mobile views with instant one-tap redirection to System Information.',
        ],
      },
      {
        type: 'SuperAdmin Legacy Data Migration (Beta)',
        items: [
          'Exclusive SuperAdmin Beta Tool: Dedicated migration utility restricted strictly to authenticated SuperAdmin accounts.',
          'Security Authorization Gate: Protected historical imports behind SuperAdmin password verification or Google SSO session validation.',
          'Streamlined Batch Intake: Multi-row spreadsheet import requiring only core historical fields (Name, Plan, Start Date, and End Date).',
          'Smart Duration Guard: Enforced a 1-month ceiling (max 31 days) for monthly plans and 366 days for yearly plans.',
          'Cash Session Safety Blocker: Blocked legacy migrations while an active cash drawer session is open to maintain ledger audit integrity.',
        ],
      },
    ],
  },
  {
    version: '1.0.4',
    date: '2026-11-08',
    summary:
      'Database backup error resolution, cash session restoration safeguards, and enhanced restore confirmation workflow.',
    sections: [
      {
        type: 'Database backup Error of null value',
        items: [
          'A problem appeared during backup phase indicating null value in column of "in_quarantined" of relation "sales" voilates not-null constraint. This was caused by a recent schema migration that added the "in_quarantined" column to the "sales" table, but did not provide a default value for existing records. The backup process attempted to insert a null value into this column, resulting in the error.',
          'Added cash session state check before allowing database restoration. If a cash session is currently open, the restore button will be disabled and a warning message will be displayed to the user.',
        ],
      },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-11-07',
    summary:
      'API gateway and database egress optimization, logbook attendance patch fixes, synchronized subscription voiding reconciliation, and Google authentication management.',
    sections: [
      {
        type: 'Egress & API Gateway Optimization',
        items: [
          'Bound dashboard telemetry queries to active date ranges, eliminating multi-megabyte 1,500-record historical dumps.',
          'Removed redundant background cache-warming queries that duplicated logbook and sales requests.',
          'Excluded heavy base64 signature images from directory bulk fetches to minimize bandwidth.',
          'Replaced full database downloads during QR and barcode scans with targeted direct queries.',
          'Added in-flight request deduplication and debounced realtime listeners across cash sessions, notifications, and rates.',
        ],
      },
      {
        type: 'Logbook & Subscription Integrity',
        items: [
          'Resolved HTTP 400 error on attendance payment status updates by validating UUID vs receipt code formats.',
          'Fixed subscription voiding workflow to accurately reconcile member statuses and purge linked receipts without corrupting logbook history.',
        ],
      },
      {
        type: 'Authentication & Security Verification',
        items: [
          'Display account email with one-click copying and status badges in Personal Account settings.',
          'Support linking and unbinding Google accounts with safeguarded password checks.',
          'Added dual-path confirmation phrase verification for Google-authenticated admin accounts.',
          'Lifted live staff presence broadcasting into root system layout for continuous online visibility.',
        ],
      },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-11-07',
    summary:
      'Seamless Google OAuth authentication method detection and zero-friction security configuration in Personal Account settings.',
    sections: [
      {
        type: 'Google OAuth & Credential Management',
        items: [
          'Dynamic Password Presence Inspection: Implemented `check_user_has_password` RPC alongside client-side provider inspection to determine whether an account was initialized via Google OAuth or standard password authentication.',
          'Context-Aware Credentials Interface: Automatically transforms the password management card into "Set Account Password" for Google-linked accounts, bypassing current password requirements and guiding users to attach custom login passwords.',
          'Connected Sign-In Methods Status Widget: Integrated visual indicator cards and badge pills displaying live connection statuses for both Google Sign-In and Account Password authentication.',
          'Unblocked Security Dialogs: Eliminated blocking password prompt verification in username update and two-step verification modals for Google accounts that have not established a custom password.',
          'TypeScript Provider Type Safety: Enhanced application metadata provider normalization to prevent runtime type errors on string array transformations.',
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-11-07',
    summary:
      'Critical database enum alignment for subscription renewals, cross-session contract isolation during void operations, and automated logbook receipt healing.',
    sections: [
      {
        type: 'Subscription Engine & Logbook Integrity',
        items: [
          'Customer Type Enum Alignment: Fixed database schema failure on membership renewals (`invalid input value for enum customer_type_enum: "Membership Renewal"`) by mapping active renewal receipts to enum-compatible types with automatic fallback.',
          'Database Schema Migration: Dispatched migration adding "Membership Renewal" to the PostgreSQL `customer_type_enum` database type.',
          'Awaited Receipt Persistence: Converted detached asynchronous receipt insertion promises into awaited transactions, guaranteeing that subscription receipts are written to storage prior to dispatching logbook refresh events.',
          'Surgical Subscription Voiding: Removed destructive 24-hour blanket time-window deletions that inadvertently purged sibling subscriptions and earlier receipts belonging to the same member.',
          'Automated Self-Healing Logbook: Implemented automatic background reconciliation in the attendance logbook that detects active subscriptions missing receipt entries and re-establishes their ledger records.',
        ],
      },
    ],
  },
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
 * Returns ALL versions in the changelog.ts
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