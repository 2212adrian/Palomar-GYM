// src/components/guide/SystemGuideModal.tsx
import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { useGuideStore } from '../../stores/useGuideStore';
import { GUIDE_TOPICS } from './guideData';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

export const SystemGuideModal: React.FC = () => {
  const { isOpen, activeTopicId, searchQuery, closeGuide, setTopic, setSearchQuery } =
    useGuideStore();
  const { user, profile } = useAuthStore();

  const isAdmin =
    isSuperAdmin(user?.email) ||
    profile?.role?.toLowerCase() === 'admin' ||
    user?.app_metadata?.role?.toLowerCase() === 'admin';

  // Role-based topic filtration:
  // Staff will have an indication guide for sales, logbook, subscription plan and incident report only.
  // Admin will have all guides as possible with member management and product list.
  const availableTopics = useMemo(() => {
    return GUIDE_TOPICS.filter((topic) => {
      if (isAdmin) return true;
      return topic.targetRole === 'staff_and_admin';
    }).sort((a, b) => {
      if (isAdmin) {
        // For admin, prioritize member management and product catalog
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeGuide}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-5xl max-h-[92vh] sm:max-h-[88vh] bg-white dark:bg-[#0f1115] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 font-body text-(--color-text)"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-black text-sm sm:text-base tracking-wider uppercase text-slate-900 dark:text-white">
                    {isAdmin ? 'Admin Master Operations Guide' : 'Staff Desk Guide'}
                  </h3>
                  <span
                    className={`text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full ${
                      isAdmin
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {isAdmin ? 'Admin View' : 'Staff View'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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

          {/* Search bar */}
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#12151a]">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics (e.g., barcode, cash change, renew plan, QR code, check in, walk in, restock)..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Body: Split into topics navigation and content */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
            {/* Left Column: Topics Sidebar */}
            <div className="md:col-span-4 lg:col-span-3 border-r border-slate-100 dark:border-white/5 overflow-y-auto p-2 sm:p-3 space-y-1 bg-slate-50/30 dark:bg-black/20">
              <div className="px-2 py-1.5 text-[10px] font-heading font-black tracking-widest uppercase text-slate-400">
                {isAdmin ? 'Admin Master Modules' : `Staff Desk Modules (${availableTopics.length})`}
              </div>

              {filteredTopics.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
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
                      onClick={() => setTopic(topic.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20'
                          : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200/80 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-heading tracking-wide uppercase truncate">
                            {topic.shortLabel}
                          </span>
                          {isAdminExclusive && (
                            <span
                              className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              Admin
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] block truncate ${
                            isActive
                              ? 'text-white/80'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {topic.timeEstimate}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Right Column: Detailed Topic Content */}
            <div className="md:col-span-8 lg:col-span-9 overflow-y-auto p-4 sm:p-6 space-y-6 bg-white dark:bg-[#0f1115]">
              {activeTopic ? (
                <>
                  {/* Topic Title Card */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 dark:border-blue-500/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
                          <activeTopic.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base sm:text-lg font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white">
                              {activeTopic.title}
                            </h2>
                            {activeTopic.targetRole === 'admin_only' ? (
                              <span className="text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                Administrator Exclusive
                              </span>
                            ) : (
                              <span className="text-[9px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Daily Staff Operation
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {activeTopic.summary}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0 text-slate-400 text-xs">
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

                    <div className="grid gap-3">
                      {activeTopic.steps.map((step) => (
                        <div
                          key={step.number}
                          className="p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-2 hover:border-blue-500/30 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-heading font-black text-xs shrink-0 mt-0.5">
                              {step.number}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
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
                                <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
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
                        <AlertCircle className="w-4 h-4 text-amber-600" />
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
                        <HelpCircle className="w-4 h-4 text-blue-500" />
                        <span>Frequently Asked Questions</span>
                      </div>

                      <div className="grid gap-2.5">
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
                </>
              ) : (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Select a topic on the left to read instructions.
                </div>
              )}
            </div>
          </div>

          {/* Footer Bar */}
          <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
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
