# Offline-First Action Queue, Haptic Feedback & User Presence Architecture

A production-grade upgrade for Palomar Gym integrating an offline-first IndexedDB Action Queue with topbar slide-over drawer, haptic sensory feedback with battery-saver auto-suppression, permanent notification deduplication, and real-time staff Online/Offline presence with account disabling.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product decisions were confirmed during interactive clarification and will guide this implementation:

- **Confirmed Decision 1 (Action Queue UI)**: Staff will monitor and manage offline queued operations via a dynamic **topbar badge and slide-over drawer**, allowing full inspection, retry, and manual sync triggers alongside automated reconnection sync.
- **Confirmed Decision 2 (Staff Account Lifecycle & Presence)**: Accounts are created in **Pending** status. When the user logs in or opens the app, their presence turns **Online**; upon disconnect/closing, it turns **Offline**. The legacy "Inactive" status is renamed to **Disabled**, locking login and session creation until re-enabled by an admin.
- **Confirmed Decision 3 (Haptic Feedback Pattern)**: Light tactile impact (`ImpactStyle.Light`) on button presses and distinct success vibration (`NotificationType.Success`) on form submissions, with strict zero-vibration suppression whenever Battery Saver mode is active.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Offline Action Queue**: Captures critical front-desk actions (member registration, check-in attendance, membership subscriptions, card purchases, and incident reports) into an encrypted IndexedDB vault whenever network connectivity drops. When the connection resumes, items automatically sync to Supabase with exponential backoff and conflict resolution.
  2. **Topbar Action Queue Drawer**: A responsive slide-over drawer accessible from the topbar that displays queued operations, timestamps, staff author, and sync status.
  3. **Haptic Feedback**: Integrates `@capacitor/haptics` across button interactions and form completion flows on mobile/Android devices, while automatically disabling vibrations when Battery Saver mode is on.
  4. **Smart Notification Engine**: Dispatches notifications through `@capacitor/local-notifications` and browser notification APIs for incidents, stock alerts, and membership expiries, ensuring that once an item is viewed, it is permanently marked as seen and never re-notified.
  5. **Staff Presence & Disabled Status**: Replaces the old "Active/Inactive" toggle with a modern "Disabled" account toggle and live "Online/Offline/Pending" presence indicator in User Management.

- **Target Audience / Persona**:
  Front-desk receptionists, gym floor managers, and system administrators running operations in unpredictable network environments and mobile Android devices.

- **Key Value**:
  Zero lost check-ins or sales during internet dropouts, crystal-clear operational visibility into who is currently logged in, and tactile responsiveness on touch hardware without draining device battery.

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Offline Action Capture & Queue Inspection**:
   - The user registers a member or logs an attendance check-in while offline.
   - The action immediately succeeds locally in IndexedDB; a topbar badge pulses with the pending count.
   - Tapping the queue badge opens a sleek slide-over drawer detailing all queued actions with retry and manual force-sync controls.
   - Upon reconnecting, the background worker reconciles all records into Supabase and updates the badge to 0 with a success toast.

2. **Haptic Feedback & Battery Saver Guard**:
   - Tapping buttons triggers a crisp light haptic tap (`ImpactStyle.Light`).
   - Submitting forms (e.g. new member, POS checkout, incident report) triggers a dual success pulse.
   - If Battery Saver is activated (manually or when battery $\le 20\%$), haptics are silenced immediately without UI disruption.

3. **Notification Deduplication**:
   - Stock alerts, incident reports, and expiring subscriptions notify staff on Android devices via Capacitor local notifications.
   - When the user opens the notification popover or clicks an alert, the alert ID is committed to local seen storage and never dispatched again.

4. **User Management Presence & Disabled Account Lock**:
   - Freshly created staff accounts show **Pending**.
   - As soon as the staff member opens their session, the status turns **Online** with an emerald dot.
   - When disconnected, it reflects **Offline** with a neutral slate dot.
   - Toggling an account to **Disabled** immediately revokes active access and blocks login attempts until toggled back.

#### Visual Identity & Theme

- **Aesthetic Direction**: High-density athletic utilitarian operations console with clean dark/light ergonomics.
- **Palette & Tokens**:
  - Primary: Deep Palomar Navy (`#123c73`) and Crimson Accent (`#bf0202`).
  - Surface: Pure White / Rich Slate Dark (`#161920`, `#1a1e27`).
  - Presence Dots: Emerald (`#10b981`) for Online, Slate (`#64748b`) for Offline, Amber (`#f59e0b`) for Pending, Rose (`#ef4444`) for Disabled.
- **Zero-Pill Discipline**:
  - Unboxed status indicators with typography (`Online · Last active 2m ago`) rather than bloated candy pill badges.
  - Interactive filter segmented controls with flat tactile buttons.
