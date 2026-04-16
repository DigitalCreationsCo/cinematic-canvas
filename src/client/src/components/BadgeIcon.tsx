import { cn } from '#client/lib/utils.js';
import { MessageSquare, type LucideIcon } from 'lucide-react';

interface BadgeIconProps {
  icon: LucideIcon;
  count: number;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  'data-testid'?: string;
}

export const BadgeIcon = ({
  icon: Icon,
  count,
  className,
  iconClassName,
  textClassName,
  'data-testid': dataTestId,
}: BadgeIconProps) => {
  const hasMessages = count > 0;

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <Icon
        className={cn(
          'transition-colors shrink-0 text-current',
          iconClassName
        )}
      />
      {hasMessages && (
        <span
          className={cn("absolute top-0.5 right-0.75 text-[10px] font-bold text-primary leading-none min-w-[16px] h-[16px] flex items-center justify-center px-1", textClassName)}
          data-testid={dataTestId}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
};

export { MessageSquare };
