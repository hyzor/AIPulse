export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (value >= 1e12) {
    return (value / 1e12).toFixed(2) + 'T';
  }
  if (value >= 1e9) {
    return (value / 1e9).toFixed(2) + 'B';
  }
  if (value >= 1e6) {
    return (value / 1e6).toFixed(2) + 'M';
  }
  if (value >= 1e3) {
    return (value / 1e3).toFixed(2) + 'K';
  }
  return value.toFixed(2);
}

export function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getChangeColor(value: number): string {
  return value >= 0 ? 'text-neon-green' : 'text-neon-red';
}

export function getChangeBgColor(value: number): string {
  return value >= 0 ? 'bg-neon-green/10' : 'bg-neon-red/10';
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
