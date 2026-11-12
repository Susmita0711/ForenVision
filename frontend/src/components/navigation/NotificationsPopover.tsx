import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ShieldAlert, AlertTriangle, FileText, Activity, Trash2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export const NotificationsPopover: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type: string, priority: string) => {
    if (priority === 'urgent' || type === 'security') {
      return <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />;
    }
    if (priority === 'warning') {
      return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
    }
    if (type === 'evidence' || type === 'case') {
      return <FileText className="h-4 w-4 text-cyan-400 shrink-0" />;
    }
    return <Activity className="h-4 w-4 text-slate-400 shrink-0" />;
  };

  const handleNotificationClick = (id: string, link?: string) => {
    markAsRead(id);
    setIsOpen(false);
    if (link) {
      navigate(link);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        aria-label="View notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-slate-950 font-mono ring-2 ring-slate-900 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">System Alerts</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                type="button"
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                <Bell className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p>No active alerts in terminal feed</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item.id, item.link)}
                  className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                    item.read ? 'hover:bg-slate-800/40 opacity-75' : 'bg-slate-850 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="mt-0.5">{getNotificationIcon(item.type, item.priority)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`font-semibold truncate ${item.read ? 'text-slate-300' : 'text-white'}`}>
                        {item.title}
                      </p>
                      <span className="text-[10px] text-slate-500 shrink-0 font-mono">{item.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearNotification(item.id);
                    }}
                    type="button"
                    className="text-slate-600 hover:text-rose-400 p-1 rounded"
                    title="Dismiss alert"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
