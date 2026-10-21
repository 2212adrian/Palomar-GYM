// src/components/guide/SystemGuideModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ShieldAlert,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useGuideStore } from '../../stores/useGuideStore';
import { GUIDE_TOPICS } from './guideData';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

export const SystemGuideModal: React.FC = () => {
  const { isOpen, activeTopicId, searchQuery, closeGuide, setTopic, setSearchQuery } =
    useGuideStore();
  const { user, profile } = useAuthStore();

  // Mobile navigation state: 'list' (module selection) vs 'detail' (reading the guide)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Reset to list view whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setMobileView('list');
    }
  }, [isOpen]);

  const isAdmin =
    isSuperAdmin(user?.email) ||
    profile?.role?.toLowerCase() === 'admin' ||
    user?.app_metadata?.role?.toLowerCase() === 'admin';

  // Role-based topic filtration:
  const availableTopics = useMemo(() => {
    return GUIDE_TOPICS.filter((topic) => {
      if (isAdmin) return true;
      return topic.targetRole === 'staff_and_admin';
    }).sort((a, b) => {
      if (isAdmin) {
        if (a.id === 'members') return -1;
        if (b.id === 'members') return 1;
        if (a.id === 'products') return -1;
        if (b.id === 'products') return 1;
      }
      return a.priorityOrder - b.priorityOrder;
    });
  }, [isAdmin]);

  // Active topic
  const activeTopic = useMemo(() => {
    const found = availableTopics.find((t) => t.id === activeTopicId);
    return found || availableTopics[0];
  }, [availableTopics, activeTopicId]);

  // Search filtered topics
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return availableTopics;
    const query = searchQuery.toLowerCase().trim();
    return availableTopics.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.summary.toLowerCase().includes(query) ||
        t.keywords.some((k) => k.toLowerCase().includes(query)) ||
        t.steps.some(
          (s) =>
            s.title.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query)
        )
    );
  }, [availableTopics, searchQuery]);

