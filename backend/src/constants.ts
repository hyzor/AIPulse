export const TRACKED_STOCKS = [
  // AI / Semiconductor
  'NVDA', // NVIDIA - AI chips leader
  'AMD', // AMD - CPUs/GPUs
  'AVGO', // Broadcom - semiconductors
  'TSM', // TSMC - chip manufacturing
  'ASML', // ASML - lithography equipment
  'ARM', // ARM Holdings - chip architecture
  'MU', // Micron - AI memory/HBM
  'SNDK', // SanDisk - AI flash storage

  // AI Software / Tech
  'MSFT', // Microsoft - Azure AI, OpenAI
  'GOOGL', // Google - AI research, Gemini
  'AMZN', // Amazon - AWS AI services
  'TSLA', // Tesla - AI/robotics, FSD
] as const;

export const STOCK_DISPLAY_NAMES: Record<string, string> = {
  NVDA: 'NVIDIA',
  AMD: 'AMD',
  AVGO: 'Broadcom',
  TSM: 'TSMC',
  ASML: 'ASML',
  ARM: 'ARM Holdings',
  MU: 'Micron',
  SNDK: 'SanDisk',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
};

export type TrackedStock = (typeof TRACKED_STOCKS)[number];
