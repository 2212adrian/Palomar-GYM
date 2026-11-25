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
    version: '1.0.14',
    date: '2026-11-25',
    summary:
      'Fixed Staff soft-delete and counter member enrollment permissions, locked Staff incident reports from edits or deletion once marked Read with Admin-only 30-day retention notices, replaced the 5-second Undo toast with an audit-logged void reason modal, added a mini-sidebar flyout submenu, simplified Membership Plans into a full-width two-button screen where Register Here (No Phone) opens the Monthly/Yearly plan screen with a Back button, added QR download and screenshot instructions on Online Registration, expanded Legal & Roles documentation modal width with full role obligations and gym rules in the footer, hid BIR tax export leaving 5 operational report formats, moved Camera Scanner cart to a draggable modal, pinned Recycle Bin footer buttons, removed duplicate Settings bars, and stopped OS notification spam while viewing the app.',
    sections: [
      {
        type: 'Role Permissions, Audit Void Reasons & Retention Policy',
        items: [
          'Staff Soft-Delete & Counter Enrollment Fix: Added server-verified soft-delete procedures for Logbook Attendance and Sales and allowed active Staff to enroll no-phone walk-in members directly at the counter.',
          'Void Confirmation with Audit-Logged Reason: Replaced the 5-second Undo toast in Sales and Logbook (Sources of Income) with a Void & Delete confirmation modal requiring a specific reason before moving items to the Recycle Bin, automatically logging every void reason in Audit Logs.',
          'Incident Reports Lock After Admin Review: Staff can no longer edit or delete their own incident reports once marked as Read (reviewed by Admin) or Archived.',
          'Admin-Only 30-Day Retention Notice: Displayed the 30-day automatic deletion policy banner and countdown exclusively for Admins while hiding retention countdowns from Staff.',
        ],
      },
      {
        type: 'Membership Plans, Online Registration QR & Navigation',
        items: [
          'Clean Two-Button Membership Plans Screen: Replaced the stacked Membership Plans view with a full-width two-button layout—Scan QR / Enter Code on the left and Register Here (No Phone) on the right, which opens the Monthly and Yearly plan screen with a Back button.',
          'Online Registration QR Download & Front-Desk Prompt: Upgraded the post-registration QR ticket with reliable offline QR generation, a one-tap Download QR button, and clear instructions to screenshot or download the QR and show it to the front desk.',
          'Collapsed Mini-Sidebar Flyout Menu: Clicking any icon with sub-options in the collapsed desktop rail now opens a clean flyout panel on the right showing all child pages.',
          'Mobile/Tablet Sidebar & Text Size Control: Fixed mobile/tablet drawer sizing and enabled the 5% snap Text Size control on tablets (768px+) as well as desktops and projectors.',
        ],
      },
      {
        type: 'Legal Documentation, Reports Hub & Anti-Spam Alerts',
        items: [
          'Wide Legal Modal & Roles, Rights & Gym Rules Guide: Stretched the Legal & Documentation modal width for easier reading and added a "Roles, Rights & Gym Rules" tab detailing obligations, rights, and exact access for Walk-In Customers, Member Customers, Staff, Admin, and SuperAdmin (accessible from the Footer and System Info).',
          'Official Reports & Operations Export Hub (5 Formats): Removed BIR tax compliance print/export documents and renamed the Export Hub to reflect the 5 available operational formats.',
          'Foreground Notification Mute & Anti-Spam Coalescing: Automatically suppressed OS/browser popups while actively viewing the app and closed active popups on focus so alerts never spam repeatedly.',
          'Camera Scanner Cart Modal & Sticky Recycle Bin Footers: Moved Camera Scanner cart to a portaled draggable modal that keeps the camera full size, pinned Recycle Bin footer action buttons, and removed duplicate Save/Cancel bars in User Management.',
        ],
      },
    ],
  },
  {
    version: '1.0.13',
    date: '2026-11-23',
    summary:
      'Smooth lag-free app performance upgrades while keeping all animations intact, desktop-only scalable text-size slider with 5% snap notches for monitors and projectors, clearer everyday wording across menus and controls, faster staff keyboard shortcuts, and full security hardening across server endpoints and database permissions.',
    sections: [
      {
        type: 'Desktop & Screen Projector Readability',
        items: [
          'Desktop-Only Text Size Slider (5% Snapping): Added a draggable circular slider in Desktop Settings scaling smoothly from Small (85%) to Large (130%) in 5% snap steps with clickable notch dots and a one-click reset to 100%, hidden on phones and tablets.',
          'Sharper Labels & Numeric Alignment: Raised undersized desktop micro-labels, strengthened muted gray contrast so projected screens stay crisp, and aligned prices, counts, and clocks with tabular numerals.',
        ],
      },
      {
        type: 'Zero-Breakage Speed & Smoothness Optimizations',
        items: [
          'Unified Animation Engine & Faster Loading: Consolidated duplicate animation runtimes into a single engine while preserving all page transitions, modals, and drawer gestures; added lazy route splitting with skeleton placeholders and on-demand PDF library loading for exports and card/barcode printing.',
          'Clock, List & Background Efficiency: Isolated the 1-second Manila clock from the top bar, removed synchronous layout reads in virtualized lists, eased nested desktop blur layers, paused hidden-tab countdowns and polls, added async image decoding, and trimmed product and user queries to essential fields.',
        ],
      },
      {
        type: 'Staff Usability & Everyday Language',
        items: [
          'Clearer Terminology & Error Recovery: Replaced technical developer labels with plain everyday staff wording across menus, storage usage, and status badges, and added a friendly screen recovery card if a view fails to load.',
          'Navigation Fixes & Keyboard Shortcuts: Repaired empty placeholder links, connected closed cash-drawer banners directly to Cash Management, and added "/" or Ctrl+K to jump straight to search plus Esc to clear focus or close the mobile drawer.',
        ],
      },
      {
        type: 'Security Hardening & Bug Fixes',
        items: [
          'Server Endpoint & Header Protection: Enforced signed-in active admin verification on user registration, removed email-existence leaks and weak password rules in password recovery, applied constant-time sync token checks, restricted cross-origin requests to trusted domains, and added HTTP security headers.',
          'Database Permissions & Filter Safety: Added a migration restricting attendance and sales inserts to active staff/admin accounts, scoped sync-conflict updates to superadmin, and sanitized display names in user audit log filters.',
        ],
      },
    ],
  },
  {
    version: '1.0.12',
    date: '2026-11-22',
    summary:
      '7-day dashboard revenue sparkline, BIR Sales/Logbook/Both source selector, zoomable profile photos across User Management & Personal Account, full user profile details with personal audit log & live presence detection, unrestricted backup saving with Backup Overview, close-session Recycle Bin warning, and single-scan product barcode protection.',
    sections: [
      {
        type: 'Dashboard Analytics & BIR Reports',
        items: [
          '7-Day Revenue Trend Sparkline: Added an interactive 7-day daily revenue sparkline chart inside the Dashboard Summary card for visualizing daily sales performance.',
          'BIR Sales & Tax Source Filter: Added Sales, Logbook, and Both filter buttons in BIR Sales & Tax reports to scope the preview table, totals, CSV, and PDF exports dynamically.',
        ],
      },
      {
        type: 'User Management, Presence & Avatar Zoom',
        items: [
          'Click-to-Zoom Profile Images: Enabled full photo zoom and pan modals when clicking profile avatars in Personal Account and User Management.',
          'User Details & Personal Audit Log: Clicking any account in User Management opens a full details modal showing profile info, zoomable avatar, and that user\'s committed audit log history.',
          'Realtime Online Presence Fix: Wired live Supabase Presence sync/join/leave listeners into the auth store so Online and Offline badges update accurately in real time.',
        ],
      },
      {
        type: 'Backups, Cash Reconciliation & Barcode Scanner',
        items: [
          'Always-Available Backup Saving & Backup Overview: Kept Save Today\'s Backup enabled regardless of active cash sessions and added a Backup Overview modal comparing Included datasets (with human-readable member/product names, dates, denominations, and formal Gym Profile, Revenue Goals, and Rates & Payments cards) against Excluded items.',
          'Confirm Close Session Recycle Bin Warning: Added an explicit count warning inside the Confirm Close Session confirmation popup whenever items remain in the Sales or Logbook Recycle Bins.',
          'Scan-Once Product Barcode Protection: Updated camera barcode scanning so products already selected in the cart are not scanned or incremented repeatedly.',
        ],
      },
    ],
  },
  {
    version: '1.1.11',
    date: '2026-11-21',
    summary:
      'Admin-only Recycle Bin notifications and RBAC hardening, offline logbook UUID resolution, removal of invalid Promo payment enum usage, Sales daily telemetry for all roles, Online Registration QR card on Plans, and Dashboard Top Products breakdown fixes.',
    sections: [
      {
        type: 'Recycle Bin Notifications & Admin-Only Access',
        items: [
          'Admin Notification Badges & Popover Tab: Added realtime unread Recycle Bin counts and a dedicated Recycle Bin tab in the notification popover for Admins and SuperAdmins with direct navigation to Sales and Logbook Recycle Bins.',
          'Strict Staff Restrictions: Hid Recycle Bin buttons, deep-links, and modals from Staff accounts, blocked offline restore replay for non-admins, and enforced PostgreSQL RLS and update trigger guards on soft-deleted attendance, sales, and product records.',
        ],
      },
      {
        type: 'Offline Logbook & Payment Enum Fixes',
        items: [
          'Offline Member UUID Resolution: Enriched offline member caches with subscription and card metadata so search, scans, and pending vault entries resolve member names accurately instead of falling back to raw UUIDs.',
          'Cache & Enum Alignment: Excluded offline cash-session markers from logbook feeds, standardized local date filtering, and replaced invalid "Promo" payment method enum usage with Cash/Paid across enrollment RPCs and logbook views.',
        ],
      },
      {
        type: 'Sales Telemetry & Registration QR',
        items: [
          'Daily Sales Summary Pill: Opened the Sales desktop header capsule and mobile daily summary bar to all roles, displaying today\'s total income and total products sold.',
          'Membership Plans QR Card: Added a Customer Online Registration QR Code card with a Copy Link button and enlarged preview modal inside Subscription Plans.',
        ],
      },
      {
        type: 'Dashboard Sales & Top Products Polish',
        items: [
          'Resolved Unlabeled Products: Updated dashboard analytics to read camelCase POS item fields (productName, productId, barcodeId), match historical soft-deleted products, and preserve recorded item unit prices.',
          'Chart & Leaderboard Cleanup: Removed the horizontal scrollbar under analytics tabs, improved pie chart legend and ranking axis spacing, and filtered leaderboards to products with recorded sales.',
        ],
      },
    ],
  },
  {
    version: '1.0.10',
    date: '2026-11-18',
    summary:
      'Responsive Online Registration UI overhaul across mobile, tablet, and desktop; seamless Google account linking and sign-in with automatic @palomargym.noemail email replacement; automatic Online Registration switch activation on cash session open; and Supabase profile RLS/identity RPC fixes.',
    sections: [
      {
        type: 'Online Registration UI & Auto-Activation',
        items: [
          'Responsive Workspace Redesign: Streamlined the Online Registration header, ON/OFF toggle control, action toolbar, retention notice, and empty state for clean alignment across mobile, tablet, and desktop while removing redundant URL text and duplicate refresh buttons.',
          'Automatic Portal Activation on Session Open: Opening a cash drawer session now automatically flips the Online Registration switch ON, while closing all active cash sessions resets it OFF cleanly without overriding manual Admin pauses mid-shift.',
        ],
      },
      {
        type: 'Google Linking, Email Sync & Single-Session Auth Fix',
        items: [
          'Specialized /auth/callback Verification Route: Added a dedicated OAuth callback handler that awaits persisted session storage, secures the active terminal session before routing, and automatically swaps any username@palomargym.noemail placeholder email with the verified Google email.',
          'Automatic @palomargym.noemail Replacement: Linking Google on username-only accounts now syncs auth.users, email identities, and public.profiles to the linked Google email address cleanly, while reverting cleanly if unlinked (Admin/Staff).',
          'Seamless Linked Google Sign-In: Hardened session-claim metadata retries and preserved pending OAuth markers across callbacks so logging in with a linked Google account persists cleanly and never triggers false "signed in on another device" logouts.',
        ],
      },
      {
        type: 'Database RLS & Identity RPC Security Fixes',
        items: [
          'Profiles RLS & Registration Security: Updated public.profiles policies with explicit service_role full access and admin/self insert controls backed by SECURITY DEFINER functions (admin_register_user and activate_own_profile) to prevent registration RLS errors.',
          'Identity Email RPC Trigger Bypass Guard: Scoped self-service email updates inside sync_linked_google_email() and revert_user_to_local_email() via a transaction-local guard while keeping direct client profile edits locked down for Staff.',
          'SQL Migration Cleanup: Fixed a role syntax typo in the sync_conflicts 24-hour purge cron migration.',
        ],
      },
    ],
  },
  {
    version: '1.0.9',
    date: '2026-11-16',
    summary:
      'RBAC backend and frontend security hardening to prevent bypassing UI restrictions, session-gated Admin ON/OFF switch for Online Registration with database and realtime enforcement, responsive OnlineQueue UI overhaul, and notification/TypeScript fixes.',
    sections: [
      {
        type: 'RBAC Security & Access Control Enforcement',
        items: [
          'Logbook & Sales Permission Separation: Separated payment toggle permissions from soft-deletion so Staff can soft-delete and restore daily attendance and sales records via their Recycle Bins, while payment status changes (Collect / Paid), subscription purges, and direct mutations to receipts, cards, member_cards, and subscriptions remain strictly Admin-only.',
          'Soft-Delete & Revenue Visibility Guards: Replaced Sales unmount hard-deletes with deleted_at soft-deletes, gated Sales revenue counters behind Admin checks across desktop and mobile views, and exposed Sales and Logbook Recycle Bin access to Staff.',
          'Admin-Only Recycle Bin Reactivation & Trigger Sync: Restricted Logbook Recycle Bin card and receipt reactivation queries and updates to Admins, relying on PostgreSQL\'s tr_card_revert_on_attendance_change trigger to synchronize card status automatically for Staff restorations.',
          'Secure Offline Sync & RPC Routing: Updated background offline sync to process card_purchase items via the pay_physical_card RPC, route audit entries through the log_audit_entry RPC with UUID validation, and restrict direct receipts and cards mutations during attendance sync to Admins.',
        ],
      },
      {
        type: 'Online Registration Switch & Portal Controls',
        items: [
          'Session-Gated Admin ON/OFF Switch: Added an interactive role="switch" control in OnlineQueue allowing Admin and SuperAdmin users to toggle public Online Registration ON or OFF (read-only for Staff), automatically forcing the switch OFF and disabling it whenever no cash drawer session is open.',
          'Database Enforcement & Realtime Sync: Persisted online_registration_enabled in system_config backed by get_online_registration_status(), set_online_registration_enabled(), updated is_gym_open() anonymous RLS insert checks, a cash_sessions trigger resetting the switch to false on session close, and a system_config guard trigger blocking true while closed—paired with Supabase realtime sync in registrationService and OnlineRegistrationPage (/register) to distinguish a closed gym session from a paused online portal.',
        ],
      },
      {
        type: 'Online Registration UI & Notification Fixes',
        items: [
          'Single Consolidated Closed-Session Banner: Removed the redundant red closed-session banner inside OnlineQueue, retaining only the amber closed-session banner above the Members List and Online Registration tabs with clean mobile stacking and updated messaging for approvals and online registration.',
          'Responsive OnlineQueue Layout: Unified the workspace header, Admin toggle switch, and action toolbar (bringing Copy Link to tablet and desktop), and replaced the overlapping fixed mobile dock with a 2-column mobile action grid (44px+ touch targets), 1-column mobile / 2-column small-tablet card grid (<768px), sortable data table (768px+), and tabular numerals on counters and purge timers.',
          'Cash Notification & TypeScript Fixes: Added full digital_in type and UI support to notification cash approval/rejection handlers, corrected auth/superadmin import paths in update and notification services, and resolved remaining TypeScript build issues.',
        ],
      },
    ],
  },
  {
    version: '1.0.8',
    date: '2026-11-15',
    summary:
      'Encrypted AES-256-GCM database backup exports/imports, Online Registration closed-session gate and live portal URL resolution, strict duplicate member name prevention, standardized form character limits, uppercase product normalization, SuperAdmin Google unlink lock, Settings header quick toggles, and removal of GPS/Device Permissions.',
    sections: [
      {
        type: 'Database Backup, Security & Admin Controls',
        items: [
          'Encrypted Backup Export & Validated Import: Added password re-authenticated (verify_user_password RPC) Export Data and Import Data workflows in Database Backup using an opaque AES-256-GCM encrypted .wpenc format, strict schema validation, and duplicate resolution prior to batch insertion.',
          'SuperAdmin Google Unlink Lock: Prevented SuperAdmin accounts from unlinking their connected Google account inside Personal Account settings.',
          'Database Manager Cleanup: Removed the Sync Conflicts tab along with its client-side state and queries, relying on automated 24-hour pg_cron purges for cleanup.',
        ],
      },
      {
        type: 'Online Registration & Portal Safeguards',
        items: [
          'Closed Cash Session Gate: Added the is_gym_open SECURITY DEFINER RPC checked on initial load, polling, and form submission; when no open cash session exists, Online Registration blocks submissions and displays "Wolf Palomar Fitness Gym Muaythai Boxing is currently closed, please come back later."',
          'Live Portal Domain Resolution: Added buildPublicPortalUrl so Open Form, Copy Link, and QR posters dynamically resolve to the live web domain (or active origin) instead of http://localhost:9999/register.',
        ],
      },
      {
        type: 'Data Integrity, Validation & Normalization',
        items: [
          'Strict Duplicate Full-Name Prevention: Blocked duplicate normalized member full names across memberService (create/update), SubscriptionPlan, MemberProfileView, MemberFormModal, and OnlineRegistrationPage, backed by the check_member_name_exists SECURITY DEFINER RPC.',
          'Input Validation & Character Limits: Enforced maxLength attributes and validation rules across Online Registration and Subscription/Profile forms—Last/First Name (50), M.I. (5), Suffix (10), Full/Emergency/Parent Name (100), Address (150 with live character counter), Phone Numbers (10–15 numeric digits), and Email (254).',
          'Uppercase Product Name Normalization: Standardized product names to uppercase across single/bulk creation and editing, product displays, and CSV migration/backup processing.',
        ],
      },
      {
        type: 'Settings UI & Permissions Cleanup',
        items: [
          'Settings Header Quick Toggles: Moved Light Theme, Standard Heading Fonts, and Battery Saving controls to the right side of the Settings header as icon-only buttons featuring an active blue glow, neutral inactive state, and descriptive hover tooltips.',
          'Location (GPS) & Device Permissions Removal: Stripped @capacitor/geolocation, Android manifest location permissions/features, Gradle references, permission helpers, GPS agreement phrasing, and the Device Permissions settings tab/page.',
        ],
      },
    ],
  },
  {
    version: '1.0.7',
    date: '2026-11-14',
    summary:
      'Super Admin Database & Migration Modules: Introduced DatabaseManager and DataMigration tabs in System Settings with superAdminOnly guards, email-verified SuperAdmin UI restrictions, and rollback manifest support in migration audit logs.',
    sections: [
      {
        type: 'System Settings & SuperAdmin Modules',
        items: [
          'DatabaseManager & DataMigration Tabs: Added dedicated DatabaseManager and DataMigration tabs to System Settings for database management and data migration workflows.',
          'SuperAdmin-Only Access Guard: Implemented the superAdminOnly guard to protect sensitive database and migration tools.',
          'Email-Verified UI Restrictions: Updated the UI to restrict access strictly to SuperAdmin users based on email verification.',
        ],
      },
      {
        type: 'Migration Audit Logs & Rollback Support',
        items: [
          'Rollback Manifest Support: Expanded migration audit logs to store and support rollback manifests for migration batches.',
        ],
      },
    ],
  },
  {
    version: '1.0.6',
    date: '2026-11-13',
    summary:
      'Fonts & Dark Mode Update: Mobile UI stability improvements, standardized blue color schemes and CSS theming variables, global input UX refinements, and readable heading font preferences.',
    sections: [
      {
        type: 'Mobile UI Stability & Theme Consistency',
        items: [
          'Mobile Keyboard Input Handling: Configured windowSoftInputMode to adjustResize for better mobile input handling when the on-screen keyboard appears.',
          'Resize Listener Optimization: Optimized window resize event listeners to prevent unnecessary UI re-renders.',
          'Interactive Widget Viewport Support: Updated the viewport meta tag for improved mobile interactive widget behavior.',
          'Unified Color & Dark Mode Variables: Standardized UI components to use consistent blue color schemes and CSS variables across light and dark mode themes.',
        ],
      },
      {
        type: 'Text Input UX & Typography',
        items: [
          'Global Input Consistency: Disabled browser autofill, autocorrect, and spellcheck globally on text inputs for predictable form behavior.',
          'Heading Font Readability Hook: Added the useHeadingFont hook to manage heading font readability preferences.',
          'System Font Support: Added support for system fonts in .font-heading via the system-heading-font class.',
        ],
      },
    ],
  },
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