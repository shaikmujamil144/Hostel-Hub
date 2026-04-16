export type ComplaintPriorityLabel = 'Low' | 'Medium' | 'High';

type PriorityResult = {
  score: number;
  label: ComplaintPriorityLabel;
  factors: string[];
};

const HIGH_URGENCY_KEYWORDS = [
  'fire',
  'smoke',
  'short circuit',
  'electric shock',
  'water leakage',
  'flood',
  'no water',
  'gas leak',
  'security',
  'theft',
  'assault',
  'emergency',
  'injury',
  'unsafe',
];

const MEDIUM_URGENCY_KEYWORDS = [
  'ac not working',
  'fan not working',
  'power cut',
  'wifi down',
  'internet not working',
  'lock broken',
  'toilet blocked',
  'drainage',
  'broken window',
  'maintenance',
  'urgent',
];

const NEGATIVE_TONE_KEYWORDS = ['immediately', 'asap', 'critical', 'danger', 'help', 'serious'];

const containsAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export const detectComplaintPriority = (title: string, description: string): PriorityResult => {
  const normalized = `${title || ''} ${description || ''}`.trim().toLowerCase();
  const factors: string[] = [];

  let score = 10;

  if (normalized.length > 220) {
    score += 8;
    factors.push('Detailed complaint description');
  }

  if (containsAny(normalized, HIGH_URGENCY_KEYWORDS)) {
    score += 55;
    factors.push('Safety or critical infrastructure keyword detected');
  }

  if (containsAny(normalized, MEDIUM_URGENCY_KEYWORDS)) {
    score += 25;
    factors.push('Operational disruption keyword detected');
  }

  if (containsAny(normalized, NEGATIVE_TONE_KEYWORDS)) {
    score += 12;
    factors.push('Urgency tone detected');
  }

  const exclamationCount = (normalized.match(/!/g) || []).length;
  if (exclamationCount >= 2) {
    score += 5;
    factors.push('Repeated emphasis markers');
  }

  score = Math.max(0, Math.min(100, score));

  let label: ComplaintPriorityLabel = 'Low';
  if (score >= 70) {
    label = 'High';
  } else if (score >= 40) {
    label = 'Medium';
  }

  if (factors.length === 0) {
    factors.push('No strong urgency indicators detected');
  }

  return { score, label, factors };
};
