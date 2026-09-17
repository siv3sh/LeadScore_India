import type { Priority } from '@/types';
import { RESOLVED_STATUSES, SOURCES, type RawLead } from './csvParser';

export interface ScoredLead extends RawLead {
  conversion_probability: number;
  score_0_100: number;
  priority: Priority;
  suggested_action: string;
}

export interface TrainingMetrics {
  auc: number;
  accuracy: number;
  /** Share of the top-ranked leads that actually converted. */
  precision: number;
  /** Share of all converted leads that the top-ranked slice captured. */
  recall: number;
  /** Labelled rows the model learned from. */
  trainSize: number;
  /** Rows scored by a model that never saw them (out-of-fold). */
  testSize: number;
}

export interface ScoringResult {
  scoredLeads: ScoredLead[];
  metrics: TrainingMetrics;
  warnings: string[];
}

/**
 * A status only counts as a training example once the outcome is settled.
 * Anything else — 'unknown', 'in_progress', a stage name — is unlabelled: it
 * still gets scored, but treating an open lead as a failure teaches the model
 * that leads nobody has finished working are bad leads.
 */
const RESOLVED_STATUS_SET = new Set(RESOLVED_STATUSES);

/** Top slice of each upload flagged for immediate outreach. */
const HIGH_PRIORITY_FRACTION = 0.2;
const MEDIUM_PRIORITY_FRACTION = 0.3;

/** Below this, ranking is not meaningfully better than shuffling the list. */
const MIN_USEFUL_AUC = 0.55;

/** Enough rows in each class to fit a model that generalises at all. */
const MIN_ROWS_TO_TRAIN = 10;
const MIN_PER_CLASS = 2;

const DAY_MS = 86400000;

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Lead age is measured against the newest lead in the file, not the wall clock,
 * so re-scoring the same upload next month yields identical features.
 */
function referenceTimeFor(leads: RawLead[]): number {
  let newest = -Infinity;
  for (const lead of leads) {
    const created = parseDate(lead.created_at);
    if (created !== null && created > newest) newest = created;
  }
  return newest === -Infinity ? Date.now() : newest;
}

function oneHotSource(source: string): number[] {
  const normalized = source.toLowerCase().trim();
  return SOURCES.map((s) => (normalized === s ? 1 : 0));
}

/**
 * Only what a brand-new, un-worked lead actually carries: where it came from,
 * when it arrived, and how long it has been sitting.
 *
 * Deliberately excludes num_orders, order_value and last_contacted_at. Those
 * are recorded as a *consequence* of the outcome — in real CRM exports every
 * lead with an order has already converted, and a lead's last contact date is
 * the day it closed. Training on them scores ~0.9 AUC in backtest while being
 * unable to rank a fresh lead, because a fresh lead has none of them.
 */
export function engineerFeatures(lead: RawLead, referenceTime: number): number[] {
  const created = parseDate(lead.created_at);
  const ageDays = created === null ? 0 : Math.max(0, (referenceTime - created) / DAY_MS);
  const createdDate = new Date(created ?? referenceTime);

  // Cyclical encoding so 23:00 sits next to 00:00 rather than 23 units away.
  const hourAngle = (2 * Math.PI * createdDate.getHours()) / 24;
  const dayAngle = (2 * Math.PI * createdDate.getDay()) / 7;

  return [
    // Long-tailed: the gap between day 1 and day 8 matters more than 200 vs 207.
    Math.log1p(ageDays),
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(dayAngle),
    Math.cos(dayAngle),
    created === null ? 1 : 0,
    ...oneHotSource(lead.source),
  ];
}

