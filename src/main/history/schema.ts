export interface HistoryEntry {
  id: string;
  timestamp: number;
  originalText: string;
  sourceLang: string;
  targetLang: string;
  providerId: string;
  translatedText: string;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp'>;
