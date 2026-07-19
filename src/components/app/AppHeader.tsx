import type { RefObject } from 'react';
import Icon from '../ui/Icon';
import WorkflowSteps, { type Step } from '../panels/WorkflowSteps';

interface AppHeaderProps {
  activeName: string;
  onOpenGallery: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
  step: Step;
  onStep: (s: Step) => void;
  stepDone: Record<Step, boolean>;
  tvAnchor: boolean;
  onSetTvAnchor: (on: boolean) => void;
  canCompare: boolean;
  onCompare: () => void;
  onSuggest: () => void;
}

/** The top bar: brand, layout switcher, workflow steps, TV/Music mode, compare + suggest. */
export default function AppHeader({
  activeName,
  onOpenGallery,
  fileRef,
  onImportFile,
  step,
  onStep,
  stepDone,
  tvAnchor,
  onSetTvAnchor,
  canCompare,
  onCompare,
  onSuggest,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" title="Phantom Lock — acoustic room planner">
          <h1>
            PHANTOM<span>LOCK</span>
          </h1>
        </div>
        <button
          type="button"
          className="room-trigger"
          title="All layouts — switch, create, manage"
          onClick={onOpenGallery}
        >
          <span className="room-trigger-name">{activeName}</span>
          <Icon name="layers" size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <WorkflowSteps step={step} onStep={onStep} done={stepDone} />

      <div className="topbar-actions">
        <div className="mode-toggle" role="group" aria-label="Listening mode">
          <button
            type="button"
            className={tvAnchor ? 'mode-on' : ''}
            aria-pressed={tvAnchor}
            title="Cinema: the phantom center must land on the TV — lock and sweet spot track the TV axis"
            onClick={() => onSetTvAnchor(true)}
          >
            <Icon name="film" size={14} />
            TV
          </button>
          <button
            type="button"
            className={!tvAnchor ? 'mode-on' : ''}
            aria-pressed={!tvAnchor}
            title="Music: the image anchors on you — the TV is ignored by locks and sweet spots"
            onClick={() => onSetTvAnchor(false)}
          >
            <Icon name="music" size={14} />
            Music
          </button>
        </div>
        {canCompare && (
          <button
            type="button"
            className="btn btn-compare"
            title="Compare two seats or two layouts side by side"
            onClick={onCompare}
          >
            <Icon name="grid" size={15} />
            <span>Compare</span>
          </button>
        )}
        <button type="button" className="btn btn-primary btn-suggest" onClick={onSuggest}>
          <Icon name="sparkles" size={15} />
          <span>Suggest placement</span>
        </button>
      </div>
    </header>
  );
}
