import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Search, 
  Check, 
  RotateCcw, 
  Smile,
  Save
} from 'lucide-react';
import { clsx } from 'clsx';
import { ANIMAL_LIST, AnimalCategory, AnimalAvatar, getAnimalProfile } from './AnimalAvatar';
import { useStore } from '../store/useStore';

interface AvatarSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES: { id: AnimalCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'ทั้งหมด', icon: '🐾' },
  { id: 'pets', label: 'สัตว์เลี้ยง', icon: '🐶' },
  { id: 'wild', label: 'สัตว์ป่า & สัตว์บก', icon: '🦁' },
  { id: 'aquatic', label: 'สัตว์น้ำ', icon: '🐬' },
  { id: 'birds', label: 'นก & แมลง', icon: '🦜' },
  { id: 'special', label: 'พิเศษ & ไดโนเสาร์', icon: '🦖' },
];

export function AvatarSelectorModal({
  isOpen,
  onClose,
  onSuccess,
}: AvatarSelectorModalProps) {
  const { user, updateAvatar } = useStore();

  const [selectedCategory, setSelectedCategory] = useState<AnimalCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string>(user?.avatarEmoji || '');
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successToast, setSuccessToast] = useState(false);

  // Sync with current user when opening
  React.useEffect(() => {
    if (isOpen && user) {
      setSelectedEmoji(user.avatarEmoji || '');
      setCustomInput('');
      setErrorMsg('');
      setSuccessToast(false);
    }
  }, [isOpen, user]);

  // Filtered animal list based on category & search term
  const filteredAnimals = useMemo(() => {
    return ANIMAL_LIST.filter((animal) => {
      const matchCategory = selectedCategory === 'all' || animal.category === selectedCategory;
      const matchSearch =
        searchTerm.trim() === '' ||
        animal.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        animal.emoji.includes(searchTerm.trim());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchTerm]);

  // Determine current active preview profile
  const previewProfile = useMemo(() => {
    const seed = user?.username || user?.uid || 'user';
    return getAnimalProfile(seed, user?.role === 'admin', user?.name, selectedEmoji);
  }, [user, selectedEmoji]);

  const isDefault = !selectedEmoji;
  const hasChanged = (user?.avatarEmoji || '') !== selectedEmoji;

  const handleSelectAnimal = (emoji: string) => {
    setSelectedEmoji(emoji);
    setCustomInput('');
    setErrorMsg('');
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setCustomInput(val);
    if (val) {
      // Pick first emoji character if multiple entered
      setSelectedEmoji(val);
    }
    setErrorMsg('');
  };

  const handleResetToDefault = () => {
    setSelectedEmoji('');
    setCustomInput('');
    setErrorMsg('');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await updateAvatar(selectedEmoji);
      if (res.success) {
        setSuccessToast(true);
        setTimeout(() => {
          setSuccessToast(false);
          onSuccess?.();
          onClose();
        }, 600);
      } else {
        setErrorMsg(res.message || 'ไม่สามารถบันทึกรูปตัวการ์ตูนได้');
      }
    } catch (e) {
      setErrorMsg('เกิดข้อผิดพลาดในการบันทึกรูป');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      id="avatar-selector-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transform transition-transform"
      >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-300 dark:border-amber-700 shadow-2xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  เปลี่ยนรูปตัวการ์ตูนประจำตัว
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  เลือกรูปสัตว์น่ารักที่คุณชอบเพื่อแสดงแทนตัวคุณในระบบ
                </p>
              </div>
            </div>

            <button
              id="close-avatar-modal-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Selection & Preview Banner */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent dark:from-amber-500/15 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="relative shrink-0">
                <AnimalAvatar
                  avatarEmoji={selectedEmoji}
                  identifier={user?.username || user?.uid}
                  name={user?.name}
                  isAdmin={user?.role === 'admin'}
                  size="xl"
                  className="shadow-md ring-2 ring-amber-400/40"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <span>ตัวอย่างรูปที่คุณเลือก:</span>
                  {isDefault && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px]">
                      ค่าเริ่มต้น
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {previewProfile.emoji} {previewProfile.name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  พนักงาน: <span className="font-semibold text-slate-700 dark:text-slate-300">{user?.name}</span> (@{user?.username})
                </div>
              </div>
            </div>

            <button
              id="reset-avatar-default-btn"
              type="button"
              onClick={handleResetToDefault}
              className={clsx(
                "px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs",
                isDefault
                  ? "border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed bg-slate-50 dark:bg-slate-800/40"
                  : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900"
              )}
              disabled={isDefault}
              title="คืนค่าเป็นรูปตัวการ์ตูนเริ่มต้นตามระบบ"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ใช้รูปเริ่มต้น</span>
            </button>
          </div>

          {/* Search & Categories Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="search-animal-input"
                type="text"
                placeholder="ค้นหาตัวการ์ตูน (เช่น แมว, ควาย, เสือ, นก, วาฬ...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  id={`cat-filter-${cat.id}`}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 shadow-2xs",
                    selectedCategory === cat.id
                      ? "bg-amber-500 text-white shadow-amber-500/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Avatar Options */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50 dark:bg-slate-900/50">
            {filteredAnimals.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                <Smile className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">ไม่พบตัวการ์ตูนที่ตรงกับ "{searchTerm}"</p>
                <p className="text-xs mt-1">ลองพิมพ์ค้นหาด้วยคำอื่น หรือเลือกจากหมวดหมู่</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3">
                {filteredAnimals.map((item) => {
                  const isSelected = selectedEmoji === item.emoji;
                  return (
                    <button
                      key={item.emoji + item.name}
                      id={`animal-option-${item.emoji}`}
                      type="button"
                      onClick={() => handleSelectAnimal(item.emoji)}
                      className={clsx(
                        "group relative p-2.5 sm:p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-98",
                        isSelected
                          ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/90 dark:bg-amber-950/60 shadow-md"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}

                      <div
                        className={clsx(
                          "w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl sm:text-3xl border mb-1.5 transition-transform group-hover:scale-105 shadow-2xs",
                          item.bg,
                          item.darkBg,
                          item.border,
                          item.darkBorder
                        )}
                      >
                        <span className="leading-none drop-shadow-2xs">{item.emoji}</span>
                      </div>

                      <span
                        className={clsx(
                          "text-[11px] sm:text-xs font-semibold truncate max-w-full block leading-tight",
                          isSelected
                            ? "text-amber-700 dark:text-amber-300 font-bold"
                            : "text-slate-700 dark:text-slate-300"
                        )}
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Custom Emoji Input Section */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Smile className="w-3.5 h-3.5 text-amber-500" />
                    <span>หรือพิมพ์อีโมจิอื่นที่ต้องการเอง:</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    พิมพ์หรือวางอีโมจิจากแป้นพิมพ์โทรศัพท์หรือคีย์บอร์ดคอมพิวเตอร์
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="custom-emoji-input"
                    type="text"
                    maxLength={4}
                    placeholder="เช่น 🦄, 🐼, 🌟"
                    value={customInput}
                    onChange={handleCustomInputChange}
                    className="w-24 text-center py-1.5 text-base rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                  {customInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmoji(customInput);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 cursor-pointer"
                    >
                      นำไปใช้
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {errorMsg && (
                <span className="text-red-500 dark:text-red-400 font-medium">
                  {errorMsg}
                </span>
              )}
              {successToast && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  บันทึกรูปตัวการ์ตูนเรียบร้อยแล้ว!
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                id="cancel-avatar-btn"
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                id="save-avatar-btn"
                type="button"
                onClick={handleSave}
                disabled={saving || (!hasChanged && !selectedEmoji)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 active:scale-98 rounded-xl transition shadow-md shadow-amber-500/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>บันทึกรูปประจำตัว</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
