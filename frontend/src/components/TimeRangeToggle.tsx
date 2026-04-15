import { useTimeRange } from '../contexts/TimeRangeContext';

import type { TimeRange } from '../types';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  description: string;
}

const timeRangeOptions: TimeRangeOption[] = [
  { value: '1d', label: '1D', description: 'Today (intraday)' },
  { value: '7d', label: '7D', description: 'Last 7 sessions' },
  { value: '30d', label: '30D', description: 'Last 30 sessions' },
];

export function TimeRangeToggle() {
  const { timeRange, setTimeRange } = useTimeRange();

  return (
    <div className="flex items-center gap-2 bg-dark-800 rounded-lg p-1 border border-dark-700">
      {timeRangeOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => { setTimeRange(option.value); }}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
            ${timeRange === option.value
          ? 'bg-neon-blue text-dark-900 shadow-lg shadow-neon-blue/20'
          : 'text-gray-400 hover:text-white hover:bg-dark-700'
        }
          `}
          title={option.description}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
