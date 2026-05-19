export const HUD_WIDTH = 576;
export const HUD_HEIGHT = 288;
export const HUD_CONTENT_CHAR_LIMIT = 950;

// Listening layout geometry.
// Image container hard limits (from docs/display.md): max 288×144 px.
export const LISTEN_SLIM_W = 40; // narrow left col for loader+waveform
export const IMG_W = 128; // square frame keeps bird art consistent and reduces BLE transfer time
export const IMG_H = 128; // square frame keeps bird art consistent and reduces BLE transfer time
export const INFO_GAP = 8; // gap between wave col and info col

// Vertical split for the middle column on the listening layout.
// Header sits at the very top next to the wave (top-aligned with the wave
// itself), body fills the middle, footer sits at the bottom.
export const INFO_HEADER_H = 56; // localized + scientific name
export const INFO_FOOTER_H = 40; // badges row
export const INFO_BODY_GAP = 4; // vertical gap between header/body/footer

// Frame rates / timers.
export const ANIM_FRAME_MS = 250; // loader animation tick
export const WAVE_LINES = 8; // vertical waveform length (lines)
export const POPUP_DURATION_S = 10; // seconds before popup auto-dismisses
