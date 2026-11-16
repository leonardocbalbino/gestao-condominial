'use server';

import { revalidatePath } from 'next/cache';
import { readPreferences, setPreferences } from '@/lib/session';

const SCALES = [1, 1.25, 1.5];

/** "A+" / "A−": três tamanhos de fonte. */
export async function changeFontSize(direction: 'up' | 'down'): Promise<void> {
  const { fontScale } = await readPreferences();
  const i = SCALES.indexOf(fontScale);
  const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, i + (direction === 'up' ? 1 : -1)))];
  await setPreferences({ fontScale: next ?? 1 });
  revalidatePath('/', 'layout');
}

export async function toggleHighContrast(): Promise<void> {
  const { highContrast } = await readPreferences();
  await setPreferences({ highContrast: !highContrast });
  revalidatePath('/', 'layout');
}
