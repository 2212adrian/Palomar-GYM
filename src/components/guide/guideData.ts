// src/components/guide/guideData.ts
import {
  ShoppingCart,
  BookOpen,
  Award,
  AlertTriangle,
  Users,
  Package,
  Wallet,
  BarChart3,
  ShieldCheck,
  Camera,
  type LucideIcon,
} from 'lucide-react';
import type { GuideTopicId } from '../../stores/useGuideStore';

export interface GuideStep {
  number: number;
  title: string;
  description: string;
  tip?: string;
  badge?: string;
}

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideTopic {
  id: GuideTopicId;
  title: string;
  shortLabel: string;
  icon: LucideIcon;
  targetRole: 'staff_and_admin' | 'admin_only';
  priorityOrder: number;
  summary: string;
  timeEstimate: string;
  keywords: string[];
  staffPermissions?: string[];
  adminExclusives?: string[];
  steps: GuideStep[];
  rules: string[];
  faqs: GuideFaq[];
}

export const GUIDE_TOPICS: GuideTopic[] = [
  // ─── 1. STAFF DESK GUIDES (Operational front-desk modules) ───
  {
    id: 'sales',
    title: 'Sales Register & POS',
    shortLabel: 'Sales Guide',
    icon: ShoppingCart,
    targetRole: 'staff_and_admin',
    priorityOrder: 1,
    summary:
      'How front-desk staff ring up gym drinks, supplements, and merchandise, accept payments, and issue receipts during an active drawer session.',
    timeEstimate: '2 mins read',
    keywords: [
      'sales',
      'cashier',
      'pos',
      'cart',
      'cash',
      'gcash',
      'receipt',
      'print',
      'change',
      'drinks',
      'selling',
    ],
    staffPermissions: [
      'Ring up retail items, energy drinks, and merchandise from the catalog',
      'Accept Cash payments and let the system calculate customer change automatically',
      'Verify GCash QR scans and enter transaction reference numbers',
      'Print digital or physical official receipts for paying customers',
      'View today’s sales timeline while the shift drawer session is open',
    ],
    adminExclusives: [
      'Opening or Closing the Cash Drawer shift session (entering initial float & balancing till)',
      'Adding new retail products, changing item selling prices, or editing barcodes',
      'Modifying or deleting past completed sales records from closed drawer sessions',
      'Batch restocking deliveries via the Restock Editor (handled in Products)',
    ],
    steps: [
      {
        number: 1,
        title: 'Choose or Scan the Item',
        description:
          'Click any product card from the POS screen, or scan the barcode packaging / type the barcode in the search bar. The item is instantly added to your cart on the right.',
        tip: 'Tapping an item multiple times increases its quantity in the cart.',
        badge: 'Step 1',
      },
      {
        number: 2,
        title: 'Select Payment Method (Cash or GCash)',
        description:
          'Under the cart, choose Cash or GCash:\n• For Cash: Type the cash amount received from the customer. The system automatically computes their exact change!\n• For GCash: Present the front-desk GCash QR code for the member to scan, verify payment on your GCash terminal, then type the reference number.',
        tip: 'Always confirm the payment notification on your GCash device before completing the transaction.',
        badge: 'Step 2',
      },
      {
        number: 3,
        title: 'Tap "Complete Sale" & Issue Receipt',
        description:
          'Click the green "Complete Sale" button. A digital receipt appears instantly. If the customer requests a physical receipt, tap "Print Receipt".',
        tip: 'To reprint an earlier sale from today’s active session, scroll the timeline list below and tap the Printer icon.',
        badge: 'Step 3',
      },
    ],
    rules: [
      'Never release items to a customer before payment is verified.',
      'If the Cash Drawer indicator shows CLOSED, request an Administrator to open today’s session with a starting float. Staff cannot open drawer sessions.',
      'To remove an accidentally clicked product, tap the trash can icon beside it in the cart.',
      'Closed session records are locked and read-only for staff.',
    ],
    faqs: [
      {
        question: 'What if the register says "Cash Drawer Closed"?',
        answer:
          'Cash drawer sessions are Admin Exclusive. An on-duty Administrator or Gym Owner must open today’s drawer session and provide the physical float before sales can be finalized.',
      },
      {
        question: 'Can staff add new drinks or change prices?',
        answer:
          'No. Adding products, changing prices, and inventory stock control are reserved exclusively for Administrators in the Products catalog.',
      },
      {
        question: 'How do I cancel an accidental item before finalizing?',
        answer:
          'Simply tap the trash can icon next to the item or click "Clear Cart" to reset without affecting inventory.',
      },
    ],
  },

  {
    id: 'cash',
    title: 'Cash Drawer & Shift Operations',
    shortLabel: 'Cash Drawer Guide',
    icon: Wallet,
    targetRole: 'staff_and_admin',
    priorityOrder: 2,
    summary:
      'Understanding how cash drawer sessions work: front-desk cash handling, automated customer change calculation, accepting GCash payments, and why opening starting floats or closing sessions is strictly Admin Exclusive.',
    timeEstimate: '3 mins read',
    keywords: [
      'cash',
      'drawer',
      'float',
      'shift',
      'open session',
      'close session',
      'change',
      'petty cash',
      'admin exclusive',
      'reconciliation',
      'discrepancy',
    ],
    staffPermissions: [
      'Accept physical Cash and GCash payments for retail sales, walk-in workout passes, and subscriptions during an active open session',
      'Let the system automatically calculate customer change upon typing the cash tendered',
      'Check the live drawer session status badge (Open / Closed / Offline) in the Topbar or Cash Management page',
      'View the active shift activity ledger and real-time transaction movements',
    ],
    adminExclusives: [
      'Opening the daily cash drawer session and inputting the starting physical cash float (e.g., ₱1,000)',
      'Closing and ending the shift session, conducting physical currency counts, and balancing discrepancies',
      'Recording manual Cash In float top-ups or Cash Out petty expense disbursements (e.g. water jug refills)',
      'Viewing historical cash sessions, past discrepancy logs, and closed shift financial reports',
    ],
    steps: [
      {
        number: 1,
        title: 'Shift Start: Administrator Opens Drawer with Starting Float',
        description:
          'Every business day or shift starts with an Administrator unlocking and opening the cash drawer session. The Admin counts the physical cash bills/coins and enters the starting float amount (e.g., ₱1,000).\n\n⚠️ IMPORTANT FOR STAFF: Front-desk staff CANNOT open drawer sessions. If the screen says "Cash Session Closed" or the topbar pill is red, request an on-duty Administrator to open today\'s session before accepting counter payments.',
        tip: 'POS sales and walk-in passes cannot accept cash until the drawer session is opened by an Admin.',
        badge: 'Shift Start (Admin Only)',
      },
      {
        number: 2,
        title: 'Operating During an Active Drawer Session',
        description:
          'Once the drawer indicator shows "DRAWER OPEN", front-desk staff can ring up sales in POS, log attendance passes, and process membership plans:\n• Type the exact cash received from the customer; the system computes the exact change to return.\n• For GCash payments, verify the customer\'s payment confirmation on the desk GCash phone before entering the reference number.\n• Put received money inside the register till immediately.',
        tip: 'Never guess customer change—always let the POS calculate the exact difference.',
        badge: 'Counter Operation (Staff)',
      },
      {
        number: 3,
        title: 'Petty Cash & Mid-Day Cash Movements (Admin Exclusive)',
        description:
          'If physical money must be taken from the till for immediate gym expenses (such as drinking water refills or emergency cleaning materials), an Administrator must log the "Cash Out" with an explanation. Staff must never remove cash from the register without Admin recording.',
        badge: 'Petty Cash (Admin Only)',
      },
      {
        number: 4,
        title: 'Shift End: Administrator Closes & Balances the Till',
        description:
          'At the end of the shift or closing time, an Administrator conducts the physical currency count, compares it against system records, records any shortage or overage, and officially clicks "Close Session".\n\n⚠️ IMPORTANT FOR STAFF: Staff DO NOT have permission to close drawer sessions or balance discrepancies. The Close Session button is hidden on staff accounts.',
        tip: 'Staff should never attempt to force-close the drawer—reconciliation is reserved for Administrators.',
        badge: 'Shift End (Admin Only)',
      },
    ],
    rules: [
      'Staff CANNOT open or close cash drawer sessions. This is strictly Admin Exclusive for financial accountability.',
      'Staff must NEVER accept cash payments while the drawer is marked Closed. Always request an Administrator to open the session first.',
      'Staff must never take money from the drawer for personal use or unrecorded gym expenses.',
      'All change calculations are automated by the POS; never guess or manually override change amounts.',
    ],
    faqs: [
      {
        question: 'Why can’t staff open the cash drawer if an Administrator is running late?',
        answer:
          'Opening a session requires entering and verifying the official physical cash float, which is restricted to Administrator accounts to safeguard gym finances. Contact an Admin to open the session remotely or in person.',
      },
      {
        question: 'Can staff click "Close Session" at the end of the day?',
        answer:
          'No. The "Close Session" button is hidden for staff accounts. An Administrator must perform the end-of-day physical count and close the shift.',
      },
      {
        question: 'Can staff log Cash Out for drinking water or cleaning supplies?',
        answer:
          'No. Only Administrators can record Cash Out and Cash In entries in the Cash Management ledger.',
      },
    ],
  },

  {
    id: 'logbook',
    title: 'Gym Logbook & Check-Ins',
    shortLabel: 'Logbook Guide',
    icon: BookOpen,
    targetRole: 'staff_and_admin',
    priorityOrder: 3,
    summary:
      'How to record gym visits for registered members, process daily walk-in guest workout passes, and monitor who is inside.',
    timeEstimate: '2 mins read',
    keywords: [
      'logbook',
      'check in',
      'attendance',
      'walk in',
      'guest',
      'qr code',
      'rfid',
      'card',
      'expired',
      'visit',
    ],
    staffPermissions: [
      'Scan member QR access cards or search members by name/phone to log visits',
      'Process "Daily Walk-In Passes" for non-members and collect the daily door fee',
      'View real-time daily gym check-in attendance lists and active visitor counts',
      'Print official receipts for daily walk-in visitor passes',
    ],
    adminExclusives: [
      'Deleting or modifying historical attendance logs from past closed sessions',
      'Editing member profiles, resetting cards, or changing registered member photos',
      'Manually granting complimentary check-ins to expired accounts without renewal',
    ],
    steps: [
      {
        number: 1,
        title: 'Scan QR Card or Search Member',
        description:
          'When a member arrives at the front desk, scan their printed or mobile QR code. Alternatively, type their full name or phone number into the search bar.',
        tip: 'The screen immediately shows their member photo and whether their status is Active or Expired.',
        badge: 'Step 1',
      },
      {
        number: 2,
        title: 'Click "Check-In Attendance"',
        description:
          'Verify that the person matches their profile photo and tap "Check In". Their attendance is time-stamped in today\'s logbook.',
        tip: 'If their membership is expiring soon or already expired, offer them a quick renewal under Subscription Plans.',
        badge: 'Step 2',
      },
      {
        number: 3,
        title: 'For Non-Members: Process "Daily Walk-In Pass"',
        description:
          'If a visitor does not have an active monthly membership, click "Daily Walk-In". Enter their name, collect the daily workout fee (Cash or GCash), and click Record Attendance.',
        tip: 'Daily walk-in fees are recorded automatically into the current shift session revenue.',
        badge: 'Walk-In Guest',
      },
    ],
    rules: [
      'Always verify that the face on the member card matches the customer at the counter.',
      'Expired members cannot check in as regular members without renewing their plan or paying a daily walk-in fee.',
      'Check-in entries from closed shifts cannot be deleted by staff, preserving genuine attendance records.',
    ],
    faqs: [
      {
        question: 'What if a member forgot their QR card or phone?',
        answer:
          'Search their name or contact number in the Logbook search box to check them in manually without any delay.',
      },
      {
        question: 'Can staff delete a mistaken check-in record?',
        answer:
          'Staff can remove a duplicate record during the active shift if needed, but records from past closed sessions are locked. Contact an Admin for audit adjustments.',
      },
    ],
  },

  {
    id: 'plans',
    title: 'Subscription Plans & Renewals',
    shortLabel: 'Plans Guide',
    icon: Award,
    targetRole: 'staff_and_admin',
    priorityOrder: 4,
    summary:
      'How staff process membership packages, import online pre-registrations, renew existing clients, and collect plan fees.',
    timeEstimate: '2 mins read',
    keywords: [
      'plans',
      'subscription',
      'membership',
      'renew',
      'student',
      'monthly',
      'annual',
      'discount',
      'fees',
    ],
    staffPermissions: [
      'Import prospective members by scanning their Online Pre-Registration QR ticket',
      'Search existing members and renew Monthly, Student, Promo, or Yearly memberships',
      'Collect subscription fees via Cash or GCash and activate passes',
      'Print and hand over new membership QR cards upon plan activation',
    ],
    adminExclusives: [
      'Manually enrolling a brand new member from scratch without an online pre-registration ticket',
      'Voiding, canceling, or refunding an active membership contract',
      'Creating new subscription package types or changing membership pricing (Rates & Payments)',
      'Freezing, pausing, or granting complimentary membership duration extensions',
    ],
    steps: [
      {
        number: 1,
        title: 'Import Pre-Registration or Search Member',
        description:
          '• For New Members: Ask them to scan the desk QR code to complete the Online Pre-Registration on their phone, then scan their pending ticket in "Import" mode.\n• For Renewals: Type the member\'s name or scan their existing QR card.',
        tip: 'Staff operate in Import mode. Creating brand-new members from scratch without online registration is Admin Exclusive.',
        badge: 'Step 1',
      },
      {
        number: 2,
        title: 'Select Desired Plan Package',
        description:
          'Choose the package requested by the client (e.g. 1-Month Regular, Student Discount, 3-Month Promo, or 1-Year VIP). The system automatically displays the price and duration.',
        tip: 'For Student rates, always ask to view a current, valid school ID before selecting.',
        badge: 'Step 2',
      },
      {
        number: 3,
        title: 'Collect Payment & Activate',
        description:
          'Select Cash or GCash, enter the payment details, and click "Confirm Subscription". The membership activates immediately and their QR pass is ready for check-in.',
        tip: 'Renewing before the current expiry date automatically appends duration to the end, so members never lose remaining days!',
        badge: 'Step 3',
      },
    ],
    rules: [
      'All gym subscriptions are non-refundable once paid at the counter (Consumer Act RA 7394 notice).',
      'Discounted student rates strictly require inspecting a valid school ID.',
      'Staff cannot void active contracts. If a plan was selected by mistake, inform an Administrator immediately.',
    ],
    faqs: [
      {
        question: 'Can staff create a member from scratch without the online form?',
        answer:
          'Staff workflow is streamlined through "Import" (online pre-registration queue tickets) to keep the counter line moving fast. If a client needs direct manual enrollment, an Administrator can assist.',
      },
      {
        question: 'Can staff cancel or refund a membership after payment?',
        answer:
          'No. Voiding contracts and issuing refunds is Admin Exclusive. All payments are final unless approved by an Administrator.',
      },
    ],
  },

  {
    id: 'reports',
    title: 'Incident Reports & Gym Safety',
    shortLabel: 'Incident Guide',
    icon: AlertTriangle,
    targetRole: 'staff_and_admin',
    priorityOrder: 5,
    summary:
      'How staff log facility maintenance issues, damaged workout equipment, member disputes, or safety accidents.',
    timeEstimate: '2 mins read',
    keywords: [
      'incident',
      'report',
      'broken',
      'safety',
      'equipment',
      'injury',
      'dispute',
      'damage',
      'lost and found',
    ],
    staffPermissions: [
      'Click "New Report" to log broken equipment, facility issues, accidents, or conduct disputes',
      'Provide objective incident descriptions, involved equipment, and immediate actions taken',
      'Edit or update details on reports originally filed by yourself',
      'Access Emergency Hub contacts and escalation telephone directories',
    ],
    adminExclusives: [
      'Investigating and updating report statuses (Mark as Read, In Progress, Resolved)',
      'Archiving or permanently deleting incident records from the database',
      'Editing reports filed by other staff members',
    ],
    steps: [
      {
        number: 1,
        title: 'Click "New Report"',
        description:
          'Tap the "+ New Report" button at the top of the Incident Reports page to open the simple reporting form.',
        tip: 'You can submit reports directly from a mobile phone or counter tablet.',
        badge: 'Step 1',
      },
      {
        number: 2,
        title: 'Choose the Issue Category',
        description:
          'Select the matching category:\n• Equipment Damage (frayed cables, cracked weights, treadmill malfunction)\n• Safety / Injury (member sprain, slip, dizziness)\n• Member Dispute / Conduct (verbal argument, unsafe behavior)\n• Facility / Lost & Found (plumbing leak, aircon issue, misplaced keys)',
        badge: 'Step 2',
      },
      {
        number: 3,
        title: 'Write Details & Submit',
        description:
          'Describe what happened, where it occurred, and if any temporary caution tags were put in place (e.g. "Cable crossover pulley #1 jammed. Tagged Out of Order."). Click Submit Report.',
        tip: 'Administrators receive an instant alert to schedule repairs or reach out to members.',
        badge: 'Step 3',
      },
    ],
    rules: [
      'If an injury occurs, provide first aid assistance before typing the incident report.',
      'Tag or cordon off broken equipment immediately to keep gym members safe.',
      'Staff submit reports for owner/admin review. Resolving or closing reports is Admin Exclusive.',
    ],
    faqs: [
      {
        question: 'Who resolves the incident reports?',
        answer:
          'Administrators and the Gym Owner review filed reports, coordinate maintenance technicians, and mark reports as Resolved once completed.',
      },
      {
        question: 'Can staff edit a report after submission?',
        answer:
          'Staff can update or add notes to reports that they personally created, but cannot alter reports filed by other coworkers.',
      },
    ],
  },

  {
    id: 'scanner',
    title: 'Camera Scanner (QR Codes & Barcodes)',
    shortLabel: 'Camera Scanner',
    icon: Camera,
    targetRole: 'staff_and_admin',
    priorityOrder: 6,
    summary:
      'How front-desk staff and administrators use the built-in camera scanner on mobile, tablet, or desktop to scan member QR cards and retail product barcodes.',
    timeEstimate: '2 mins read',
    keywords: [
      'scanner',
      'camera',
      'barcode',
      'qr code',
      'webcam',
      'flip camera',
      'flash',
      'check in',
      'retail',
    ],
    staffPermissions: [
      'Open the Global Smart Scanner modal via the Topbar camera icon or counter shortcut',
      'Scan member QR cards for instant logbook attendance check-in',
      'Scan Online Pre-Registration QR tickets to import new members into Subscription Plans',
      'Scan retail product barcodes to instantly add drinks and snacks to the POS Sales cart',
      'Switch between front and rear cameras or select from connected USB webcams',
    ],
    adminExclusives: [
      'Regenerating or revoking encrypted member QR security cards (handled in Member Profile)',
      'Configuring terminal hardware camera diagnostics and IP/geofence security in Settings',
    ],
    steps: [
      {
        number: 1,
        title: 'Launch the Camera Scanner',
        description:
          'Click the Camera icon in the Topbar header or tap "Scan QR / Barcode" on any desk screen. The smart scanner modal opens instantly and initializes your camera feed.',
        tip: 'Ensure your browser or tablet has granted camera permission to the gym application.',
        badge: 'Step 1',
      },
      {
        number: 2,
        title: 'Choose Target Mode (QR Code or Barcode)',
        description:
          '• Member QR Mode: Point camera at the member’s printed ID badge or smartphone screen. The system recognizes the code, plays an audio chime, and logs attendance or opens their profile.\n• Product Barcode Mode: Point camera at retail beverage or supplement barcodes to instantly add the item to the active POS register cart.',
        badge: 'Step 2',
      },
      {
        number: 3,
        title: 'Switching Cameras or Low-Light Flash',
        description:
          'On mobile or tablet devices, tap "Flip Camera" to toggle between front selfie and rear autofocus cameras. On desktop terminals with multiple webcams, use the camera selector dropdown.',
        tip: 'Hold badges roughly 6–10 inches away from the lens in good lighting for near-instant scan detection.',
        badge: 'Controls',
      },
    ],
    rules: [
      'Keep camera lenses clean from fingerprints for swift QR decoding.',
      'If a member’s phone screen brightness is too low, ask them to increase brightness before scanning.',
      'If camera hardware is unavailable, staff can manually search member names or type product barcodes.',
    ],
    faqs: [
      {
        question: 'What if the camera displays "Permission Denied"?',
        answer:
          'Check your browser or device settings to ensure Camera permissions are set to "Allow" for this website or application.',
      },
      {
        question: 'Can staff scan barcodes from an external USB laser scanner?',
        answer:
          'Yes! The system automatically detects physical USB/Bluetooth handheld barcode scanners on the Sales and Logbook search bars without requiring camera mode.',
      },
    ],
  },

  // ─── 2. ADMIN-ONLY MASTER GUIDES (Exclusive to Admins & Superadmins) ───

  {
    id: 'members',
    title: 'Managing Members & QR Cards',
    shortLabel: 'Member List Guide',
    icon: Users,
    targetRole: 'admin_only',
    priorityOrder: 7,
    summary:
      'Complete administrator guide for registering members, issuing QR cards, editing profiles, capturing webcam photos, and managing memberships.',
    timeEstimate: '3 mins read',
    keywords: [
      'members',
      'member list',
      'register',
      'profiles',
      'qr code',
      'rfid',
      'webcam',
      'photo',
      'freeze',
      'suspend',
      'edit member',
    ],
    adminExclusives: [
      'Registering brand new member profiles from scratch and capturing webcam photos',
      'Generating, regenerating, and revoking encrypted QR security access cards',
      'Editing member contact info, emergency contacts, or personal details',
      'Freezing, suspending, or archiving member profiles',
      'Exporting the entire member directory to Excel or printable format',
    ],
    steps: [
      {
        number: 1,
        title: 'Registering a New Gym Member',
        description:
          'Navigate to Members List and click "Register Member". Enter Full Name, Contact Number, Birthday, and Emergency Contact. Click the Camera icon to capture their profile photo using your webcam or phone camera.',
        tip: 'Capturing a photo ensures staff can visually verify the member during check-ins.',
        badge: 'Member Setup',
      },
      {
        number: 2,
        title: 'Generating & Issuing Access QR Cards',
        description:
          'Every registered member automatically receives a unique encrypted QR security card. Click "Generate / View QR Card". You can print physical laminated ID badges or send the digital card to their phone.',
        tip: 'The QR card works with any standard 2D barcode scanner or tablet camera.',
        badge: 'Access Badges',
      },
      {
        number: 3,
        title: 'Editing Profiles & Updating Details',
        description:
          'Click any member card to view their attendance history, payment logs, emergency contacts, and active plans. Click "Edit Profile" to update phone numbers or upload a new photo.',
        badge: 'Maintenance',
      },
      {
        number: 4,
        title: 'Freezing, Suspending, or Archiving Accounts',
        description:
          'If a member requests a medical pause or travel freeze: open their profile, toggle their status to "Suspended / Frozen", and note the reason. Unfreeze anytime with one click.',
        badge: 'Account Control',
      },
    ],
    rules: [
      'Always maintain member data privacy (RA 10173 Data Privacy Act). Never share personal details.',
      'Check IDs when registering minors (under 18) to ensure guardian signatures are on file.',
      'Ensure clear headshots without sunglasses or hats during webcam capture.',
    ],
    faqs: [
      {
        question: 'How do I replace a lost member QR card?',
        answer:
          'Open the member’s profile, click "QR Card Options", and click "Regenerate QR Card". This immediately revokes the old lost card for security and gives them a fresh code.',
      },
      {
        question: 'Can I export the member list to Excel or print it?',
        answer:
          'Yes, click the "Print / Export" button in the member list header to generate a clean directory.',
      },
    ],
  },

  {
    id: 'products',
    title: 'Product Catalog, Barcodes & Restocking',
    shortLabel: 'Product List Guide',
    icon: Package,
    targetRole: 'admin_only',
    priorityOrder: 8,
    summary:
      'Complete administrator guide for adding retail items, printing barcode sticker sheets, tracking stock levels, and using the batch Restock Editor.',
    timeEstimate: '3 mins read',
    keywords: [
      'products',
      'product list',
      'inventory',
      'barcode',
      'labels',
      'restock',
      'supplier',
      'stock movement',
      'pricing',
      'drinks',
      'recycle bin',
    ],
    adminExclusives: [
      'Adding new retail items to the inventory catalog and setting Selling & Cost prices',
      'Generating and printing barcode sticker sheets for shelf labels and bottles',
      'Executing batch stock deliveries with the Restock Editor (supplier PO tracking)',
      'Restoring accidentally deleted products from the Recycle Bin',
    ],
    steps: [
      {
        number: 1,
        title: 'Adding a New Product to the Catalog',
        description:
          'Go to My Products and click "+ Add New Item". Fill in Product Name, Category (Drinks, Supplements, Gear), Selling Price, Cost Price, and Starting Stock.',
        badge: 'Catalog Setup',
      },
      {
        number: 2,
        title: 'Printing Barcode Shelf / Product Labels',
        description:
          'Click "Print Sheet Labels" at the top of the products page. Select items and quantities. The system generates high-resolution, printable PDF sticker sheets ready for label printers or A4 sticker sheets.',
        tip: 'Stick labels on counter shelves or directly on drinks for ultra-fast point-of-sale scanning!',
        badge: 'Barcodes',
      },
      {
        number: 3,
        title: 'Restocking Deliveries (Restock Editor)',
        description:
          'When supplier delivery arrives, open "Stock Movements" and click "Restock Editor":\n• It automatically selects all items with limited inventory.\n• You can use the "Global Supplier Name" toggle to enter your delivery supplier once for all products, or specify per item.\n• Enter delivered quantities and click Save.',
        badge: 'Restock Flow',
      },
      {
        number: 4,
        title: 'Restoring Deleted Products (Recycle Bin)',
        description:
          'If an item is accidentally deleted, click "Recycle Bin" in the header to view soft-deleted products and restore them with one click, preserving all past sales records.',
        badge: 'Data Safety',
      },
    ],
    rules: [
      'Always enter both Selling Price and Cost Price so gross profit calculations remain accurate.',
      'Do not modify external barcodes once products are stickered on the sales floor.',
      'Perform physical inventory counts periodically and check the Stock Movements ledger.',
    ],
    faqs: [
      {
        question: 'Can staff access the Products or Restock editor?',
        answer:
          'No. Product management, pricing, and restocking are restricted to Administrators. Staff only have access to sell items through the Sales POS.',
      },
      {
        question: 'How do low stock notifications work?',
        answer:
          'Set a "Low Stock Threshold" (e.g. 5 units). When items fall to or below that level, the system triggers yellow warning pills to prompt a restock.',
      },
    ],
  },

  {
    id: 'dashboard',
    title: 'Executive Dashboard & Goals',
    shortLabel: 'Dashboard Guide',
    icon: BarChart3,
    targetRole: 'admin_only',
    priorityOrder: 9,
    summary:
      'How administrators monitor gym financial health, sales performance, attendance rush hours, and monthly revenue targets.',
    timeEstimate: '2 mins read',
    keywords: [
      'dashboard',
      'revenue',
      'goals',
      'analytics',
      'charts',
      'profit',
      'attendance rush',
      'financials',
    ],
    adminExclusives: [
      'Monitoring real-time revenue, gross profit, and subscription conversions',
      'Setting monthly revenue benchmarks and tracking pace trajectories',
      'Analyzing gym peak workout hours (5:00 PM – 8:30 PM heatmaps)',
    ],
    steps: [
      {
        number: 1,
        title: 'Reading Real-Time KPI Tiles',
        description:
          'The top cards display today’s Total Revenue, Active Check-ins, New Subscriptions, and Retail Item Sales. These numbers update in real-time as transactions occur.',
        badge: 'Overview',
      },
      {
        number: 2,
        title: 'Tracking Revenue Benchmarks & Targets',
        description:
          'Open "Revenue Goals" to set your gym’s monthly target (e.g., ₱200,000). The visual pace bar shows your run-rate and tells you if you are ahead or behind your target trajectory.',
        badge: 'Milestones',
      },
      {
        number: 3,
        title: 'Analyzing Busy Hours & Attendance Heatmaps',
        description:
          'Use the attendance trends chart to see gym peak workout hours. This helps schedule trainers, staff shifts, and cleaning routines.',
        badge: 'Operations',
      },
    ],
    rules: [
      'Review dashboard metrics weekly to detect shifts in membership sign-ups or retail sales.',
    ],
    faqs: [
      {
        question: 'Can staff members access the financial dashboard?',
        answer:
          'No, the system automatically protects the Executive Dashboard and financial charts for administrator accounts only.',
      },
    ],
  },

  {
    id: 'users',
    title: 'Staff Accounts & Access Security',
    shortLabel: 'User Security Guide',
    icon: ShieldCheck,
    targetRole: 'admin_only',
    priorityOrder: 10,
    summary:
      'How to create front-desk staff accounts, manage passwords, set permissions, and configure terminal restrictions.',
    timeEstimate: '2 mins read',
    keywords: [
      'users',
      'staff accounts',
      'superadmin',
      'passwords',
      'roles',
      'permissions',
      'security',
      'ip restriction',
    ],
    adminExclusives: [
      'Creating, editing, and deactivating staff user login credentials',
      'Configuring terminal location restrictions (Wi-Fi, IP, and GPS geofence)',
      'Triggering remote session revocation (force sign-out) on terminals',
    ],
    steps: [
      {
        number: 1,
        title: 'Creating Staff Accounts',
        description:
          'In User Management, click "Add User". Create an account with role "Staff". Staff accounts have access to daily operations (Sales, Logbook, Plans, and Reports) but cannot access owner settings or delete inventory.',
        badge: 'Account Setup',
      },
      {
        number: 2,
        title: 'Role Permissions & Access Control',
        description:
          'The system enforces strict role-based access control. Staff cannot see executive financials, cannot delete past audit logs, and cannot alter gym profile configuration.',
        badge: 'Permissions',
      },
      {
        number: 3,
        title: 'Terminal Security & Location Lock',
        description:
          'In System Settings, you can configure IP, Wi-Fi, or location restrictions so staff can only log in while physically present at the gym counter.',
        badge: 'Protection',
      },
    ],
    rules: [
      'Never share administrator passwords with staff.',
      'Assign individual accounts to each employee to maintain clear audit accountability.',
    ],
    faqs: [
      {
        question: 'What happens if a staff member forgets their password?',
        answer:
          'An administrator can open User Management, click the user, and trigger a secure password reset.',
      },
    ],
  },
];
