/**
 * 鹊动FAC功能评估与干预系统 - 生活方式问卷评估（独立评估模块）
 * 从综合评估中抽离：可独立填写问卷、生成生活方式评估报告与干预建议，
 * 并可在「报告管理中心」与其他四类报告任意组合 / 单独打印导出。
 */
(function () {
  'use strict';

  const NEED = 5; // 至少完成题数方可生成

  function collectSurvey(form) {
    const d = U.formData(form);
    const survey = {};
    CONST.LIFE_SURVEY.forEach(sec => sec.questions.forEach(q => { survey[q.key] = d[q.key]; }));
    return survey;
  }
  function answeredCount(survey) {
    return Object.values(survey).filter(v => v && (!Array.isArray(v) || v.length)).length;
  }
  function hasRaw(survey) {
    return Object.keys(survey).some(k => k !== '_scored' && k !== '_advice');
  }

  Pages.lifestyle = function () {
    if (!AppState.patient || !AppState.patient.name) {
      return `<div class="alert alert-warning"><div><strong>请先完成患者首诊登记</strong>
        <p style="margin:6px 0 0;">生活方式问卷评估需要患者的性别、年龄等基础信息作为计算依据。</p>
        <a href="#/patient" class="btn btn-primary btn-sm mt-2">前往首诊登记 →</a></div></div>`;
    }
    const p = AppState.patient;
    const saved = AppState.lifeSurvey || {};

    const wrap = U.el(`<div>
      ${patientBar()}

      <div class="card mb-3">
        <div class="card-body" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
          <div><span style="color:var(--text-muted);font-size:13px;">患者</span>
            <div style="font-weight:700;font-size:17px;">${U.esc(p.name)}</div></div>
          <div><span style="color:var(--text-muted);font-size:13px;">性别 / 年龄</span>
            <div style="font-weight:600;">${p.gender === 'female' ? '女' : '男'} · ${p.age || '—'} 岁</div></div>
          <div style="margin-left:auto;display:flex;gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-life">一键填充演示数据</button>
          </div>
        </div>
      </div>

      <form id="life-form">
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📋</span>生活方式专项调研问卷</h3>
            <div class="no-print" style="display:flex;gap:8px;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-gen-life">生成生活方式干预报告</button>
            </div>
          </div>
          <div class="card-body">
            <div class="alert alert-info" style="margin-bottom:18px;">
              <div><strong>问卷说明</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.7;">
              覆盖饮食结构、作息熬夜、久坐活动、饮水习惯、体态平衡、情绪动机六大维度共 21 题。
              提交后系统将输出各维度定量得分、定性结论，并生成可执行的生活方式改变指导建议。</p></div>
            </div>
            ${CONST.LIFE_SURVEY.map(sec => `
              <div style="margin-bottom:26px;">
                <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;
                  padding-bottom:10px;border-bottom:2px solid var(--primary);margin-bottom:14px;">
                  <span style="font-size:19px;">${sec.icon}</span>${sec.title}</div>
                ${sec.questions.map(q => `
                  <div class="form-group full-width" style="margin-bottom:16px;">
                    <label style="font-size:13.5px;">${q.label}</label>
                    <div class="${q.type === 'checkbox' ? 'checkbox' : 'radio'}-group">
                      ${q.options.map(o => `<label class="${q.type === 'checkbox' ? 'checkbox' : 'radio'}-item">
                        <input type="${q.type}" name="${q.key}" value="${o.v}"><span>${o.t}</span></label>`).join('')}
                    </div>
                  </div>`).join('')}
              </div>`).join('')}
          </div>
        </div>

        <div class="card mt-3 no-print">
          <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;" id="life-actions">
            <button type="button" class="btn btn-primary btn-lg" id="btn-save-life">保存问卷数据</button>
            <button type="button" class="btn btn-success btn-lg" id="btn-to-report">保存并前往报告管理中心 →</button>
          </div>
        </div>
      </form>

      <div id="life-output" class="mt-3"></div>
    </div>`);

    const form = U.qs('#life-form', wrap);
    U.bindChoiceStyle(form);

    // 回填已保存答卷（仅原始作答键）
    if (hasRaw(saved)) {
      U.fillForm(form, saved);
      U.bindChoiceStyle(form);
    }

    // 草稿自动保存（输入即落盘，刷新/误关后可续填）
    const lifeDraft = SmartForm.bindDraft(form, 'life-form', { indicatorHost: '#life-actions' });

    function showReport() {
      const out = U.qs('#life-output', wrap);
      if (!AppState.lifeSurvey || !AppState.lifeSurvey._scored) {
        out.innerHTML = '<div class="alert alert-warning">请先点击「生成生活方式干预报告」。</div>';
        return;
      }
      out.innerHTML = '<div class="life-report-full">' + window.buildReportDoc(null, 'lifestyle') + '</div>' +
        `<div class="no-print" style="margin-top:12px;display:flex;gap:10px;">
          <button class="btn btn-primary btn-sm" id="btn-print-life">打印 / 导出本报告</button>
          <button class="btn btn-secondary btn-sm" id="btn-share-life">📲 分享二维码</button>
          <a class="btn btn-ghost btn-sm" href="#/report">前往报告管理中心</a>
        </div>`;
      U.qs('#btn-print-life', out).onclick = async () => {
        const stage = document.getElementById('report-print-stage') ||
          (() => { const s = document.createElement('div'); s.id = 'report-print-stage'; document.body.appendChild(s); return s; })();
        let html = window.buildReportDoc(null, 'lifestyle');
        try { const qb = await window.Share.buildPlanQrBlock({ mode: 'report', scope: 'lifestyle' }); if (qb) html += qb; } catch (e) {}
        stage.innerHTML = html;
        const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
        window.onafterprint = clear;
        setTimeout(() => window.print(), 60);
      };
      U.qs('#btn-share-life', out).onclick = () => {
        if (window.Share) window.Share.openReportQRModal('lifestyle'); else U.toast('分享组件未加载', 'warning');
      };
    }

    function computeAndStore() {
      const survey = collectSurvey(form);
      if (answeredCount(survey) < NEED) { U.toast(`请至少完成 ${NEED} 道问卷题目`, 'warning'); return null; }
      const score = Calc.lifeSurveyScore(survey);
      const advice = Calc.lifeAdvice(
        score, AppState.assessment || {}, p,
        (window.getLatestStrengthSummary ? window.getLatestStrengthSummary() : null)
      );
      AppState.lifeSurvey = { ...survey, _scored: score, _advice: advice };
      return { score, advice };
    }

    U.qs('#btn-gen-life', wrap).onclick = (e) => {
      const r = computeAndStore();
      if (!r) return;
      U.withBtn(e.currentTarget, '生成中…', () => {
        U.toast('生活方式干预报告已生成', 'success');
        showReport();
        setTimeout(() => U.qs('#life-output', wrap).scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      });
    };

    U.qs('#btn-save-life', wrap).onclick = async (e) => {
      const r = computeAndStore();
      if (!r) return;
      await U.withBtn(e.currentTarget, '保存中…', async () => {
        try {
          await persistPatient();
          lifeDraft.clear();
          U.toast('生活方式问卷已保存', 'success');
        } catch (e2) { U.toast('保存失败：' + U.errMsg(e2), 'error'); }
      });
    };

    U.qs('#btn-to-report', wrap).onclick = async (e) => {
      await U.withBtn(e.currentTarget, '保存中…', async () => {
        computeAndStore(); // 已填则附带评分结果，未填也不阻塞跳转
        try {
          await persistPatient();
          lifeDraft.clear();
          location.hash = '#/report';
        } catch (e2) { U.toast('保存失败：' + U.errMsg(e2), 'error'); }
      });
    };

    U.qs('#btn-demo-life', wrap).onclick = () => {
      U.fillForm(form, {
        dietStructure: 'carbHeavy', vegIntake: 'g150', friedFreq: 'weekly3', eatSpeed: 'lt10', snackNight: 'weekly3',
        sleepRegular: 'irregular', stayUpFreq: 'weekly3', sleepDuration2: 'h6', sleepQuality2: 'fair',
        sitHours: 'ge8', breakFreq: 'rare', dailySteps: 's4000',
        waterAmount: 'ml1000', waterTiming: 'thirsty', sugarDrink2: 'weekly3',
        postureIssues: ['forwardHead', 'lordosis'], painArea: ['lowBack', 'knee'], balanceSelf: 's5',
        stressEat: 'often', motivation: 'medium', socialSupport: 'some'
      });
      U.bindChoiceStyle(form);
      U.toast('已填充问卷演示数据，点击「生成生活方式干预报告」查看结果', 'success');
    };

    if (AppState.lifeSurvey && AppState.lifeSurvey._scored) {
      setTimeout(showReport, 30);
    }

    return wrap;
  };
})();
