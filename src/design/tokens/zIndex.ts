/** 层级（z-index）。只允许使用这里的值。 */
export const zIndex = {
  wallpaper: -1,
  content: 0,
  raised: 10,
  bar: 100,
  sidebar: 150,
  menu: 200,
  sheet: 300,
  modal: 400,
  popover: 500,
  toast: 600,
  skipLink: 700,
} as const;

export type ZIndexToken = keyof typeof zIndex;
