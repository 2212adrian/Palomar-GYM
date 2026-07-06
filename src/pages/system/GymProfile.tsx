//src/pages/system/GymProfile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { toast } from 'react-toastify';
import { compressImage } from '../../lib/imageCompressor'; // Import from safe shared helper path
import { 
  Building, 
  Upload, 
  Trash2, 
  Loader2, 
  Image as ImageIcon, 
  Info,
  ExternalLink,
  Lock
} from 'lucide-react';

const getInitialGymConfig = () => {
  const saved = localStorage.getItem('palomar_gym_profile');
  const defaultConfig = {
    gymName: 'WOLF PALOMAR GYM',
    gymDescription: 'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.',
    gymAddress: '123 Sample Street, Barangay Central, Quezon City, Metro Manila',
    contactName1: 'Staff Ryan',
    contactNumber1: '09762607481',
    contactName2: 'Admin Wolf',
    contactNumber2: '09123456789',
    emailAddress: 'contact@wolfpalomargym.com',
    gymLogo: '', // Base64 data URL
    carouselImages: [] as string[] // Array of Base64 data URLs
  };
  if (saved) {
    try {
      const config = JSON.parse(saved);
      return { ...defaultConfig, ...config };
    } catch {
      return defaultConfig;
    }
  }
  return defaultConfig;
};

