import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: string;
  delay?: number;
}

export function Tooltip({
  children,
  content,
  position = 'top',
  maxWidth = '400px',
  delay = 300,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const calculatePosition = () => {
    if (!triggerRef.current) {
      return { x: 0, y: 0 };
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const offset = 8;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - offset;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + offset;
        break;
      case 'left':
        x = rect.left - offset;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + offset;
        y = rect.top + rect.height / 2;
        break;
    }

    // Adjust for viewport boundaries
    const padding = 8;
    x = Math.max(padding, Math.min(x, window.innerWidth - padding));
    y = Math.max(padding, Math.min(y, window.innerHeight - padding));

    return { x, y };
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setCoords(calculatePosition());
      setIsMounted(true);
      setTimeout(() => setIsVisible(true), 10);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
    setTimeout(() => setIsMounted(false), 150);
  };

  const getTransformOrigin = () => {
    switch (position) {
      case 'top': return 'translate(-50%, -100%)';
      case 'bottom': return 'translate(-50%, 0)';
      case 'left': return 'translate(-100%, -50%)';
      case 'right': return 'translate(0, -50%)';
    }
  };

  const getArrowPosition = () => {
    switch (position) {
      case 'top':
        return {
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderColor: 'transparent transparent transparent transparent',
          borderTopColor: '#374151',
        };
      case 'bottom':
        return {
          top: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderColor: 'transparent transparent transparent transparent',
          borderBottomColor: '#374151',
        };
      case 'left':
        return {
          right: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderColor: 'transparent transparent transparent transparent',
          borderLeftColor: '#374151',
        };
      case 'right':
        return {
          left: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderColor: 'transparent transparent transparent transparent',
          borderRightColor: '#374151',
        };
    }
  };

  const tooltip = (
    <div
      className={`
        fixed z-[9999] pointer-events-none
        transition-all duration-150 ease-out
        ${isVisible ? 'opacity-100' : 'opacity-0 translate-y-1'}
      `}
      style={{
        left: coords.x,
        top: coords.y,
        transform: getTransformOrigin(),
        maxWidth,
      }}
    >
      <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-gray-300 leading-relaxed whitespace-normal">{content}</p>
        <div
          className="absolute w-0 h-0 border-4"
          style={{
            ...getArrowPosition(),
            borderStyle: 'solid',
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isMounted && createPortal(tooltip, document.body)}
    </div>
  );
}

interface InfoTooltipProps {
  content: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function InfoTooltip({ content, size = 'sm', className = '' }: InfoTooltipProps) {
  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  return (
    <Tooltip content={content} position="top">
      <svg
        className={`${sizeClasses[size]} text-gray-500 hover:text-gray-400 cursor-help transition-colors ${className}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </Tooltip>
  );
}
