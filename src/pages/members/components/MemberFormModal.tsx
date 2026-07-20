// src/pages/members/components/MemberFormModal.tsx
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RotateCcw, X, Users } from 'lucide-react';

interface MemberFormModalProps {
  isEditing: boolean;
  formMemberId: string;
  setFormMemberId: (id: string) => void;
  formFullName: string;
  setFormFullName: (val: string) => void;
  formPhone: string;
  setFormPhone: (val: string) => void;
  formEmail: string;
  setFormEmail: (val: string) => void;
  formPlan: string;
  setFormPlan: (val: string) => void;
  formExpiryDate: string;
  setFormExpiryDate: (val: string) => void;
  formStatus: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  setFormStatus: (val: any) => void;
  formImageUrl: string;
  saving: boolean;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  generateMemberId: () => string;
}

export const MemberFormModal: React.FC<MemberFormModalProps> = ({
  isEditing,
  formMemberId,
  setFormMemberId,
  formFullName,
  setFormFullName,
  formPhone,
  setFormPhone,
  formEmail,
  setFormEmail,
  formPlan,
  setFormPlan,
  formExpiryDate,
  setFormExpiryDate,
  formStatus,
  setFormStatus,
  formImageUrl,
  saving,
  uploading,
  onFileUpload,
  onSave,
  onClose,
  generateMemberId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-body text-xs text-(--color-text)">
      <form 
        onSubmit={onSave}
        className="relative bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3">
          <h3 className="text-sm font-heading font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
            {isEditing ? 'EDIT MEMBER PROFILE' : 'ENROLL NEW MEMBER'}
          </h3>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 rounded-lg bg-slate-100 dark:bg-neutral-900 border text-slate-400 hover:text-slate-200 cursor-pointer animate-fade-in"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Image Frame */}
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="relative w-20 h-20 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-100 dark:bg-neutral-900 flex items-center justify-center shadow-inner">
            {formImageUrl ? (
              <img src={formImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Users className="w-8 h-8 text-slate-400" />
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] font-heading tracking-wider uppercase text-(--color-primary-light) font-bold bg-(--color-primary)/10 px-3 py-1 rounded-lg hover:bg-(--color-primary)/20 cursor-pointer border-none"
          >
            Upload Photo
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileUpload} 
            accept="image/*" 
            className="hidden" 
          />
        </div>

        {/* Grid Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left text-xs font-semibold">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Member Code ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formMemberId}
                onChange={(e) => setFormMemberId(e.target.value)}
                className="flex-1 p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setFormMemberId(generateMemberId())}
                className="px-3 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-200 dark:hover:bg-neutral-800 text-slate-500 cursor-pointer bg-transparent"
                title="Regenerate ID"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Full Name</label>
            <input
              type="text"
              value={formFullName}
              onChange={(e) => setFormFullName(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none"
              placeholder="e.g. John Doe"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Phone Number</label>
            <input
              type="text"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none"
              placeholder="09XXXXXXXXX"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Email Address</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none"
              placeholder="name@email.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Membership Plan</label>
            <select
              value={formPlan}
              onChange={(e) => setFormPlan(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none cursor-pointer font-bold"
            >
              <option value="Monthly Plan">Monthly Plan</option>
              <option value="Regular Pass">Regular Pass</option>
              <option value="VIP Yearly Plan">VIP Yearly Plan</option>
              <option value="Weekly Pass">Weekly Pass</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">Plan Expiration Date</label>
            <input
              type="date"
              value={formExpiryDate}
              onChange={(e) => setFormExpiryDate(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none font-bold font-mono"
              required
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-slate-400 font-bold block uppercase text-[10px]">System Status</label>
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
              className="w-full p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-(--bg-page) text-slate-900 dark:text-white outline-none cursor-pointer font-bold"
            >
              <option value="Active">Active</option>
              <option value="Expires Soon">Expires Soon</option>
              <option value="Expired">Expired</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 dark:border-white/10 bg-transparent text-slate-505 rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer hover:bg-slate-200 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || uploading}
            className="flex-1 py-3 bg-[#1b365d] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer font-bold flex items-center justify-center gap-1.5 shadow-md animate-fade-in border-none"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Parameters
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};