import { afterEach, describe, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { expectNoAxeViolations } from '../../../test/axe';
import { apartmentScene } from '../../../engine/scene';
import { traceScene } from '../../../engine/raytrace';
import { computeAudio } from '../../../engine/stereo';
import type { SimSettings } from '../../../engine/types';
import Sidebar from '../../app/Sidebar';
import AppHeader from '../../app/AppHeader';
import Toolbar from '../Toolbar';
import Legend from '../../canvas/Legend';
import Toast from '../../ui/Toast';
import OptimizeDialog from '../OptimizeDialog';
import ArrangeDialog from '../ArrangeDialog';
import FirstRunExplainer from '../../app/FirstRunExplainer';

afterEach(cleanup);

const settings: SimSettings = {
  rayCount: 60,
  maxBounces: 2,
  decay: 0.22,
  display: 'rays',
  showTriangle: true,
  showBestSpot: true,
  snap: true,
  tvAnchor: true,
};

const noop = () => {};
const scene = apartmentScene();
const trace = traceScene(scene, settings.rayCount, settings.maxBounces);
const audio = computeAudio(scene, trace, settings.tvAnchor);

/* eslint-disable @typescript-eslint/no-explicit-any */
const sidebar = (over: Record<string, unknown> = {}) =>
  render(
    <Sidebar
      {...({
        scene,
        settings,
        selection: null,
        trace,
        audio,
        bestSpot: null,
        appMode: 'tune',
        designSubStep: 'build',
        canCompare: true,
        placeModel: 'homepod',
        onScene: noop,
        onSettings: noop,
        onSelection: noop,
        onSubStep: noop,
        onSwitchSeat: noop,
        onAddSeat: noop,
        onRenameSeat: noop,
        onRemoveSeat: noop,
        onCompare: noop,
        onOptimize: noop,
        onArrange: noop,
        onPlaceSpeaker: noop,
        onPairSpeakers: noop,
        onDeleteSpeaker: noop,
        onMatchTrims: noop,
        onUnderlay: noop,
        onClearUnderlay: noop,
        onCalibrate: noop,
        onDetect: noop,
        onAddPreset: noop,
        onRenameArea: noop,
        onRemoveArea: noop,
        onError: noop,
        onToast: noop,
        onCopyVerdict: noop,
        onExportImage: noop,
        detecting: false,
        ...over,
      } as any)}
    />,
  );
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('sidebar surfaces have no axe violations (S7 deliverable 4)', () => {
  it('TUNE — verdict hero, spec sheet, speakers, seats, controls, echogram', async () => {
    const { container } = sidebar({ appMode: 'tune' });
    await expectNoAxeViolations(container);
  });

  it('DESIGN / build — the Build sub-step column', async () => {
    const { container } = sidebar({ appMode: 'design', designSubStep: 'build' });
    await expectNoAxeViolations(container);
  });

  it('DESIGN / furnish — the furniture palette column', async () => {
    const { container } = sidebar({ appMode: 'design', designSubStep: 'furnish' });
    await expectNoAxeViolations(container);
  });

  it('TUNE with a speaker selected — the inspector', async () => {
    const { container } = sidebar({
      appMode: 'tune',
      selection: { type: 'speaker', id: scene.speakers[0]?.id ?? 'x' },
    });
    await expectNoAxeViolations(container);
  });
});

describe('chrome surfaces have no axe violations', () => {
  it('the global header', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { container } = render(
      <AppHeader
        {...({
          layouts: [{ id: 'l1', name: 'Maple Court', scene, settings, updatedAt: 0 }],
          activeId: 'l1',
          appMode: 'tune',
          canUndo: true,
          canRedo: false,
          onSwitchLayout: noop,
          onOpenGallery: noop,
          onMode: noop,
          onUndo: noop,
          onRedo: noop,
        } as any)}
      />,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await expectNoAxeViolations(container);
  });

  it('the toolbar', async () => {
    const { container } = render(
      <Toolbar
        appMode="design"
        designSubStep="build"
        mode="wall"
        placeModel="homepod"
        onTool={noop}
        onPlaceSpeaker={noop}
        onResetView={noop}
      />,
    );
    await expectNoAxeViolations(container);
  });

  it('the on-canvas legend, collapsed and expanded', async () => {
    const { container } = render(<Legend appMode="tune" settings={settings} />);
    await expectNoAxeViolations(container);
    await act(async () => {
      (container.querySelector('.legend-toggle') as HTMLButtonElement).click();
    });
    await expectNoAxeViolations(container);
  });

  it('a destructive toast (assertive) and an informational one', async () => {
    for (const tone of ['bad', 'ok', 'default'] as const) {
      const { container } = render(
        <Toast toast={{ id: 1, message: 'Something happened', tone }} onDismiss={noop} />,
      );
      await expectNoAxeViolations(container);
      cleanup();
    }
  });
});

describe('overlay surfaces have no axe violations', () => {
  it('the optimizer', async () => {
    const { container } = render(
      <OptimizeDialog
        proposal={null}
        defaultMode="music"
        rooms={[]}
        willReplace={false}
        onRun={noop}
        onApply={noop}
        onClose={noop}
      />,
    );
    await expectNoAxeViolations(container);
  });

  it('the arrange dialog', async () => {
    const { container } = render(
      <ArrangeDialog
        proposal={null}
        onSuggestInventory={() => ({ items: [], reasons: [] })}
        onRun={noop}
        onApply={noop}
        onClose={noop}
      />,
    );
    await expectNoAxeViolations(container);
  });

  it('the first-run explainer', async () => {
    const { container } = render(<FirstRunExplainer onDismiss={noop} />);
    await expectNoAxeViolations(container);
  });
});
