import { downloadJSON } from "./download";
import type { Measurements } from "./grip";
import { validateThrow } from "./rapsodo";
import type { ThrowDraft } from "./rapsodo";

interface SessionContext {
  pitchId: string;
  left: boolean;
  personalized: boolean;
  measurements: Measurements;
}

/** Shared export path: native iOS share sheet or a normal browser download. */
export function saveRapsodoSession(
  context: SessionContext,
  rows: ThrowDraft[],
  sample: boolean,
  recordedAt = new Date(),
) {
  const results = rows.map(validateThrow);
  if (!results.length || results.some((result) => !result.value)) {
    throw new Error("Complete every throw before saving the session.");
  }
  const timestamp = recordedAt.toISOString();
  const filename = `gripit-${context.pitchId}-${sample ? "sample" : "session"}-${timestamp.replace(/[:.]/g, "-")}.json`;
  downloadJSON(filename, {
    version: 1,
    source: sample ? "synthetic_demo" : "rapsodo_manual",
    recordedAt: timestamp,
    pitch: context.pitchId,
    handedness: context.left ? "left" : "right",
    handSource: context.personalized ? "scan" : "sample",
    measurementUnits: "mm",
    measurements: context.measurements,
    throws: results.map((result) => result.value!),
  });
}
