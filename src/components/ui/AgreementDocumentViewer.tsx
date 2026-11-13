// src/components/ui/AgreementDocumentViewer.tsx

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Phone,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';

export type AgreementDocument = 'agreement' | 'terms' | 'privacy';

interface AgreementDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  initialDocument?: AgreementDocument;
  hideUserAgreement?: boolean;
  onAccept?: () => void;
}

interface LiveGymLegalProfile {
  gymName: string;
  gymAddress: string;
  contactName1: string;
  contactNumber1: string;
  contactName2: string;
  contactNumber2: string;
  emailAddress: string;
  updatedAt: string | null;
}

export const LEGAL_TERMS_EFFECTIVE_DATE = '06 Nov. 2026';

const DEFAULT_LEGAL_PROFILE: LiveGymLegalProfile = {
  gymName: 'Wolf Palomar Gym Muaythai Boxing',
  gymAddress: '6B Judge A. Roldan St., Navotas City, Metro Manila, Philippines',
  contactName1: 'GYM Family Contact 1',
  contactNumber1: '09098893819',
  contactName2: 'GYM Family Contact 2',
  contactNumber2: '09054380792',
  emailAddress: 'wolf.palomar@gmail.com',
  updatedAt: null,
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-1.5 border-l-2 border-blue-500/50 pl-3 text-left">
    <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
      {title}
    </h4>
    <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
      {children}
    </div>
  </section>
);

const Highlight: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2.5 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100 text-left">
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
    <div>{children}</div>
  </div>
);

export const AgreementDocumentViewer: React.FC<
  AgreementDocumentViewerProps
