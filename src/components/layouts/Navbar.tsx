import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ClipboardList, Scan, Target, Menu } from 'lucide-react';

interface NavbarProps {
  onMoreClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMoreClick }) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#141414]/95 border-t border-white/5 backdrop-blur-lg flex lg:hidden justify-between items-center px-4 z-40">
      
      {/* Sales */}
      <Link 
        to="/sales/register" 
        className={`flex flex-col items-center gap-1 flex-1 ${location.pathname.startsWith('/sales') ? 'text-red-500' : 'text-slate-400'}`}
      >
        <ShoppingBag className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Sales</span>
      </Link>

      {/* Logbook */}
      <Link 
        to="/members/check-in" 
        className={`flex flex-col items-center gap-1 flex-1 ${location.pathname.startsWith('/members/check-in') ? 'text-red-500' : 'text-slate-400'}`}
      >
        <ClipboardList className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Logbook</span>
      </Link>

      {/* Scanner Circle Floating Button (Center aligned) */}
      <div className="relative -top-3 flex-1 flex justify-center">
        <Link 
          to="/scanner" 
          aria-label="Scan QR Code"
          title="Scan QR Code"
          className="w-14 h-14 bg-[#bf0202] hover:bg-[#9c0202] text-white rounded-full flex items-center justify-center shadow-lg shadow-red-950/45 border-4 border-[#141414] scale-110 active:scale-95 transition-all"
        >
          <Scan className="w-6 h-6 animate-pulse" />
        </Link>
      </div>

      {/* Subscription */}
      <Link 
        to="/subscriptions/new" 
        className={`flex flex-col items-center gap-1 flex-1 ${location.pathname.startsWith('/subscriptions') ? 'text-red-500' : 'text-slate-400'}`}
      >
        <Target className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">Subs</span>
      </Link>

      {/* More Options trigger */}
      <button 
        onClick={onMoreClick}
        aria-label="Open More Options"
        title="Open More Options"
        className="flex flex-col items-center gap-1 flex-1 text-slate-400 cursor-pointer"
      >
        <Menu className="w-4.5 h-4.5" />
        <span className="text-[9px] font-heading tracking-widest uppercase">More</span>
      </button>
    </nav>
  );
};