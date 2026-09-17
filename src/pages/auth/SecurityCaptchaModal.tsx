// src/components/auth/SecurityCaptchaModal.tsx
import React, { useRef } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { ShieldAlert } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

interface SecurityCaptchaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (token: string) => void;
  theme?: 'dark' | 'light';
  siteKey: string;
}

export const SecurityCaptchaModal: React.FC<SecurityCaptchaModalProps> = ({
  isOpen,
  onClose,
  onVerify,
  theme = 'dark',
  siteKey,
}) => {
  const captchaRef = useRef<HCaptcha | null>(null);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Security Verification">
      <div className="flex flex-col items-center justify-center p-3 space-y-3 font-body">
        <div className="flex items-center gap-1.5 text-xs font-heading font-black text-blue-600 dark:text-red-500 uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Please complete the security check to proceed</span>
        </div>

        <div className="overflow-hidden flex justify-center rounded-2xl my-2 p-1 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10">
          <HCaptcha
            ref={captchaRef}
            sitekey={siteKey}
            onVerify={(token) => {
              onVerify(token);
            }}
            onExpire={() => {}}
            onError={(err) => {
              console.error('hCaptcha Error:', err);
            }}
            theme={theme === 'dark' ? 'dark' : 'light'}
          />
        </div>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-mono">
          Protected by hCaptcha. Verifying that you are human.
        </p>
      </div>
    </Modal>
  );
};