> = ({
  isOpen,
  onClose,
  initialDocument = 'agreement',
  hideUserAgreement = false,
  onAccept,
}) => {
  const resolvedInitial =
    hideUserAgreement && initialDocument === 'agreement'
      ? 'terms'
      : initialDocument;
  const [activeDocument, setActiveDocument] =
    useState<AgreementDocument>(resolvedInitial);
  const [isMounted, setIsMounted] = useState(false);
  const [gymProfile, setGymProfile] = useState<LiveGymLegalProfile>(
    DEFAULT_LEGAL_PROFILE
  );

  useEffect(() => {
    if (isOpen) {
      const target =
        hideUserAgreement && initialDocument === 'agreement'
          ? 'terms'
          : initialDocument;
      setActiveDocument(target);
    }
  }, [isOpen, initialDocument, hideUserAgreement]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let isSubscribed = true;

    const loadGymProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('gym_profile')
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        if (!error && data && isSubscribed) {
          setGymProfile({
            gymName: data.gym_name || DEFAULT_LEGAL_PROFILE.gymName,
            gymAddress: data.gym_address || DEFAULT_LEGAL_PROFILE.gymAddress,
            contactName1:
              data.contact_name_1 || DEFAULT_LEGAL_PROFILE.contactName1,
            contactNumber1:
              data.contact_number_1 || DEFAULT_LEGAL_PROFILE.contactNumber1,
            contactName2:
              data.contact_name_2 || DEFAULT_LEGAL_PROFILE.contactName2,
            contactNumber2:
              data.contact_number_2 || DEFAULT_LEGAL_PROFILE.contactNumber2,
            emailAddress:
              data.email_address || DEFAULT_LEGAL_PROFILE.emailAddress,
            updatedAt: data.updated_at || null,
          });
          return;
        }
      } catch {
        // Fallback to localStorage if offline
      }

      try {
        const saved = localStorage.getItem('palomar_gym_profile');
        if (saved && isSubscribed) {
          const parsed = JSON.parse(saved);
          setGymProfile((prev) => ({
            ...prev,
            gymName: parsed.gymName || prev.gymName,
            gymAddress: parsed.gymAddress || prev.gymAddress,
            contactName1: parsed.contactName1 || prev.contactName1,
            contactNumber1: parsed.contactNumber1 || prev.contactNumber1,
            contactName2: parsed.contactName2 || prev.contactName2,
            contactNumber2: parsed.contactNumber2 || prev.contactNumber2,
            emailAddress: parsed.emailAddress || prev.emailAddress,
          }));
        }
      } catch {
        // Ignore parse error
      }
    };

    loadGymProfile();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isMounted || !isOpen) return null;

  const handleAccept = () => {
    try {
      localStorage.setItem(
        'palomar_user_agreement_accepted',
        JSON.stringify({
          version: '2026-09-29',
          acceptedAt: new Date().toISOString(),
        })
      );
      window.dispatchEvent(new CustomEvent('palomar-agreement-accepted'));
    } catch {
      // Ignore storage errors
    }
    if (onAccept) {
      onAccept();
    }
    onClose();
  };

  const formattedEffectiveDate = LEGAL_TERMS_EFFECTIVE_DATE;

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden font-body text-xs text-(--color-text) max-h-[90vh] flex flex-col animate-scale-up">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-slate-50 dark:bg-[#161920] border-b border-slate-200 dark:border-white/10 px-5 sm:px-6 pt-5 shrink-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                {gymProfile.gymName}
              </p>
              <h3 className="font-heading text-lg uppercase tracking-wider text-slate-900 dark:text-white">
                {activeDocument === 'terms'
                  ? 'Terms & Conditions'
                  : activeDocument === 'privacy'
                  ? 'Privacy Policy'
                  : hideUserAgreement
                  ? 'Terms & Conditions'
                  : 'Legal & User Agreement'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-slate-200 dark:bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Effective {formattedEffectiveDate}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-300 dark:border-neutral-700"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Legal document sections"
          >
            {!hideUserAgreement && (
              <button
                type="button"
                onClick={() => setActiveDocument('agreement')}
                className={`px-3 sm:px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-xl transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeDocument === 'agreement'
                    ? 'bg-(--color-primary) text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>User Agreement</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveDocument('terms')}
              className={`px-3 sm:px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-xl transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeDocument === 'terms'
                  ? 'bg-(--color-primary) text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span>Terms &amp; Conditions</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDocument('privacy')}
              className={`px-3 sm:px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-xl transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeDocument === 'privacy'
                  ? 'bg-(--color-primary) text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Privacy Policy</span>
            </button>
          </div>
        </header>

        {/* Scrollable Document Body */}
        <main className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {activeDocument === 'terms' ? (
            <TermsContent profile={gymProfile} />
          ) : activeDocument === 'privacy' ? (
            <PrivacyContent profile={gymProfile} />
          ) : hideUserAgreement ? (
            <TermsContent profile={gymProfile} />
          ) : (
            <UserAgreementContent profile={gymProfile} />
          )}
        </main>

        {/* Footer Bar */}
        <footer className="sticky bottom-0 flex items-center justify-between gap-3 bg-slate-100/90 dark:bg-[#12141a] border-t border-slate-200 dark:border-white/10 p-4 sm:px-6 shrink-0">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
            {hideUserAgreement
              ? 'By clicking Accept, you acknowledge the Terms & Conditions and Privacy Policy.'
              : 'By clicking Accept, you acknowledge the User Agreement, Terms & Conditions, and Privacy Policy.'}
          </p>
          <button
            type="button"
            onClick={handleAccept}
            className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-xs font-heading font-black uppercase tracking-widest cursor-pointer border-none shadow-md transition-all active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Accept</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};

const UserAgreementContent: React.FC<{ profile: LiveGymLegalProfile }> = ({
  profile,
}) => (
  <div className="space-y-4 text-left">
    <div className="flex gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
      <FileText className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        This User Agreement is a binding electronic contract between you and{' '}
        <strong>{profile.gymName}</strong> governing your membership, physical access to the facility, and use of all digital systems including the Online Pre-Registration Portal, Member QR &amp; Physical Access Cards, Logbook, and POS Registers.
      </p>
    </div>

    <Highlight>
      <strong>Binding Operational &amp; Legal Policies:</strong> (1) All fees and memberships are 100% non-refundable and strictly non-transferable to any other person; (2) Running memberships cannot be frozen or paused for personal reasons, but early renewals stay queued and paused until the current membership ends; (3) Disciplinary suspensions do not pause or extend membership duration; and (4) Members are required to use all equipment responsibly and return items to their proper places after use.
    </Highlight>

    <Section title="1. Covered Platforms & System Users">
      <p>
        This agreement applies to all users interacting with the{' '}
        {profile.gymName} ecosystem: (a){' '}
        <strong>Members &amp; Walk-In Guests</strong> using physical access
        cards or digital passes; (b){' '}
        <strong>Pre-Registration Applicants &amp; Legal Guardians</strong>{' '}
        submitting enrollment forms online; and (c){' '}
        <strong>Authorized Staff, Administrators &amp; Superadmin</strong>{' '}
        operating the management console, barcode/QR scanner, sales register,
        and live cash drawer sessions.
      </p>
    </Section>

    <Section title="2. Online Pre-Registration, Queue Tickets & Minors">
      <p>
        Prospective members may submit online pre-registrations for Monthly
        (30-Day) or Yearly (365-Day) Membership plans. To prevent queue abuse,
        each device is limited to a maximum of{' '}
        <strong>three (3) active pending registration tickets</strong> at a
        time, with form progress automatically saved locally for up to 24 hours.
        A pending queue ticket reserves your application in the front-desk queue
        but does not activate membership privileges until verified and paid in
        person at {profile.gymName}. Applicants must be at least{' '}
        <strong>12 years old</strong>; applicants aged{' '}
        <strong>12 to 17</strong> require verifiable parent/guardian contact
        details and dual digital signatures (Applicant and Parent/Guardian).
      </p>
    </Section>

    <Section title="3. Membership Access Cards, QR Codes & Check-In Verification">
      <p>
        Physical membership cards and QR/barcode passes are linked to a single
        verified member profile and are strictly non-transferable. Members must
        scan or present their assigned card at the front desk logbook upon every
        entry. Active Monthly members receive unlimited check-ins with ₱0 daily
        door fee for 30 consecutive days, while Yearly members hold a 365-day
        access key with discounted daily check-in rates. Lending cards,
        tampering with barcodes, or bypassing scanner check-ins is grounds for
        immediate card revocation. Lost or damaged physical cards require
        payment of the facility&apos;s card replacement fee.
      </p>
    </Section>

    <Section title="4. Terminal Authentication, 2FA & Facility Perimeter Security">
      <p>
        Staff and Administrator accounts are protected by 6-digit Email
        Two-Factor Authentication (2FA), hCaptcha verification, and optional
        Facility Access Restrictions (GPS geofence radius and authorized
        Wi-Fi/IP validation). Authorized personnel must never share login
        credentials, 2FA verification codes, or attempt to spoof geolocation or
        network restrictions. Administrators and the Superadmin actively monitor
        terminal sessions and may trigger instant remote session revocation
        (Force Sign-Out) at any time.
      </p>
    </Section>

    <Section title="5. POS Transactions, Non-Refundable & Non-Freezable Rule">
      <p>
        Every membership subscription, walk-in check-in fee, card issuance, and product sale is tied to active Cash Drawer Sessions and recorded in immutable audit logs under Philippine Standard Time (Asia/Manila). All membership passes, card issuance fees, and store purchases are strictly final, non-refundable, non-creditable, and non-freezable upon completion of payment at the front desk.
      </p>
    </Section>

    <Section title="6. Device Permissions, Offline Sync & App Updates">
      <p>
        When using the Capacitor Android App or Desktop Web App (PWA), camera
        access is used exclusively for scanning member/product barcodes and
        capturing profile or inventory photos, and geolocation access is used
        strictly to verify on-site terminal compliance when security
        restrictions are enabled. Users agree to keep their installed
        application updated to the latest release published in System
        Information or the App Download Portal.
      </p>
    </Section>

    <Section title="7. Acceptable System Use & Legal Compliance">
      <p>
        Users agree not to submit fraudulent pre-registrations, manipulate POS
        sales or cash drawer balances, extract member records without
        authorization, or disrupt database and cloud storage services.
        Violations are subject to account termination, membership cancellation,
        and legal action under the Cybercrime Prevention Act of 2012 (RA 10175),
        Electronic Commerce Act (RA 8792), Data Privacy Act of 2012 (RA 10173),
        and Safe Spaces Act (RA 11313).
      </p>
    </Section>

    <p className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-white/10 pt-3">
      System User Agreement for {profile.gymName} ({profile.gymAddress}). Read
      together with the Terms &amp; Conditions and Privacy Policy.
    </p>
  </div>
);

const TermsContent: React.FC<{ profile: LiveGymLegalProfile }> = ({
  profile,
}) => (
  <div className="space-y-4 text-left">
    <div className="flex gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
      <Scale className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        These rules govern access and safety at {profile.gymName}. By registering, paying, or entering the facility, you accept these terms in full.
      </p>
    </div>

    <Highlight>
      <strong>Mandatory Facility Notice:</strong>
      <ul className="list-disc list-inside mt-1 space-y-1 font-semibold">
        <li><strong>Strictly Non-Refundable:</strong> All payments for subscriptions, passes, and cards are final and non-refundable once paid.</li>
        <li><strong>Strictly Non-Transferable:</strong> Memberships and access credentials belong exclusively to the subscribed owner. They cannot be shared, lent, transferred, or used by anyone else; doing so constitutes a severe violation resulting in immediate revocation without refund.</li>
        <li><strong>Strictly Non-Freezable:</strong> Memberships run on consecutive calendar days; they cannot be paused, frozen, or put on hold for illness, work, exams, or travel.</li>
        <li><strong>Subscription Renewals &amp; Extensions:</strong> If you renew or purchase an extended membership while an existing membership is currently running, your current membership continues to run without interruption, while the renewed extension stays paused and will only activate once the running subscription has expired.</li>
        <li><strong>Suspensions Do Not Pause Membership:</strong> If suspended for rule violations, your membership validity clock keeps running without extension or refund.</li>
        <li><strong>Responsible Equipment Use:</strong> Members must be responsible with all gym equipment, use it with care, and return every piece of equipment, weight, and accessory back to its designated place after use.</li>
      </ul>
    </Highlight>

    <Section title="1. Responsible Equipment Use & Care">
      <p>
        Members are expected to be responsible for all gym equipment during their workout. Use machinery, dumbbells, bars, and attachments safely, avoid dropping or slamming weights carelessly, and always return every piece of equipment and weight back to its proper designated location immediately after use so other members can find and use it.
      </p>
    </Section>

    <Section title="2. Membership Validity, Non-Transferable, Non-Freezable Policy & Queued Renewals">
      <p>
        Memberships cover a continuous period of calendar days (30 days for Monthly; 365 days for Yearly) and are strictly non-transferable. Subscriptions and cards are personal to the registered subscriber and may never be shared, loaned, or used by another person. Allowing someone else to use your account or card, or attempting to check in under another person's name, is a contractual violation resulting in immediate membership cancellation without refund. Memberships cannot be frozen, paused, or extended for travel, illness, or personal scheduling. When an active member renews or buys an extension, their currently active membership continues to run normally, and the new extension remains paused in queue, automatically beginning only after the active subscription reaches its expiration date.
      </p>
    </Section>

    <Section title="3. Facility Conduct, Safety & Suspension Clock Policy">
      <p>
        Management reserves the right to suspend or terminate facility privileges for property damage, abusive language, filming others without consent, harassment, or refusal to comply with staff directives or gym etiquette. If a member is suspended for disciplinary reasons, the membership countdown clock continues to run normally. No days lost during a suspension will be refunded, credited, or added back to the subscription.
      </p>
    </Section>

    <Section title="4. Health, injury, and emergency response">
      <p>
        Exercise carries risk. Stop and tell staff if you feel pain, dizziness,
        shortness of breath, or another unsafe symptom. Seek medical advice when
        needed. Tell staff promptly about any injury, accident, damaged
        equipment, or unsafe condition. The gym may contact your emergency
        contact when reasonably necessary.
      </p>
    </Section>

    <Section title="5. Minors and guardian consent">
      <p>
        Applicants below 18 need a parent or legal guardian’s consent. The
        parent or guardian confirms they are authorized to consent, have read
        this agreement, and will help the minor follow the rules. The gym may
        request proof of identity or authority. Electronic signatures and
        records are handled in line with the Electronic Commerce Act (RA 8792),
        subject to applicable requirements.
      </p>
    </Section>

    <Section title="6. Staff and administrator responsibilities">
      <p>
        Staff must actively monitor customers in the facility, guide safe
        equipment use, and promptly return equipment not placed properly. They
        must teach members who are unfamiliar with equipment or gym rules, help
        prevent theft or loss, report incidents, keep logbook check-ins
        accurate, and record sales correctly. Administrators supervise these
        duties, review records and incidents, and support fair enforcement.
      </p>
    </Section>

    <Section title="7. Respect, safety, and legal compliance">
      <p>
        Everyone must be treated with respect. Harassment, discrimination,
        intimidation, and gender-based sexual harassment are not allowed. The
        gym supports the safety principles reflected in the Safe Spaces Act (RA
        11313) and occupational safety practices under RA 11058 for its staff
        and operations. Theft and intentional property damage may be reported
        under applicable criminal laws.
      </p>
    </Section>

    <Section title="8. Changes and questions">
      <p>
        The gym may update rules when reasonably needed for safety, service, or
        legal compliance. Material changes will be made available before they
        apply where practical. Ask the gym staff for clarification before
        agreeing.
      </p>
    </Section>

    <p className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-white/10 pt-3">
      Plain-language agreement. It works alongside applicable Philippine law and
      does not remove rights that the law requires.
    </p>
  </div>
);

const PrivacyContent: React.FC<{ profile: LiveGymLegalProfile }> = ({
  profile,
}) => (
  <div className="space-y-4 text-left">
    <div className="flex gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
      <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        {profile.gymName} is committed to safeguarding your personal data in strict compliance with the <strong>Data Privacy Act of 2012 (RA 10173)</strong>, the <strong>Safe Spaces Act (RA 11313)</strong>, and applicable Philippine health and safety regulations.
      </p>
    </div>

    <Highlight>
      <strong>Commitment to Confidentiality &amp; Vital Safety:</strong> Your information is handled under the core principles of <strong>Transparency, Legitimate Purpose, and Proportionality</strong>. We never sell your personal data. Specific identifiers—such as your photo, home address, and In Case of Emergency (ICE) contacts—are gathered strictly for physical safety, identity verification, and medical emergency assistance.
    </Highlight>

    <Section title="1. Identity Verification &amp; Member Photographs">
      <p>
        We capture and store a facial photograph of every applicant during enrollment or digital registration. In accordance with Section 12 of RA 10173 and facility safety rules, this photo is used exclusively to: (a) print your official physical membership card; (b) verify your visual identity at front-desk scanner checkpoints upon every entry; and (c) prevent unauthorized entry, card-sharing fraud, or impersonation. Member photos are stored in secured, access-restricted cloud storage and are never published, shared with third parties, or used for promotional materials without your separate, explicit written consent.
      </p>
    </Section>

    <Section title="2. In Case of Emergency (ICE) Data &amp; Vital Medical Safety">
      <p>
        Exercise carries inherent physical demands. Under Section 12(e) and Section 13(c) of RA 10173 (processing necessary to protect the life and health of the data subject), we collect designated In Case of Emergency (ICE) names, relationship details, and active phone numbers. In the event of acute medical distress, fainting, sudden cardiac symptoms, or accidental injury on the gym floor, this information allows management and first-aid staff to instantly alert your family, contact emergency physicians, and coordinate ambulance or paramedic transfer.
      </p>
    </Section>

    <Section title="3. Residential Home Address Collection &amp; Purpose">
      <p>
        Your residential street address is gathered exclusively for emergency logistics and legal recordkeeping. In serious medical emergencies requiring hospital transfer, dispatching first responders (such as barangay emergency units or ambulance services) requires precise residential records. For minor applicants (ages 12 to 17), verified home addresses establish guardian residency under parental consent requirements. Your address is treated with strict confidentiality and is accessible only to authorized administrators.
      </p>
    </Section>

    <Section title="4. Technical Safeguards &amp; Data Security">
      <p>
        All member profiles, attendance logbook records, digital signatures, and encrypted credentials are protected by industry-standard technical safeguards, including HTTPS SSL encryption, Row Level Security (RLS) database policies, and multi-factor staff authentication. Access is strictly restricted to active administrative staff on duty. Physical documents and digital records are retained only for the active lifecycle of your membership and necessary statutory audit periods, after which they are securely archived or permanently purged.
      </p>
    </Section>

    <Section title="5. Your Legal Rights under RA 10173">
      <p>
        As a data subject under Philippine law, you possess the right to: (a) be informed of how your data is handled; (b) request reasonable access to your stored personal information and photographs; (c) dispute and correct inaccurate or outdated information; (d) object to processing outside of mandatory safety and contract fulfillment requirements; and (e) lodge a complaint with the <strong>National Privacy Commission (NPC)</strong> if you believe your privacy rights have been infringed.
      </p>
    </Section>

    <Section title="6. Minors, Parental Consent &amp; Respectful Facility Use">
      <p>
        For applicants aged 12 to 17, personal information is collected solely with the verified consent and electronic signature of a parent or legal guardian under the Electronic Commerce Act (RA 8792). Taking photos or videos of other gym members without their consent is strictly prohibited inside the facility under the Safe Spaces Act (RA 11313) and will lead to immediate card revocation.
      </p>
    </Section>

    <Section title="7. Data Protection Inquiries &amp; Contact">
      <div className="space-y-2">
        <p>
          To review, update, or inquire about your stored personal records, photos, or emergency details, please contact {profile.gymName}&apos;s administration at the front desk or via our published contact lines:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10">
            <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
              {profile.gymAddress}
            </span>
          </div>
          <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10">
            <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
              <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-mono">
                {profile.contactName1}: {profile.contactNumber1}
                {profile.contactName2 &&
                  profile.contactNumber2 &&
                  ` | ${profile.contactName2}: ${profile.contactNumber2}`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="font-mono break-all">
                {profile.emailAddress}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Section>

    <p className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-white/10 pt-3">
      This Privacy Policy operates under Republic Act No. 10173 (Data Privacy Act of 2012) and its Implementing Rules and Regulations.
    </p>
  </div>
);
