export const kantoCollectionTargets = [
  {
    id: "jungle-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "fossil-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "team-rocket-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "gym-heroes-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
  },
  {
    id: "gym-challenge-pokemon",
    scope: "Kanto expansion",
    expectedPrintings: ["Unlimited", "1st Edition"],
    requiredPrintingFamilies: ["Unlimited", "1st Edition"],
    excludedCards: [
      {
        id: "pokemon-gym-challenge-s-chansey-duplicate-ultra-rare",
        reason: "JustTCG duplicate provider record outside the 132-card set checklist",
      },
    ],
  },
  {
    id: "base-set-2-pokemon",
    scope: "Kanto reprint expansion",
    expectedPrintings: ["Unlimited"],
  },
  {
    id: "legendary-collection-pokemon",
    scope: "Later Kanto reprint expansion",
    expectedPrintings: ["Normal", "Reverse Holofoil"],
  },
  {
    id: "wotc-promo-pokemon",
    scope: "Mixed Kanto and Johto promotional series",
    expectedPrintings: ["Promo"],
  },
];

const legacyTargetOverrides = new Map([
  [
    "base-set-pokemon",
    {
      id: "base-set-pokemon",
      scope: "Legacy Pokemon catalog",
      expectedPrintings: ["Unlimited"],
    },
  ],
  [
    "base-set-shadowless-pokemon",
    {
      id: "base-set-shadowless-pokemon",
      scope: "Legacy Pokemon catalog",
      expectedPrintings: ["Shadowless", "1st Edition"],
    },
  ],
  ...kantoCollectionTargets.map((target) => [target.id, target]),
]);

export const legacyTarget = (set) =>
  legacyTargetOverrides.get(set.id) ?? {
    id: set.id,
    scope: "Legacy Pokemon catalog before Diamond and Pearl",
    expectedPrintings: [],
  };
