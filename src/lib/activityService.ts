import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ActivityLog } from '../types';

export async function logActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>) {
  try {
    const activitiesRef = collection(db, 'activities');
    await addDoc(activitiesRef, {
      ...activity,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn('Failed to log activity:', error);
  }
}
