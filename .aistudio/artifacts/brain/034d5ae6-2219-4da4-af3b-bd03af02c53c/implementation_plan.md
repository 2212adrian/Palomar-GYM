# UI Dark Mode Overhaul & Compliance Export Hub Upgrades

A comprehensive plan to recalibrate dark mode color styling across the application (reserving red strictly for errors and destructive actions, styling primary buttons as dark slate with red accent borders and white text), fixing header title contrast in `index.tsx` for light/dark responsiveness, and upgrading the Official Reports & Compliance Export Hub.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification and will govern execution:
> - **Primary Action Buttons in Dark Mode**: Dark slate/zinc background with red accent borders (`border-red-600/80`), subtle dark red hover states (`hover:bg-red-950/40`), and crisp white text—eliminating the harsh "error button" feel.
> - **Red Color Guardrails**: Red (`#DC2626` / `text-red-500` / `bg-red-950`) is strictly reserved for true runtime errors, validation alerts, and destructive actions (e.g., Delete, Void). Informational banners (such as "Access Protocol" on login), subtitles, breadcrumbs, and status labels will display in white or clean slate in dark mode.
> - **Cash Sessions Denomination Breakdown**: Implemented as an expandable detail drawer row in the live preview table, with complete bill/coin counts included in CSV and PDF exports.
> - **Report Hub Status Cleanups**: Pointless "VALID" status removed from BIR Sales & Tax and status removed from Cash Sessions.
> - **GCash Reference Tracking**: GCash reference numbers will be prominently visible for all GCash transactions in Attendance Passes and Membership Contracts reports.

---

## 1. Overview & Core Concept

### What It Delivers
1. **Light & Dark Mode Header Responsiveness (`src/routes/index.tsx`)**:
   - Fixes the page header title so it renders with clear high-contrast dark navy (`text-slate-900`) on light mode and crisp white (`dark:text-white`) on dark mode.
   - Adjusts the subtitle and breadcrumbs from error-toned rose text to balanced theme-responsive tokens.
2. **Dark Mode Color De-Escalation**:
   - Re-styles login "Access Protocol" and non-error notice boxes from red/rose alert styling to a polished cybersecurity protocol card (dark slate, subtle steel-blue shield accent, white text).
   - Standardizes primary action buttons in dark mode to use dark slate with subtle red accent outlines and white text instead of solid warning red.
   - Eliminates non-error red text in dark mode, ensuring general labels, metrics, and text render in clean white or neutral slate.
3. **Official Reports & Compliance Export Hub Upgrades (`ReportsExportModal.tsx`)**:
   - **BIR Sales & Tax**: Removes the redundant "VALID" status column from the preview table, CSV, and PDF exports.
   - **Cash Sessions**: Removes the status column and adds an interactive expandable detail drawer showing counted bill/coin breakdown (e.g. ₱1,000x5, ₱500x2, ₱100x10) for each session, plus inclusion in CSV and PDF.
   - **Attendance & Membership Reports**: Checks if payment method is GCash; if so, displays the 13-digit GCash reference number alongside the payment method in the table, CSV, and PDF.

---

## 2. User Experience & Visual Design

### A. Dark Mode Color Restraint & Hierarchy
- **Error vs. Neutral Distinction**:
  - *True Error / Danger*: `bg-rose-600`, `text-rose-500`, `border-rose-600` (e.g., "Invalid password", "Void Subscription", "Delete User").
  - *Primary Action Buttons*: `bg-white dark:bg-[#161920] border border-slate-200 dark:border-red-600/60 hover:dark:bg-red-950/30 text-slate-800 dark:text-white` with crisp typography.
  - *Access Protocol (Login)*: `bg-slate-100 dark:bg-zinc-900/90 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200` with an athletic steel/blue shield icon.
  - *Informational Text*: Replaced `text-red-500` / `text-rose-500` with `text-slate-900 dark:text-white` or `text-slate-600 dark:text-slate-300`.

