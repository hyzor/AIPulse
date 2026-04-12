interface LoadingSkeletonProps {
  width?: number;
  height?: number;
}

export function LoadingSkeleton({ width = 300, height = 80 }: LoadingSkeletonProps) {
  return (
    <div
      className="bg-dark-800/50 rounded animate-pulse"
      style={{ width, height }}
    >
      <div className="w-full h-full bg-gradient-to-r from-dark-700/50 via-dark-600/50 to-dark-700/50" />
    </div>
  );
}
