import { describe, expect, it } from "vitest";
import {
  clockToDegrees,
  emptyThrow,
  sampleSession,
  validateThrow,
} from "./rapsodo";

describe("Rapsodo manual entry", () => {
  it("converts clock directions through the wrap at 12", () => {
    expect(clockToDegrees("12:00")).toBe(0);
    expect(clockToDegrees("3:00")).toBe(90);
    expect(clockToDegrees("12:30")).toBe(15);
    expect(clockToDegrees("11:59")).toBe(359.5);
    for (const invalid of ["00:00", "13:00", "12:60", "12:3", "", "abc"])
      expect(clockToDegrees(invalid)).toBeNull();
  });
  it("rejects missing data, non-finite numbers, and likely unit mistakes", () => {
    expect(Object.keys(validateThrow(emptyThrow(1)).errors)).toHaveLength(5);
    const bad = {
      ...sampleSession()[0],
      velocity_mph: "Infinity",
      release_height_ft: "165",
      spin_value: "101",
    };
    expect(validateThrow(bad).value).toBeNull();
    expect(validateThrow(bad).errors).toHaveProperty("release_height_ft");
  });
  it("preserves either efficiency or signed gyro without inventing the other", () => {
    const row = sampleSession()[0];
    expect(validateThrow(row).value).toEqual({
      velocity_mph: 78,
      spin_rate_rpm: 2100,
      spin_axis_deg: 15,
      spin_efficiency_pct: 88,
      release_height_ft: 5.4,
    });
    expect(
      validateThrow({ ...row, efficiencyMode: "gyro", spin_value: "-15" })
        .value,
    ).toEqual({
      velocity_mph: 78,
      spin_rate_rpm: 2100,
      spin_axis_deg: 15,
      gyro_degree: -15,
      release_height_ft: 5.4,
    });
    expect(
      validateThrow({ ...row, spin_value: "0" }).value?.spin_efficiency_pct,
    ).toBe(0);
    expect(
      validateThrow({ ...row, spin_rate_rpm: "0" }).value?.spin_rate_rpm,
    ).toBe(0);
  });
});
