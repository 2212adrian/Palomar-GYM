// src/components/ui/TabLoader.tsx
import React, { useState, useEffect, useContext } from 'react';
import { TabLoadingContext } from '../layouts/SystemLayout';
import logoImg from '../../assets/landscape-logo.webp';

interface TabLoaderProps {
  isVisible: boolean;
}

const STATUS_PHRASES = [
  "Preparing your workspace...",
  "Loading gym records...",
  "Syncing latest data...",
  "Fetching information...",
  "Updating dashboard...",
  "Loading member information...",
  "Preparing system modules...",
  "Organizing your data...",
  "Checking for recent updates...",
  "Finalizing your workspace..."
];

export const TabLoader: React.FC<TabLoaderProps> = ({ isVisible }) => {
  const { isOnline } = useContext(TabLoadingContext);
  const [statusText, setStatusText] = useState(STATUS_PHRASES[0]);

  useEffect(() => {
    if (!isOnline) {
      setStatusText("Network offline. Waiting to reconnect...");
      return;
    }

    if (isVisible) {
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % STATUS_PHRASES.length;
        setStatusText(STATUS_PHRASES[idx]);
      }, 350);
      return () => clearInterval(interval);
    }
  }, [isVisible, isOnline]);

  const getHexPoints = (cx: number, cy: number, r: number) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i - 30;
      const angleRad = (Math.PI / 180) * angleDeg;
      points.push(`${(cx + r * Math.cos(angleRad)).toFixed(2)},${(cy + r * Math.sin(angleRad)).toFixed(2)}`);
    }
    return points.join(' ');
  };

  const cols = 7;
  const rows = 4;
  const r = 18;
  const hSpacing = r * 1.5;
  const vSpacing = r * Math.sqrt(3);

  const width = (cols - 1) * hSpacing + r * 2 + 30;
  const height = (rows - 0.5) * vSpacing + r * 2 + 20;

  const hexagons: { key: string; cx: number; cy: number; delay: number }[] = [];

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = col * hSpacing + r + 15;
      let cy = row * vSpacing + r + 10;
      if (col % 2 === 1) {
        cy += vSpacing / 2;
      }
      const delay = (col + row) * 0.12;

      hexagons.push({
        key: `hex-${col}-${row}`,
        cx,
        cy,
        delay,
      });
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-slate-50/95 dark:bg-[#070a13]/95 backdrop-blur-md transition-all duration-500 ease-in-out pointer-events-none ${
        isVisible ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <style>{`
        @keyframes hexWave {
          0%, 100% {
            opacity: 0.15;
            transform: scale(0.85);
            fill: #cbd5e1;
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
            fill: #123c73;
          }
        }

        @keyframes hexWaveDark {
          0%, 100% {
            opacity: 0.15;
            transform: scale(0.85);
            fill: #1e293b;
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
            fill: #bf0202;
          }
        }

        @keyframes hexWaveOffline {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.9);
            fill: #475569;
          }
          50% {
            opacity: 0.9;
            transform: scale(1.02);
            fill: #d97706; 
          }
        }

        .hex-polygon {
          transform-origin: center;
          animation: hexWave 2.2s infinite ease-in-out;
          transition: fill 0.3s ease;
        }

        .dark .hex-polygon {
          animation-name: hexWaveDark;
        }

        .offline-polygon {
          animation-name: hexWaveOffline !important;
        }

        .hex-svg-container {
          will-change: transform, opacity;
          transform: translate3d(0, 0, 0);
        }
      `}</style>

      <div className="flex flex-col items-center max-w-md p-8 text-center hex-svg-container select-none">
        <div className="relative mb-6">
          <img
            src={logoImg}
            alt="Gym Logo"
            className="h-16 w-auto object-contain mx-auto dark:brightness-110 drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <div className="relative w-56 h-auto flex items-center justify-center">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible drop-shadow-[0_10px_20px_rgba(18,60,115,0.08)] dark:drop-shadow-[0_10px_20px_rgba(191,2,2,0.12)]"
          >
            <g>
              {hexagons.map((hex) => (
                <polygon
                  key={hex.key}
                  points={getHexPoints(hex.cx, hex.cy, r)}
                  className={`hex-polygon ${!isOnline ? 'offline-polygon' : ''}`}
                  style={{
                    animationDelay: `${hex.delay}s`,
                    transformOrigin: `${hex.cx}px ${hex.cy}px`,
                  }}
                />
              ))}
            </g>
          </svg>
        </div>

        <div className="mt-8 h-6 flex items-center justify-center">
          <span className={`text-xs font-mono tracking-wider transition-colors duration-300 ${
            !isOnline ? 'text-amber-600 dark:text-amber-500 font-semibold animate-pulse' : 'text-slate-500 dark:text-slate-400'
          }`}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
};