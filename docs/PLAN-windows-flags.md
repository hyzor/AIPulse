# Windows Flag Display Fix - Implementation Plan

## Problem
Windows OS does not natively support country flag emojis. They display as regional indicator letters ("US", "GB", "TW", "NL") instead of actual flag images 🇺🇸🇬🇧🇹🇼🇳🇱.

This affects all Windows browsers (Chrome, Brave, Edge, Firefox).

## Solution: SVG Flag Icons

### Option A: FlagCDN (Simplest)
Use FlagCDN service to load flag images by country code:
- URL format: `https://flagcdn.com/w40/{country_code}.png`
- Example: `https://flagcdn.com/w40/us.png` for USA
- Pros: No dependencies, always up-to-date
- Cons: External dependency, requires internet

### Option B: country-flag-icons Package
Install npm package with SVG flags:
```bash
npm install country-flag-icons
```
Usage:
```tsx
import { US, GB, TW, NL } from 'country-flag-icons/react/3x2'

// In component
<US title="United States" className="w-6 h-4" />
```

Pros: Works offline, SVG (scalable), React components
Cons: Adds bundle size (~200KB for all flags)

### Option C: Custom SVG Icons
Add SVG flag files to `frontend/public/flags/` directory:
- `flags/us.svg`
- `flags/gb.svg`
- `flags/tw.svg`
- `flags/nl.svg`
- etc.

Pros: Full control, no external dependencies
Cons: Need to collect/maintain 15 flag SVGs

## Implementation Plan

### 1. Update STOCK_COUNTRIES constant
Add country code mapping:
```typescript
export const STOCK_COUNTRIES: Record<string, { 
  country: string; 
  flag: string; 
  origin: string;
  countryCode: string; // ISO 3166-1 alpha-2
}> = {
  NVDA: { country: 'United States', flag: '🇺🇸', origin: 'Santa Clara, CA', countryCode: 'us' },
  AMD: { country: 'United States', flag: '🇺🇸', origin: 'Sunnyvale, CA', countryCode: 'us' },
  TSM: { country: 'Taiwan', flag: '🇹🇼', origin: 'Hsinchu, Taiwan', countryCode: 'tw' },
  ASML: { country: 'Netherlands', flag: '🇳🇱', origin: 'Veldhoven, Netherlands', countryCode: 'nl' },
  ARM: { country: 'United Kingdom', flag: '🇬🇧', origin: 'Cambridge, UK', countryCode: 'gb' },
  // ... etc
};
```

### 2. Create FlagIcon Component
```tsx
// components/FlagIcon.tsx
interface FlagIconProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Option A: FlagCDN
export function FlagIcon({ countryCode, size = 'md', className }: FlagIconProps) {
  const sizeMap = { sm: 'w-4', md: 'w-6', lg: 'w-8' };
  return (
    <img 
      src={`https://flagcdn.com/w40/${countryCode}.png`}
      alt={countryCode.toUpperCase()}
      className={`${sizeMap[size]} aspect-[3/2] object-cover rounded-sm ${className}`}
      loading="lazy"
    />
  );
}

// Option B: country-flag-icons package
// import { Flags } from 'country-flag-icons/react/3x2'
// export function FlagIcon({ countryCode, size = 'md' }: FlagIconProps) {
//   const FlagComponent = Flags[countryCode.toUpperCase()];
//   return FlagComponent ? <FlagComponent className="rounded-sm" /> : null;
// }
```

### 3. Update StockCard Component
Replace emoji span with FlagIcon:
```tsx
// Old
<span className="flag-emoji" title={STOCK_COUNTRIES[quote.symbol]?.country}>
  {STOCK_COUNTRIES[quote.symbol]?.flag}
</span>

// New
<FlagIcon 
  countryCode={STOCK_COUNTRIES[quote.symbol]?.countryCode || 'us'}
  size="md"
  title={STOCK_COUNTRIES[quote.symbol]?.country}
/>
```

### 4. Update DataCollectionStatus Component
Replace emoji spans with FlagIcon in the symbol list.

### 5. Add Fallback
For systems that block external images:
```tsx
<img 
  src={`https://flagcdn.com/w40/${countryCode}.png`}
  onError={(e) => {
    // Fallback to text code if image fails
    e.currentTarget.style.display = 'none';
    e.currentTarget.nextSibling.style.display = 'inline';
  }}
/>
<span style={{ display: 'none' }}>{countryCode.toUpperCase()}</span>
```

## Priority
**Low** - Current emoji system works on Linux/Mac. Windows users see text codes which is acceptable.

## Estimated Effort
- 30-60 minutes for Option A (FlagCDN)
- 1-2 hours for Option B (npm package)
- 2-3 hours for Option C (custom SVGs)

## Related Files to Modify
1. `frontend/src/types/index.ts` - Add countryCode to STOCK_COUNTRIES
2. `frontend/src/components/StockCard.tsx` - Replace emoji with FlagIcon
3. `frontend/src/components/DataCollectionStatus.tsx` - Replace emoji with FlagIcon
4. `frontend/src/components/FlagIcon.tsx` - New component (for Option A/B)

## Notes
- Taiwan flag (🇹🇼) may not be available on all flag services due to political reasons
- Netherlands flag may show as "NL" on some services instead of 🇳🇱
- Consider caching flag images locally if using FlagCDN
