import type { RawLead } from './csvParser';

export interface FeatureVector {
  features: number[];
  label: number;
}

export interface ScoredLead extends RawLead {
  conversion_probability: number;
  score_0_100: number;
  priority: 'low' | 'medium' | 'high';
  suggested_action: string;
}

export interface TrainingMetrics {
  auc: number;
  accuracy: number;
  precision: number;
  recall: number;
  trainSize: number;
  testSize: number;
}

const SOURCES = ['fb', 'ig', 'google', 'referral', 'walkin', 'other'];

function parseDate(s: string | null): number {
  if (!s) return Date.now();
  const d = new Date(s);
  if (isNaN(d.getTime())) return Date.now();
  return d.getTime();
}

function oneHotSource(source: string): number[] {
  const normalized = source.toLowerCase().trim();
  return SOURCES.map((s) => (normalized === s ? 1 : 0));
}

export function engineerFeatures(lead: RawLead): number[] {
  const now = Date.now();
  const createdAt = parseDate(lead.created_at);
  const lastContact = lead.last_contacted_at ? parseDate(lead.last_contacted_at) : null;

  const daysSinceCreated = Math.max(0, (now - createdAt) / 86400000);
  const daysSinceLastContact = lastContact !== null ? Math.max(0, (now - lastContact) / 86400000) : daysSinceCreated;

  const createdDate = new Date(createdAt);
  const hourOfDay = createdDate.getHours();
  const dayOfWeek = createdDate.getDay();

  const sourceOneHot = oneHotSource(lead.source);
  const numContacts = lastContact !== null ? 1 : 0;

  return [
    daysSinceCreated,
    daysSinceLastContact,
    lead.num_orders,
    lead.order_value,
    hourOfDay,
    dayOfWeek,
    numContacts,
    ...sourceOneHot,
  ];
}

function deriveLabel(lead: RawLead): number {
  const createdAt = parseDate(lead.created_at);
  const lastContact = lead.last_contacted_at ? parseDate(lead.last_contacted_at) : null;

  if (lead.status === 'won') {
    if (lastContact !== null) {
      const daysToConvert = (lastContact - createdAt) / 86400000;
      return daysToConvert <= 30 ? 1 : 0;
    }
    return 1;
  }
  return 0;
}

export function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
    const ez = Math.exp(z);
    return ez / (1 + ez);
}

export interface LogisticRegressionModel {
  weights: number[];
  bias: number;
  featureMean: number[];
  featureStd: number[];
}

function standardize(features: number[][], mean: number[], std: number[]): number[][] {
  return features.map((row) => row.map((v, i) => (std[i] > 0 ? (v - mean[i]) / std[i] : 0)));
}

