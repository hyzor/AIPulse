interface FlagIconProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

export function FlagIcon({ countryCode, size = 'md', className = '', title }: FlagIconProps) {
  const sizeMap = { sm: 'w-4', md: 'w-5', lg: 'w-6' };
  const widthClass = sizeMap[size];

  return (
    <img
      src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
      alt={title || countryCode.toUpperCase()}
      title={title}
      className={`${widthClass} aspect-[3/2] object-cover rounded-sm inline-block ${className}`}
      loading="lazy"
      onError={(e) => {
        // Fallback: hide image and show text code instead
        e.currentTarget.style.display = 'none';
        const nextSibling = e.currentTarget.nextElementSibling as HTMLElement;
        if (nextSibling) {
          nextSibling.style.display = 'inline';
        }
      }}
    />
  );
}

export function FlagIconWithFallback({ countryCode, size = 'md', className = '', title }: FlagIconProps) {
  return (
    <span className="inline-flex items-center">
      <FlagIcon countryCode={countryCode} size={size} className={className} title={title} />
      <span className="hidden text-xs">{countryCode.toUpperCase()}</span>
    </span>
  );
}
