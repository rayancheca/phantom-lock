import type { SpeakerModel, ToolMode } from '../../engine/types';
import type { AppMode, DesignSubStep } from '../app/mode';
import './panels.css';

interface Props {
  appMode: AppMode;
  designSubStep: DesignSubStep;
  mode: ToolMode;
  placeModel: SpeakerModel;
  onTool: (m: ToolMode) => void;
  onPlaceSpeaker: (m: SpeakerModel) => void;
  onResetView: () => void;
}

const ICONS: Record<string, string> = {
  select: 'M6 3 L18 12 L12 13.5 L15 20 L12.5 21 L9.5 14.5 L6 18 Z',
  wall: 'M4 20 L20 4 M4 20 l0 -3 M20 4 l-3 0',
  rect: 'M5 7 h14 v10 h-14 Z',
  circle: 'M12 5 a7 7 0 1 0 0.001 0 Z',
  speaker: 'M12 4 a8 8 0 0 1 8 8 M12 8 a4 4 0 0 1 4 4 M12 12 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0',
  fit: 'M4 9 V4 h5 M15 4 h5 v5 M20 15 v5 h-5 M9 20 H4 v-5',
  marquee: 'M5 5 h4 M11 5 h4 M17 5 h2 v2 M19 11 v4 M19 17 v2 h-2 M13 19 h-4 M7 19 H5 v-2 M5 13 V9',
  lasso: 'M12 4 c4.5 0 8 2.2 8 5 s-3.5 5 -8 5 -8 -2.2 -8 -5 3.5 -5 8 -5 Z M8.5 13.5 C7 16 7 18.5 8.5 20.5',
};

function ToolButton({
  icon,
  label,
  title,
  kbd,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  title: string;
  kbd?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`strip-btn ${active ? 'strip-active' : ''}`}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={icon} />
      </svg>
      <span>{label}</span>
      {kbd && <span className="strip-kbd">{kbd}</span>}
    </button>
  );
}

export default function Toolbar({
  appMode,
  designSubStep,
  mode,
  placeModel,
  onTool,
  onPlaceSpeaker,
  onResetView,
}: Props) {
  const isSpeakerTool = (m: SpeakerModel) => mode === 'speaker' && placeModel === m;
  const isBuild = appMode === 'design' && designSubStep === 'build';
  const isFurnish = appMode === 'design' && designSubStep === 'furnish';

  return (
    <div className="toolstrip" role="toolbar" aria-label="Canvas tools">
      <ToolButton
        icon={ICONS.select}
        label="Move"
        kbd="1"
        title="Select & move anything (1)"
        active={mode === 'select'}
        onClick={() => onTool('select')}
      />
      <ToolButton
        icon={ICONS.marquee}
        label="Box select"
        title="Drag a box to select everything inside (⇧ adds to the selection)"
        active={mode === 'marquee'}
        onClick={() => onTool('marquee')}
      />
      <ToolButton
        icon={ICONS.lasso}
        label="Lasso"
        title="Draw around objects to select them (⇧ adds to the selection)"
        active={mode === 'lasso'}
        onClick={() => onTool('lasso')}
      />
      {isBuild && (
        <ToolButton
          icon={ICONS.wall}
          label="Draw walls"
          kbd="2"
          title="Click corner by corner; click the first corner to close (2)"
          active={mode === 'wall'}
          onClick={() => onTool('wall')}
        />
      )}
      {isFurnish && (
        <>
          <ToolButton
            icon={ICONS.rect}
            label="Box"
            kbd="3"
            title="Drag to draw a box — couch, desk, cabinet… (3)"
            active={mode === 'rect'}
            onClick={() => onTool('rect')}
          />
          <ToolButton
            icon={ICONS.circle}
            label="Circle"
            kbd="4"
            title="Drag from the centre to draw a round object (4)"
            active={mode === 'circle'}
            onClick={() => onTool('circle')}
          />
        </>
      )}
      {appMode === 'tune' && (
        <>
          <ToolButton
            icon={ICONS.speaker}
            label="+ HomePod"
            kbd="5"
            title="Click the canvas to place a HomePod (5)"
            active={isSpeakerTool('homepod')}
            onClick={() => onPlaceSpeaker('homepod')}
          />
          <ToolButton
            icon={ICONS.speaker}
            label="+ mini"
            title="Click the canvas to place a HomePod mini"
            active={isSpeakerTool('homepod-mini')}
            onClick={() => onPlaceSpeaker('homepod-mini')}
          />
        </>
      )}
      <div className="strip-sep" aria-hidden="true" />
      <ToolButton icon={ICONS.fit} label="Fit" title="Fit the room to the view" onClick={onResetView} />
    </div>
  );
}
