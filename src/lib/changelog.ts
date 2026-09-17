// src/lib/changelog.ts

export interface ChangelogSection {
  type: 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Security';
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
 * All historical versions remain preserved here.
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.26.1',
    date: '2026-09-17',
    summary:
      'Superadmin ownership transfer, a quieter cash drawer workflow, and in-app release notes.',
    sections: [
      {
        type: 'Added',
        items: [
          'Superadmin ownership transfer: confirm the new owner by username, re-enter your own password, then wait for the 3-second safety countdown before confirming.',
          "A \"What's New\" release notes dialog shown once an update has actually been installed and the new version is running.",
          'Administrator-visible Superadmin identity lookup, so an ownership change takes effect immediately without waiting for a redeploy.',
        ],
      },
      {
        type: 'Changed',
        items: [
          'The Superadmin account is now hidden from ordinary administrators in User Management.',
          'The Enter Cash Float prompt no longer reappears after a cash session has been ended.',
        ],
      },
      {
        type: 'Fixed',
        items: [
          'Corrected Superadmin detection in User Management, which previously evaluated the helper function itself as a truthy value.',
          'Ownership transfer promotes the incoming account before handing over the role, avoiding a profile-update guard rejection.',
        ],
      },
    ],
  },
  {
    version: '0.24.7',
    date: '2026-09-10',
    summary: 'Security hardening, Android APK installation stability, and unified agreements.',
    sections: [
      {
        type: 'Fixed',
        items: [
          'Enforce strict 6-digit verification codes across all 2FA authentication and password recovery flows.',
          'Synced System Information legal documents with the unified AgreementDocumentViewer.',
          'Fixed Android APK installer FileProvider authority error when installing Catbox CDN updates.',
          'Fixed broken Continue with Google button on Capacitor Android via system browser & deep linking.',
          'Added automatic page refresh handling for PWA webapp when out of date.',
          'Updated public pre-registration URL to canonical https://wolfpalomar.vercel.app/register and added link copy buttons.',
          'Configured staff and admin terminal login link to https://wolfpalomar.vercel.app/login across public registration pages.',
          'Cleaned up duplicate recovery code bypass prompts in authentication screen.',
        ],
      },
    ],
  },
  {
    version: '0.24.6',
    date: '2026-09-09',
    summary: 'Remote administrative session revocation and member profile management.',
    sections: [
      {
        type: 'Added',
        items: [
          'Real-time global session revocation broadcast listener for instant administrator remote sign-out.',
          'Edit profile modal with real-time avatar upload and username management in user directory.',
          'Dynamic camera switching and live video feed preview diagnostics in system permissions.',
        ],
      },
    ],
  },
  {
    version: '0.24.5',
    date: '2026-09-08',
    summary: 'OTA Catbox CDN update distribution and offline logbook enhancements.',
    sections: [
      {
        type: 'Added',
        items: [
          'Direct Catbox CDN OTA application release pipeline with high-speed download mirrors.',
          'In-app APK updater dialog with real-time download telemetry and package installer handoff.',
          'Offline attendance check-in and local database synchronization optimizations.',
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
 * Returns a specific changelog entry by version string (e.g. "0.24.7" or "v0.24.7").
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
    for (const item of section.items) {
      lines.push(`• ${item}`);
    }
  }
  return lines.join('\n');
};
