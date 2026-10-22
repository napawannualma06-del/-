import React, { Component, ErrorInfo, ReactNode } from 'react';
import { QuotaExceededBanner } from './QuotaExceededBanner';
import { isQuotaExceededError } from '../lib/firebase';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      const isQuota = isQuotaExceededError(errorMsg) || 
        (typeof window !== 'undefined' && sessionStorage.getItem('firestore_quota_exceeded') === 'true');

      if (isQuota) {
        return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
            <div className="w-full max-w-2xl">
              <QuotaExceededBanner />
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              เกิดข้อผิดพลาดในการแสดงผล
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 line-clamp-3 font-mono bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-left">
              {errorMsg || 'Unknown error occurred'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>รีโหลดหน้าเว็บใหม่</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
