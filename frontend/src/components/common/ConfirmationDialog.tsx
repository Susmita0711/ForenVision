import React from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const variantIcons = {
    danger: <ShieldAlert className="h-6 w-6 text-rose-400" />,
    warning: <AlertTriangle className="h-6 w-6 text-amber-400" />,
    info: <Info className="h-6 w-6 text-cyan-400" />,
  };

  const confirmBtnClasses = {
    danger: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-rose-950/50',
    warning: 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-amber-950/50',
    info: 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500 shadow-cyan-950/50',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-lg border px-4 py-2 text-xs font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-50 ${confirmBtnClasses[variant]}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="rounded-xl p-2.5 bg-slate-800/80 border border-slate-700 shrink-0">
          {variantIcons[variant]}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed pt-1">{message}</p>
      </div>
    </Modal>
  );
};
