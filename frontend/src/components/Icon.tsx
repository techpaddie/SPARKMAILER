import { forwardRef } from 'react';

interface IconProps {
  name: string;
  className?: string;
  size?: number;
}

/** Google Material Symbol (Outlined). Use icon name from https://fonts.google.com/icons */
const Icon = forwardRef<HTMLSpanElement, IconProps>(
  ({ name, className = '', size = 24 }, ref) => (
    <span
      ref={ref}
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size }}
      aria-hidden
    >
      {name}
    </span>
  )
);
Icon.displayName = 'Icon';
export default Icon;
