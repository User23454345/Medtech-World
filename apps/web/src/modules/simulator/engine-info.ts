import type { SimulationEngine } from '@medtech/core';

/** Leichtgewichtige Beschreibung der Modelle (ohne Engine-Code) für Übersicht und Panel */
export const ENGINE_INFO: Record<SimulationEngine, { label: string; description: string; icon: string }> = {
  'pulse-oximetry': { label: 'Pulsoximetrie', description: 'Rot-/IR-Photoplethysmogramm, Verhältnis R und SpO₂ mit Bewegung, Perfusion und Fremdlicht.', icon: 'pulse' },
  ventilation: { label: 'Beatmung', description: 'Ein-Kompartiment-Lunge: PCV und VCV, Compliance, Resistance, PEEP und Leckage.', icon: 'route' },
  'ecg-monitor': { label: 'EKG-Monitor', description: 'Synthetisches EKG mit Sinusrhythmus, Vorhofflimmern, VT, Kammerflimmern und Artefakten.', icon: 'pulse' },
  'infusion-pump': { label: 'Infusionspumpe', description: 'Förderrate und VTBI, Druckanstieg bei Okklusion, Zeit bis Alarm, Bolusgefahr, Luftalarm.', icon: 'target' },
  'electrical-safety': { label: 'Elektrische Sicherheit', description: 'Bewertung von Schutzleiterwiderstand und Ableitströmen nach DIN EN 62353.', icon: 'shield' },
};
