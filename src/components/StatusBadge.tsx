import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react';

export type BadgeTone = 'nominal' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
  icon?: 'check' | 'warn' | 'danger' | 'clock' | 'lock' | 'truck' | 'x';
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  nominal: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-slate-100 text-[#0F294A] border-slate-300',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone, label, icon }) => {
  const IconComp = (() => {
    switch (icon) {
      case 'check':
        return CheckCircle2;
      case 'warn':
        return AlertTriangle;
      case 'danger':
        return ShieldAlert;
      case 'clock':
        return Clock;
      case 'lock':
        return Lock;
      case 'truck':
        return Truck;
      case 'x':
        return XCircle;
      default:
        return null;
    }
  })();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${TONE_CLASSES[tone]}`}
    >
      {IconComp && <IconComp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
};
