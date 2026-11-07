// src/pages/system/GymProfile.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { toast } from 'react-toastify';
import { compressImage } from '../../lib/imageCompressor';
import defaultCarousel1 from '../../assets/1-carousel.webp';
import defaultCarousel2 from '../../assets/2-carousel.webp';
import defaultCarousel3 from '../../assets/3-carousel.webp';
import defaultCarousel4 from '../../assets/4-carousel.webp';
import defaultCarousel5 from '../../assets/5-carousel.webp';
import defaultCarousel6 from '../../assets/6-carousel.webp';
import defaultLogo from '../../assets/icon.png';
import {
  Building,
  Upload,
  Trash2,
  Image as ImageIcon,
  Info,
  ExternalLink,
  Lock,
} from 'lucide-react';

const DEFAULT_CAROUSEL_IMAGES = [
  defaultCarousel1,
  defaultCarousel2,
  defaultCarousel3,
  defaultCarousel4,
  defaultCarousel5,
  defaultCarousel6,
];

const DEFAULT_GYM_CONFIG = {
  gymName: 'WOLF PALOMAR GYM',
  gymDescription:
    'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.',
  gymAddress: '123 Sample Street, Barangay Central, Quezon City, Metro Manila',
  contactName1: 'GYM Family Contact 1',
  contactNumber1: '09762607481',
  contactName2: 'GYM Family Contact 2',
  contactNumber2: '09123456789',
  emailAddress: 'wolf.palomar@gmail.com',
  gymLogo: '',
  carouselImages: [] as string[],
};

