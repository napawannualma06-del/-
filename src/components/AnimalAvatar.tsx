import React from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';

export type AnimalCategory = 'all' | 'pets' | 'wild' | 'aquatic' | 'birds' | 'special';

export interface AnimalProfile {
  emoji: string;
  name: string;
  category: AnimalCategory;
  bg: string;
  darkBg: string;
  border: string;
  darkBorder: string;
}

export const ANIMAL_LIST: AnimalProfile[] = [
  // สัตว์เลี้ยง (pets)
  { emoji: '🐶', name: 'ชิบะสดใส', category: 'pets', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🐱', name: 'แมวส้มขี้เล่น', category: 'pets', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🐰', name: 'กระต่ายร่าเริง', category: 'pets', bg: 'bg-pink-100', darkBg: 'dark:bg-pink-950/70', border: 'border-pink-300', darkBorder: 'dark:border-pink-800' },
  { emoji: '🐹', name: 'แฮมสเตอร์แก้มตุ่ย', category: 'pets', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐕', name: 'น้องหมาแสนรู้', category: 'pets', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐈‍⬛', name: 'แมวดำลึกลับ', category: 'pets', bg: 'bg-slate-200', darkBg: 'dark:bg-slate-800', border: 'border-slate-400', darkBorder: 'dark:border-slate-600' },

  // สัตว์ป่าและสัตว์บก (wild)
  { emoji: '🦁', name: 'สิงโตจอมพลัง', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐯', name: 'เสือน้อยไฟแรง', category: 'wild', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🐼', name: 'แพนด้าอารมณ์ดี', category: 'wild', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🐨', name: 'โคอาล่าน่ารัก', category: 'wild', bg: 'bg-teal-100', darkBg: 'dark:bg-teal-950/70', border: 'border-teal-300', darkBorder: 'dark:border-teal-800' },
  { emoji: '🦊', name: 'จิ้งจอกเจ้าปัญญา', category: 'wild', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-950/70', border: 'border-rose-300', darkBorder: 'dark:border-rose-800' },
  { emoji: '🐻', name: 'หมีใจกว้าง', category: 'wild', bg: 'bg-amber-200/80', darkBg: 'dark:bg-amber-900/60', border: 'border-amber-400', darkBorder: 'dark:border-amber-700' },
  { emoji: '🐺', name: 'หมาป่าสุขุม', category: 'wild', bg: 'bg-slate-200', darkBg: 'dark:bg-slate-800', border: 'border-slate-400', darkBorder: 'dark:border-slate-600' },
  { emoji: '🐃', name: 'ควายใจดีสู้งาน', category: 'wild', bg: 'bg-stone-200', darkBg: 'dark:bg-stone-800', border: 'border-stone-400', darkBorder: 'dark:border-stone-600' },
  { emoji: '🐮', name: 'วัวอารมณ์ดี', category: 'wild', bg: 'bg-zinc-100', darkBg: 'dark:bg-zinc-800', border: 'border-zinc-300', darkBorder: 'dark:border-zinc-600' },
  { emoji: '🐴', name: 'ม้าหนุ่มว่องไว', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦓', name: 'ม้าลายว่องไว', category: 'wild', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🦒', name: 'ยีราฟใจเย็น', category: 'wild', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🐘', name: 'ช้างน้อยสุขใจ', category: 'wild', bg: 'bg-slate-200/80', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🐵', name: 'ลิงน้อยแสนซน', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦍', name: 'กอริลล่าผู้พิทักษ์', category: 'wild', bg: 'bg-stone-300', darkBg: 'dark:bg-stone-800', border: 'border-stone-400', darkBorder: 'dark:border-stone-600' },
  { emoji: '🦥', name: 'สล็อธใจเย็น', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦦', name: 'นากทะเลช่างคิด', category: 'wild', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/70', border: 'border-emerald-300', darkBorder: 'dark:border-emerald-800' },
  { emoji: '🦫', name: 'บีเวอร์สู้งาน', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦔', name: 'เม่นแคระน่ารัก', category: 'wild', bg: 'bg-stone-100', darkBg: 'dark:bg-stone-800', border: 'border-stone-300', darkBorder: 'dark:border-stone-600' },
  { emoji: '🐿️', name: 'กระรอกปราดเปรียว', category: 'wild', bg: 'bg-orange-100', darkBg: 'dark:bg-orange-950/70', border: 'border-orange-300', darkBorder: 'dark:border-orange-800' },
  { emoji: '🦘', name: 'จิงโจ้พลังสูง', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🦌', name: 'กวางป่าสง่างาม', category: 'wild', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐷', name: 'หมูน้อยอารมณ์ดี', category: 'wild', bg: 'bg-pink-100', darkBg: 'dark:bg-pink-950/70', border: 'border-pink-300', darkBorder: 'dark:border-pink-800' },
  { emoji: '🐑', name: 'แกะน้อยนุ่มฟู', category: 'wild', bg: 'bg-sky-50', darkBg: 'dark:bg-sky-950/60', border: 'border-sky-200', darkBorder: 'dark:border-sky-800' },

  // สัตว์น้ำ (aquatic)
  { emoji: '🐬', name: 'โลมาสดชื่น', category: 'aquatic', bg: 'bg-cyan-100', darkBg: 'dark:bg-cyan-950/70', border: 'border-cyan-300', darkBorder: 'dark:border-cyan-800' },
  { emoji: '🐳', name: 'วาฬสีน้ำเงิน', category: 'aquatic', bg: 'bg-blue-100', darkBg: 'dark:bg-blue-950/70', border: 'border-blue-300', darkBorder: 'dark:border-blue-800' },
  { emoji: '🦈', name: 'ฉลามมาดเท่', category: 'aquatic', bg: 'bg-slate-200', darkBg: 'dark:bg-slate-800', border: 'border-slate-300', darkBorder: 'dark:border-slate-600' },
  { emoji: '🦭', name: 'แมวน้ำกลมปุ๊ก', category: 'aquatic', bg: 'bg-blue-100', darkBg: 'dark:bg-blue-950/70', border: 'border-blue-300', darkBorder: 'dark:border-blue-800' },
  { emoji: '🐙', name: 'หมึกยิ้มสดใส', category: 'aquatic', bg: 'bg-red-100', darkBg: 'dark:bg-red-950/70', border: 'border-red-300', darkBorder: 'dark:border-red-800' },
  { emoji: '🦀', name: 'ปูตัวตึง', category: 'aquatic', bg: 'bg-rose-100', darkBg: 'dark:bg-rose-950/70', border: 'border-rose-300', darkBorder: 'dark:border-rose-800' },
  { emoji: '🦞', name: 'กุ้งมังกรพลังบวก', category: 'aquatic', bg: 'bg-red-100', darkBg: 'dark:bg-red-950/70', border: 'border-red-300', darkBorder: 'dark:border-red-800' },
  { emoji: '🐠', name: 'ปลาการ์ตูนสดใส', category: 'aquatic', bg: 'bg-amber-100', darkBg: 'dark:bg-amber-950/70', border: 'border-amber-300', darkBorder: 'dark:border-amber-800' },
  { emoji: '🐢', name: 'เต่าทะเลใจเย็น', category: 'aquatic', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/70', border: 'border-emerald-300', darkBorder: 'dark:border-emerald-800' },

  // นกและแมลง (birds)
  { emoji: '🐧', name: 'เพนกวินมาดเท่', category: 'birds', bg: 'bg-sky-100', darkBg: 'dark:bg-sky-950/70', border: 'border-sky-300', darkBorder: 'dark:border-sky-800' },
  { emoji: '🦉', name: 'นกฮูกสายรอบรู้', category: 'birds', bg: 'bg-purple-100', darkBg: 'dark:bg-purple-950/70', border: 'border-purple-300', darkBorder: 'dark:border-purple-800' },
  { emoji: '🦅', name: 'นกอินทรีเวหา', category: 'birds', bg: 'bg-stone-200', darkBg: 'dark:bg-stone-800', border: 'border-stone-400', darkBorder: 'dark:border-stone-600' },
  { emoji: '🦜', name: 'นกแก้วพูดเก่ง', category: 'birds', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/70', border: 'border-emerald-300', darkBorder: 'dark:border-emerald-800' },
  { emoji: '🦩', name: 'ฟลามิงโก้เจ้าเสน่ห์', category: 'birds', bg: 'bg-pink-100', darkBg: 'dark:bg-pink-950/70', border: 'border-pink-300', darkBorder: 'dark:border-pink-800' },
  { emoji: '🦚', name: 'นกยูงสง่างาม', category: 'birds', bg: 'bg-teal-100', darkBg: 'dark:bg-teal-950/70', border: 'border-teal-300', darkBorder: 'dark:border-teal-800' },
  { emoji: '🦆', name: 'เป็ดน้อยร่าเริง', category: 'birds', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-300', darkBorder: 'dark:border-yellow-800' },
  { emoji: '🦢', name: 'หงส์ขาวสง่า', category: 'birds', bg: 'bg-indigo-50', darkBg: 'dark:bg-indigo-950/60', border: 'border-indigo-200', darkBorder: 'dark:border-indigo-800' },
  { emoji: '🐝', name: 'ผึ้งน้อยขยัน', category: 'birds', bg: 'bg-yellow-100', darkBg: 'dark:bg-yellow-950/70', border: 'border-yellow-400', darkBorder: 'dark:border-yellow-700' },
  { emoji: '🦋', name: 'ผีเสื้อเบิกบาน', category: 'birds', bg: 'bg-indigo-100', darkBg: 'dark:bg-indigo-950/70', border: 'border-indigo-300', darkBorder: 'dark:border-indigo-800' },

  // สิ่งพิเศษและตำนาน (special)
  { emoji: '🦄', name: 'ยูนิคอร์นนำโชค', category: 'special', bg: 'bg-fuchsia-100', darkBg: 'dark:bg-fuchsia-950/70', border: 'border-fuchsia-300', darkBorder: 'dark:border-fuchsia-800' },
  { emoji: '🦖', name: 'ทีเร็กซ์ทรงพลัง', category: 'special', bg: 'bg-green-100', darkBg: 'dark:bg-green-950/70', border: 'border-green-300', darkBorder: 'dark:border-green-800' },
  { emoji: '🦕', name: 'แบรคิโอใจดี', category: 'special', bg: 'bg-cyan-100', darkBg: 'dark:bg-cyan-950/70', border: 'border-cyan-300', darkBorder: 'dark:border-cyan-800' },
  { emoji: '🐉', name: 'มังกรฟ้ามงคล', category: 'special', bg: 'bg-emerald-100', darkBg: 'dark:bg-emerald-950/70', border: 'border-emerald-300', darkBorder: 'dark:border-emerald-800' },
  { emoji: '🐸', name: 'กบน้อยโชคดี', category: 'special', bg: 'bg-lime-100', darkBg: 'dark:bg-lime-950/70', border: 'border-lime-300', darkBorder: 'dark:border-lime-800' },
];

/**
 * Deterministically get an animal cartoon profile based on a unique identifier
 * (User ID, username, or name), with support for user's custom chosen avatar emoji.
 */
export function getAnimalProfile(
  identifier?: string,
  isAdmin?: boolean,
  name?: string,
  customEmoji?: string
): AnimalProfile {
  // 1. ถ้าผู้ใช้มีการเลือกรูปอีโมจิประจำตัวไว้เอง (Custom Avatar) ให้แสดงรูปที่เลือกเป็นอันดับแรก
  if (customEmoji && customEmoji.trim() !== '') {
    const trimmed = customEmoji.trim();
    const matched = ANIMAL_LIST.find((a) => a.emoji === trimmed);
    if (matched) {
      return matched;
    }
    // กรณีเป็นอีโมจิที่ผู้ใช้พิมพ์กำหนดเองนอกเหนือจากตาราง
    return {
      emoji: trimmed,
      name: name ? `รูปประจำตัวของ ${name}` : 'รูปประจำตัว',
      category: 'special',
      bg: 'bg-violet-100',
      darkBg: 'dark:bg-violet-950/70',
      border: 'border-violet-300',
      darkBorder: 'dark:border-violet-700',
    };
  }

  // 2. แอดมินสูงสุด (gametpl)
  if (isAdmin || identifier?.toLowerCase() === 'gametpl' || identifier === 'admin_gametpl') {
    return {
      emoji: '👑🦁',
      name: 'สิงโตเจ้าป่า (ผู้ดูแลระบบ)',
      category: 'special',
      bg: 'bg-amber-200',
      darkBg: 'dark:bg-amber-900',
      border: 'border-amber-400',
      darkBorder: 'dark:border-amber-600',
    };
  }

  // 3. ค่าเริ่มต้นสำหรับพนักงานชื่อ Fong (ควายใจดีสู้งาน)
  const normalizedIdent = (identifier || '').trim().toLowerCase();
  const normalizedName = (name || '').trim().toLowerCase();
  if (
    normalizedIdent === 'fong' ||
    normalizedIdent.includes('fong') ||
    normalizedIdent.startsWith('fong') ||
    normalizedName === 'fong' ||
    normalizedName.includes('fong') ||
    normalizedName.includes('ฟอง')
  ) {
    return {
      emoji: '🐃',
      name: 'ควายใจดีสู้งาน',
      category: 'wild',
      bg: 'bg-stone-200',
      darkBg: 'dark:bg-stone-850',
      border: 'border-stone-400',
      darkBorder: 'dark:border-stone-600',
    };
  }

  if (!identifier || identifier.trim() === '') {
    return ANIMAL_LIST[0];
  }

  // 4. สุ่มตามรหัส Hash ของชื่อ/ID อย่างคงที่
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
  avatarEmoji?: string;
  isAdmin?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showTooltip?: boolean;
}

export function AnimalAvatar({
  identifier,
  name,
  avatarEmoji,
  isAdmin = false,
  size = 'md',
  className = '',
  showTooltip = true,
}: AnimalAvatarProps) {
  const userAvatars = useStore((s) => s?.userAvatars || {});
  
  // ตรวจหา custom emoji จาก props หรือจากแคชข้อมูลผู้ใช้ใน store
  const explicitEmoji = avatarEmoji;
  const storeEmoji = userAvatars ? (
    (identifier ? (userAvatars[identifier] || userAvatars[identifier.toLowerCase()]) : undefined) ||
    (name ? userAvatars[name.toLowerCase()] : undefined)
  ) : undefined;
  const resolvedEmoji = explicitEmoji !== undefined ? explicitEmoji : storeEmoji;

  const seed = identifier || name || 'user';
  const animal = getAnimalProfile(seed, isAdmin, name, resolvedEmoji);

  const sizeClasses = {
    xs: 'w-5 h-5 text-[11px] rounded-md border',
    sm: 'w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm rounded-lg border',
    md: 'w-8 h-8 sm:w-8.5 sm:h-8.5 text-base rounded-xl border',
    lg: 'w-10 h-10 sm:w-11 sm:h-11 text-lg sm:text-xl rounded-2xl border-1.5',
    xl: 'w-12 h-12 text-2xl rounded-2xl border-2',
    '2xl': 'w-16 h-16 text-3xl rounded-3xl border-2',
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