function deriveLabel(lead: RawLead): number {
  return lead.status === 'won' ? 1 : 0;
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

export interface LogisticRegressionModel {
  weights: number[];
  bias: number;
  featureMean: number[];
  featureStd: number[];
}

export interface TrainOptions {
  maxEpochs?: number;
  learningRate?: number;
  l2?: number;
  tolerance?: number;
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
  options: TrainOptions = {}
): LogisticRegressionModel {
  const { maxEpochs = 500, learningRate = 0.5, l2 = 1e-3, tolerance = 1e-6 } = options;
  const n = features.length;
  const d = features[0].length;
  const { mean, std } = computeMeanStd(features);

  // Flat typed array: this loop runs (folds + 1) x maxEpochs times over every
  // row, and at the 50k plan tier the allocations dominate otherwise.
  const X = new Float64Array(n * d);
  for (let i = 0; i < n; i++) {
    const row = features[i];
    const offset = i * d;
    for (let j = 0; j < d; j++) {
      X[offset + j] = std[j] > 0 ? (row[j] - mean[j]) / std[j] : 0;
    }
  }
  const y = Float64Array.from(labels);

  const weights = new Float64Array(d);
  const gradient = new Float64Array(d);

  // Starting at the base-rate log-odds makes the model calibrated before the
  // first step, rather than spending its epoch budget climbing away from p=0.5.
  let positives = 0;
  for (let i = 0; i < n; i++) positives += y[i];
  const baseRate = Math.min(1 - 1e-6, Math.max(1e-6, positives / n));
  let bias = Math.log(baseRate / (1 - baseRate));

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    gradient.fill(0);
    let biasGradient = 0;

    for (let i = 0; i < n; i++) {
      const offset = i * d;
      let z = bias;
      for (let j = 0; j < d; j++) z += X[offset + j] * weights[j];
      const error = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gradient[j] += error * X[offset + j];
      biasGradient += error;
    }

    let largestStep = Math.abs(biasGradient / n);
    for (let j = 0; j < d; j++) {
      // L2 on weights only; penalising the bias would break calibration.
      const g = gradient[j] / n + l2 * weights[j];
      weights[j] -= learningRate * g;
      largestStep = Math.max(largestStep, Math.abs(g));
    }
    bias -= (learningRate * biasGradient) / n;

    if (largestStep < tolerance) break;
  }

  return { weights: Array.from(weights), bias, featureMean: mean, featureStd: std };
}

export function predict(model: LogisticRegressionModel, features: number[]): number {
  let z = model.bias;
  for (let j = 0; j < features.length; j++) {
    if (model.featureStd[j] > 0) {
      z += ((features[j] - model.featureMean[j]) / model.featureStd[j]) * model.weights[j];
    }
  }
  return sigmoid(z);
}

/**
 * Mann-Whitney U with mid-ranks for ties. O(n log n) — the previous pairwise
 * form was O(n²) and froze the tab well before the 50,000-lead plan limit.
 */
export function computeAUC(probabilities: number[], labels: number[]): number {
  const n = probabilities.length;
  let positives = 0;
  for (const label of labels) positives += label;
  const negatives = n - positives;
  if (positives === 0 || negatives === 0) return 0.5;

  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => probabilities[a] - probabilities[b]
  );

  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && probabilities[order[j + 1]] === probabilities[order[i]]) j++;
    // Tied probabilities share the average rank, so an all-equal prediction
    // scores 0.5 instead of looking like a perfect ranking.
    const midRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = midRank;
    i = j + 1;
  }

  let rankSum = 0;
  for (let k = 0; k < n; k++) if (labels[k] === 1) rankSum += ranks[k];

  const auc = (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
  return Math.min(1, Math.max(0, auc));
}

function rankByScoreDesc(probabilities: number[]): number[] {
  // Index tie-break keeps the ordering stable for identical probabilities.
  return Array.from({ length: probabilities.length }, (_, i) => i).sort(
    (a, b) => probabilities[b] - probabilities[a] || a - b
  );
}

/**
 * Precision and recall of the slice the product actually asks people to call,
 * which is far more useful than a 0.5 cutoff nobody acts on.
 */
function evaluateAtTopSlice(
  probabilities: number[],
  labels: number[],
  fraction: number
): Pick<TrainingMetrics, 'accuracy' | 'precision' | 'recall'> {
  const n = probabilities.length;
  const order = rankByScoreDesc(probabilities);
  const cutoff = Math.max(1, Math.round(n * fraction));

  let truePositives = 0;
  for (let rank = 0; rank < cutoff; rank++) {
    if (labels[order[rank]] === 1) truePositives++;
  }

  let positives = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    positives += labels[i];
    if ((probabilities[i] >= 0.5 ? 1 : 0) === labels[i]) correct++;
  }

  return {
    accuracy: correct / n,
    precision: truePositives / cutoff,
    recall: positives > 0 ? truePositives / positives : 0,
  };
}

