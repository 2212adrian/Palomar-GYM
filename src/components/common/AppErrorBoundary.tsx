// src/components/common/AppErrorBoundary.tsx
import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
    const isChunkError =
      message.includes('failed to fetch dynamically imported module') ||
      message.includes('loading chunk') ||
      message.includes('importing a module script failed');

    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: unknown) {
    console.warn('Screen load interrupted:', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-heading text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
              {this.state.isChunkError
                ? 'Screen Update Ready'
                : 'Something Didn’t Load Properly'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {this.state.isChunkError
                ? 'A newer version of this screen is available or your connection paused briefly. Reload to open the latest view.'
                : 'This screen ran into an unexpected interruption. Reloading will restore your workspace safely.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-(--color-primary) hover:bg-(--color-primary-hover) text-white font-heading text-xs uppercase tracking-wider font-black shadow-md active:scale-95 transition-all cursor-pointer min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload This Screen</span>
          </button>
        </div>
      </div>
    );
  }
}
