export const V15_DIFFICULTY_PRESETS = Object.freeze({
  easy: Object.freeze({ label: "Легко", party_win_probability: Object.freeze([0.95, 0.98]), mean_pc_ko_fraction: Object.freeze([0.15, 0.45]) }),
  medium: Object.freeze({ label: "Нормально", party_win_probability: Object.freeze([0.75, 0.87]), mean_pc_ko_fraction: Object.freeze([0.35, 0.65]) }),
  hard: Object.freeze({ label: "Сложно", party_win_probability: Object.freeze([0.60, 0.75]), mean_pc_ko_fraction: Object.freeze([0.50, 0.75]) }),
  deadly: Object.freeze({ label: "Смертельно", party_win_probability: Object.freeze([0, 0.50]), mean_pc_ko_fraction: Object.freeze([0.75, 1]) }),
});
