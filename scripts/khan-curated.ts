// Curated mapping: 5 LearnTok groups → 24 Khan subjects (= LearnTok topics).
// Subject names MUST match exactly the `subject` field in
// docs/research/khan-academy-playlists.json.
// Order within each group determines `position` (top-N derivation in
// onboarding picks topics by ascending position).

export type GroupKey = 'finance' | 'humanities' | 'stem' | 'math' | 'cs';

export type GroupDef = {
  key: GroupKey;
  title: string;        // displayed (Chinese)
  position: number;     // group order
  icon: string;
  topics: TopicDef[];
};

export type TopicDef = {
  subjectName: string;  // matches Khan JSON `subject`
  displayTitle: string; // shown in app (English; matches Khan canonical name)
  icon: string;
};

export const GROUPS: GroupDef[] = [
  {
    key: 'finance',
    title: '经济金融',
    position: 0,
    icon: '💰',
    topics: [
      { subjectName: 'Microeconomics',              displayTitle: 'Microeconomics',              icon: '💸' },
      { subjectName: 'Macroeconomics',              displayTitle: 'Macroeconomics',              icon: '🌍' },
      { subjectName: 'Finance and Capital Markets', displayTitle: 'Finance and Capital Markets', icon: '💼' },
    ],
  },
  {
    key: 'humanities',
    title: '人文历史',
    position: 1,
    icon: '📜',
    topics: [
      { subjectName: 'World History',             displayTitle: 'World History',             icon: '🌎' },
      { subjectName: 'US History',                displayTitle: 'US History',                icon: '🗽' },
      { subjectName: 'Art History',               displayTitle: 'Art History',               icon: '🎨' },
      { subjectName: 'US government and civics',  displayTitle: 'US Government & Civics',    icon: '⚖' },
    ],
  },
  {
    key: 'stem',
    title: '理工',
    position: 2,
    icon: '🔬',
    topics: [
      { subjectName: 'Physics',                  displayTitle: 'Physics',                   icon: '🧲' },
      { subjectName: 'Chemistry',                displayTitle: 'Chemistry',                 icon: '⚗' },
      { subjectName: 'Biology',                  displayTitle: 'Biology',                   icon: '🧬' },
      { subjectName: 'Cosmology & Astronomy',    displayTitle: 'Cosmology & Astronomy',     icon: '🌌' },
      { subjectName: 'Electrical Engineering',   displayTitle: 'Electrical Engineering',    icon: '⚡' },
      { subjectName: 'Computer Animation',       displayTitle: 'Computer Animation',        icon: '🎬' },
    ],
  },
  {
    key: 'math',
    title: '数学',
    position: 3,
    icon: '∑',
    topics: [
      { subjectName: 'Algebra Basics',           displayTitle: 'Algebra Basics',            icon: '➕' },
      { subjectName: 'Pre-Algebra',              displayTitle: 'Pre-Algebra',               icon: '🔢' },
      { subjectName: 'Geometry',                 displayTitle: 'Geometry',                  icon: '📐' },
      { subjectName: 'Trigonometry',             displayTitle: 'Trigonometry',              icon: '📏' },
      { subjectName: 'AP Calculus AB',           displayTitle: 'Calculus AB',               icon: '📈' },
      { subjectName: 'AP Calculus BC',           displayTitle: 'Calculus BC',               icon: '🧮' },
      { subjectName: 'Linear Algebra',           displayTitle: 'Linear Algebra',            icon: '⛓' },
      { subjectName: 'Multivariable Calculus',   displayTitle: 'Multivariable Calculus',    icon: '🧱' },
      { subjectName: 'Differential Equations',   displayTitle: 'Differential Equations',    icon: '∂' },
    ],
  },
  {
    key: 'cs',
    title: '编程',
    position: 4,
    icon: '🖥', // distinct from Computer Programming topic icon (💻)
    topics: [
      { subjectName: 'Computer Programming',     displayTitle: 'Computer Programming',      icon: '💻' },
      { subjectName: 'Computer Science',         displayTitle: 'Computer Science',          icon: '🖥' },
    ],
  },
];

// Per-course (= playlist) lesson cap. Long playlists truncate.
export const LESSON_CAP = 30;

// Stable namespace for UUIDv5 generation. Keeps re-runs idempotent.
export const UUID_NS = 'b1e9f5e8-7a4c-4a1d-9e7e-7a3a1e1c0d99';
