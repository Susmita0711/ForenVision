import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SystemNotification, ActivityLog } from '../types';
import { fetchDashboardSummary } from '../api/dashboardApi';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: SystemNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  addNotification: (notification: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function mapActivityToNotification(item: ActivityLog): SystemNotification {
  const actorLabel =
    typeof item.actor === 'string'
      ? item.actor
      : item.actor?.name || item.actor?.email || 'Authorized Examiner';
  const targetType = item.targetType || 'system';
  const mappedType: SystemNotification['type'] =
    targetType === 'case'
      ? 'case'
      : targetType === 'evidence' || targetType === 'custody'
      ? 'evidence'
      : targetType === 'user' || targetType === 'auth'
      ? 'security'
      : 'system';

  return {
    id: item.id || `act_${item.timestamp}`,
    title: item.action.replace(/_/g, ' '),
    message: `${actorLabel} — ${item.target || 'Forensic Artifact'}`,
    timestamp: item.timestamp,
    type: mappedType,
    priority: 'info',
    read: false,
  };
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }

    let active = true;
    fetchDashboardSummary()
      .then((res) => {
        if (!active || !res.success || !res.data) return;
        const recent = res.data.recentActivity || [];
        if (recent.length > 0) {
          setNotifications(recent.slice(0, 8).map(mapActivityToNotification));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(item => (item.id === id ? { ...item, read: true } : item))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(item => ({ ...item, read: true })));
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(item => item.id !== id));
  };

  const addNotification = (notif: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => {
    const newEntry: SystemNotification = {
      ...notif,
      id: `notif_${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newEntry, ...prev]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotification,
        addNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
