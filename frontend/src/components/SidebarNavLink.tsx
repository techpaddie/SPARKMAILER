import { NavLink } from 'react-router-dom';
import Icon from './Icon';

interface SidebarNavLinkProps {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  activeClass?: string;
  inactiveClass?: string;
  badge?: number | null;
}

export default function SidebarNavLink({
  to,
  label,
  icon,
  end,
  activeClass = 'bg-primary-500/10 text-primary-400 border-l-2 border-primary-500',
  inactiveClass = 'text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 border-l-2 border-transparent',
  badge,
}: SidebarNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-3 text-sm font-medium transition-all duration-200 min-h-[44px] border-l-2 ${
          isActive ? activeClass : inactiveClass
        }`
      }
    >
      <span className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center" aria-hidden>
        <Icon name={icon} size={22} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="min-w-0 w-0 opacity-0 overflow-hidden group-hover:w-[140px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap flex items-center gap-2">
        {label}
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-primary-500/20 text-primary-400 text-xs font-semibold px-1.5">
            {badge}
          </span>
        )}
      </span>
    </NavLink>
  );
}