### B. Reports Export Hub Preview Table
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  OFFICIAL REPORTS & COMPLIANCE EXPORT HUB                                       [X]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [BIR SALES & TAX]  [CASH SESSIONS]  [ATTENDANCE & PASSES]  [MEMBERSHIP]  ...          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  CASH SESSIONS AUDIT                                                                   │
│  Session ID        Opened At         Closed At         Float (PHP)  Counted (PHP)      │
│  CS-20261110-001   Nov 10, 08:00 AM  Nov 10, 06:00 PM  ₱1,000.00    ₱15,450.00  [v]    │
│  └─▶ [EXPANDED BREAKDOWN]:                                                             │
│      Banknotes: ₱1,000 x 12  ·  ₱500 x 6  ·  ₱100 x 4  ·  ₱50 x 1  ·  Coins: ₱20 x 0  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ATTENDANCE & MEMBERSHIP LOGS                                                          │
│  Customer Name      Plan             Amount      Payment Method                        │
│  Adrian Angeles     Monthly Member   ₱1,200.00   GCash (Ref: 9028172635412)            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Architecture & File Map

```
┌─────────────────────────────────────────────────────────────┐
│                       System Layout                         │
│                              │                              │
│            ┌─────────────────┴──────────────────┐           │
│            ▼                                    ▼           │
│    src/routes/index.tsx              src/pages/auth/Login   │
│    (Responsive Header Title          (Non-error Access      │
│     slate-900 / dark:white)           Protocol card)        │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
     ┌───────────────────────────────────────────────────┐
     │  src/pages/dashboard/components/                  │
     │  ReportsExportModal.tsx                           │
     │  - BIR: Remove status column                      │
     │  - Cash: Remove status, add Denomination Drawer   │
     │  - Attendance & Subs: Display GCash Ref #         │
     │  - PDF & CSV: Sync schema & denominations         │
     └───────────────────────────────────────────────────┘
```

### Detailed Component Changes:
1. **`src/routes/index.tsx`**:
   - Update `HeaderLayout`:
     ```tsx
     <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
       {headerInfo.subtitle}
     </span>
     <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase mt-0.5">
       {headerInfo.title}
     </h1>
     ```
   - Ensure light mode renders sharp slate navy `#0f172a` while dark mode renders pure `#ffffff`.

2. **`src/pages/auth/Login.tsx`**:
   - Update `ACCESS PROTOCOL` box from red alert classes (`dark:bg-red-950/30`, `dark:border-red-600/30`, `text-red-500`) to a neutral security protocol badge with `text-slate-800 dark:text-slate-200`, subtle border, and blue shield.
   - Refactor primary submit buttons and recovery buttons to use dark slate with red accent border and white text in dark mode.

3. **`src/pages/dashboard/components/ReportsExportModal.tsx`**:
   - **BIR Sales & Tax**:
     - Remove "STATUS" column from `headers` in preview table, CSV generator, and PDF generator.
   - **Cash Sessions**:
     - Remove "STATUS" column.
     - Add `expandedSessionId` toggle state.
     - Add expand button in the session table row and an animated child row rendering the bill and coin breakdown (`₱1,000x...`, `₱500x...`, etc.) formatted cleanly.
     - In CSV export: Add `DENOMINATIONS` column with formatted breakdown.
     - In PDF export: Add denomination summary below the session row.
   - **Attendance & Subscriptions**:
     - Extract `reference_number`, `gcash_reference`, or receipt GCash reference for each row.
     - Format payment method column: `GCash • Ref: ${refNumber}` when payment method is GCash and reference is present.
     - Include reference number in CSV columns and PDF reports.

4. **Global Theme & Dark Mode Styling**:
   - Review and update components where non-error red text is used, replacing with white or light slate text in dark mode.
   - Keep red strictly on error messages, alert modals, and delete/void actions.

---

## 4. Verification & Testing Steps

1. **Light & Dark Mode Header Contrast**:
   - Toggle to light mode: Confirm `index.tsx` header title is clearly visible in dark navy (`text-slate-900`).
   - Toggle to dark mode: Confirm header title is crisp white (`text-white`).
2. **Login Access Protocol & Button Colors**:
   - Inspect Login screen in dark mode: Verify "Access Protocol" looks like a trusted information card (slate/white), not an error banner.
   - Verify primary action buttons have a dark slate background with red accent borders and white text.
3. **Reports Export Hub Verification**:
   - Open Compliance Export Hub -> BIR Sales: Confirm no "VALID" status column.
   - Open Cash Sessions: Confirm no "STATUS" column; click to expand a cash session and verify denomination counts appear clearly in the drawer.
   - Open Attendance & Subscriptions: Verify GCash transactions display their reference numbers.
   - Export CSV and PDF for Cash Sessions, Attendance, and BIR to ensure headers and data match the clean format without encoding bugs.
4. **Compile & Lint**: Run `compile_applet` and `lint_applet` together to verify 0 syntax or type errors.
