export type Node = {
  id: string;
  x: number;
  y: number;
  name: string;
  summary: string;
  type: string;
  filePath?: string; // Absolute path of the local OS file
  folderId?: string;
  radius?: number; // Optional radius for improved arrow intersection math
  tags?: string[];
  color?: string; // Tailwind color class or hex for aesthetic coloring
  isReadonly?: boolean; // Determines if user can rename or edit content
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  color?: string;
  routing?: 'straight' | 'bezier' | 'step';
  stroke?: 'solid' | 'dashed' | 'dotted';
};

export type Folder = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  tags?: string[];
  color?: string;
};

export type Transform = {
  x: number;
  y: number;
  scale: number;
};

export type CommandDefinition = {
  name: string;
  description: string;
  args: string[];
};

export type CliState = {
  history: string[];
  historyIndex: number;
  currentInput: string;
};
