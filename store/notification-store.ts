import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Notification {
    id: string;
    title: string;
    message: string;
    timestamp: Date;
    isRead: boolean;
    type?: 'info' | 'success' | 'warning' | 'error';
}

interface NotificationState {
    notifications: Notification[];
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    getUnreadCount: () => number;
    fetchFromApi: () => Promise<void>;
}

const DEFAULT_NOTIFICATIONS: Notification[] = [];

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            notifications: DEFAULT_NOTIFICATIONS,
            addNotification: (n) => {
                const newNotif = {
                    ...n,
                    id: Math.random().toString(36).substring(7),
                    timestamp: new Date(),
                    isRead: false,
                };
                set((state) => ({
                    notifications: [newNotif, ...state.notifications],
                }));
                // Sync to backend
                fetch('/api/private/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: n.title, message: n.message, type: n.type }),
                }).catch(() => {});
            },
            markAsRead: (id) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        n.id === id ? { ...n, isRead: true } : n
                    ),
                }));
                // Sync to backend
                fetch('/api/private/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notificationId: id }),
                }).catch(() => {});
            },
            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
                }));
                // Sync to backend
                fetch('/api/private/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ readAll: true }),
                }).catch(() => {});
            },
            clearAll: () => set({ notifications: [] }),
            getUnreadCount: () => get().notifications.filter((n) => !n.isRead).length,
            fetchFromApi: async () => {
                try {
                    const res = await fetch('/api/private/notifications');
                    const data = await res.json();
                    if (data.ok && data.data?.notifications) {
                        const apiNotifs = data.data.notifications.map((n: any) => ({
                            id: n.id,
                            title: n.title,
                            message: n.message,
                            timestamp: new Date(n.timestamp),
                            isRead: n.isRead,
                            type: n.type || 'info',
                        }));
                        // Merge: keep local notifications that aren't in the API list
                        const existingIds = new Set(apiNotifs.map((n: Notification) => n.id));
                        const localOnly = get().notifications.filter(n => !existingIds.has(n.id));
                        set({ notifications: [...apiNotifs, ...localOnly] });
                    }
                } catch { /* silent — use local data */ }
            },
        }),
        {
            name: 'notification-storage',
            version: 2,
            migrate: (persistedState, version) => {
                const state = persistedState as NotificationState;
                if (version < 2) {
                    return { ...state, notifications: [] };
                }
                return state;
            },
        }
    )
);

