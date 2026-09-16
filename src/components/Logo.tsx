import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = '', 
  size = 'md',
  showSubtitle = false
}) => {
  const sizeMap = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-12',
    lg: 'h-14 sm:h-16',
    xl: 'h-20 sm:h-24',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <img
        src="/logo.svg"
        alt="ไทย พลัส+"
        className={`${sizeMap[size]} w-auto object-contain drop-shadow-xs transition-transform hover:scale-105`}
      />
      {showSubtitle && (
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-tight text-slate-800 dark:text-white uppercase leading-none">
            ระบบจัดการคิวพนักงาน
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold leading-tight">
            ไทย พลัส+ (Thai Plus+)
          </span>
        </div>
      )}
    </div>
  );
};