/**
 * Fixed seed on purpose: uploading the same file twice must produce the same
 * scores, or users watch their call list reshuffle for no reason.
 */
function createRandom(seed = 0x9e3779b9): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deals each class round-robin across folds, so no fold ends up without any
 * converted leads — which is how a single random split produces a meaningless
 * 0.5 AUC on skewed data.
 */
function assignStratifiedFolds(labels: number[], foldCount: number, random: () => number): number[] {
  const byClass: Record<number, number[]> = { 0: [], 1: [] };
  labels.forEach((label, i) => byClass[label].push(i));

  const folds = new Array(labels.length).fill(0);
  for (const indices of [byClass[1], byClass[0]]) {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    indices.forEach((index, position) => {
      folds[index] = position % foldCount;
    });
  }
  return folds;
}

/**
 * Bands are relative to the batch rather than absolute probabilities. With a
 * 13% base rate no lead ever exceeds a 0.70 cutoff, which left 2.6% of leads
 * marked high and buried a perfectly good ranking under "low priority".
 */
function assignPriorities(probabilities: number[]): Priority[] {
  const n = probabilities.length;
  const order = rankByScoreDesc(probabilities);
  const highCutoff = Math.max(1, Math.round(n * HIGH_PRIORITY_FRACTION));
  const mediumCutoff = highCutoff + Math.round(n * MEDIUM_PRIORITY_FRACTION);

  const priorities = new Array<Priority>(n);
  order.forEach((index, rank) => {
    priorities[index] = rank < highCutoff ? 'high' : rank < mediumCutoff ? 'medium' : 'low';
  });
  return priorities;
}

function suggestedActionFor(priority: Priority): string {
  switch (priority) {
    case 'high':
      return 'Call today';
    case 'medium':
      return 'Send WhatsApp / email offer';
    case 'low':
      return 'Nurture later / add to newsletter';
    default: {
      const exhaustive: never = priority;
      return exhaustive;
    }
  }
}

function buildScoredLeads(
  rawLeads: RawLead[],
  probabilities: number[]
): ScoredLead[] {
  const priorities = assignPriorities(probabilities);
  return rawLeads.map((lead, i) => ({
    ...lead,
    conversion_probability: probabilities[i],
    score_0_100: Math.round(probabilities[i] * 100),
    priority: priorities[i],
    suggested_action: suggestedActionFor(priorities[i]),
  }));
}

/**
 * Warns when the order columns encode the outcome rather than predicting it,
 * which is why they are not features. Only fires when the data proves it.
 */
function detectOutcomeLeakage(labeled: RawLead[]): boolean {
  const withOrders = labeled.filter((lead) => lead.num_orders > 0 || lead.order_value > 0);
  if (withOrders.length < 10) return false;
  const wonShare = withOrders.filter((lead) => lead.status === 'won').length / withOrders.length;
  return wonShare >= 0.99;
}

