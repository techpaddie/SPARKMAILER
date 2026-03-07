import { NavLink } from 'react-router-dom';
import Icon from './Icon';

interface SidebarNavLinkProps {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  activeClass?: string;
  inactiveClass?: string;
}

export default function SidebarNavLink({
  to,
  label,
  icon,
  end,
  activeClass = 'bg-primary-500/10 text-primary-400 border-l-2 border-primary-500',
  inactiveClass = 'text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 border-l-2 border-transparent',
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
      <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center" aria-hidden>
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 w-0 opacity-0 overflow-hidden group-hover:w-[140px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
        {label}
      </span>
    </NavLink>
  );
}
