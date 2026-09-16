import React from 'react';
import { clsx } from 'clsx';

export interface AnimalProfile {
  emoji: string;
  name: string;
  bg: string;
  darkBg: string;
  border: string;
  darkBorder: string;
}

export const ANIMAL_LIST: AnimalProfile[] = [
  { emoji: '🦁', name: 'สิงโตจอมพลัง', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐯', name: 'เสือน้อยไฟแรง', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🐼', name: 'แพนด้าอารมณ์ดี', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🐨', name: 'โคอาล่าน่ารัก', bg: 'bg-teal-100', darkBg: 'dark:bg-teal-950/70', border: 'border-teal-300', darkBorder: 'dark:border-teal-800' },
  { emoji: '🦊', name: 'จิ้งจอกเจ้าปัญญา', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-950/70', border: 'border-rose-300', darkBorder: 'dark:border-rose-800' },
  { emoji: '🐰', name: 'กระต่ายร่าเริง', bg: 'bg-pink-100', darkBg: 'dark:bg-pink-950/70', border: 'border-pink-300', darkBorder: 'dark:border-pink-800' },
  { emoji: '🐻', name: 'หมีใจกว้าง', bg: 'bg-amber-200/80', darkBg: 'dark:bg-amber-900/60', border: 'border-amber-400', darkBorder: 'dark:border-amber-700' },
  { emoji: '🐶', name: 'ชิบะสดใส', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🐱', name: 'แมวส้มขี้เล่น', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🐧', name: 'เพนกวินมาดเท่', bg: 'bg-sky-100', darkBg: 'dark:bg-sky-950/70', border: 'border-sky-300', darkBorder: 'dark:border-sky-800' },
  { emoji: '🦉', name: 'นกฮูกสายรอบรู้', bg: 'bg-purple-100', darkBg: 'dark:bg-purple-950/70', border: 'border-purple-300', darkBorder: 'dark:border-purple-800' },
  { emoji: '🐬', name: 'โลมาสดชื่น', bg: 'bg-cyan-100', darkBg: 'dark:bg-cyan-950/70', border: 'border-cyan-300', darkBorder: 'dark:border-cyan-800' },
  { emoji: '🦄', name: 'ยูนิคอร์นนำโชค', bg: 'bg-fuchsia-100', darkBg: 'dark:bg-fuchsia-950/70', border: 'border-fuchsia-300', darkBorder: 'dark:border-fuchsia-800' },
  { emoji: '🦔', name: 'เม่นแคระน่ารัก', bg: 'bg-stone-100', darkBg: 'dark:bg-stone-800', border: 'border-stone-300', darkBorder: 'dark:border-stone-600' },
  { emoji: '🦦', name: 'นากทะเลช่างคิด', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/70', border: 'border-emerald-300', darkBorder: 'dark:border-emerald-800' },
  { emoji: '🦭', name: 'แมวน้ำกลมปุ๊ก', bg: 'bg-blue-100', darkBg: 'dark:bg-blue-950/70', border: 'border-blue-300', darkBorder: 'dark:border-blue-800' },
  { emoji: '🦒', name: 'ยีราฟใจเย็น', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🐘', name: 'ช้างน้อยสุขใจ', bg: 'bg-slate-200/80', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🐸', name: 'กบน้อยโชคดี', bg: 'bg-lime-100', darkBg: 'dark:bg-lime-950/70', border: 'border-lime-300', darkBorder: 'dark:border-lime-800' },
  { emoji: '🐵', name: 'ลิงน้อยแสนซน', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐹', name: 'แฮมสเตอร์แก้มตุ่ย', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🐙', name: 'หมึกยิ้มสดใส', bg: 'bg-red-100', darkBg: 'dark:bg-red-950/70', border: 'border-red-300', darkBorder: 'dark:border-red-800' },
  { emoji: '🦩', name: 'ฟลามิงโก้เจ้าเสน่ห์', bg: 'bg-pink-100', darkBg: 'dark:bg-pink-950/70', border: 'border-pink-300', darkBorder: 'dark:border-pink-800' },
  { emoji: '🦚', name: 'นกยูงสง่างาม', bg: 'bg-teal-100', darkBg: 'dark:bg-teal-950/70', border: 'border-teal-300', darkBorder: 'dark:border-teal-800' },
  { emoji: '🐝', name: 'ผึ้งน้อยขยัน', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-400', darkBorder: 'dark:border-yellow-700' },
  { emoji: '🦋', name: 'ผีเสื้อเบิกบาน', bg: 'bg-indigo-100', darkBg: 'dark:bg-indigo-950/70', border: 'border-indigo-300', darkBorder: 'dark:border-indigo-800' },
  { emoji: '🦖', name: 'ทีเร็กซ์ทรงพลัง', bg: 'bg-green-100', darkBg: 'dark:bg-green-950/70', border: 'border-green-300', darkBorder: 'dark:border-green-800' },
  { emoji: '🦕', name: 'แบรคิโอใจดี', bg: 'bg-cyan-100', darkBg: 'dark:bg-cyan-950/70', border: 'border-cyan-300', darkBorder: 'dark:border-cyan-800' },
  { emoji: '🦥', name: 'สล็อธใจเย็น', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐺', name: 'หมาป่าสุขุม', bg: 'bg-slate-200', darkBg: 'dark:bg-slate-800', border: 'border-slate-400', darkBorder: 'dark:border-slate-600' },
  { emoji: '🦫', name: 'บีเวอร์สู้งาน', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦆', name: 'เป็ดน้อยร่าเริง', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🐿️', name: 'กระรอกปราดเปรียว', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🦓', name: 'ม้าลายว่องไว', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🦘', name: 'จิงโจ้พลังสูง', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦚', name: 'หงส์ขาวสง่า', bg: 'bg-indigo-50', darkBg: 'dark:bg-indigo-950/60', border: 'border-indigo-200', darkBorder: 'dark:border-indigo-800' },
];

/**
 * Deterministically get an animal cartoon profile based on a unique identifier
 * (User ID, username, or name).
 */
export function getAnimalProfile(identifier?: string, isAdmin?: boolean): AnimalProfile {
  if (isAdmin || identifier?.toLowerCase() === 'gametpl' || identifier === 'admin_gametpl') {
    return {
      emoji: '👑🦁',
      name: 'สิงโตเจ้าป่า (ผู้ดูแลระบบ)',
      bg: 'bg-amber-200',
      darkBg: 'dark:bg-amber-900',
      border: 'border-amber-400',
      darkBorder: 'dark:border-amber-600',
    };
  }

  if (!identifier || identifier.trim() === '') {
    return ANIMAL_LIST[0];
  }

  let hash = 0;
  const str = identifier.trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ANIMAL_LIST.length;
  return ANIMAL_LIST[index];
}

interface AnimalAvatarProps {
  identifier?: string;
  name?: string;
  isAdmin?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
}

export function AnimalAvatar({
  identifier,
  name,
  isAdmin = false,
  size = 'md',
  className = '',
  showTooltip = true,
}: AnimalAvatarProps) {
  const seed = identifier || name || 'user';
  const animal = getAnimalProfile(seed, isAdmin);

  const sizeClasses = {
    xs: 'w-5 h-5 text-[11px] rounded-md border',
    sm: 'w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm rounded-lg border',
    md: 'w-8 h-8 sm:w-8.5 sm:h-8.5 text-base rounded-xl border',
    lg: 'w-10 h-10 sm:w-11 sm:h-11 text-lg sm:text-xl rounded-2xl border-1.5',
    xl: 'w-12 h-12 text-2xl rounded-2xl border-2',
  }[size];

  const tooltipText = name 
    ? `${name} (${animal.name})` 
    : animal.name;

  return (
    <div
      className={clsx(
        "relative flex items-center justify-center select-none shrink-0 transition-transform active:scale-95 shadow-2xs",
        sizeClasses,
        animal.bg,
        animal.darkBg,
        animal.border,
        animal.darkBorder,
        className
      )}
      title={showTooltip ? tooltipText : undefined}
    >
      <span className="leading-none drop-shadow-2xs">{animal.emoji}</span>
      {isAdmin && size !== 'xs' && (
        <span className="absolute -top-1 -right-1 text-[9px] leading-none" title="ผู้ดูแลระบบ">
          👑
        </span>
      )}
    </div>
  );
}