export const GymProfile: React.FC = () => {
  const loadedConfig = getInitialGymConfig();
  const { user } = useAuthStore();

  // 1. Reactive state settings - Gym Name is fully editable
  const [gymName, setGymName] = useState<string>(loadedConfig.gymName);
  const [gymDescription, setGymDescription] = useState<string>(loadedConfig.gymDescription);
  const [gymAddress, setGymAddress] = useState<string>(loadedConfig.gymAddress);
  const [contactName1, setContactName1] = useState<string>(loadedConfig.contactName1);
  const [contactNumber1, setContactNumber1] = useState<string>(loadedConfig.contactNumber1);
  const [contactName2, setContactName2] = useState<string>(loadedConfig.contactName2);
  const [contactNumber2, setContactNumber2] = useState<string>(loadedConfig.contactNumber2);
  const [emailAddress, setEmailAddress] = useState<string>(loadedConfig.emailAddress);
  const [gymLogo, setGymLogo] = useState<string>(loadedConfig.gymLogo);
  const [carouselImages, setCarouselImages] = useState<string[]>(loadedConfig.carouselImages);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialConfig, setInitialConfig] = useState<any>(loadedConfig);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const carouselInputRef = useRef<HTMLInputElement>(null);
  const initialConfigRef = useRef<any>(loadedConfig);
  const currentConfigRef = useRef<any>(null);

  // Fetch configuration parameters directly from Supabase gym_profile table
  const fetchGymProfile = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('gym_profile')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;

      if (data) {
        setGymName(data.gym_name);
        setGymDescription(data.gym_description);
        setGymAddress(data.gym_address);
        setContactName1(data.contact_name_1);
        setContactNumber1(data.contact_number_1);
        setContactName2(data.contact_name_2);
        setContactNumber2(data.contact_number_2);
        setEmailAddress(data.email_address);
        setGymLogo(data.gym_logo || '');
        setCarouselImages(data.carousel_images || []);

        const parsedConfig = {
          gymName: data.gym_name,
          gymDescription: data.gym_description,
          gymAddress: data.gym_address,
          contactName1: data.contact_name_1,
          contactNumber1: data.contact_number_1,
          contactName2: data.contact_name_2,
          contactNumber2: data.contact_number_2,
          emailAddress: data.email_address,
          gymLogo: data.gym_logo || '',
          carouselImages: data.carousel_images || []
        };
        setInitialConfig(parsedConfig);
        initialConfigRef.current = parsedConfig;
      }
    } catch (err: any) {
      console.warn('Failed to load cloud configuration, using default variables:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGymProfile();
  }, []);

  // Sync current config ref on every state change
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
    carouselImages
  };

  // Automatically save current states to local storage draft to drive the Login Preview tab
  useEffect(() => {
    const draft = {
      gymName,
      gymDescription,
      gymAddress,
      contactName1,
      contactNumber1,
      contactName2,
      contactNumber2,
      emailAddress,
      gymLogo,
      carouselImages
    };
    localStorage.setItem('palomar_gym_profile_draft', JSON.stringify(draft));
  }, [gymName, gymDescription, gymAddress, contactName1, contactNumber1, contactName2, contactNumber2, emailAddress, gymLogo, carouselImages]);

  // Compute dirty state
  const isDirty = initialConfig && (
    gymName !== initialConfig.gymName ||
    gymDescription !== initialConfig.gymDescription ||
    gymAddress !== initialConfig.gymAddress ||
    contactName1 !== initialConfig.contactName1 ||
    contactNumber1 !== initialConfig.contactNumber1 ||
    contactName2 !== initialConfig.contactName2 ||
    contactNumber2 !== initialConfig.contactNumber2 ||
    emailAddress !== initialConfig.emailAddress ||
    gymLogo !== initialConfig.gymLogo ||
    JSON.stringify(carouselImages) !== JSON.stringify(initialConfig.carouselImages)
  );

  const handleSaveConfig = async () => {
    setIsSaving(true);
    const current = currentConfigRef.current;
    try {
      const { error } = await supabase
        .from('gym_profile')
        .update({
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
          updated_by: user?.id
        })
        .eq('id', 1);

      if (error) throw error;

      localStorage.removeItem('palomar_gym_profile_draft'); // Clean up drafts
      setInitialConfig(current);
      initialConfigRef.current = current;
      toast.success('GYM profile settings saved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync modifications.');
    } finally {
      setIsSaving(false);
    }
  };

  // Bind custom save trigger from parent settings
  useEffect(() => {
    const handleSaveTrigger = () => {
      handleSaveConfig();
    };
    window.addEventListener('trigger-rates-save', handleSaveTrigger);
    return () => window.removeEventListener('trigger-rates-save', handleSaveTrigger);
  }, []);

  // Bind cancel triggers to discard local drafts
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
        localStorage.removeItem('palomar_gym_profile_draft'); // Clear draft
        toast.info('Changes discarded.');
      }
    };
    window.addEventListener('trigger-rates-cancel', handleCancelTrigger);
    return () => window.removeEventListener('trigger-rates-cancel', handleCancelTrigger);
  }, [initialConfig]);

  // Sync state with parent components
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('settings-dirty-state', { 
      detail: { isDirty, isSaving } 
    }));
  }, [isDirty, isSaving]);

  // Clean up dirty state and drafts on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('settings-dirty-state', { 
        detail: { isDirty: false, isSaving: false } 
      }));
      localStorage.removeItem('palomar_gym_profile_draft');
    };
  }, []);

  // Convert files to Base64
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle Gym Logo upload (compressed to 1024KB / 1MB)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size exceeds the 20MB limit.');
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

  // Handle Carousel uploads (compressed to 2048KB / 2MB)
  const handleCarouselUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 6 - carouselImages.length;
    if (remainingSlots <= 0) {
      toast.error('Maximum 6 carousel images allowed.');
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    const compressedPromises = filesToUpload.map(async (file) => {
      if (file.size > 20 * 1024 * 1024) {
        toast.warn(`Skipped "${file.name}" because it exceeds the 20MB limit.`);
        return null;
      }
      try {
        const compressed = await compressImage(file, 2048 * 2048);
        return await convertToBase64(compressed);
      } catch {
        return null;
      }
    });

    const newImages = (await Promise.all(compressedPromises)).filter(Boolean) as string[];
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
    window.open('/login?preview=true', '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-[#bf0202]" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading GYM business profile settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-body">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
          Gym Profile
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Configure business details, contact directories, and login screen media layouts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Setup Forms */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Identity Form */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Gym Information
            </h3>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="gymNameInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Gym Name</label>
                <input
                  id="gymNameInput"
                  type="text"
                  value={gymName}
                  placeholder="Enter business name"
                  title="Gym Name"
                  onChange={(e) => setGymName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-bold outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="gymDescriptionInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Gym Description</label>
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
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="gymAddressInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Physical Address</label>
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
              </div>

              {/* Two Contacts Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 dark:border-white/5 pt-4">
                <div className="grid gap-1.5">
                  <label htmlFor="contactName1Input" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Contact Name 1</label>
                  <input
                    id="contactName1Input"
                    type="text"
                    value={contactName1}
                    placeholder="E.g., Staff Ryan"
                    title="Contact Name 1"
                    onChange={(e) => setContactName1(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="contactNumber1Input" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Contact Number 1</label>
                  <input
                    id="contactNumber1Input"
                    type="text"
                    value={contactNumber1}
                    placeholder="E.g., 09762607481"
                    title="Contact Number 1"
                    onChange={(e) => setContactNumber1(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                    required
                  />
                </div>

                <div className="grid gap-1.5 pt-1.5">
                  <label htmlFor="contactName2Input" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Contact Name 2</label>
                  <input
                    id="contactName2Input"
                    type="text"
                    value={contactName2}
                    placeholder="E.g., Admin Wolf"
                    title="Contact Name 2"
                    onChange={(e) => setContactName2(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                    required
                  />
                </div>

                <div className="grid gap-1.5 pt-1.5">
                  <label htmlFor="contactNumber2Input" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Contact Number 2</label>
                  <input
                    id="contactNumber2Input"
                    type="text"
                    value={contactNumber2}
                    placeholder="E.g., 09123456789"
                    title="Contact Number 2"
                    onChange={(e) => setContactNumber2(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-1.5 border-t border-slate-200 dark:border-white/5 pt-4">
                <label htmlFor="emailAddressInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Business Email Address</label>
                <input
                  id="emailAddressInput"
                  type="email"
                  value={emailAddress}
                  placeholder="Enter support email"
                  title="Business Email"
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  required
                />
              </div>
            </div>
          </div>

          {/* Media Uploads */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-5">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Branding & Media Displays
            </h3>

            {/* Logo Slot */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
              <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 bg-white dark:bg-[#13161a] overflow-hidden">
                {gymLogo ? (
                  <img src={gymLogo} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <Building className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="text-center sm:text-left space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">Gym Logo</span>
                {/* 
                  Camera capture prompt supported natively on mobile webviews 
                  by using accept="image/*" without conflicting constraints.
                */}
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
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 hover:opacity-90 cursor-pointer shadow-xs"
                  >
                    Select Photo / Camera
                  </button>
                  {gymLogo && (
                    <button
                      type="button"
                      onClick={() => setGymLogo('')}
                      className="px-3 py-1.5 border border-red-500/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Carousel Images - Now styled as Widescreen aspect ratio */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Carousel Images ({carouselImages.length} / 6)
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
                  disabled={carouselImages.length >= 6}
                  onClick={() => carouselInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 hover:opacity-90 disabled:opacity-30 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Add Photo
                </button>
              </div>

              {carouselImages.length > 0 ? (
                /* Widescreen aspect ratio (aspect-video / 16:9) applied cleanly */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {carouselImages.map((src, index) => (
                    <div key={index} className="relative aspect-video rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#13161a] group animate-slide-up shadow-xs">
                      <img src={src} alt={`Carousel ${index + 1}`} className="w-full h-full object-cover" />
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
                <div className="py-8 border border-dashed border-slate-200 dark:border-white/10 rounded-xl text-center text-xs text-slate-400 font-medium leading-relaxed">
                  No widescreen carousel images uploaded yet. <br />
                  (Max 6 photos • Compressed to 2MB target).
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Hand: Sandbox Navigation Redirect Block */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-white/5 rounded-2xl shadow-xs space-y-5 flex flex-col h-full justify-between">
            <div className="space-y-4">
              <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
                Live Terminal Preview
              </h3>

              <div className="p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 dark:border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>To ensure your brand identity, logo, and active carousels render cleanly on high-definition monitors, we have created a dedicated, sandboxed viewer.</span>
              </div>
            </div>

            {/* Redirect Action Card */}
            <div className="p-6 border border-slate-200 dark:border-white/5 rounded-2xl bg-white dark:bg-[#0d0f12] text-center space-y-4 animate-slide-up shadow-sm">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 dark:bg-[#bf0202]/10 border border-blue-500/20 dark:border-red-500/20 flex items-center justify-center mx-auto text-blue-600 dark:text-[#bf0202]">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-heading text-xs tracking-wider uppercase text-slate-800 dark:text-slate-200">
                  Secure Sandboxed Preview
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                  Open the actual live Login screen in a separate, non-functional tab. It will display your current unsaved drafts cleanly in both Light and Dark themes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenLivePreview}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1b365d] dark:bg-[#bf0202] hover:opacity-90 text-white rounded-xl text-[10px] font-heading tracking-widest uppercase shadow-md cursor-pointer transition-all duration-300 active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                Open Live Login Preview
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};