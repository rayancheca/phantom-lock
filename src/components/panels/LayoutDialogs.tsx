import { useState } from 'react';
import Dialog from '../ui/Dialog';
import '../ui/ui.css';

const clampDim = (n: number) => Math.max(2, Math.min(25, n));

interface RoomSizeDialogProps {
  title: string;
  submitLabel: string;
  askName?: { label: string; placeholder: string };
  onSubmit: (w: number, d: number, name?: string) => void;
  onClose: () => void;
}

/** Width × depth entry with a live area preview — replaces prompt('4 x 5'). */
export function RoomSizeDialog({ title, submitLabel, askName, onSubmit, onClose }: RoomSizeDialogProps) {
  const [w, setW] = useState('4');
  const [d, setD] = useState('5');
  const [name, setName] = useState('');
  const wNum = parseFloat(w.replace(',', '.'));
  const dNum = parseFloat(d.replace(',', '.'));
  const valid = Number.isFinite(wNum) && Number.isFinite(dNum) && wNum > 0 && dNum > 0;

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit(clampDim(wNum), clampDim(dNum), askName ? name : undefined);
        }}
      >
        {askName && (
          <div className="dialog-fields">
            <label className="dialog-field">
              <span>{askName.label}</span>
              <input type="text" value={name} placeholder={askName.placeholder} maxLength={32} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
        )}
        <div className="dialog-fields">
          <label className="dialog-field">
            <span>Width (m)</span>
            <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
          </label>
          <label className="dialog-field">
            <span>Depth (m)</span>
            <input inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
        </div>
        <p className="dialog-preview">
          {valid
            ? `${clampDim(wNum).toFixed(1)} m × ${clampDim(dNum).toFixed(1)} m ≈ ${(clampDim(wNum) * clampDim(dNum)).toFixed(0)} m²`
            : 'Enter both sides in metres.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface RenameDialogProps {
  name: string;
  title?: string;
  fieldLabel?: string;
  submitLabel?: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function RenameDialog({
  name,
  title = 'Rename layout',
  fieldLabel = 'Layout name',
  submitLabel = 'Rename',
  placeholder,
  onSubmit,
  onClose,
}: RenameDialogProps) {
  const [value, setValue] = useState(name);
  const trimmed = value.trim();

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed.slice(0, 48));
        }}
      >
        <div className="dialog-fields">
          <label className="dialog-field">
            <span>{fieldLabel}</span>
            <input
              type="text"
              value={value}
              maxLength={48}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!trimmed}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface CalibrateDialogProps {
  measured: number;
  onSubmit: (realMetres: number) => void;
  onClose: () => void;
}

/** Floating (non-modal) so both calibration points stay visible on canvas. */
export function CalibrateDialog({ measured, onSubmit, onClose }: CalibrateDialogProps) {
  const [value, setValue] = useState('4');
  const real = parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(real) && real > 0;

  return (
    <Dialog title="Set the scale" modal={false} onClose={onClose}>
      <p className="dialog-sub">
        Those two points measure {measured.toFixed(2)} m on the plan right now. What is the real
        distance between them?
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(real);
        }}
      >
        <div className="dialog-fields">
          <label className="dialog-field">
            <span>Real distance (m)</span>
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Apply scale
          </button>
        </div>
      </form>
    </Dialog>
  );
}
