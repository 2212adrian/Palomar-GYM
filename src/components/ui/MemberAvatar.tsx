// src/components/ui/MemberAvatar.tsx

import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { MEMBER_AVATARS_BUCKET } from '../../lib/supabase/memberStorage';

interface MemberAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  size?: number; // default 40
  roundedClassName?: string;
  isEditable?: boolean;
  onEditClick?: () => void;
  badgeTooltip?: string;
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  src,
  name = 'Member',
  className = '',
  size = 40,
  roundedClassName = 'rounded-xl',
  isEditable = false,
  onEditClick,
  badgeTooltip = 'Click to change photo (Take selfie / upload)',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
    if (!src || !src.trim()) {
      setResolvedUrl(null);
      return;
    }

    const trimmed = src.trim();

    // Direct HTTP(S), Blob, or base64 Data URLs
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('data:')
    ) {
      setResolvedUrl(trimmed);
      return;
    }

    // Relative storage bucket path
    const resolveStoragePath = async () => {
      const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      try {
        const { data: pubData } = supabase.storage
          .from(MEMBER_AVATARS_BUCKET)
          .getPublicUrl(cleanPath);

        if (pubData?.publicUrl) {
          setResolvedUrl(pubData.publicUrl);
        } else {
          const { data: fallbackPub } = supabase.storage
            .from('avatars')
            .getPublicUrl(cleanPath);
          setResolvedUrl(fallbackPub?.publicUrl || null);
        }
      } catch (e) {
        setHasError(true);
      }
    };

    resolveStoragePath();
  }, [src]);

  const initial = (name || 'M').trim().charAt(0).toUpperCase() || 'M';

  const sizeStyle = size
    ? { width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` }
    : undefined;

  return (
    <div
      style={sizeStyle}
      onClick={(e) => {
        if (isEditable && onEditClick) {
          e.stopPropagation();
          onEditClick();
        }
      }}
      className={`relative group shrink-0 select-none overflow-hidden ${roundedClassName} ${
        isEditable ? 'cursor-pointer' : ''
      } ${className}`}
      title={isEditable ? badgeTooltip : name}
    >
      {resolvedUrl && !hasError ? (
        <img
          src={resolvedUrl}
          alt={name}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover border border-(--border-color) ${roundedClassName} transition-transform duration-200 group-hover:scale-105`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading font-black shadow-inner border border-white/20 ${roundedClassName}`}
          style={{ fontSize: `${Math.max(12, Math.round(size * 0.42))}px` }}
        >
          {initial}
        </div>
      )}

      {/* Interactive Hover / Edit Overlay Badge */}
      {isEditable && (
        <div
          className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white ${roundedClassName} backdrop-blur-xs`}
        >
          <Camera className="w-5 h-5 text-white animate-pulse" />
          <span className="text-[8px] font-heading font-extrabold uppercase tracking-wider mt-0.5 text-white">
            Photo
          </span>
        </div>
      )}
    </div>
  );
};