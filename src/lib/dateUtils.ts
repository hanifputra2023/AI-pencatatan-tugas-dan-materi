/**
 * Academic Date & Deadline Utilities
 */

export interface DeadlineInfo {
  formattedText: string;
  badgeLabel: string;
  badgeType: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'future' | 'legacy';
  daysRemaining?: number;
}

/**
 * Generate preset ISO strings for quick deadline setting
 */
export function getDeadlinePresets() {
  const now = new Date();

  // 1. Hari Ini 23:59
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 0, 0);

  // 2. Besok 23:59
  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 0, 0);

  // 3. 3 Hari Lagi 23:59
  const inThreeDays = new Date(now);
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  inThreeDays.setHours(23, 59, 0, 0);

  // 4. 1 Minggu Lagi 23:59
  const inOneWeek = new Date(now);
  inOneWeek.setDate(inOneWeek.getDate() + 7);
  inOneWeek.setHours(23, 59, 0, 0);

  return [
    { label: 'Hari Ini (23:59)', iso: toLocalIsoString(todayEnd) },
    { label: 'Besok (23:59)', iso: toLocalIsoString(tomorrowEnd) },
    { label: '3 Hari Lagi', iso: toLocalIsoString(inThreeDays) },
    { label: '1 Minggu Lagi', iso: toLocalIsoString(inOneWeek) },
  ];
}

/**
 * Format a Date object to YYYY-MM-DDTHH:mm for datetime-local input
 */
export function toLocalIsoString(date: Date): string {
  try {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (e) {
    return '';
  }
}

/**
 * Parse and evaluate any deadline string (ISO or text) into readable countdown status
 */
export function parseDeadline(dueDate: string | null | undefined): DeadlineInfo | null {
  if (!dueDate || typeof dueDate !== 'string' || !dueDate.trim()) return null;

  try {
    const trimmed = dueDate.trim();
    const parsedDate = new Date(trimmed);

    // If valid ISO/Date format
    if (!isNaN(parsedDate.getTime()) && (trimmed.includes('-') || trimmed.includes('T') || trimmed.includes('/'))) {
      const now = new Date();
      const diffMs = parsedDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const dateFormatted = parsedDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: parsedDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
      const timeFormatted = parsedDate.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const fullReadable = `${dateFormatted}, ${timeFormatted}`;

      // Overdue
      if (diffMs < 0) {
        const daysAgo = Math.abs(diffDays);
        return {
          formattedText: fullReadable,
          badgeLabel: daysAgo === 0 ? 'Lewat Hari Ini' : `Terlewat (${daysAgo} hari)`,
          badgeType: 'overdue',
          daysRemaining: diffDays,
        };
      }

      // Today
      const isSameDay = parsedDate.getDate() === now.getDate() &&
                        parsedDate.getMonth() === now.getMonth() &&
                        parsedDate.getFullYear() === now.getFullYear();
      if (isSameDay) {
        return {
          formattedText: fullReadable,
          badgeLabel: `Hari Ini (${timeFormatted})`,
          badgeType: 'today',
          daysRemaining: 0,
        };
      }

      // Tomorrow
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = parsedDate.getDate() === tomorrow.getDate() &&
                         parsedDate.getMonth() === tomorrow.getMonth() &&
                         parsedDate.getFullYear() === tomorrow.getFullYear();
      if (isTomorrow) {
        return {
          formattedText: fullReadable,
          badgeLabel: `Besok (${timeFormatted})`,
          badgeType: 'tomorrow',
          daysRemaining: 1,
        };
      }

      // Within 3 days
      if (diffDays <= 3) {
        return {
          formattedText: fullReadable,
          badgeLabel: `Sisa ${diffDays} hari`,
          badgeType: 'soon',
          daysRemaining: diffDays,
        };
      }

      // Future
      return {
        formattedText: fullReadable,
        badgeLabel: `${dateFormatted} (${diffDays} hari)`,
        badgeType: 'future',
        daysRemaining: diffDays,
      };
    }

    // Legacy manual text string (e.g. "Besok 23:59")
    const lower = trimmed.toLowerCase();
    if (lower.includes('hari ini') || lower.includes('today')) {
      return { formattedText: trimmed, badgeLabel: trimmed, badgeType: 'today' };
    }
    if (lower.includes('besok') || lower.includes('tomorrow')) {
      return { formattedText: trimmed, badgeLabel: trimmed, badgeType: 'tomorrow' };
    }
    if (lower.includes('lewat') || lower.includes('terlewat')) {
      return { formattedText: trimmed, badgeLabel: trimmed, badgeType: 'overdue' };
    }

    return { formattedText: trimmed, badgeLabel: trimmed, badgeType: 'legacy' };
  } catch (err) {
    return { formattedText: dueDate, badgeLabel: dueDate, badgeType: 'legacy' };
  }
}
