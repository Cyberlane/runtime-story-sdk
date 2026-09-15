// Art coordinates are presentation data. Poses never execute or authorize mechanics.
export const actingSheets = {
  ivo: {
    file: "ivo-acting-v2",
    poses: {
      guarded: { rect: [205, 8, 285, 626], face: [30, 0, 180, 180] },
      alarmed: { rect: [750, 12, 415, 621], face: [133, 0, 170, 170] },
      resting: {
        rect: [150, 737, 370, 490],
        face: [75, 0, 180, 180],
        scale: 0.78,
      },
      resolved: {
        sheet: "ivo-idle-speaking-v1",
        rect: [150, 10, 220, 490],
        face: [48, 0, 122, 122],
      },
      speaking: {
        sheet: "ivo-idle-speaking-v1",
        rect: [1160, 520, 290, 490],
        face: [52, 0, 127, 127],
        pivot: 0.4,
      },
      walk0: {
        sheet: "ivo-walk-v1",
        rect: [25, 55, 470, 730],
        face: [175, 5, 160, 160],
        pivot: 0.54,
      },
      walk1: {
        sheet: "ivo-walk-v1",
        rect: [528, 55, 275, 730],
        face: [76, 0, 158, 158],
        pivot: 0.54,
      },
      walk2: {
        sheet: "ivo-walk-v1",
        rect: [880, 55, 480, 730],
        face: [192, 0, 160, 160],
        pivot: 0.51,
      },
      walk3: {
        sheet: "ivo-walk-v1",
        rect: [1410, 55, 285, 730],
        face: [90, 0, 160, 160],
        pivot: 0.54,
      },
    },
  },
  sera: {
    file: "sera-acting-v1",
    poses: {
      attentive: { rect: [45, 17, 509, 961], face: [134, 0, 225, 225] },
      concerned: { rect: [584, 17, 411, 961], face: [53, 0, 210, 210] },
      reassuring: { rect: [1020, 16, 510, 964], face: [70, 0, 215, 215] },
    },
  },
  mara: {
    file: "mara-acting-v1",
    poses: {
      watchful: { rect: [125, 20, 425, 975], face: [47, 0, 225, 225] },
      defensive: { rect: [649, 20, 380, 975], face: [24, 0, 200, 200] },
      guardedRelief: { rect: [1140, 27, 385, 970], face: [40, 0, 218, 218] },
    },
  },
};

export function characterPoses(world) {
  const location = world.entities.ivo.location;
  const shelter = world.shelterGrants.includes("ivo");
  const delivered = Object.values(world.documents).some(
    (d) => !d.original && d.owner === "sera",
  );
  return {
    ivo:
      location === "outside" || world.clock === "morning"
        ? "resolved"
        : location === "office" && shelter
          ? "resting"
          : world.setbackOccurred && !shelter
            ? "alarmed"
            : "guarded",
    sera:
      shelter || world.clock === "morning"
        ? "reassuring"
        : world.setbackOccurred
          ? "concerned"
          : "attentive",
    mara: world.knowledge.sera.includes("mara_signature")
      ? "defensive"
      : delivered
        ? "guardedRelief"
        : "watchful",
  };
}