export function scoreLeads(rawLeads: RawLead[]): ScoringResult {
  const warnings: string[] = [];
  const referenceTime = referenceTimeFor(rawLeads);
  const features = rawLeads.map((lead) => engineerFeatures(lead, referenceTime));

  const labeledRows: number[] = [];
  for (let i = 0; i < rawLeads.length; i++) {
    if (RESOLVED_STATUS_SET.has(rawLeads[i].status)) labeledRows.push(i);
  }

  const unlabeledCount = rawLeads.length - labeledRows.length;
  if (unlabeledCount > 0) {
    warnings.push(
      `${unlabeledCount} lead${unlabeledCount === 1 ? '' : 's'} have no settled outcome ` +
        '(status is not won, lost or no_response). They were scored but left out of training, ' +
        'because counting an open lead as a failure teaches the model the wrong lesson.'
    );
  }

  const labels = labeledRows.map((i) => deriveLabel(rawLeads[i]));
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;

  if (detectOutcomeLeakage(labeledRows.map((i) => rawLeads[i]))) {
    warnings.push(
      'Order value and order count were ignored: every lead with an order in this file has ' +
        'already converted, so they reveal the outcome instead of predicting it. A new lead ' +
        'has no orders yet, so a model trained on them could not rank one.'
    );
  }

  if (labels.length < MIN_ROWS_TO_TRAIN || positives < MIN_PER_CLASS || negatives < MIN_PER_CLASS) {
    warnings.push(
      `Only ${positives} won and ${negatives} not-won leads have a settled outcome, which is too ` +
        'few to train on. Leads are ranked by a simple source-and-recency rule instead.'
    );
    return scoreWithoutTraining(rawLeads, features, labeledRows, labels, warnings);
  }

  // Three folds past a few thousand rows keeps a 50k upload inside a couple of
  // seconds; five gives small files a more stable estimate.
  const foldCount = labels.length >= 2000 ? 3 : 5;
  const random = createRandom();
  const foldOf = assignStratifiedFolds(labels, foldCount, random);

  // Out-of-fold predictions: every labelled row is scored by a model that never
  // saw it, so the reported AUC is not measured on the training data.
  const outOfFold = new Array<number>(labels.length).fill(0.5);
  for (let fold = 0; fold < foldCount; fold++) {
    const trainRows: number[] = [];
    const testRows: number[] = [];
    for (let i = 0; i < labels.length; i++) {
      (foldOf[i] === fold ? testRows : trainRows).push(i);
    }
    if (trainRows.length === 0 || testRows.length === 0) continue;

    const foldLabels = trainRows.map((i) => labels[i]);
    // A single-class fold has no decision boundary to learn.
    if (foldLabels.every((label) => label === foldLabels[0])) {
      for (const i of testRows) outOfFold[i] = foldLabels[0];
      continue;
    }

    const foldModel = trainLogisticRegression(
      trainRows.map((i) => features[labeledRows[i]]),
      foldLabels
    );
    for (const i of testRows) {
      outOfFold[i] = predict(foldModel, features[labeledRows[i]]);
    }
  }

  const auc = computeAUC(outOfFold, labels);
  const sliceMetrics = evaluateAtTopSlice(outOfFold, labels, HIGH_PRIORITY_FRACTION);

  if (auc < MIN_USEFUL_AUC) {
    warnings.push(
      `The model found no reliable pattern (AUC ${auc.toFixed(2)}, where 0.50 is guessing). ` +
        'This file has no columns that predict conversion ahead of time, so the ranking below ' +
        'is close to arbitrary. Add fields known before the outcome — budget, city, product ' +
        'interest, response time — to get a model worth acting on.'
    );
  }

  const finalModel = trainLogisticRegression(
    labeledRows.map((i) => features[i]),
    labels
  );
  const probabilities = features.map((vector) => predict(finalModel, vector));

  return {
    scoredLeads: buildScoredLeads(rawLeads, probabilities),
    metrics: {
      auc,
      accuracy: sliceMetrics.accuracy,
      precision: sliceMetrics.precision,
      recall: sliceMetrics.recall,
      trainSize: labels.length,
      testSize: labels.length,
    },
    warnings,
  };
}

/**
 * Fallback for files too small or too one-sided to fit anything. Ranks on the
 * two signals that need no training, and never touches `status` — scoring a
 * lead partly on whether it already converted is not a prediction.
 */
function scoreWithoutTraining(
  rawLeads: RawLead[],
  features: number[][],
  labeledRows: number[],
  labels: number[],
  warnings: string[]
): ScoringResult {
  const probabilities = rawLeads.map((lead, i) => {
    // features[i][0] is log1p(ageDays); recent leads rank above stale ones.
    const ageDays = Math.expm1(features[i][0]);
    let score = 0.5;
    if (lead.source === 'referral') score += 0.15;
    else if (lead.source === 'walkin') score += 0.1;
    if (ageDays <= 7) score += 0.1;
    else if (ageDays > 90) score -= 0.15;
    return Math.min(0.95, Math.max(0.05, score));
  });

  const labeledProbabilities = labeledRows.map((i) => probabilities[i]);
  const evaluated =
    labels.length > 0
      ? evaluateAtTopSlice(labeledProbabilities, labels, HIGH_PRIORITY_FRACTION)
      : { accuracy: 0, precision: 0, recall: 0 };

  return {
    scoredLeads: buildScoredLeads(rawLeads, probabilities),
    metrics: {
      auc: computeAUC(labeledProbabilities, labels),
      accuracy: evaluated.accuracy,
      precision: evaluated.precision,
      recall: evaluated.recall,
      trainSize: 0,
      testSize: labels.length,
    },
    warnings,
  };
}
