export type BrandingColors = {
  primaryHex?: string | null;
  secondaryHex?: string | null;
  accentHex?: string | null;
};

export const DEFAULT_BRANDING = {
  primaryHex: "#2563eb",
  secondaryHex: "#1e293b",
  accentHex: "#3b82f6",
};

type Hsl = { h: number; s: number; l: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const hexToHsl = (hex: string): Hsl | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToToken = (hsl: Hsl) => `${hsl.h} ${hsl.s}% ${hsl.l}%`;

const hexToHslToken = (hex: string, fallback: string) => {
  const parsed = hexToHsl(hex);
  return parsed ? hslToToken(parsed) : fallback;
};

/**
 * Applies branding colors to the global CSS variables used by the design system.
 * These variables are in the "H S% L%" token format (no hsl(...) wrapper).
 */
export const applyBrandingCssVars = (colors: BrandingColors) => {
  const primaryHex = colors.primaryHex ?? DEFAULT_BRANDING.primaryHex;
  const secondaryHex = colors.secondaryHex ?? DEFAULT_BRANDING.secondaryHex;
  const accentHex = colors.accentHex ?? DEFAULT_BRANDING.accentHex;

  const primaryToken = hexToHslToken(primaryHex, "217 91% 50%");
  const secondaryToken = hexToHslToken(secondaryHex, "222 47% 11%");

  // Sidebar accents/borders: derived from secondary for better cohesion
  const secondaryHsl = hexToHsl(secondaryHex) ?? { h: 222, s: 47, l: 11 };
  const sidebarAccent = { ...secondaryHsl, l: clamp(secondaryHsl.l + 7, 0, 100) };
  const sidebarBorder = { ...secondaryHsl, l: clamp(secondaryHsl.l + 5, 0, 100) };

  const accentToken = hexToHslToken(accentHex, "217 91% 60%");

  // Core theme
  document.documentElement.style.setProperty("--primary", primaryToken);
  document.documentElement.style.setProperty("--ring", primaryToken);

  // Sidebar theme
  document.documentElement.style.setProperty("--sidebar-background", secondaryToken);
  document.documentElement.style.setProperty("--sidebar-primary", primaryToken);
  document.documentElement.style.setProperty("--sidebar-ring", primaryToken);
  document.documentElement.style.setProperty("--sidebar-accent", hslToToken(sidebarAccent));
  document.documentElement.style.setProperty("--sidebar-border", hslToToken(sidebarBorder));

  // A small lift so components that reference accent feel aligned.
  // Note: our accent tokens are used as "subtle surface" colors, so we keep it softer.
  const accentHsl = hexToHsl(accentHex);
  if (accentHsl) {
    const subtleAccent = { ...accentHsl, l: clamp(accentHsl.l + 35, 0, 98), s: clamp(accentHsl.s - 25, 0, 100) };
    document.documentElement.style.setProperty("--accent", hslToToken(subtleAccent));
    document.documentElement.style.setProperty("--accent-foreground", primaryToken);
  }
};
