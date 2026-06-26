import React, { useState, useEffect } from 'react';

export const Dashboard: React.FC = () => {
  const [showIntro, setShowIntro] = useState(false);
  const [slideOut, setSlideOut] = useState(false);

  useEffect(() => {
  // 1. Inspect for the one-time transition trigger flag
  const playIntroFlag = sessionStorage.getItem('playDashboardIntro');
  
  if (playIntroFlag === 'true') {
    setShowIntro(true);
    
    // 2. Trigger the slide-out transition after a tiny layout paint delay
    const triggerTimer = setTimeout(() => {
      setSlideOut(true);
    }, 50);

    // 3. Completely remove overlay from DOM and clean up the flag AFTER the 1.8s animation completes
    const cleanTimer = setTimeout(() => {
      setShowIntro(false);
      sessionStorage.removeItem('playDashboardIntro'); // <-- Delete flag ONLY after animation finishes
    }, 1900);
    
    return () => {
      clearTimeout(triggerTimer);
      clearTimeout(cleanTimer);
    };
  }
}, []);


  return (
  // Uses var(--bg-page) to dynamically render the exact same background shade as the login terminal
  <div className="relative min-h-screen bg-[var(--bg-page)] text-slate-900 dark:text-slate-100 transition-colors duration-500">
    
    {/* SEAMLESS OUTRO-TO-INTRO SLIDE REVEAL OVERLAY */}
    {showIntro && (
      <div 
        className={`fixed inset-0 z-[15000] bg-[var(--bg-page)] pointer-events-none transition-transform duration-[1800ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
          slideOut ? '-translate-x-full' : 'translate-x-0'
        }`} 
      />
    )}

    {/* Your standard Dashboard layout structure */}
    <main className="p-8">
      <h1 className="text-2xl font-bold font-heading">DASHBOARD</h1>
      <p className="text-slate-500 mt-2 font-body">Welcome to your secure management interface.</p>
    </main>

  </div>
);
};