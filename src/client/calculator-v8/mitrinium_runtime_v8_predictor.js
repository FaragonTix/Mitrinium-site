// Mitrinium V8 hybrid KNN / exported HistGradientBoosting predictor.
// No Monte-Carlo and no sklearn at runtime.

function baseMap(bundle, baseVector) {
  const m = {};
  bundle.base_feature_order.forEach((name, i) => { m[name] = baseVector[i]; });
  const mag = Math.sqrt(Math.max(0,
    m.enemy_survivability_cv * m.enemy_pressure_cv
  ));
  m.enemy_heterogeneity_magnitude = mag;
  m.enemy_corr_signal = m.enemy_survival_pressure_corr * mag;
  return m;
}

function pointFeature(bundle, pointIndex, featureName) {
  const cloud = bundle.knn_cloud;
  const baseIndex = bundle.base_feature_order.indexOf(featureName);
  if (baseIndex >= 0) {
    return cloud.features_flat[pointIndex * cloud.feature_stride + baseIndex];
  }

  const off = pointIndex * cloud.feature_stride;
  const si = bundle.base_feature_order.indexOf("enemy_survivability_cv");
  const pi = bundle.base_feature_order.indexOf("enemy_pressure_cv");
  const ci = bundle.base_feature_order.indexOf("enemy_survival_pressure_corr");

  const surv = cloud.features_flat[off + si];
  const press = cloud.features_flat[off + pi];
  const mag = Math.sqrt(Math.max(0, surv * press));

  if (featureName === "enemy_heterogeneity_magnitude") return mag;
  if (featureName === "enemy_corr_signal") {
    return cloud.features_flat[off + ci] * mag;
  }
  throw new Error("Unknown feature: " + featureName);
}

function pushTopK(heap, item, maxK) {
  let lo = 0, hi = heap.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (heap[mid].d > item.d) lo = mid + 1;
    else hi = mid;
  }
  heap.splice(lo, 0, item);
  if (heap.length > maxK) heap.shift();
}

function predictKNN(bundle, base, target, knn) {
  if (!bundle.knn_cloud) throw new Error("V8 bundle has no KNN cloud.");

  const cloud = bundle.knn_cloud;
  const policy = knn.neighbor_policy;
  const maxK = policy.type === "fixed"
    ? policy.k
    : Math.max(policy.base_k, policy.mid_k, policy.far_k);

  const top = [];
  for (let i = 0; i < cloud.count; i++) {
    let d2 = 0;
    for (let j = 0; j < knn.feature_order.length; j++) {
      const name = knn.feature_order[j];
      const zq = (base[name] - knn.normalization_mean[j]) / knn.normalization_std[j];
      const zp = (pointFeature(bundle, i, name) - knn.normalization_mean[j]) / knn.normalization_std[j];
      const d = zq - zp;
      d2 += d * d;
    }
    pushTopK(top, { d: d2, i }, maxK);
  }

  top.reverse();

  let k;
  if (policy.type === "fixed") {
    k = policy.k;
  } else {
    const local = Math.sqrt(top[policy.base_k - 1].d);
    k = local <= policy.density_q50
      ? policy.base_k
      : (local <= policy.density_q85 ? policy.mid_k : policy.far_k);
  }

  const oi = cloud.outcome_order.indexOf(target);
  let sw = 0, sy = 0;
  for (let j = 0; j < k; j++) {
    const p = top[j];
    const w = Math.pow(cloud.iterations[p.i], knn.iteration_power)
      / (p.d + knn.distance_eps);
    const y = cloud.outcomes_flat[p.i * cloud.outcome_stride + oi];
    sw += w;
    sy += w * y;
  }
  return sy / sw;
}

function predictBoost(base, model) {
  let out = model.baseline;

  for (const tree of model.trees) {
    let node = 0;
    while (tree.f[node] >= 0) {
      const value = base[model.feature_order[tree.f[node]]];
      if (Number.isNaN(value)) {
        node = tree.m[node] ? tree.l[node] : tree.r[node];
      } else {
        node = value <= tree.t[node] ? tree.l[node] : tree.r[node];
      }
    }
    out += tree.v[node];
  }

  if (model.clip[0] !== null) out = Math.max(model.clip[0], out);
  if (model.clip[1] !== null) out = Math.min(model.clip[1], out);
  return out;
}

function selectEngine(rule, heterogeneity) {
  if (rule.type === "single") return rule.model;
  return heterogeneity >= rule.threshold ? rule.above : rule.below;
}

export function predictMitriniumV8(bundle, baseVector) {
  const base = baseMap(bundle, baseVector);
  const heterogeneity = Math.max(
    base.enemy_survivability_cv,
    base.enemy_pressure_cv
  );

  const result = {};
  for (const target of bundle.outcome_order) {
    const head = bundle.heads[target];
    const engine = selectEngine(head.runtime_rule, heterogeneity);

    if (engine === "boost") {
      result[target] = predictBoost(base, head.boost);
    } else if (engine === "knn") {
      result[target] = predictKNN(bundle, base, target, head.knn);
    } else {
      throw new Error("Unknown V8 engine: " + engine);
    }
  }
  return result;
}
