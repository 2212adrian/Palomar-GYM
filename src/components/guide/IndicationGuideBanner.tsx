// src/components/guide/IndicationGuideBanner.tsx
import React, { useState } from 'react';
import { BookOpen, HelpCircle, ChevronRight, X, Sparkles } from 'lucide-react';
import { useGuideStore, type GuideTopicId } from '../../stores/useGuideStore';
import { GUIDE_TOPICS } from './guideData';

interface IndicationGuideBannerProps {
  topicId: GuideTopicId;
  variant?: 'banner' | 'pill' | 'compact';
  className?: string;
}

export const IndicationGuideBanner: React.FC<IndicationGuideBannerProps> = ({
  topicId,
  variant = 'banner',
  className = '',
}) => {
  const { openGuide } = useGuideStore();
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`guide_banner_dismissed_${topicId}`) === 'true';
  });

  const topic = GUIDE_TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;

  const Icon = topic.icon || BookOpen;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    localStorage.setItem(`guide_banner_dismissed_${topicId}`, 'true');
  };

  const handleRestore = () => {
    setIsDismissed(false);
    localStorage.removeItem(`guide_banner_dismissed_${topicId}`);
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => openGuide(topicId)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-heading font-extrabold tracking-wider uppercase transition-all cursor-pointer shadow-xs active:scale-95 ${className}`}
        title={`View guide for ${topic.title}`}
      >
        <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
        <span>{topic.shortLabel}</span>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={() => openGuide(topicId)}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-semibold transition-all cursor-pointer shadow-xs group ${className}`}
      >
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="flex items-center gap-1.5 font-heading text-[10px] tracking-wider uppercase font-bold">
          <BookOpen className="w-3.5 h-3.5 text-blue-500 dark:text-emerald-400" />
          {topic.title}
        </span>
        <span className="text-[10px] text-slate-400 group-hover:text-blue-500 transition-colors">
          • View Guide
        </span>
      </button>
    );
  }

  // If dismissed, show a slim reopening pill so it is always accessible without clutter
  if (isDismissed) {
    return (
      <div className={`flex items-center justify-end my-1 ${className}`}>
        <button
          type="button"
          onClick={handleRestore}
          className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Need help? Show {topic.shortLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => openGuide(topicId)}
      className={`relative overflow-hidden rounded-2xl border border-blue-500/20 dark:border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent dark:from-blue-950/30 dark:via-indigo-950/20 p-3 sm:p-4 transition-all hover:border-blue-500/40 cursor-pointer shadow-xs group ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-heading font-black tracking-widest uppercase px-2 py-0.5 rounded-md bg-blue-600 text-white">
                GUIDE
              </span>
              <h4 className="text-xs sm:text-sm font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {topic.title}
              </h4>
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <Sparkles className="w-3 h-3 text-amber-500" /> Easy 3-Step Walkthrough
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {topic.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openGuide(topicId);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors shadow-sm cursor-pointer"
          >
            <span>Open Guide</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
