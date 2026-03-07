interface MaterialIconProps {
  name: string;
  className?: string;
}

/** Renders a Google Material Icon by name (e.g. "dashboard", "mail", "person"). */
export default function MaterialIcon({ name, className = '' }: MaterialIconProps) {
  return <span className={`material-icons ${className}`} aria-hidden>{name}</span>;
}
