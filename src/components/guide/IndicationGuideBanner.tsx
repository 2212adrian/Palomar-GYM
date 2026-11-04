// src/components/guide/IndicationGuideBanner.tsx
import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useGuideStore, type GuideTopicId } from '../../stores/useGuideStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { GUIDE_TOPICS } from './guideData';

interface IndicationGuideBannerProps {
  topicId: GuideTopicId;
  variant?: 'banner' | 'pill' | 'compact';
  className?: string;
}

const STAFF_ALLOWED_TOPICS: GuideTopicId[] = ['sales', 'logbook', 'plans', 'reports'];

export const IndicationGuideBanner: React.FC<IndicationGuideBannerProps> = ({
  topicId,
  className = '',
}) => {
  const { openGuide } = useGuideStore();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isAdmin = Boolean(
    isSuperAdmin(user?.email) || profile?.role === 'admin'
  );

  // Staff can only see indication guide for sales, logbook, subscription plan, and incident report.
  // Admin has access to all guides (members, products, etc.).
  if (!isAdmin && !STAFF_ALLOWED_TOPICS.includes(topicId)) {
    return null;
  }

  const topic = GUIDE_TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;

  return (
    <div className={`flex items-center justify-end my-1 select-none ${className}`}>
      <button
        type="button"
        onClick={() => openGuide(topicId)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-heading font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10 transition-colors cursor-pointer"
        title={`Show ${topic.shortLabel}`}
      >
        <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span>Need help? Show {topic.shortLabel}</span>
      </button>
    </div>
  );
};
