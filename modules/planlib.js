/**
 * 智能运动方案库：数据存储 + 按评估结果自动匹配
 * 数据存于 DB.planLibrary（localStorage）。管理员可维护动作、视频/图片与匹配规则。
 */
(function () {
  'use strict';

  const CAT_LABEL = { aerobic: '有氧', resistance: '抗阻', flexibility: '柔韧', balance: '平衡', nutrition: '营养' };
  window.PLANLIB_CATS = CAT_LABEL;

  function weaknessOf(ctx) {
    const iso = (ctx.isokineticData || []);
    const iot = (ctx.isotonicData || []);
    let weak = false;
    const consider = (rec, isIso) => {
      try {
        const s = isIso
          ? Calc.isokineticScore({ ptbwL: rec.ptbwL, ptbwR: rec.ptbwR, fiL: rec.fiL, fiR: rec.fiR, hqL: rec.hqL, hqR: rec.hqR, lsi: rec.lsi, avgPowerL: rec.avgPowerL, avgPowerR: rec.avgPowerR }, (ctx.patient && ctx.patient.gender) || 'male')
          : Calc.isotonicScore({ oneRML: rec.oneRML, oneRMR: rec.oneRMR, reps: rec.repsL != null ? rec.repsL : rec.repsR, loadWeight: rec.loadL != null ? rec.loadL : rec.loadR, lsi: rec.lsi }, (ctx.patient && ctx.patient.gender) || 'male', ctx.patient && ctx.patient.weight);
        if (s && s.total < 70) weak = true;
      } catch (e) {}
    };
    iso.forEach(r => consider(r, true));
    iot.forEach(r => consider(r, false));
    return weak;
  }

  window.PlanLib = {
    async get() { return DB.getPlanLibrary(); },
    async save(list) { return DB.savePlanLibrary(list); },
    CAT_LABEL,
    weaknessOf,
    /** 根据患者上下文（assessment/isokinetic/isotonic）匹配方案库动作 */
    async match(ctx) {
      try {
        const list = await DB.getPlanLibrary();
        if (!list.length) return [];
        const bmi = (ctx.assessment && ctx.assessment.bmi) != null ? ctx.assessment.bmi : null;
        const weak = weaknessOf(ctx);
        return list.filter(it => {
          const r = it.rules || {};
          if (r.bmiMin != null && bmi != null && bmi < r.bmiMin) return false;
          if (r.bmiMax != null && bmi != null && bmi > r.bmiMax) return false;
          if (r.weak === 'none' && weak) return false;
          if (['strength', 'endurance', 'balance'].includes(r.weak) && !weak) return false;
          return true;
        });
      } catch (e) { console.warn('PlanLib.match failed', e); return []; }
    }
  };
})();
