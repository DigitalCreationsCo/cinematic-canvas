import { cn } from '#client/lib/utils.js';
import { MessageSquare, type LucideIcon } from 'lucide-react';

interface BadgeIconProps {
  icon: LucideIcon;
  count: number;
  className?: string;
  iconClassName?: string;
  'data-testid'?: string;
}

export const BadgeIcon = ({
  icon: Icon,
  count,
  className,
  iconClassName,
  'data-testid': dataTestId,
}: BadgeIconProps) => {
  const hasMessages = count > 0;

  return (
    <div className={cn('relative w-10 h-10 flex items-center justify-center', className)}>
      <Icon
        className={cn(
          'transition-colors w-10 h-10 shrink-0',
          hasMessages ? 'text-foreground' : 'text-muted-foreground',
          iconClassName
        )}
      />
      {hasMessages && (
        <span
          className="absolute text-[9px] font-bold text-primary leading-none"
          data-testid={dataTestId}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  );
};

export { MessageSquare };