export const GymProfile: React.FC = () => {
  const { user } = useAuthStore();

  const [gymName, setGymName] = useState<string>(DEFAULT_GYM_CONFIG.gymName);
  const [gymDescription, setGymDescription] = useState<string>(
    DEFAULT_GYM_CONFIG.gymDescription
  );
  const [gymAddress, setGymAddress] = useState<string>(
    DEFAULT_GYM_CONFIG.gymAddress
  );
  const [contactName1, setContactName1] = useState<string>(
    DEFAULT_GYM_CONFIG.contactName1
  );
  const [contactNumber1, setContactNumber1] = useState<string>(
    DEFAULT_GYM_CONFIG.contactNumber1
  );
  const [contactName2, setContactName2] = useState<string>(
    DEFAULT_GYM_CONFIG.contactName2
  );
  const [contactNumber2, setContactNumber2] = useState<string>(
    DEFAULT_GYM_CONFIG.contactNumber2
  );
  const [emailAddress, setEmailAddress] = useState<string>(
    DEFAULT_GYM_CONFIG.emailAddress
  );
  const [gymLogo, setGymLogo] = useState<string>(DEFAULT_GYM_CONFIG.gymLogo);
  const [carouselImages, setCarouselImages] = useState<string[]>(
    DEFAULT_GYM_CONFIG.carouselImages
  );
  const [activeTab, setActiveTab] = useState<'info' | 'branding'>('info');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialConfig, setInitialConfig] = useState<any>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const carouselInputRef = useRef<HTMLInputElement>(null);
  const initialConfigRef = useRef<any>(null);
  const currentConfigRef = useRef<any>(null);

  const fetchGymProfile = useCallback(async (silent = false) => {
    const cacheKey = 'palomar_gym_profile_cache_v2';
    if (!silent) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const parsedConfig = {
            gymName: parsed.gymName ?? parsed.gym_name ?? DEFAULT_GYM_CONFIG.gymName,
            gymDescription:
              parsed.gymDescription ?? parsed.gym_description ?? DEFAULT_GYM_CONFIG.gymDescription,
            gymAddress: parsed.gymAddress ?? parsed.gym_address ?? DEFAULT_GYM_CONFIG.gymAddress,
            contactName1: parsed.contactName1 ?? parsed.contact_name_1 ?? DEFAULT_GYM_CONFIG.contactName1,
            contactNumber1:
              parsed.contactNumber1 ?? parsed.contact_number_1 ?? DEFAULT_GYM_CONFIG.contactNumber1,
            contactName2: parsed.contactName2 ?? parsed.contact_name_2 ?? DEFAULT_GYM_CONFIG.contactName2,
            contactNumber2:
              parsed.contactNumber2 ?? parsed.contact_number_2 ?? DEFAULT_GYM_CONFIG.contactNumber2,
            emailAddress: parsed.emailAddress ?? parsed.email_address ?? DEFAULT_GYM_CONFIG.emailAddress,
            gymLogo: parsed.gymLogo ?? parsed.gym_logo ?? '',
            carouselImages: Array.isArray(parsed.carouselImages)
              ? parsed.carouselImages
              : Array.isArray(parsed.carousel_images)
              ? parsed.carousel_images
              : [],
          };
          setGymName(parsedConfig.gymName);
          setGymDescription(parsedConfig.gymDescription);
          setGymAddress(parsedConfig.gymAddress);
          setContactName1(parsedConfig.contactName1);
          setContactNumber1(parsedConfig.contactNumber1);
          setContactName2(parsedConfig.contactName2);
          setContactNumber2(parsedConfig.contactNumber2);
          setEmailAddress(parsedConfig.emailAddress);
          setGymLogo(parsedConfig.gymLogo);
          setCarouselImages(parsedConfig.carouselImages);
          setInitialConfig(parsedConfig);
          initialConfigRef.current = parsedConfig;
          setIsLoading(false);
        }
      } catch {}
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!initialConfigRef.current) {
        setInitialConfig(DEFAULT_GYM_CONFIG);
        initialConfigRef.current = DEFAULT_GYM_CONFIG;
      }
      setIsLoading(false);
      return;
    }

    try {
      if (!silent && !localStorage.getItem(cacheKey)) {
        setIsLoading(true);
      }
      const { data, error } = await supabase
        .from('gym_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const parsedConfig = {
          gymName: data.gym_name || DEFAULT_GYM_CONFIG.gymName,
          gymDescription:
            data.gym_description || DEFAULT_GYM_CONFIG.gymDescription,
          gymAddress: data.gym_address || DEFAULT_GYM_CONFIG.gymAddress,
          contactName1: data.contact_name_1 || DEFAULT_GYM_CONFIG.contactName1,
          contactNumber1:
            data.contact_number_1 || DEFAULT_GYM_CONFIG.contactNumber1,
          contactName2: data.contact_name_2 || DEFAULT_GYM_CONFIG.contactName2,
          contactNumber2:
            data.contact_number_2 || DEFAULT_GYM_CONFIG.contactNumber2,
          emailAddress: data.email_address || DEFAULT_GYM_CONFIG.emailAddress,
          gymLogo: data.gym_logo || '',
          carouselImages: Array.isArray(data.carousel_images)
            ? data.carousel_images
            : [],
        };

        setGymName(parsedConfig.gymName);
        setGymDescription(parsedConfig.gymDescription);
        setGymAddress(parsedConfig.gymAddress);
        setContactName1(parsedConfig.contactName1);
        setContactNumber1(parsedConfig.contactNumber1);
        setContactName2(parsedConfig.contactName2);
        setContactNumber2(parsedConfig.contactNumber2);
        setEmailAddress(parsedConfig.emailAddress);
        setGymLogo(parsedConfig.gymLogo);
        setCarouselImages(parsedConfig.carouselImages);

        setInitialConfig(parsedConfig);
        initialConfigRef.current = parsedConfig;

        try {
          localStorage.setItem(cacheKey, JSON.stringify(parsedConfig));
        } catch {}
      } else if (!initialConfigRef.current) {
        setInitialConfig(DEFAULT_GYM_CONFIG);
        initialConfigRef.current = DEFAULT_GYM_CONFIG;
      }
    } catch (err: any) {
      console.warn('Failed to load gym profile configuration:', err.message);
      if (!initialConfigRef.current) {
        setInitialConfig(DEFAULT_GYM_CONFIG);
        initialConfigRef.current = DEFAULT_GYM_CONFIG;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGymProfile();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('gym_profile_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gym_profile' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            fetchGymProfile(true);
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchGymProfile]);

  currentConfigRef.current = {
    gymName,
    gymDescription,
    gymAddress,
    contactName1,
    contactNumber1,
    contactName2,
    contactNumber2,
    emailAddress,
    gymLogo,
    carouselImages,
  };

  const isDirty = Boolean(
    initialConfig &&
    (gymName !== initialConfig.gymName ||
      gymDescription !== initialConfig.gymDescription ||
      gymAddress !== initialConfig.gymAddress ||
      contactName1 !== initialConfig.contactName1 ||
      contactNumber1 !== initialConfig.contactNumber1 ||
      contactName2 !== initialConfig.contactName2 ||
      contactNumber2 !== initialConfig.contactNumber2 ||
      emailAddress !== initialConfig.emailAddress ||
      gymLogo !== initialConfig.gymLogo ||
      JSON.stringify(carouselImages || []) !==
        JSON.stringify(initialConfig.carouselImages || []))
  );

  const handleSaveConfig = async () => {
    setIsSaving(true);
    const current = currentConfigRef.current;
    try {
      const { error } = await supabase.from('gym_profile').upsert([
        {
          id: 1,
          gym_name: current.gymName,
          gym_description: current.gymDescription,
          gym_address: current.gymAddress,
          contact_name_1: current.contactName1,
          contact_number_1: current.contactNumber1,
          contact_name_2: current.contactName2,
          contact_number_2: current.contactNumber2,
          email_address: current.emailAddress,
          gym_logo: current.gymLogo,
          carousel_images: current.carouselImages,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        },
      ]);

      if (error) throw error;

      const changes: string[] = [];
      if (initialConfig?.gymName !== current.gymName) {
        changes.push(`Gym Name: "${initialConfig?.gymName}" -> "${current.gymName}"`);
      }
      if (initialConfig?.gymDescription !== current.gymDescription) {
        changes.push(`Description updated`);
      }
      if (initialConfig?.gymAddress !== current.gymAddress) {
        changes.push(`Address: "${initialConfig?.gymAddress}" -> "${current.gymAddress}"`);
      }
      if (initialConfig?.contactName1 !== current.contactName1) {
        changes.push(`Primary Contact Name: "${initialConfig?.contactName1}" -> "${current.contactName1}"`);
      }
      if (initialConfig?.contactNumber1 !== current.contactNumber1) {
        changes.push(`Primary Contact Phone: "${initialConfig?.contactNumber1}" -> "${current.contactNumber1}"`);
      }
      if (initialConfig?.contactName2 !== current.contactName2) {
        changes.push(`Secondary Contact Name: "${initialConfig?.contactName2}" -> "${current.contactName2}"`);
      }
      if (initialConfig?.contactNumber2 !== current.contactNumber2) {
        changes.push(`Secondary Contact Phone: "${initialConfig?.contactNumber2}" -> "${current.contactNumber2}"`);
      }
      if (initialConfig?.emailAddress !== current.emailAddress) {
        changes.push(`Email Address: "${initialConfig?.emailAddress}" -> "${current.emailAddress}"`);
      }
      if (initialConfig?.gymLogo !== current.gymLogo) {
        changes.push(`Gym Logo updated`);
      }
      if (
        JSON.stringify(initialConfig?.carouselImages || []) !==
        JSON.stringify(current.carouselImages || [])
      ) {
        changes.push(
          `Carousel Images: ${(initialConfig?.carouselImages || []).length} images -> ${(current.carouselImages || []).length} images`
        );
      }
      const diffStr = changes.length > 0 ? `: ${changes.join(', ')}` : '';
      await logAudit(
        'GYM_PROFILE_UPDATED',
        `Updated Gym Profile configurations${diffStr}.`,
        '1'
      );

      setInitialConfig(current);
      initialConfigRef.current = current;
      toast.success('GYM profile settings saved successfully.');
    } catch (err: any) {
      const rawMessage = String(err?.message || '');
      const isRlsError =
        err?.code === '42501' || /row-level security/i.test(rawMessage);

      toast.error(
        isRlsError
          ? 'Access denied: only an Administrator or the Superadmin may save Gym Profile settings.'
          : rawMessage || 'Failed to sync modifications.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleSaveTrigger = () => handleSaveConfig();
    window.addEventListener('trigger-rates-save', handleSaveTrigger);
    return () =>
      window.removeEventListener('trigger-rates-save', handleSaveTrigger);
  }, []);

  useEffect(() => {
    const handleCancelTrigger = () => {
      const config = initialConfigRef.current;
      if (config) {
        setGymName(config.gymName);
        setGymDescription(config.gymDescription);
        setGymAddress(config.gymAddress);
        setContactName1(config.contactName1);
        setContactNumber1(config.contactNumber1);
        setContactName2(config.contactName2);
        setContactNumber2(config.contactNumber2);
        setEmailAddress(config.emailAddress);
        setGymLogo(config.gymLogo);
        setCarouselImages(config.carouselImages);
        toast.info('Changes discarded.');
      }
    };
    window.addEventListener('trigger-rates-cancel', handleCancelTrigger);
    return () =>
      window.removeEventListener('trigger-rates-cancel', handleCancelTrigger);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('settings-dirty-state', {
        detail: { isDirty, isSaving },
      })
    );
  }, [isDirty, isSaving]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('settings-dirty-state', {
          detail: { isDirty: false, isSaving: false },
        })
      );
    };
  }, []);

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size exceeds the 8MB limit.');
      return;
    }

    try {
      const compressed = await compressImage(file, 2048 * 2048);
      const base64 = await convertToBase64(compressed);
      setGymLogo(base64);
      toast.success('Logo uploaded and optimized.');
    } catch {
      toast.error('Failed to compress logo.');
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleCarouselUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentImages = carouselImages || [];
    const remainingSlots = 6 - currentImages.length;
    if (remainingSlots <= 0) {
      toast.error('Maximum 6 carousel images allowed.');
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    const compressedPromises = filesToUpload.map(async (file) => {
      if (file.size > 8 * 1024 * 1024) {
        toast.warn(`Skipped "${file.name}" because it exceeds the 8MB limit.`);
        return null;
      }
      try {
        const compressed = await compressImage(file, 2048 * 2048);
        return await convertToBase64(compressed);
      } catch {
        return null;
      }
    });

    const newImages = (await Promise.all(compressedPromises)).filter(
      Boolean
    ) as string[];
    setCarouselImages((prev) => [...prev, ...newImages]);

    if (files.length > remainingSlots) {
      toast.warn(`Only uploaded ${remainingSlots} images. Limit is 6.`);
    } else {
      toast.success('Images imported successfully.');
    }

    if (carouselInputRef.current) carouselInputRef.current.value = '';
  };

  const removeCarouselImage = (index: number) => {
    setCarouselImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOpenLivePreview = () => {
    try {
      const win = window.open('/login?preview=true', '_blank');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        window.location.href = '/login?preview=true';
      }
    } catch {
      window.location.href = '/login?preview=true';
    }
  };

  return (
    <div className="space-y-6 font-body text-(--color-text)">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
          Gym Profile
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Configure business details, contact directories, and login screen
          media layouts.
        </p>
      </div>

      {/* Mobile Responsive Switch Tabs */}
      <div className="flex lg:hidden p-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl select-none">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'info'
              ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Gym Information</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'branding'
              ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Branding & Media</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Gym Information Forms */}
        <div
          className={`lg:col-span-6 space-y-6 ${
            activeTab === 'info' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 sm:p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Gym Information
            </h3>

            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="grid gap-1.5">
                  <label
                    htmlFor="gymNameInput"
                    className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                  >
                    Gym Name
                  </label>
                  {isLoading ? (
                    <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                  ) : (
                    <input
                      id="gymNameInput"
                      type="text"
                      value={gymName}
                      placeholder="Enter business name"
                      title="Gym Name"
                      onChange={(e) => setGymName(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-bold outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                      required
                    />
                  )}
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="emailAddressInput"
                    className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                  >
                    Business Email
                  </label>
                  {isLoading ? (
                    <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                  ) : (
                    <input
                      id="emailAddressInput"
                      type="email"
                      value={emailAddress}
                      placeholder="Enter support email"
                      title="Business Email"
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                      required
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor="gymDescriptionInput"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Gym Description
                </label>
                {isLoading ? (
                  <div className="h-20 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                ) : (
                  <textarea
                    id="gymDescriptionInput"
                    value={gymDescription}
                    placeholder="Enter gym bio or access protocol description (displays on login screen)..."
                    title="Gym Description"
                    rows={3}
                    onChange={(e) => setGymDescription(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all resize-none leading-relaxed"
                    required
                  />
                )}
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor="gymAddressInput"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Physical Address
                </label>
                {isLoading ? (
                  <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                ) : (
                  <input
                    id="gymAddressInput"
                    type="text"
                    value={gymAddress}
                    placeholder="Enter street, city, province"
                    title="Physical Address"
                    onChange={(e) => setGymAddress(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                    required
                  />
                )}
              </div>

              {/* Two Contacts Section in Compact Two-Column Rows */}
              <div className="border-t border-slate-200 dark:border-white/5 pt-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="contactName1Input"
                      className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                    >
                      Contact Name 1
                    </label>
                    {isLoading ? (
                      <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                    ) : (
                      <input
                        id="contactName1Input"
                        type="text"
                        value={contactName1}
                        placeholder="GYM Contact 1"
                        title="Contact Name 1"
                        onChange={(e) => setContactName1(e.target.value)}
                        className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                        required
                      />
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="contactNumber1Input"
                      className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                    >
                      Contact Number 1
                    </label>
                    {isLoading ? (
                      <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                    ) : (
                      <input
                        id="contactNumber1Input"
                        type="text"
                        value={contactNumber1}
                        placeholder="09762607481"
                        title="Contact Number 1"
                        onChange={(e) => setContactNumber1(e.target.value)}
                        className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                        required
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="contactName2Input"
                      className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                    >
                      Contact Name 2
                    </label>
                    {isLoading ? (
                      <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                    ) : (
                      <input
                        id="contactName2Input"
                        type="text"
                        value={contactName2}
                        placeholder="GYM Contact 2"
                        title="Contact Name 2"
                        onChange={(e) => setContactName2(e.target.value)}
                        className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                        required
                      />
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <label
                      htmlFor="contactNumber2Input"
                      className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate"
                    >
                      Contact Number 2
                    </label>
                    {isLoading ? (
                      <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 animate-pulse" />
                    ) : (
                      <input
                        id="contactNumber2Input"
                        type="text"
                        value={contactNumber2}
                        placeholder="09123456789"
                        title="Contact Number 2"
                        onChange={(e) => setContactNumber2(e.target.value)}
                        className="w-full px-3 py-2 sm:py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs sm:text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                        required
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Branding, Media Displays & Integrated Live Terminal Preview */}
        <div
          className={`lg:col-span-6 space-y-6 ${
            activeTab === 'branding' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 sm:p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-5">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Branding & Media Displays
            </h3>

            {/* Logo Slot */}
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 p-3.5 sm:p-4 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
              <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 bg-white dark:bg-[#13161a] overflow-hidden">
                {isLoading ? (
                  <div className="w-full h-full bg-slate-100 dark:bg-[#13161a] animate-pulse" />
                ) : (
                  <img
                    src={gymLogo || defaultLogo}
                    alt="Logo preview"
                    className="w-full h-full object-contain p-1"
                  />
                )}
              </div>
              <div className="text-center sm:text-left space-y-2">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                    Gym Logo
                  </span>
                  {!gymLogo && !isLoading && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400">
                      Default
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  id="logoUpload"
                  ref={logoInputRef}
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  title="Upload Gym Logo"
                />
                <div className="flex gap-2 justify-center sm:justify-start">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 hover:opacity-90 cursor-pointer shadow-xs disabled:opacity-30"
                  >
                    Select Photo / Camera
                  </button>
                  {gymLogo && !isLoading && (
                    <button
                      type="button"
                      onClick={() => setGymLogo('')}
                      className="px-3 py-1.5 border border-red-500/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Carousel Images */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Carousel Images ({(carouselImages || []).length > 0 ? `${carouselImages.length} / 6` : 'Default • 6 images'})
                </label>
                <input
                  type="file"
                  id="carouselUpload"
                  ref={carouselInputRef}
                  accept="image/*"
                  multiple
                  onChange={handleCarouselUpload}
                  className="hidden"
                  title="Upload Carousel Images"
                />
                <button
                  type="button"
                  disabled={(carouselImages || []).length >= 6 || isLoading}
                  onClick={() => carouselInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 hover:opacity-90 disabled:opacity-30 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Add Photo
                </button>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {[...Array(3)].map((_, idx) => (
                    <div
                      key={idx}
                      className="aspect-video bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 animate-pulse"
                    />
                  ))}
                </div>
              ) : (carouselImages || []).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {carouselImages.map((src, index) => (
                    <div
                      key={index}
                      className="relative aspect-video rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#13161a] group animate-slide-up shadow-xs"
                    >
                      <img
                        src={src}
                        alt={`Carousel ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeCarouselImage(index)}
                        aria-label="Remove Carousel Image"
                        title="Remove Carousel Image"
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer rounded-xl"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                    {DEFAULT_CAROUSEL_IMAGES.map((src, index) => (
                      <div
                        key={index}
                        className="relative aspect-video rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#13161a] shadow-xs"
                      >
                        <img
                          src={src}
                          alt={`Default Carousel ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white backdrop-blur-xs">
                          Default {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center font-medium">
                    Showing system default carousel images. Click &quot;Add Photo&quot; to upload custom promotional images.
                  </p>
                </div>
              )}
            </div>

            {/* Integrated Live Terminal Preview */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-3">
              <div className="p-4 sm:p-5 border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-[#13161a] space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
                    <h4 className="text-xs font-heading tracking-wider uppercase font-bold text-slate-800 dark:text-slate-200">
                      Live Terminal Preview
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
                    Sandboxed
                  </span>
                </div>

                <div className="p-3 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 dark:border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Preview how your brand identity, logo, address, and active carousels render cleanly on the actual login screen.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenLivePreview}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1b365d] dark:bg-[#bf0202] hover:opacity-90 text-white rounded-xl text-xs font-heading font-bold tracking-wider uppercase shadow-md cursor-pointer transition-all duration-200 active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Live Login Preview</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
