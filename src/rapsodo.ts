export interface ThrowDraft {
  id: number;
  velocity_mph: string;
  spin_rate_rpm: string;
  spin_direction: string;
  efficiencyMode: "efficiency" | "gyro";
  spin_value: string;
  release_height_ft: string;
}

export interface RapsodoThrow {
  velocity_mph: number;
  spin_rate_rpm: number;
  spin_axis_deg: number;
  spin_efficiency_pct?: number;
  gyro_degree?: number;
  release_height_ft: number;
}

export type ThrowErrors = Partial<Record<keyof ThrowDraft, string>>;

export const emptyThrow = (id: number): ThrowDraft => ({
  id,
  velocity_mph: "",
  spin_rate_rpm: "",
  spin_direction: "",
  efficiencyMode: "efficiency",
  spin_value: "",
  release_height_ft: "",
});

/** Clock position: 12:00 = 0 degrees, 3:00 = 90 degrees. */
export function clockToDegrees(clock: string): number | null {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)$/.exec(clock.trim());
  return match ? (Number(match[1]) % 12) * 30 + Number(match[2]) * 0.5 : null;
}

export function validateThrow(row: ThrowDraft): {
  errors: ThrowErrors;
  value: RapsodoThrow | null;
} {
  const errors: ThrowErrors = {};
  const number = (
    key: keyof ThrowDraft,
    min: number,
    max: number,
    label: string,
  ) => {
    const raw = String(row[key]).trim();
    const value = Number(raw);
    if (!raw) errors[key] = `Enter ${label}.`;
    else if (!Number.isFinite(value) || value < min || value > max)
      errors[key] = `Use ${min} to ${max}. Check the units.`;
    return value;
  };
  // Broad input checks for typos, not scoring thresholds or performance targets.
  const velocity_mph = number("velocity_mph", 1, 120, "velocity");
  const spin_rate_rpm = number("spin_rate_rpm", 0, 5000, "total spin");
  const release_height_ft = number(
    "release_height_ft",
    0,
    10,
    "release height",
  );
  const spinValue = number(
    "spin_value",
    row.efficiencyMode === "gyro" ? -90 : 0,
    row.efficiencyMode === "gyro" ? 90 : 100,
    row.efficiencyMode === "gyro" ? "gyro degree" : "spin efficiency",
  );
  const spin_axis_deg = clockToDegrees(row.spin_direction);
  if (spin_axis_deg === null)
    errors.spin_direction = "Use clock time, e.g. 12:30 (1:00 to 12:59).";
  return {
    errors,
    value: Object.keys(errors).length
      ? null
      : {
          velocity_mph,
          spin_rate_rpm,
          spin_axis_deg: spin_axis_deg!,
          release_height_ft,
          ...(row.efficiencyMode === "efficiency"
            ? { spin_efficiency_pct: spinValue }
            : { gyro_degree: spinValue }),
        },
  };
}

export const sampleSession = (): ThrowDraft[] =>
  [
    ["78", "2100", "12:30", "88", "5.4"],
    ["79", "2150", "12:45", "90", "5.5"],
    ["77", "2050", "12:20", "87", "5.3"],
  ].map(
    (
      [
        velocity_mph,
        spin_rate_rpm,
        spin_direction,
        spin_value,
        release_height_ft,
      ],
      i,
    ) => ({
      id: i + 1,
      velocity_mph,
      spin_rate_rpm,
      spin_direction,
      efficiencyMode: "efficiency",
      spin_value,
      release_height_ft,
    }),
  );
