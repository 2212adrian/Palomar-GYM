# Changelog

All notable changes to the Wolf Palomar Gym Terminal are documented in this file.

## [0.24.7] - 2026-09-10
### Fixed
- Enforce 6-digit verification codes across all 2FA authentication and password recovery dispatch flows.
- Synced System Information legal documents with unified AgreementDocumentViewer.
- Fixed Android APK installer authority meta-data error when installing updates from Catbox CDN.
- Fixed Google OAuth sign-in flow on Capacitor Android to use in-app system browser with PKCE and deep link handling.
- Enhanced PWA update detection with automatic reload mechanism for out-of-date web clients.
- Updated public pre-registration URL to canonical https://wolfpalomar.vercel.app/register and added link copy buttons.
- Configured staff and admin terminal login link to https://wolfpalomar.vercel.app/login across public registration pages.
- Cleaned up duplicate recovery code bypass prompts in authentication screen.

## [0.24.6] - 2026-09-09
### Added
- Real-time global session revocation broadcast listener for instant administrator remote sign-out.
- Edit profile modal with real-time avatar upload and username management in user directory.
- Dynamic camera switching and live video feed preview diagnostics in system permissions.

## [0.24.5] - 2026-09-08
### Added
- Direct Catbox CDN OTA application release pipeline with high-speed download mirrors.
- In-app APK updater dialog with real-time download telemetry and package installer handoff.
- Offline attendance check-in and local database synchronization optimizations.

