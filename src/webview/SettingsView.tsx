import { Button, Card } from 'even-toolkit/web';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { config } from '../config';
import { getLocaleLabel, resolveSupportedLocale } from '../locale';
import type { I18nLangsResponse } from '../net/types';
import {
  clearBirdieLocation,
  getPreferencesState,
  preferenceRanges,
  subscribePreferences,
  updateBirdiePreferences,
} from '../preferences';
import { birdieStore } from '../store';
import { LogsPanel } from './LogsView';

function useStore() {
  return useSyncExternalStore(birdieStore.subscribe, birdieStore.getState, birdieStore.getState);
}

function usePreferencesState() {
  return useSyncExternalStore(subscribePreferences, getPreferencesState, getPreferencesState);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(valueMs: number): string {
  return `${Math.round(valueMs / 1000)}s`;
}

function formatCoordinate(value: number | null): string {
  return value === null ? 'Unset' : value.toFixed(4);
}

function PreferenceSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="birdie-setting-group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="birdie-setting-label">{label}</p>
          <p className="birdie-setting-help">{description}</p>
        </div>
        <span className="birdie-setting-value">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="birdie-slider"
      />
    </div>
  );
}

export function SettingsView() {
  const state = useStore();
  const { values: preferences } = usePreferencesState();
  const diagnostics = state.diagnostics;
  const [localeOptions, setLocaleOptions] = useState<string[]>(['en_us']);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [latInput, setLatInput] = useState(preferences.locationLat?.toFixed(6) ?? '');
  const [lonInput, setLonInput] = useState(preferences.locationLon?.toFixed(6) ?? '');

  useEffect(() => {
    setLatInput(preferences.locationLat?.toFixed(6) ?? '');
    setLonInput(preferences.locationLon?.toFixed(6) ?? '');
  }, [preferences.locationLat, preferences.locationLon]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocaleOptions() {
      try {
        const response = await fetch(config.useLocalAnalyzeProxy ? '/i18n/langs' : `${config.workerUrl}/i18n/langs`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as I18nLangsResponse;
        const langs = Array.isArray(body.langs) && body.langs.length > 0 ? body.langs : ['en_us'];
        if (!cancelled) {
          setLocaleOptions(Array.from(new Set(['en_us', ...langs])));
        }
      } catch {
        if (!cancelled) {
          setLocaleOptions(['en_us']);
        }
      }
    }

    void loadLocaleOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const lastCaptureLabel = diagnostics.lastCaptureStartedAt
    ? new Date(diagnostics.lastCaptureStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';
  const lastPacketLabel = diagnostics.lastAudioPacketAt
    ? new Date(diagnostics.lastAudioPacketAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'No packets';

  async function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not available in this webview.');
      return;
    }

    setLocationStatus('Requesting current location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateBirdiePreferences({
          locationLat: position.coords.latitude,
          locationLon: position.coords.longitude,
        });
        setLocationStatus('Saved current location for future BirdNET requests.');
      },
      (error) => {
        setLocationStatus(error.message || 'Location permission was denied or unavailable.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  function updateManualLatitude(raw: string) {
    setLatInput(raw);
    if (raw.trim() === '') {
      updateBirdiePreferences({ locationLat: null });
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      updateBirdiePreferences({ locationLat: value });
    }
  }

  function updateManualLongitude(raw: string) {
    setLonInput(raw);
    if (raw.trim() === '') {
      updateBirdiePreferences({ locationLon: null });
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      updateBirdiePreferences({ locationLon: value });
    }
  }

  return (
    <div className="birdie-scroll-panel">
      <div className="flex flex-col gap-5 pb-6">
        <section className="flex flex-col gap-3">
          <p className="birdie-section-title">Audio capture</p>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body flex flex-col gap-4">
              <PreferenceSlider
                label="Inference Interval"
                description="How often BirdNET analyzes audio. Lower values are more responsive but use more battery."
                value={preferences.inferenceIntervalMs}
                min={preferenceRanges.inferenceIntervalMs.min}
                max={preferenceRanges.inferenceIntervalMs.max}
                step={preferenceRanges.inferenceIntervalMs.step}
                displayValue={formatSeconds(preferences.inferenceIntervalMs)}
                onChange={(value) => updateBirdiePreferences({ inferenceIntervalMs: value })}
              />
              <PreferenceSlider
                label="Mic Gain"
                description="Digital volume boost before upload. Use it if the microphone sounds too quiet."
                value={preferences.micGain}
                min={preferenceRanges.micGain.min}
                max={preferenceRanges.micGain.max}
                step={preferenceRanges.micGain.step}
                displayValue={`${preferences.micGain.toFixed(1)}×`}
                onChange={(value) => updateBirdiePreferences({ micGain: value })}
              />
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="birdie-setting-mini">
                  <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Sample rate</p>
                  <p className="mt-2 text-normal-title text-text">{config.sampleRate / 1000}kHz</p>
                </div>
                <div className="birdie-setting-mini">
                  <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Channels</p>
                  <p className="mt-2 text-normal-title text-text">{config.channels === 1 ? 'Mono' : String(config.channels)}</p>
                </div>
                <div className="birdie-setting-mini">
                  <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Bit depth</p>
                  <p className="mt-2 text-normal-title text-text">{config.bitDepth}-bit</p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <p className="birdie-section-title">Analysis thresholds</p>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body flex flex-col gap-4">
              <PreferenceSlider
                label="Threshold"
                description="Minimum confidence score required to show a detection."
                value={preferences.threshold}
                min={preferenceRanges.threshold.min}
                max={preferenceRanges.threshold.max}
                step={preferenceRanges.threshold.step}
                displayValue={formatPercent(preferences.threshold)}
                onChange={(value) => updateBirdiePreferences({ threshold: value })}
              />
              <PreferenceSlider
                label="Sensitivity"
                description="Higher sensitivity detects more birds but may increase false positives."
                value={preferences.sensitivity}
                min={preferenceRanges.sensitivity.min}
                max={preferenceRanges.sensitivity.max}
                step={preferenceRanges.sensitivity.step}
                displayValue={preferences.sensitivity.toFixed(2)}
                onChange={(value) => updateBirdiePreferences({ sensitivity: value })}
              />
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <p className="birdie-section-title">Location</p>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="birdie-setting-mini">
                  <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Latitude</p>
                  <p className="mt-2 text-normal-title text-text">{formatCoordinate(preferences.locationLat)}</p>
                </div>
                <div className="birdie-setting-mini">
                  <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Longitude</p>
                  <p className="mt-2 text-normal-title text-text">{formatCoordinate(preferences.locationLon)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="default" onClick={requestCurrentLocation} className="birdie-quiet-button">
                  Use current location
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    clearBirdieLocation();
                    setLocationStatus('Cleared saved coordinates.');
                  }}
                  className="birdie-quiet-button"
                >
                  Clear location
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="birdie-field">
                  <span className="birdie-setting-label">Manual latitude</span>
                  <input
                    type="number"
                    step="0.000001"
                    min="-90"
                    max="90"
                    value={latInput}
                    onChange={(event) => updateManualLatitude(event.currentTarget.value)}
                    className="birdie-input"
                    placeholder="e.g. 44.4949"
                  />
                </label>
                <label className="birdie-field">
                  <span className="birdie-setting-label">Manual longitude</span>
                  <input
                    type="number"
                    step="0.000001"
                    min="-180"
                    max="180"
                    value={lonInput}
                    onChange={(event) => updateManualLongitude(event.currentTarget.value)}
                    className="birdie-input"
                    placeholder="e.g. 11.3426"
                  />
                </label>
              </div>
              <p className="text-detail text-text-dim">
                {locationStatus ?? 'Location is optional. Birdie will still analyze clips when coordinates are unset.'}
              </p>
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <p className="birdie-section-title">Bird name language</p>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body">
              <label className="birdie-field">
                <span className="birdie-setting-label">Language</span>
                <select
                  value={preferences.locale}
                  onChange={(event) => updateBirdiePreferences({ locale: resolveSupportedLocale(event.currentTarget.value) })}
                  className="birdie-input"
                >
                  {localeOptions.map((locale) => (
                    <option key={locale} value={locale}>
                      {getLocaleLabel(locale)} ({locale})
                    </option>
                  ))}
                </select>
                <span className="birdie-setting-help">
                  Birdie localizes common names from eBird taxonomy. Scientific names always stay unchanged.
                </span>
              </label>
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <p className="birdie-section-title">Diagnostics</p>
          <Card padding="none" className="birdie-surface-card">
            <div className="birdie-card-body grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last error</p>
                <p className="mt-2 text-normal-body text-text">
                  {state.lastError ?? 'No recent BirdNET or network errors.'}
                </p>
              </div>
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Analyze status</p>
                <p className="mt-2 text-normal-body text-text">
                  {diagnostics.lastAnalyzeStatus ?? 'Waiting for first capture.'}
                </p>
              </div>
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Capture started</p>
                <p className="mt-2 text-normal-body text-text">{lastCaptureLabel}</p>
              </div>
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last audio packet</p>
                <p className="mt-2 text-normal-body text-text">{lastPacketLabel}</p>
              </div>
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Last flush size</p>
                <p className="mt-2 text-normal-body text-text">
                  {diagnostics.lastFlushBytes !== null ? `${diagnostics.lastFlushBytes} B` : 'No flush yet'}
                </p>
              </div>
              <div>
                <p className="text-detail uppercase tracking-[0.18em] text-text-dim">Capture issue</p>
                <p className="mt-2 text-normal-body text-text">
                  {diagnostics.lastCaptureError ?? 'No microphone errors recorded.'}
                </p>
              </div>
            </div>
          </Card>
          <LogsPanel />
        </section>
      </div>
    </div>
  );
}
