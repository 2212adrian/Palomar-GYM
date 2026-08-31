// src/components/ui/AgreementDocumentViewer.tsx

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Scale, ShieldCheck, X } from 'lucide-react';

export type AgreementDocument = 'terms' | 'privacy';

interface AgreementDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  initialDocument?: AgreementDocument;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-1.5 border-l-2 border-blue-500/50 dark:border-red-500/50 pl-3 text-left">
    <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">{title}</h4>
    <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
  </section>
);

const Highlight: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2.5 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100 text-left">
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
    <div>{children}</div>
  </div>
);

export const AgreementDocumentViewer: React.FC<AgreementDocumentViewerProps> = ({ 
  isOpen, 
  onClose, 
  initialDocument = 'terms' 
}) => {
  const [activeDocument, setActiveDocument] = useState<AgreementDocument>(initialDocument);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveDocument(initialDocument);
  }, [isOpen, initialDocument]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-red-400">
                Wolf Palomar Gym
              </p>
              <h3 className="font-heading text-lg uppercase tracking-wider text-slate-900 dark:text-white">
                User Agreement
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-slate-200 dark:bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Effective 30 Aug 2026
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
          <div className="flex gap-2" role="tablist" aria-label="User Agreement sections">
            <button 
              type="button" 
              onClick={() => setActiveDocument('terms')} 
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-xl transition-colors cursor-pointer ${
                activeDocument === 'terms' 
                  ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              Terms & Conditions
            </button>
            <button 
              type="button" 
              onClick={() => setActiveDocument('privacy')} 
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-xl transition-colors cursor-pointer ${
                activeDocument === 'privacy' 
                  ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              Privacy Policy
            </button>
          </div>
        </header>

        {/* Scrollable Document Body */}
        <main className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {activeDocument === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </main>

        {/* Footer Bar */}
        <footer className="sticky bottom-0 flex justify-end bg-slate-100/90 dark:bg-[#12141a] border-t border-slate-200 dark:border-white/10 p-4 sm:px-6 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md transition-colors"
          >
            Close Agreement
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};

const TermsContent = () => (
  <div className="space-y-4 text-left">
    <div className="flex gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
      <Scale className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        These rules keep Wolf Palomar Gym safe, fair, and welcoming. They apply to every member, guest, staff member, and parent or guardian agreeing for a minor.
      </p>
    </div>

    <Highlight>
      <strong>Important:</strong> Membership payments are non-refundable after payment, except where Philippine law requires a refund. Please check the plan, duration, and total before paying.
    </Highlight>

    <Section title="1. Safe and respectful gym use">
      <p>Use equipment only as intended and within your ability. Return weights, attachments, benches, and other equipment to their proper place after use. Follow staff instructions, posted safety notices, and reasonable gym procedures. Ask staff before using unfamiliar equipment.</p>
    </Section>

    <Section title="2. Damage, theft, and prohibited conduct">
      <p>Do not steal, damage, misuse, hide, or remove gym property. Do not threaten, harass, fight with, record others without permission, or endanger anyone. A member may be responsible for damage caused by intentional misuse or carelessness. Serious or repeated violations can lead to removal, suspension, cancellation, and referral to the proper authorities.</p>
    </Section>

    <Section title="3. Payments, subscriptions, and refunds">
      <p>Before payment, check the selected plan, price, duration, and added fees. Memberships are personal and cannot be transferred or shared without written gym approval. Fees are final and non-refundable after payment, except where applicable Philippine consumer law requires otherwise. This policy does not remove rights under the Consumer Act of the Philippines (RA 7394) [cite: 7, 8].</p>
    </Section>

    <Section title="4. Health, injury, and emergency response">
      <p>Exercise carries risk. Stop and tell staff if you feel pain, dizziness, shortness of breath, or another unsafe symptom. Seek medical advice when needed. Tell staff promptly about any injury, accident, damaged equipment, or unsafe condition. The gym may contact your emergency contact when reasonably necessary.</p>
    </Section>

    <Section title="5. Minors and guardian consent">
      <p>Applicants below 18 need a parent or legal guardian’s consent. The parent or guardian confirms they are authorized to consent, have read this agreement, and will help the minor follow the rules. The gym may request proof of identity or authority. Electronic signatures and records are handled in line with the Electronic Commerce Act (RA 8792) [cite: 9, 10], subject to applicable requirements.</p>
    </Section>

    <Section title="6. Staff and administrator responsibilities">
      <p>Staff must actively monitor customers in the facility, guide safe equipment use, and promptly return equipment not placed properly. They must teach members who are unfamiliar with equipment or gym rules, help prevent theft or loss, report incidents, keep logbook check-ins accurate, and record sales correctly. Administrators supervise these duties, review records and incidents, and support fair enforcement.</p>
    </Section>

    <Section title="7. Respect, safety, and legal compliance">
      <p>Everyone must be treated with respect. Harassment, discrimination, intimidation, and gender-based sexual harassment are not allowed. The gym supports the safety principles reflected in the Safe Spaces Act (RA 11313) [cite: 1, 2] and occupational safety practices under RA 11058 [cite: 5, 6] for its staff and operations. Theft and intentional property damage may be reported under applicable criminal laws.</p>
    </Section>

    <Section title="8. Changes and questions">
      <p>The gym may update rules when reasonably needed for safety, service, or legal compliance. Material changes will be made available before they apply where practical. Ask the gym staff for clarification before agreeing.</p>
    </Section>

    <p className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-white/10 pt-3">
      Plain-language agreement. It works alongside applicable Philippine law and does not remove rights that the law requires.
    </p>
  </div>
);

const PrivacyContent = () => (
  <div className="space-y-4 text-left">
    <div className="flex gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
      <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        We collect only the information reasonably needed to register members, provide gym services, manage payments and access, and keep the facility safe.
      </p>
    </div>

    <Highlight>
      <strong>Your privacy:</strong> The Data Privacy Act of 2012 (RA 10173) [cite: 3, 4] gives you rights over your personal information. You may ask questions or make a request through the gym’s published contact details.
    </Highlight>

    <Section title="1. Information we collect">
      <p>This can include your name, contact details, date of birth, address, emergency contact, membership and payment details, attendance records, and—for minors—parent or guardian details and consent. We collect it from you or your lawful parent or guardian.</p>
    </Section>

    <Section title="2. Why we use it">
      <p>We use your information to process registration and subscriptions, contact you about your membership, verify access, issue receipts, respond to incidents, meet legal obligations, and operate the gym. We do not sell personal information.</p>
    </Section>

    <Section title="3. Sharing, security, and records">
      <p>Access is limited to authorized staff and service providers who need the information to operate the service. Information may be disclosed when required by law or to protect people, property, or legal rights. We use reasonable safeguards, but no system can promise absolute security. Records are retained only as long as reasonably needed for operations, legal duties, dispute handling, and secure recordkeeping.</p>
    </Section>

    <Section title="4. Your rights under RA 10173">
      <p>You may ask to be informed about, access, correct, or object to processing of your personal data, subject to legal limits. You may raise a privacy concern with the gym and, where applicable, the National Privacy Commission. Withdrawing consent may affect services that need the information to operate.</p>
    </Section>

    <Section title="5. Minors, images, and respectful use">
      <p>A parent or legal guardian provides consent for a minor’s registration. Do not take or share another person’s image or personal information without a lawful basis or permission. The gym follows the privacy principles of transparency, legitimate purpose, and proportionality under RA 10173 [cite: 3].</p>
    </Section>

    <Section title="6. Contact">
      <p>For a privacy request or question, contact Wolf Palomar Gym through the contact details shown in this application or at the gym. Please provide enough detail for us to verify and respond to your request.</p>
    </Section>

    <p className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-white/10 pt-3">
      This is a plain-language privacy notice, not a substitute for a full legal review. It is designed around RA 10173 and its implementing rules.
    </p>
  </div>
);