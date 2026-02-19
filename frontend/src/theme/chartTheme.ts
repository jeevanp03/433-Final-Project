export const COLOURS = {
  navy: "#1B2A4A",
  blue: "#2E75B6",
  teal: "#26A69A",
  orange: "#E8792F",
  red: "#D32F2F",
  green: "#388E3C",
  purple: "#8B5CF6",
  pink: "#EC4899",
} as const;

export const CHART_COLOUR_SEQUENCE = [
  COLOURS.blue,
  COLOURS.teal,
  COLOURS.orange,
  COLOURS.green,
  COLOURS.red,
  COLOURS.purple,
  COLOURS.pink,
];

export const CHART_DEFAULTS = {
  axisStroke: "#E2E5EA",
  axisTickSize: 11,
  gridStrokeDasharray: "3 3",
  gridOpacity: 0.5,
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#E2E5EA",
  tooltipRadius: 8,
  animationDuration: 400,
  animationEasing: "ease-out" as const,
} as const;