function computeMeanStd(features: number[][]): { mean: number[]; std: number[] } {
  const n = features.length;
  const d = features[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);

  for (const row of features) {
    for (let j = 0; j < d; j++) mean[j] += row[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  for (const row of features) {
    for (let j = 0; j < d; j++) {
      const diff = row[j] - mean[j];
      std[j] += diff * diff;
    }
  }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n);

  return { mean, std };
}

export function trainLogisticRegression(
  features: number[][],
  labels: number[],
  epochs = 200,
  lr = 0.1
): LogisticRegressionModel {
  const { mean, std } = computeMeanStd(features);
  const X = standardize(features, mean, std);
  const n = X.length;
  const d = X[0].length;

  const weights = new Array(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(d).fill(0);
    let biasGrad = 0;

    for (let i = 0; i < n; i++) {
      const z = bias + X[i].reduce((sum, x, j) => sum + x * weights[j], 0);
      const pred = sigmoid(z);
      const error = pred - labels[i];

      for (let j = 0; j < d; j++) {
        gradients[j] += error * X[i][j];
      }
      biasGrad += error;
    }

    for (let j = 0; j < d; j++) {
      weights[j] -= (lr * gradients[j]) / n;
    }
    bias -= (lr * biasGrad) / n;
  }

  return { weights, bias, featureMean: mean, featureStd: std };
}

export function predict(model: LogisticRegressionModel, features: number[]): number {
  const standardized = features.map((v, i) =>
    model.featureStd[i] > 0 ? (v - model.featureMean[i]) / model.featureStd[i] : 0
  );
  const z = model.bias + standardized.reduce((sum, x, j) => sum + x * model.weights[j], 0);
  return sigmoid(z);
}

function computeAUC(probabilities: number[], labels: number[]): number {
  const paired = probabilities.map((p, i) => ({ p, label: labels[i] }));
  paired.sort((a, b) => b.p - a.p);

  const positives = labels.filter((l) => l === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;

  let auc = 0;
  let prevFpr = 0;
  let prevTpr = 0;

  for (let i = 0; i < paired.length; i++) {
    const tp = paired.slice(0, i + 1).filter((p) => p.label === 1).length;
    const fp = i + 1 - tp;
    const tpr = tp / positives;
    const fpr = fp / negatives;
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
  }

  return Math.min(1, Math.max(0, auc));
}

function computeMetrics(probabilities: number[], labels: number[], threshold = 0.5): Omit<TrainingMetrics, 'auc' | 'trainSize' | 'testSize'> {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < probabilities.length; i++) {
    const pred = probabilities[i] >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 1) fn++;
    else tn++;
  }
  const accuracy = (tp + tn) / labels.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  return { accuracy, precision, recall };
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface ScoringResult {
  scoredLeads: ScoredLead[];
  metrics: TrainingMetrics;
}

export function scoreLeads(rawLeads: RawLead[]): ScoringResult {
  if (rawLeads.length < 5) {
    // Not enough data to train — use a heuristic fallback
    return scoreLeadsHeuristic(rawLeads);
  }

  const featureVectors: FeatureVector[] = rawLeads.map((lead) => ({
    features: engineerFeatures(lead),
    label: deriveLabel(lead),
  }));

  const shuffled = shuffleArray(featureVectors);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const trainData = shuffled.slice(0, splitIdx);
  const testData = shuffled.slice(splitIdx);

  const trainFeatures = trainData.map((d) => d.features);
  const trainLabels = trainData.map((d) => d.label);
  const testFeatures = testData.map((d) => d.features);
  const testLabels = testData.map((d) => d.label);

  const model = trainLogisticRegression(trainFeatures, trainLabels, 200, 0.1);

  const testProbs = testFeatures.map((f) => predict(model, f));
  const auc = computeAUC(testProbs, testLabels);
  const metrics = computeMetrics(testProbs, testLabels);

  const allFeatures = featureVectors.map((d) => d.features);
  const allProbs = allFeatures.map((f) => predict(model, f));

  const positiveRate = trainLabels.filter((l) => l === 1).length / trainLabels.length;

  const scoredLeads: ScoredLead[] = rawLeads.map((lead, i) => {
    const prob = allProbs[i];
    const score = Math.round(prob * 100);
    const priority = score <= 40 ? 'low' : score <= 70 ? 'medium' : 'high';
    const suggested_action =
      priority === 'high'
        ? 'Call today'
        : priority === 'medium'
        ? 'Send WhatsApp / email offer'
        : 'Nurture later / add to newsletter';

    return {
      ...lead,
      conversion_probability: prob,
      score_0_100: score,
      priority,
      suggested_action,
    };
  });

  return {
    scoredLeads,
    metrics: {
      auc,
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      trainSize: trainData.length,
      testSize: testData.length,
    },
  };
}

function scoreLeadsHeuristic(rawLeads: RawLead[]): ScoringResult {
  const scoredLeads: ScoredLead[] = rawLeads.map((lead) => {
    const now = Date.now();
    const createdAt = parseDate(lead.created_at);
    const daysSinceCreated = Math.max(0, (now - createdAt) / 86400000);
    const lastContact = lead.last_contacted_at ? parseDate(lead.last_contacted_at) : null;
    const daysSinceLastContact = lastContact !== null ? Math.max(0, (now - lastContact) / 86400000) : daysSinceCreated;

    let score = 30;
    if (lead.num_orders > 0) score += 20;
    if (lead.order_value > 500) score += 15;
    if (lead.status === 'won') score += 20;
    if (daysSinceLastContact < 7) score += 15;
    if (lead.source === 'referral') score += 10;
    score = Math.min(100, Math.max(0, score));

    const priority = score <= 40 ? 'low' : score <= 70 ? 'medium' : 'high';
    const suggested_action =
      priority === 'high'
        ? 'Call today'
        : priority === 'medium'
        ? 'Send WhatsApp / email offer'
        : 'Nurture later / add to newsletter';

    return {
      ...lead,
      conversion_probability: score / 100,
      score_0_100: score,
      priority,
      suggested_action,
    };
  });

  return {
    scoredLeads,
    metrics: {
      auc: 0.5,
      accuracy: 0,
      precision: 0,
      recall: 0,
      trainSize: 0,
      testSize: 0,
    },
  };
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'medium':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'low':
      return 'text-slate-600 bg-slate-50 border-slate-200';
    default:
      return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}
