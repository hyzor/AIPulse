import { AlertCircle, CheckCircle2, Brain, Cpu, Code2, Rocket, Gauge } from 'lucide-react';
import { RateLimitStatus } from '../types';

interface StatusBarProps {
  totalStocks: number;
  apiConfigured: boolean | null;
  error: string | null;
  rateLimit?: RateLimitStatus | null;
}

export function StatusBar({ totalStocks, apiConfigured, error, rateLimit }: StatusBarProps) {
  // Determine rate limit color based on usage
  const getRateLimitColor = (percent: number) => {
    if (percent >= 80) return 'text-neon-red';
    if (percent >= 60) return 'text-yellow-400';
    return 'text-neon-green';
  };

  return (
    <div className="bg-dark-900 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Stock Count */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Brain className="w-4 h-4 text-neon-purple" />
              <span className="text-sm text-gray-300">
                <span className="font-bold text-white">{totalStocks}</span> AI stocks tracked
              </span>
            </div>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Cpu className="w-4 h-4 text-neon-blue" />
              <span className="text-sm text-gray-300">Semiconductors</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Code2 className="w-4 h-4 text-neon-green" />
              <span className="text-sm text-gray-300">AI Software</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Rocket className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-gray-300">Tech Giants</span>
            </div>
          </div>

          {/* Rate Limit Indicator */}
          {rateLimit && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600 ${getRateLimitColor(rateLimit.percentUsed)}`}>
                <Gauge className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {rateLimit.callsRemaining}/{rateLimit.maxPerMinute} calls
                </span>
              </div>
            </div>
          )}

          {/* API Status */}
          {apiConfigured !== null && (
            <div className="flex items-center gap-2">
              {apiConfigured ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-green/10 rounded-lg border border-neon-green/30">
                  <CheckCircle2 className="w-4 h-4 text-neon-green" />
                  <span className="text-sm text-neon-green font-medium">API Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-red/10 rounded-lg border border-neon-red/30">
                  <AlertCircle className="w-4 h-4 text-neon-red" />
                  <span className="text-sm text-neon-red font-medium">API Not Configured</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-neon-red/10 border border-neon-red/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-neon-red flex-shrink-0" />
            <p className="text-sm text-neon-red">{error}</p>
          </div>
        )}

        {/* Rate Limit Warning */}
        {rateLimit && rateLimit.percentUsed >= 80 && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-400">
              Approaching rate limit! ({rateLimit.percentUsed}% used) - Will use cached data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
