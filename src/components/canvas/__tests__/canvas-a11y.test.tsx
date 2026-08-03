import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import CanvasStage from '../../app/CanvasStage';
import { CANVAS_HELP } from '../canvas-help';
import { expectNoAxeViolations, expectNoAxeViolationsOnPage } from '../../../test/axe';
import { apartmentScene } from '../../../engine/scene';
import { traceScene } from '../../../engine/raytrace';
import { computeAudio } from '../../../engine/stereo';
import type { SimSettings } from '../../../engine/types';

afterEach(cleanup);

const settings: SimSettings = {
  rayCount: 60,
  maxBounces: 2,
  decay: 0.22,
  display: 'rays',
  showTriangle: true,
  showBestSpot: false,
  snap: true,
  tvAnchor: true,
};

const noop = () => {};

function renderStage(over: Record<string, unknown> = {}) {
  const scene = apartmentScene();
  const trace = traceScene(scene, settings.rayCount, settings.maxBounces);
  const audio = computeAudio(scene, trace, settings.tvAnchor);
  return render(
    <CanvasStage
      scene={scene}
      settings={settings}
      selection={null}
      mode="select"
      theme="sound"
      placeModel="homepod"
      trace={trace}
      audio={audio}
      proposal={null}
      canvasProposalObjects={null}
      bestSpot={null}
      resetViewToken={0}
      overlayOpen={false}
      onScene={noop}
      onSelection={noop}
      onDragging={noop}
      onCalibrate={noop}
      onRoomDrawn={noop}
      onSplitWall={noop}
      onSeatAgainstWall={noop}
      onActivateSeat={noop}
      onNotice={noop}
      appMode="tune"
      designSubStep="build"
      onTool={noop}
      onPlaceSpeaker={noop}
      onResetView={noop}
      onRotateSel={noop}
      onNudgeSel={noop}
      onDeleteSel={noop}
      showStarter={false}
      onStarterRectRoom={noop}
      onStarterDrawWalls={noop}
      onStarterApartment={noop}
      onStarterImportPhoto={noop}
      optimizeOpen={false}
      optimizeDefaultMode="music"
      optimizeRooms={[]}
      optimizeWillReplace={false}
      onRunOptimizer={noop}
      onApplyProposal={noop}
      onCloseOptimize={noop}
      arrangeOpen={false}
      arrangeResult={null}
      onSuggestInventory={() => ({ items: [], reasons: [] })}
      onRunArrange={noop}
      onApplyArrange={noop}
      onCloseArrange={noop}
      detection={{
        proposal: null,
        detecting: false,
        keptWalls: null,
        run: () => {},
        toggleWall: () => {},
        accept: () => {},
        discard: () => {},
      }}
      onTraceInstead={noop}
      {...over}
    />,
  );
}

describe('the canvas is a focusable, AT-legible widget (S7 deliverable 1)', () => {
  it('exposes the canvas as an application widget with an accessible name', () => {
    const { container } = renderStage();
    const canvas = container.querySelector('canvas.sim-canvas')!;
    expect(canvas.getAttribute('role')).toBe('application');
    expect(canvas.getAttribute('aria-label')).toBeTruthy();
    expect(canvas.getAttribute('aria-roledescription')).toBe('Floorplan editor');
  });

  it('is in the tab order', () => {
    const { container } = renderStage();
    expect(container.querySelector('canvas.sim-canvas')!.getAttribute('tabindex')).toBe('0');
  });

  it('LEAVES the tab order behind a blocking overlay', () => {
    // Otherwise a keyboard user tabs into a canvas that is visually covered and
    // whose keys the dispatcher is (correctly) refusing to act on.
    const { container } = renderStage({ overlayOpen: true });
    expect(container.querySelector('canvas.sim-canvas')!.getAttribute('tabindex')).toBe('-1');
  });

  it('resolves every aria-describedby IDREF to a real element', () => {
    const { container } = renderStage();
    const ids = container.querySelector('canvas.sim-canvas')!.getAttribute('aria-describedby')!.split(/\s+/);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(container.querySelector(`#${id}`)).not.toBeNull();
  });

  it('publishes the key map in the accessibility tree', () => {
    const { container } = renderStage();
    const help = container.querySelector('#sim-canvas-help')!;
    expect(help.textContent).toBe(CANVAS_HELP);
    // role="application" turns off browse mode, so the instructions are the only
    // way a screen-reader user learns the keys.
    expect(help.textContent).toMatch(/Press N for the next item/);
    expect(help.textContent).toMatch(/P places a speaker/);
    expect(help.textContent).toMatch(/D adds a door/);
    expect(help.textContent).toMatch(/F flips its hinge and Shift F flips its swing side/);
  });

  it('renders exactly one help element (the IDREF must be unambiguous)', () => {
    const { container } = renderStage();
    expect(container.querySelectorAll('#sim-canvas-help')).toHaveLength(1);
  });

  it('has no axe violations in TUNE', async () => {
    const { container } = renderStage();
    await expectNoAxeViolations(container);
  });

  it('has no axe violations in DESIGN on the plan theme', async () => {
    const { container } = renderStage({ appMode: 'design', theme: 'plan', mode: 'wall' });
    await expectNoAxeViolations(container);
  });

  it('has no axe violations with the detected-layout dialog open', async () => {
    const scene = apartmentScene();
    const walls = scene.objects.filter((o) => o.kind === 'wall').slice(0, 4);
    const { container } = renderStage({
      overlayOpen: true,
      detection: {
        proposal: {
          walls,
          rejected: new Set([walls[1].id]),
          sensitivity: 'balanced' as const,
          quality: {
            confidence: 0.82,
            refusal: null,
            wallCount: walls.length,
            support: 0.97,
            structure: 0.85,
            explained: 0.94,
            totalLength: 42,
          },
        },
        detecting: false,
        keptWalls: walls,
        run: noop,
        toggleWall: noop,
        accept: noop,
        discard: noop,
      },
    });
    // PAGE-WIDE, not the subtree runner: `landmark-unique` is a best-practice
    // rule the WCAG-tags-only run does not see, and this card adds a dialog
    // plus a fieldset over the still-mounted canvas (the S20 lesson).
    await expectNoAxeViolationsOnPage();
    expect(container.querySelectorAll('.detect-row')).toHaveLength(4);
  });

  it('has no axe violations with the empty-state starter showing', async () => {
    const { container } = renderStage({ showStarter: true, appMode: 'design' });
    await expectNoAxeViolations(container);
  });
});