- **Typography**: Clean sans display hierarchy (`Outfit` / `Plus Jakarta Sans`) with monospace tabular numbers (`font-mono tabular-nums`) for timestamps and counts.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: IndexedDB Action Queue Architecture**:
  - *Chosen Approach*: Leverage and enhance the existing `offlineVault.ts` and `backgroundSyncService.ts` IndexedDB stores with an observable Zustand store (`useActionQueueStore`) that reacts in real-time to vault mutations.
  - *Why*: Avoids data duplication and guarantees crypto-grade SHA-256 tamper seals while providing immediate UI reactivity across topbar and drawer.
  - *Alternatives Considered*: Storing queues in `localStorage` was rejected due to strict 5MB quota limits and lack of transaction locking.

- **Decision 2: Haptics Utility Wrapper (`hapticsService.ts`)**:
  - *Chosen Approach*: Build a unified `triggerHaptic(type)` utility that dynamically checks `@capacitor/haptics`, falls back to Web Vibration API where available, and bails out if `isBatterySaver` is true.
  - *Why*: Centralizes battery-saver compliance in a single place rather than scattering power-check guards in every button component.

- **Decision 3: User Presence Tracking via Supabase Realtime & Heartbeat**:
  - *Chosen Approach*: Maintain a lightweight `last_seen_at` heartbeat in Supabase and listen to presence channels. Accounts with active heartbeat within 5 minutes or open socket are marked "Online"; otherwise "Offline". Newly created accounts retain "pending" until their first session. "Disabled" is stored as `status = 'disabled'`.
  - *Why*: Accurate, scalable, and does not require third-party presence providers.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION LAYER                          │
│                                                                        │
│   [Button Click / Submit]   [Reception Check-in]   [User Management]   │
└──────────────┬────────────────────────┬─────────────────────┬──────────┘
               │                        │                     │
               ▼                        ▼                     ▼
┌──────────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│      HAPTICS ENGINE      │ │ OFFLINE INTERCEPT  │ │ PRESENCE TRACKER   │
│                          │ │                    │ │                    │
│   @capacitor/haptics     │ │ Check navigator    │ │ Supabase Heartbeat │
│   Battery Saver Guard    │ │ If offline ->      │ │ Online / Offline   │
│   (Suppresses if active) │ │ Encrypt & Queue    │ │ Disabled Lock      │
└──────────────────────────┘ └──────────┬─────────┘ └────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        INDEXEDDB ENCRYPTED VAULT                       │
│                                                                        │
│   Stores: pending_transactions, action_queue, vault_meta               │
│   Crypto: AES-GCM (256-bit) + Salted SHA-256 Tamper Verification       │
└───────────────────────────────────────┬────────────────────────────────┘
                                        │ (When online resumes)
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKGROUND SYNC SERVICE                         │
│                                                                        │
│   Reconciliation Worker ───> Supabase Remote Database (Auto Retry)     │
│   Topbar Drawer UI      <─── Emits sync status, pending counts         │
└────────────────────────────────────────────────────────────────────────┘
```

#### Implementation Progress & Completed Verification

- [x] **Install `@capacitor/haptics`**: Installed and configured.
- [x] **Haptic Sensory Feedback (`src/lib/hapticsService.ts`)**:
  - `triggerHapticButton()` (`ImpactStyle.Light`).
  - `triggerHapticFormSuccess()` (`NotificationType.Success`).
  - Battery Saver suppression verified via battery API and `.battery-saver` check.
  - Added to `Button.tsx`, `ActionQueueDrawer.tsx`, `UserManagement.tsx`, and `LogbookRecordAttendance.tsx`.
- [x] **Offline-First Action Queue Store & Drawer**:
  - Event dispatch on IndexedDB write/purge in `src/lib/offlineVault.ts`.
  - Reactive Zustand store `src/stores/useActionQueueStore.ts`.
  - Slide-over drawer with real-time pending count, retry/discard controls, and manual sync in `src/components/layouts/ActionQueueDrawer.tsx`.
  - Live topbar counter button in `src/components/layouts/Topbar.tsx`.
- [x] **Persistent Notification Deduplication**:
  - Persistent tracking of dispatched IDs in `src/stores/useNotificationStore.ts`.
  - Alerts are dispatched as native browser/Capacitor notifications.
  - Opening `NotificationPopover.tsx` permanently marks alerts as seen so they never notify again.
- [x] **Staff Account Presence & Disabled Status**:
  - Replaced "Active/Inactive" with "Disabled" toggle in `src/pages/system/UserManagement.tsx`.
  - Realtime Supabase presence tracking for Online / Offline status.
  - Newly created accounts display "Pending" until initial login.
  - Disabled accounts are strictly rejected from logging in and accessing sessions (`src/stores/authStore.ts`).
- [x] **Build Verification**:
  - `lint_applet` passed with 0 errors.
  - `compile_applet` passed successfully.