const handleSelectTopic = (id: Parameters<typeof setTopic>[0]) => {
  setTopic(id);
  setMobileView('detail');
};

  const handleBackToList = () => {
    setMobileView('list');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeGuide}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal Window (Bottom sheet on mobile, centered modal on desktop) */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-5xl h-[94dvh] sm:h-auto sm:max-h-[88vh] bg-white dark:bg-[#0f1115] border-t sm:border border-slate-200 dark:border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 font-body text-slate-800 dark:text-slate-200"
        >
          {/* Universal Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-white/[0.02] shrink-0">
            <div className="flex items-center gap-2.5">
              {/* Show Back Button on Mobile Detail view */}
              {mobileView === 'detail' && (
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="md:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors flex items-center gap-1 text-xs font-bold"
                  aria-label="Back to topic list"
                >
                  <ArrowLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </button>
              )}

              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-black text-xs sm:text-base tracking-wider uppercase text-slate-900 dark:text-white line-clamp-1">
                    {mobileView === 'detail' && (
                      <span className="md:hidden">{activeTopic?.shortLabel || 'Guide'}</span>
                    )}
                    <span className={mobileView === 'detail' ? 'hidden md:inline' : 'inline'}>
                      {isAdmin ? 'Admin Instruction Guide' : 'Staff Desk Guide'}
                    </span>
                  </h3>
                  <span
                    className={`text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      isAdmin
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {isAdmin ? 'Admin' : 'Staff'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  Simple, non-technical instructions for everyday gym operations.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeGuide}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Close Guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Layout Area */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0 relative">
            {/* ----------------- LEFT PANE / MODULE SELECTION ----------------- */}
            <div
              className={`md:col-span-4 lg:col-span-3 border-r border-slate-100 dark:border-white/5 flex flex-col bg-slate-50/40 dark:bg-black/20 ${
                mobileView === 'detail' ? 'hidden md:flex' : 'flex'
              } h-full overflow-hidden`}
            >
              {/* Search Bar */}
              <div className="p-3 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#12151a]">
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search topics (e.g., barcode, cash)..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all font-medium"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Module List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                <div className="px-2 py-1 text-[10px] font-heading font-black tracking-widest uppercase text-slate-400 flex items-center justify-between">
                  <span>{isAdmin ? 'Admin Guide Modules' : 'Staff Guide Modules'}</span>
                  <span>{filteredTopics.length}</span>
                </div>

                {filteredTopics.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No matching topics found.
                  </div>
                ) : (
                  filteredTopics.map((topic) => {
                    const Icon = topic.icon;
                    const isActive = activeTopic?.id === topic.id;
                    const isAdminExclusive = topic.targetRole === 'admin_only';

                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => handleSelectTopic(topic.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all cursor-pointer border ${
                          isActive
                            ? 'md:bg-blue-600 md:text-white md:border-blue-600 md:shadow-md md:shadow-blue-500/20 bg-blue-50/70 border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-white'
                            : 'bg-white dark:bg-white/[0.03] border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/15 text-slate-800 dark:text-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isActive
                                ? 'md:bg-white/20 md:text-white bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-heading font-bold tracking-wide uppercase truncate">
                                {topic.shortLabel}
                              </span>
                              {isAdminExclusive && (
                                <span
                                  className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    isActive
                                      ? 'md:bg-white/20 md:text-white bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  Admin
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[10px] block mt-0.5 ${
                                isActive
                                  ? 'md:text-white/80 text-blue-600 dark:text-blue-400 font-medium'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {topic.timeEstimate}
                            </span>
                          </div>
                        </div>

                        {/* Chevron right indicating mobile tap navigation */}
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isActive
                              ? 'md:text-white/70 text-blue-600 dark:text-blue-400'
                              : 'text-slate-400 dark:text-slate-600'
                          }`}
                        />
                      </button>
                    );
                  })
                )}
              </div>

              {/* Mobile bottom dismiss */}
              <div className="p-3 border-t border-slate-100 dark:border-white/5 md:hidden bg-white dark:bg-[#12151a]">
                <button
                  type="button"
                  onClick={closeGuide}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-heading font-bold uppercase tracking-wider"
                >
                  Close Guide
                </button>
              </div>
            </div>

            {/* ----------------- RIGHT PANE / DETAIL CONTENT ----------------- */}
            <div
              className={`md:col-span-8 lg:col-span-9 overflow-y-auto p-4 sm:p-6 space-y-5 bg-white dark:bg-[#0f1115] ${
                mobileView === 'list' ? 'hidden md:block' : 'block'
              } h-full`}
            >

              {activeTopic ? (
                <>
                  {/* Topic Title Card */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 dark:border-blue-500/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shrink-0">
                          <activeTopic.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm sm:text-lg font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white">
                              {activeTopic.title}
                            </h2>
                            {activeTopic.targetRole === 'admin_only' ? (
                              <span className="text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                Admin Exclusive
                              </span>
                            ) : (
                              <span className="text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Staff Operation
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {activeTopic.summary}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400 text-xs shrink-0 self-start sm:self-center">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{activeTopic.timeEstimate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Role Permission Scope Breakdown */}
                  {((activeTopic.staffPermissions && activeTopic.staffPermissions.length > 0) ||
                    (activeTopic.adminExclusives && activeTopic.adminExclusives.length > 0)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeTopic.staffPermissions && activeTopic.staffPermissions.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-heading font-black tracking-wider uppercase text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Staff Permitted Access</span>
                          </div>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                            {activeTopic.staffPermissions.map((perm, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-emerald-600 font-bold shrink-0 mt-0.5">•</span>
                                <span>{perm}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {activeTopic.adminExclusives && activeTopic.adminExclusives.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-heading font-black tracking-wider uppercase text-rose-700 dark:text-rose-300">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                            <span>Admin Exclusive (Not for Staff)</span>
                          </div>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                            {activeTopic.adminExclusives.map((excl, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-rose-600 font-bold shrink-0 mt-0.5">•</span>
                                <span>{excl}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step-by-Step Walkthrough */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-heading font-black tracking-wider uppercase text-slate-800 dark:text-slate-200">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      <span>Step-by-Step Instructions</span>
                    </div>

                    <div className="grid gap-2.5">
                      {activeTopic.steps.map((step) => (
                        <div
                          key={step.number}
                          className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-1.5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-heading font-black text-xs shrink-0 mt-0.5">
                              {step.number}
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <h4 className="text-xs sm:text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                                  {step.title}
                                </h4>
                                {step.badge && (
                                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                    {step.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                                {step.description}
                              </p>
                              {step.tip && (
                                <div className="mt-2 p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
                                  <span className="font-bold shrink-0">💡 Pro Tip:</span>
                                  <span>{step.tip}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operational Rules & Reminders */}
                  {activeTopic.rules.length > 0 && (
                    <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/15 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-heading font-black tracking-wider uppercase text-amber-800 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Key Rules &amp; Best Practices</span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        {activeTopic.rules.map((rule, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-600 font-bold mt-0.5">•</span>
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Frequently Asked Questions */}
                  {activeTopic.faqs.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-heading font-black tracking-wider uppercase text-slate-800 dark:text-slate-200">
                        <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
                        <span>Frequently Asked Questions</span>
                      </div>

                      <div className="grid gap-2">
                        {activeTopic.faqs.map((faq, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/40 dark:bg-white/[0.01] space-y-1"
                          >
                            <div className="text-xs font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                              Q: {faq.question}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              A: {faq.answer}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mobile Actions at bottom of guide */}
                  <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row gap-2.5 md:hidden">
                    <button
                      type="button"
                      onClick={handleBackToList}
                      className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Modules
                    </button>
                    <button
                      type="button"
                      onClick={closeGuide}
                      className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-heading font-bold uppercase tracking-wider shadow-md"
                    >
                      Got it, back to work
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Select a topic to read instructions.
                </div>
              )}
            </div>
          </div>

          {/* Desktop-only Footer Bar */}
          <div className="hidden md:flex p-3 sm:p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.02] items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Questions? Ask your gym administrator or superadmin.</span>
            </div>

            <button
              type="button"
              onClick={closeGuide}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-heading font-bold tracking-wider uppercase shadow-md transition-colors cursor-pointer"
            >
              Got it, back to work
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};