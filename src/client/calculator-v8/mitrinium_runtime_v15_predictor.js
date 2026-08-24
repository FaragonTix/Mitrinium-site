// Mitrinium V15 predictor.
// No Monte-Carlo and no sklearn at runtime.
// expandedFeatureMap must contain any physical features required by the selected heads.

function sigmoid(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

function invTransform(x, mode) {
  return mode === "logit" ? sigmoid(x) : x;
}

function clipValue(x, clip) {
  if (clip[0] !== null) x = Math.max(clip[0], x);
  if (clip[1] !== null) x = Math.min(clip[1], x);
  return x;
}

function buildFeatureMap(bundle, baseVector, expandedFeatureMap = {}) {
  const m = {};
  bundle.base_feature_order.forEach((name, i) => { m[name] = baseVector[i]; });
  const surv = Math.max(0, m.enemy_survivability_cv);
  const press = Math.max(0, m.enemy_pressure_cv);
  const mag = Math.sqrt(surv * press);
  m.enemy_heterogeneity_magnitude = mag;
  m.enemy_corr_signal = m.enemy_survival_pressure_corr * mag;
  for (const [k, v] of Object.entries(expandedFeatureMap || {})) m[k] = v;
  return m;
}

function requireFeatures(map, model) {
  for (const name of model.feature_order || []) {
    if (!(name in map)) throw new Error("Missing V15 feature: " + name);
  }
}

function predictHGB(map, model) {
  requireFeatures(map, model);
  let out = model.baseline;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.f[node] >= 0) {
      const x = map[model.feature_order[tree.f[node]]];
      if (Number.isNaN(x)) node = tree.m[node] ? tree.l[node] : tree.r[node];
      else node = x <= tree.t[node] ? tree.l[node] : tree.r[node];
    }
    out += tree.v[node];
  }
  return clipValue(invTransform(out, model.output_transform || "direct"), model.clip);
}

function predictMLP(map, model) {
  requireFeatures(map, model);
  let a = model.feature_order.map((name, i) =>
    (map[name] - model.normalization_mean[i]) / model.normalization_std[i]
  );
  for (let layer = 0; layer < model.coefs.length; layer++) {
    const W = model.coefs[layer];
    const b = model.intercepts[layer];
    const next = new Array(b.length).fill(0);
    for (let j = 0; j < b.length; j++) {
      let s = b[j];
      for (let i = 0; i < a.length; i++) s += a[i] * W[i][j];
      next[j] = layer < model.coefs.length - 1 ? Math.tanh(s) : s;
    }
    a = next;
  }
  const raw = a[0] * model.target_std + model.target_mean;
  return clipValue(invTransform(raw, model.output_transform || "direct"), model.clip);
}

function predictSimple(map, model) {
  if (model.type === "mlp_regressor") return predictMLP(map, model);
  if (model.type === "hist_gradient_boosting_regressor") return predictHGB(map, model);
  throw new Error("Unknown V15 simple model type: " + model.type);
}

function predictRegimeMixture(map, model) {
  const anchor = predictSimple(map, model.anchor);
  const low = predictMLP(map, model.low_expert);
  const mid = predictMLP(map, model.mid_expert);
  const high = predictMLP(map, model.high_expert);
  const g = model.gating;
  const lw = sigmoid((g.low_cut - anchor) / g.temp);
  const hw = sigmoid((anchor - g.high_cut) / g.temp);
  const mw = (1 - lw) * (1 - hw);
  const total = lw + mw + hw;
  return clipValue((lw * low + mw * mid + hw * high) / total, model.clip);
}

function predictTransformBlend(map, model) {
  const direct = predictSimple(map, model.direct_model);
  const logit = predictSimple(map, model.logit_model);
  const anchor = 0.5 * (direct + logit);
  const edge = Math.abs(anchor - 0.5);
  const w = sigmoid((edge - model.threshold) / model.temp);
  return clipValue((1 - w) * direct + w * logit, model.clip);
}

function predictHead(map, head) {
  if (head.type === "regime_mlp_mixture") return predictRegimeMixture(map, head);
  if (head.type === "smooth_transform_blend") return predictTransformBlend(map, head);
  return predictSimple(map, head);
}

export function predictMitriniumV15(bundle, baseVector, expandedFeatureMap = {}) {
  const map = buildFeatureMap(bundle, baseVector, expandedFeatureMap);
  const result = {};
  for (const target of bundle.outcome_order) result[target] = predictHead(map, bundle.heads[target]);
  return result;
}
