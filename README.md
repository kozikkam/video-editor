# Video Editor

A WASM-powered video editor built with React, using non-destructive EDL (Edit Decision List) editing.

## Architecture

This project uses a **non-destructive editing** approach:
- Video files are never modified during editing
- All edits are stored as metadata (EDL)
- Preview uses native HTML5 video seeking for instant playback
- MediaRecorder is used to export the video in WebM format

## Tech Stack

- **React 19** - UI framework
- **Radix UI + shadcn/ui** - Accessible component primitives with styled components
- **Zustand** - State management
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **pnpm workspaces** - Monorepo management

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 8

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

This starts the demo app at http://localhost:3000

### Build Library

```bash
pnpm build:core
```

## Core Concepts

### Sources
Video files are added via drag & drop. Each source gets:
- An `objectUrl` created via `URL.createObjectURL(file)` for instant preview
- Metadata extracted (duration, dimensions)

### Edit Decision List (EDL)
All edits are metadata changes:
```typescript
interface TimelineClip {
  id: string;
  sourceId: string;
  /** The start time within the source video (where playback begins in the original file) */
  sourceInPointSeconds: number;
  /** The end time within the source video (where playback ends in the original file) */
  sourceOutPointSeconds: number;
  /** The position on the timeline where this clip starts (independent of the source video's timing) */
  timelinePositionSeconds: number;
  trimmed: TrimmedRegions;
}
```

## Using the Library

```tsx
import { VideoEditor } from '@video-editor/core';

function App() {
  return <VideoEditor />;
}
```

Or use individual components:

```tsx
import {
  DropZone,
  Timeline,
  VideoPreview,
  Toolbar,
  useTimeline,
  usePlayback,
  useSources,
} from '@video-editor/core';
```

## Keyboard Shortcuts

- **Space** - Play/Pause
- **Arrow Left/Right** - Seek 1s (hold Shift for 5s)
- **Home/End** - Jump to start/end
- **Delete/Backspace** - Delete selected clip
- **S** - Split clip at playhead
