import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_MEASUREMENTS } from "./grip";
import { emptyThrow, sampleSession } from "./rapsodo";
import { saveRapsodoSession } from "./rapsodoSession";

afterEach(() => vi.unstubAllGlobals());

function bridge() {
  const postMessage = vi.fn();
  vi.stubGlobal("window", {
    webkit: { messageHandlers: { gripit: { postMessage } } },
  });
  return postMessage;
}
const context = {
  pitchId: "four-seam",
  left: true,
  personalized: true,
  measurements: DEFAULT_MEASUREMENTS,
};

it("saves canonical Rapsodo data and hand context through the iOS share bridge", () => {
  const postMessage = bridge();
  saveRapsodoSession(
    context,
    [sampleSession()[0]],
    false,
    new Date("2026-10-18T00:00:00Z"),
  );
  const message = postMessage.mock.calls[0][0];
  expect(message.action).toBe("export");
  expect(message.filename).toBe(
    "gripit-four-seam-session-2026-10-18T00-00-00-000Z.json",
  );
  expect(JSON.parse(message.content)).toMatchObject({
    source: "rapsodo_manual",
    pitch: "four-seam",
    handedness: "left",
    handSource: "scan",
    measurementUnits: "mm",
    measurements: DEFAULT_MEASUREMENTS,
    throws: [
      {
        velocity_mph: 78,
        spin_rate_rpm: 2100,
        spin_axis_deg: 15,
        spin_efficiency_pct: 88,
        release_height_ft: 5.4,
      },
    ],
  });
});
it("keeps sample provenance and gyro when exporting a demo session", () => {
  const postMessage = bridge();
  saveRapsodoSession(
    context,
    [{ ...sampleSession()[0], efficiencyMode: "gyro", spin_value: "-20" }],
    true,
  );
  const payload = JSON.parse(postMessage.mock.calls[0][0].content);
  expect(payload.source).toBe("synthetic_demo");
  expect(payload.throws[0].gyro_degree).toBe(-20);
  expect(payload.throws[0]).not.toHaveProperty("spin_efficiency_pct");
});
it("does not export empty or partially invalid sessions", () => {
  const postMessage = bridge();
  for (const rows of [
    [],
    [emptyThrow(1)],
    [sampleSession()[0], emptyThrow(2)],
  ]) {
    expect(() => saveRapsodoSession(context, rows, false)).toThrow(
      "Complete every throw",
    );
  }
  expect(postMessage).not.toHaveBeenCalled();
});
