// src/components/ui/WhatsNewModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { getChangelogForVersion } from '../../lib/changelog';
import pkg from '../../../package.json';

/**
 * localStorage key holding the app version the user last acknowledged.
 * When it differs from the RUNNING version, an update has been installed.
 */
const LAST_SEEN_VERSION_KEY = 'palomar_last_seen_version';

const readStoredVersion = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
};

const writeStoredVersion = (version: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // localStorage can be unavailable in private mode or a restricted WebView.
  }
};

/**
 * "What's New" announcement shown after an update has been installed.
 *
 * TIMING CONTRACT -- this is what makes it wait for the update:
 *   The modal keys off `pkg.version`, the version of the bundle that is
 *   ACTUALLY RUNNING right now. It never consults the remote app_releases
 *   table, and it never fires merely because an update is *available*.
 *
 *   So the sequence is always:
 *     1. Update is downloaded / APK installed.
 *     2. App restarts (or PWA reloads) into the new bundle.
 *     3. THIS component compares the new running version against the recorded
 *        one, sees they differ, and only then announces the changes.
 *
 *   If an update is offered but never applied, the running version never
 *   changes and nothing is shown -- exactly the desired behaviour.
 *
 * FIRST INSTALL: on a brand-new device there is no previously recorded version,
 * so we record the current one silently. There is no "old version" to announce
 * a change against.
 */
export const WhatsNewModal: React.FC = () => {
  const currentVersion = pkg.version;

  const [isOpen, setIsOpen] = useState(false);
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);

  useEffect(() => {
    const storedVersion = readStoredVersion();

    if (!storedVersion) {
      // First ever launch on this device -- record and stay silent.
      writeStoredVersion(currentVersion);
      return;
    }

    if (storedVersion === currentVersion) {
      // Nothing changed since the user last acknowledged this version.
      return;
    }

    // The running bundle differs from the last acknowledged version, which means
    // the update has genuinely been installed and we are now on the new build.
    setPreviousVersion(storedVersion);

    // Let the app paint and finish its boot sequence before interrupting.
    const timer = setTimeout(() => setIsOpen(true), 1200);
    return () => clearTimeout(timer);
  }, [currentVersion]);

  const changelog = useMemo(
    () => getChangelogForVersion(currentVersion),
    [currentVersion]
  );

  const handleDismiss = () => {
    // Record only on dismissal, so an interrupted session still shows it later.
    writeStoredVersion(currentVersion);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      title=""
      className="max-w-lg p-6 text-left"
    >
      <div className="space-y-4 font-body">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-(--color-primary)/10 text-(--color-primary) flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-heading font-black uppercase tracking-wider text-(--color-text)">
              What&apos;s New
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {previousVersion && (
                <>
                  <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500">
                    v{previousVersion}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                </>
              )}
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                v{currentVersion}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close what's new"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        {changelog.summary && (
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            {changelog.summary}
          </p>
        )}

        {/* Sections */}
        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {changelog.sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1.5">
              <span className="text-[10px] font-heading font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {section.type}
              </span>
              <ul className="space-y-1.5">
                {section.items.map((item, iIdx) => (
                  <li
                    key={iIdx}
                    className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-(--color-primary) mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-(--border-color)">
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
            Released: {changelog.date}
          </span>
          <Button
            variant="primary"
            onClick={handleDismiss}
            className="px-5 py-2.5 text-[10px] font-heading tracking-widest uppercase"
          >
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
};
