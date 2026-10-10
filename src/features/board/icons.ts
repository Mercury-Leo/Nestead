/**
 * Task icons are single emoji stored as text: no icon library, no assets, and
 * they render on every device the family owns. Nothing newer than Unicode 13
 * (2020), so older phones draw them too.
 */
export const TASK_ICONS = [
  '🧹', '🧼', '🍽️', '🗑️', '🧺', '🛏️', '🛒', '🍳',
  '🐕', '🌱', '🔧', '💡', '📦', '📮', '💸', '🚗',
] as const;

export const DEFAULT_TASK_ICON = '🧹';

/**
 * The rest, behind the picker's "More icons", by kind of chore. No emoji is in
 * two groups or in `TASK_ICONS`, so a picked one is highlighted once. Each key
 * names its heading, `board.icons.groups.<key>`.
 */
export const TASK_ICON_GROUPS = [
  { key: 'cleaning', icons: ['🧽', '🪣', '🧴', '🧻', '🚽', '🛁', '🚿', '🪟', '🪠', '🧤', '♻️', '🚮', '✨', '🕸️', '🪥', '🪤'] },
  { key: 'home', icons: ['👕', '👖', '🧦', '👗', '🧥', '👟', '🧷', '🧵', '🪡', '🛋️', '🪑', '🚪', '🖼️', '🪞', '🔑', '🏠'] },
  { key: 'kitchen', icons: ['🥣', '🍴', '🔪', '🥘', '🍲', '🥗', '🍞', '🥪', '🍝', '🍕', '🧁', '☕', '🥛', '🧊', '🥡', '🍎'] },
  { key: 'shopping', icons: ['🛍️', '🧾', '✉️', '📬', '🏪', '🏤', '🏦', '🏧', '🎁', '🏷️', '💐', '⛽', '💈', '👓'] },
  { key: 'money', icons: ['💳', '💰', '🪙', '🧮', '📄', '📝', '📋', '📅', '📞', '📱', '💻', '🖨️', '📧', '🗂️', '📎', '🔒'] },
  { key: 'garden', icons: ['🌿', '🪴', '🌷', '🌻', '🌳', '🍂', '🍃', '🌵', '🍅', '💧', '☀️', '❄️', '🐝', '🐛', '🏡', '⛏️'] },
  { key: 'pets', icons: ['🐈', '🐩', '🐟', '🐠', '🐦', '🦜', '🐇', '🐹', '🐁', '🐢', '🦎', '🐔', '🥚', '🐴', '🦴', '🐾'] },
  { key: 'repairs', icons: ['🔨', '🪛', '🪚', '🔩', '🧰', '🛠️', '🪜', '📏', '🖌️', '🧱', '🪝', '🔌', '🔋', '🔦', '🌡️', '🚰'] },
  { key: 'travel', icons: ['🚙', '🚲', '🛵', '🚌', '🚆', '🚕', '✈️', '🧳', '🛂', '🗺️', '🧭', '🅿️', '🏨', '🏕️', '🏖️', '🎫'] },
  { key: 'kids', icons: ['🎒', '📚', '📖', '✏️', '🖍️', '🎨', '🧸', '🧩', '🍼', '👶', '🏫', '🎓', '⚽', '🎹', '🩰', '🛴'] },
  { key: 'health', icons: ['💊', '🩺', '🩹', '🦷', '💉', '🩸', '🏥', '🧘', '🏃', '🏋️', '🚴', '🏊', '💇', '💅', '🛀', '🛌'] },
  { key: 'events', icons: ['🎉', '🎂', '🎈', '🥂', '🍷', '🎵', '🎬', '🎮', '🎲', '📺', '📸', '🕯️', '🕎', '✡️', '🎄', '❤️'] },
] as const;

export type TaskIconGroupKey = (typeof TASK_ICON_GROUPS)[number]['key'];

/** Every icon the picker offers: the everyday ones first, then each group. */
export const ALL_TASK_ICONS: readonly string[] = [...TASK_ICONS, ...TASK_ICON_GROUPS.flatMap((group) => group.icons)];
