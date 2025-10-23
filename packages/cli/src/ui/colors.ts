/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Stub theme types for blessed UI
type ColorsTheme = {
  type: string;
  Foreground: string;
  Background: string;
  LightBlue: string;
  AccentBlue: string;
  AccentPurple: string;
  AccentCyan: string;
  AccentGreen: string;
  AccentYellow: string;
  AccentRed: string;
  Comment: string;
  Gray: string;
  GradientColors: string[];
};

const themeManager = {
  getActiveTheme: () => ({
    colors: {
      type: 'dark',
      Foreground: 'white',
      Background: 'black',
      LightBlue: 'blue',
      AccentBlue: 'blue',
      AccentPurple: 'magenta',
      AccentCyan: 'cyan',
      AccentGreen: 'green',
      AccentYellow: 'yellow',
      AccentRed: 'red',
      Comment: 'gray',
      Gray: 'gray',
      GradientColors: ['blue', 'cyan', 'green']
    } as ColorsTheme
  })
};

export const Colors: ColorsTheme = {
  get type() {
    return themeManager.getActiveTheme().colors.type;
  },
  get Foreground() {
    return themeManager.getActiveTheme().colors.Foreground;
  },
  get Background() {
    return themeManager.getActiveTheme().colors.Background;
  },
  get LightBlue() {
    return themeManager.getActiveTheme().colors.LightBlue;
  },
  get AccentBlue() {
    return themeManager.getActiveTheme().colors.AccentBlue;
  },
  get AccentPurple() {
    return themeManager.getActiveTheme().colors.AccentPurple;
  },
  get AccentCyan() {
    return themeManager.getActiveTheme().colors.AccentCyan;
  },
  get AccentGreen() {
    return themeManager.getActiveTheme().colors.AccentGreen;
  },
  get AccentYellow() {
    return themeManager.getActiveTheme().colors.AccentYellow;
  },
  get AccentRed() {
    return themeManager.getActiveTheme().colors.AccentRed;
  },
  get Comment() {
    return themeManager.getActiveTheme().colors.Comment;
  },
  get Gray() {
    return themeManager.getActiveTheme().colors.Gray;
  },
  get GradientColors() {
    return themeManager.getActiveTheme().colors.GradientColors;
  },
};
