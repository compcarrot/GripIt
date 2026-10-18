import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { emptyThrow, sampleSession, validateThrow } from "./rapsodo";
import type { ThrowDraft } from "./rapsodo";
import type { Measurements } from "./grip";
import { isNativeHost } from "./download";
import { saveRapsodoSession } from "./rapsodoSession";
import "./session.css";

interface Props {
  pitchId: string;
  pitchName: string;
  left: boolean;
  personalized: boolean;
  measurements: Measurements;
  onBack: () => void;
}

export function SessionPanel({
  pitchId,
  pitchName,
  left,
  personalized,
  measurements,
  onBack,
}: Props) {
  const native = isNativeHost();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  // A new scan gets a separate draft so old throws cannot attach to a new hand.
  const [sessions, setSessions] = useState<
    Record<string, { rows: ThrowDraft[]; sample: boolean }>
  >({});
  const key = `${pitchId}-${left ? "left" : "right"}-${personalized ? "scan" : "sample"}-${JSON.stringify(measurements)}`;
  const session = sessions[key] ?? { rows: [emptyThrow(1)], sample: false };
  const { rows, sample } = session;
  const [attempted, setAttempted] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setAttempted(false);
    setReviewed(false);
    setTouched({});
  }, [key]);
  useEffect(() => {
    if (reviewed) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [reviewed]);
  const update = (nextRows: ThrowDraft[], nextSample = sample) => {
    setSessions((prev) => ({
      ...prev,
      [key]: { rows: nextRows, sample: nextSample },
    }));
    setReviewed(false);
  };
  const validated = rows.map(validateThrow);
  const validThrows = validated.flatMap((row) =>
    row.value ? [row.value] : [],
  );
  const valid = validThrows.length === rows.length;
  const change = (id: number, field: keyof ThrowDraft, value: string) =>
    update(
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  const reset = () => {
    update([emptyThrow(1)], false);
    setAttempted(false);
    setTouched({});
  };
  const exportSession = () => {
    saveRapsodoSession(
      { pitchId, left, personalized, measurements },
      rows,
      sample,
    );
  };

  return (
    <section className="throw-session" aria-labelledby="session-heading">
      <button
        className="session-back"
        onClick={() => {
          setReviewed(false);
          onBack();
        }}
      >
        <ArrowLeft size={16} /> Back to grip studio
      </button>
      <div className="session-steps" aria-label="Session progress">
        <span>
          <Check size={14} /> Your grip
        </span>
        <i />
        <span className="current">02 / Throw & record</span>
      </div>
      <div className="session-title-row">
        <div>
          <span className="eyebrow">FROM GRIP TO GAME</span>
          <h1 id="session-heading">
            Your next pitch.
            <br />
            <em>By the numbers.</em>
          </h1>
          <p>
            Throw when you’re ready. Enter the numbers from your Rapsodo screen.
          </p>
        </div>
        <div className="session-context">
          <span className="eyebrow">YOUR SETUP</span>
          <strong>{pitchName}</strong>
          <span>
            {left ? "Left" : "Right"}-handed ·{" "}
            {personalized ? "Scanned hand" : "Sample hand"}
          </span>
          <button onClick={onBack}>
            Change grip <ArrowLeft size={13} />
          </button>
        </div>
      </div>

      <div className="session-layout">
        <div className="session-main">
          <div className="session-card">
            <div className="session-card-top">
              <div>
                <span className="eyebrow">RAPSODO / MANUAL ENTRY</span>
                <h2>Record your throws</h2>
              </div>
              <span className="session-count">
                {rows.length} {rows.length === 1 ? "throw" : "throws"}
              </span>
            </div>
            <p className="session-hint">
              One throw is enough to start. Add at least three for future
              consistency analysis.
            </p>
            <div className="sample-tools">
              <span>Just exploring the prototype?</span>
              <button
                data-testid="load-sample-session"
                onClick={() => {
                  update(sampleSession(), true);
                  setAttempted(false);
                  setTouched({});
                }}
              >
                Load sample session <ArrowRight size={14} />
              </button>
            </div>
            {sample && (
              <div className="sample-banner" role="status">
                <strong>DEMO DATA</strong> These are made-up throws for testing,
                not your results.
                <button onClick={reset}>Start my own session</button>
              </div>
            )}

            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setAttempted(true);
                if (valid) setReviewed(true);
                else
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLInputElement>(
                        ".throw-session [aria-invalid='true']",
                      )
                      ?.focus(),
                  );
              }}
            >
              <div className="throw-rows">
                {rows.map((row, i) => {
                  const fields = [
                    {
                      key: "velocity_mph",
                      label: "Velocity",
                      unit: "mph",
                      placeholder: "e.g. 78",
                      min: 1,
                      max: 120,
                    },
                    {
                      key: "spin_rate_rpm",
                      label: "Total spin",
                      unit: "rpm",
                      placeholder: "e.g. 2100",
                      min: 0,
                      max: 5000,
                    },
                    {
                      key: "spin_direction",
                      label: "Spin direction",
                      unit: "hh:mm",
                      placeholder: "e.g. 12:30",
                    },
                    {
                      key: "spin_value",
                      label:
                        row.efficiencyMode === "efficiency"
                          ? "Spin efficiency"
                          : "Gyro degree",
                      unit: row.efficiencyMode === "efficiency" ? "%" : "°",
                      placeholder:
                        row.efficiencyMode === "efficiency"
                          ? "e.g. 88"
                          : "e.g. 15",
                      min: row.efficiencyMode === "gyro" ? -90 : 0,
                      max: row.efficiencyMode === "gyro" ? 90 : 100,
                    },
                    {
                      key: "release_height_ft",
                      label: "Release height",
                      unit: "ft",
                      placeholder: "e.g. 5.4",
                      min: 0,
                      max: 10,
                    },
                  ] as const;
                  return (
                    <fieldset className="throw-row" key={row.id}>
                      <legend>Throw {i + 1}</legend>
                      <div className="throw-row-toolbar">
                        <label>
                          Spin measurement
                          <select
                            aria-label={`Throw ${i + 1} spin measurement`}
                            value={row.efficiencyMode}
                            onChange={(event) => {
                              update(
                                rows.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        efficiencyMode: event.target
                                          .value as ThrowDraft["efficiencyMode"],
                                        spin_value: "",
                                      }
                                    : r,
                                ),
                              );
                            }}
                          >
                            <option value="efficiency">Efficiency (%)</option>
                            <option value="gyro">Gyro degree (°)</option>
                          </select>
                        </label>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            className="remove-throw"
                            aria-label={`Remove throw ${i + 1}`}
                            onClick={() =>
                              update(rows.filter((r) => r.id !== row.id))
                            }
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        )}
                      </div>
                      <div className="throw-fields">
                        {fields.map((field) => {
                          const id = `throw-${row.id}-${field.key}`;
                          const error =
                            attempted || touched[id]
                              ? validated[i].errors[field.key]
                              : undefined;
                          return (
                            <div className="throw-field" key={field.key}>
                              <label htmlFor={id}>
                                {field.label} <span>{field.unit}</span>
                              </label>
                              <input
                                id={id}
                                aria-label={`Throw ${i + 1} ${field.label}`}
                                type={
                                  field.key === "spin_direction"
                                    ? "text"
                                    : "number"
                                }
                                inputMode={
                                  field.key === "spin_direction" ||
                                  (field.key === "spin_value" &&
                                    row.efficiencyMode === "gyro")
                                    ? "text"
                                    : "decimal"
                                }
                                step="any"
                                {...("min" in field
                                  ? { min: field.min, max: field.max }
                                  : {})}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                value={row[field.key]}
                                placeholder={field.placeholder}
                                aria-invalid={Boolean(error)}
                                aria-describedby={
                                  error ? `${id}-error` : undefined
                                }
                                onBlur={() =>
                                  setTouched((prev) => ({
                                    ...prev,
                                    [id]: true,
                                  }))
                                }
                                onChange={(event) =>
                                  change(row.id, field.key, event.target.value)
                                }
                              />
                              {error && (
                                <small
                                  className="field-error"
                                  id={`${id}-error`}
                                >
                                  {error}
                                </small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <button
                className="add-throw"
                type="button"
                onClick={() =>
                  update([
                    ...rows,
                    emptyThrow(Math.max(...rows.map((r) => r.id)) + 1),
                  ])
                }
              >
                <Plus size={16} /> Add another throw
              </button>
              {attempted && !valid && (
                <p className="session-errors" role="alert">
                  Check the highlighted fields before reviewing your session.
                </p>
              )}
              <div className="session-actions">
                <span>
                  {native
                    ? "Your entries stay on this device while the app is open."
                    : "Your data stays in this browser tab."}
                  <br />
                  Save the session before closing
                  {native ? "." : " or refreshing."}
                </span>
                <button
                  className="primary"
                  type="submit"
                  data-testid="review-session"
                >
                  Review session <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>

          {reviewed && valid && (
            <section
              className="session-review"
              aria-labelledby="review-heading"
              role="status"
            >
              <span className="eyebrow">
                {sample ? "SAMPLE SESSION" : "SESSION READY"}
              </span>
              <h2 id="review-heading" ref={reviewHeading} tabIndex={-1}>
                Your session at a glance.
              </h2>
              <div className="session-stats">
                <div>
                  <strong>{validThrows.length}</strong>
                  <span>throws recorded</span>
                </div>
                <div>
                  <strong>
                    {(
                      validThrows.reduce(
                        (sum, row) => sum + row.velocity_mph,
                        0,
                      ) / validThrows.length
                    ).toFixed(1)}
                    <small> mph</small>
                  </strong>
                  <span>average velocity</span>
                </div>
                <div>
                  <strong>
                    {Math.round(
                      validThrows.reduce(
                        (sum, row) => sum + row.spin_rate_rpm,
                        0,
                      ) / validThrows.length,
                    )}
                    <small> rpm</small>
                  </strong>
                  <span>average total spin</span>
                </div>
              </div>
              <p>
                Grip scoring and focus areas will appear here once the reviewed
                rule table is connected. These numbers alone cannot identify a
                finger as the cause.
              </p>
              <button
                className="primary"
                onClick={exportSession}
                data-testid="save-session"
              >
                <ArrowDownToLine size={16} />{" "}
                {native ? "Save or share" : "Export"}{" "}
                {sample ? "sample" : "session"} JSON
              </button>
              {native && (
                <p className="session-save-note">
                  Choose Save to Files or AirDrop in the share sheet. Saving
                  does not submit your data to Rapsodo.
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="session-guide" aria-label="Data entry guide">
          <span className="eyebrow">A LITTLE GUIDANCE</span>
          <h2>
            Five numbers.
            <br />
            One place to start.
          </h2>
          <ol>
            <li>
              <strong>Throw your selected pitch.</strong>
              <p>Keep the same grip for each throw in this session.</p>
            </li>
            <li>
              <strong>Copy your Rapsodo reading.</strong>
              <p>
                Use mph, rpm and feet. Enter spin direction exactly as a clock
                time, like 12:30.
              </p>
            </li>
            <li>
              <strong>Use efficiency or gyro.</strong>
              <p>
                Choose whichever your screen shows. You only need one per throw.
              </p>
            </li>
          </ol>
          <div className="session-consistency">
            <span>
              {validThrows.length >= 3
                ? "03+ VALID THROWS"
                : `${validThrows.length} / 3 VALID THROWS`}
            </span>
            <p>
              {validThrows.length >= 3
                ? "Enough valid throws for future consistency analysis. Scoring is not connected yet."
                : "Consistency analysis needs at least three complete, valid throws. You can review and export one."}
            </p>
          </div>
          <p className="session-guide-note">
            Input limits catch likely typos. They are not performance targets.
          </p>
        </aside>
      </div>
    </section>
  );
}
