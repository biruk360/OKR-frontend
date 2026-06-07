export const CULTURE_LIBRARY_VERSION = 1

export const CULTURE_CRITERIA = [
  {
    code: 'C1',
    title: 'Judgment',
    anchors: {
      '0': 'Regularly makes decisions without enough context and does not learn from outcomes.',
      '4': 'Uses available facts for routine decisions but needs support when tradeoffs are unclear.',
      '7': 'Consistently applies sound judgment, surfaces tradeoffs, and adjusts when evidence changes.',
      '10': 'Makes exceptional high-impact decisions under ambiguity and raises decision quality across the team.',
    },
  },
  {
    code: 'C2',
    title: 'Clear Communication & Honesty',
    anchors: {
      '0': 'Withholds important context or communicates in ways that repeatedly create confusion.',
      '4': 'Shares required information but clarity, candor, or follow-through is inconsistent.',
      '7': 'Communicates clearly, directly, and respectfully, including when the message is difficult.',
      '10': 'Creates organization-wide clarity and models unusually candid, constructive communication.',
    },
  },
  {
    code: 'C3',
    title: 'Freedom & Responsibility',
    anchors: {
      '0': 'Requires close supervision and does not reliably own commitments or consequences.',
      '4': 'Handles defined work independently but needs support to manage broader accountability.',
      '7': 'Uses autonomy responsibly, owns outcomes, and proactively addresses risks and mistakes.',
      '10': 'Expands responsible autonomy for others while consistently delivering exceptional outcomes.',
    },
  },
  {
    code: 'C4',
    title: 'Highly Aligned / Loosely Coupled',
    anchors: {
      '0': 'Works in isolation or creates dependencies without aligning on goals and constraints.',
      '4': 'Coordinates on immediate tasks but misses important cross-team context or dependencies.',
      '7': 'Aligns early on outcomes and context, then executes independently with effective coordination.',
      '10': 'Creates durable alignment across teams and enables fast decentralized execution.',
    },
  },
  {
    code: 'C5',
    title: 'Curiosity & Innovation',
    anchors: {
      '0': 'Resists learning and repeats ineffective approaches despite new evidence.',
      '4': 'Learns when prompted and contributes incremental improvements to familiar work.',
      '7': 'Actively learns, tests ideas, and converts insight into useful improvements.',
      '10': 'Creates breakthrough approaches and builds a strong experimentation and learning culture.',
    },
  },
  {
    code: 'C6',
    title: 'Patriotism & Community Impact',
    anchors: {
      '0': 'Shows little consideration for the wider community or the long-term impact of decisions.',
      '4': 'Supports community-impact commitments when assigned but rarely initiates them.',
      '7': 'Consistently considers national and community impact and contributes meaningful service.',
      '10': 'Creates sustained, measurable community impact and inspires others to contribute.',
    },
  },
] as const
